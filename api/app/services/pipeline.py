"""Run every preprocessing stage on one upload, timing each and recording what it did.

The web player replays these stages in order, so each one reports only facts
the code measured: its own wall time, whether it changed the picture, and the
numbers that explain the change. The frame encoder is not written yet, so the
run ends at contrast.
"""

import base64
import inspect
import io
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any, TypeVar

import numpy as np
from PIL import Image

from app.errors import PipelineError, SynapseError
from app.schemas import FunctionRef, StageResult
from app.services.preprocess import (
    BRIGHT_BACKGROUND_CUTOFF,
    MAX_PIXELS,
    SIDE_MULTIPLE,
    border_median,
    crop_digit,
    decode,
    downsample,
    fix_orientation,
    flatten_alpha,
    normalize_polarity,
    otsu_threshold,
    stretch_contrast,
    to_grayscale,
)
from app.services.validate import MAX_UPLOAD_BYTES, matched_signature, validate_upload

# Stage pictures are for a 512px viewer; 384px keeps the JSON small and still
# looks sharp once the 8 x 8 stages take over.
MAX_PREVIEW_SIDE = 384
JPEG_QUALITY = 85

APP_ROOT = Path(__file__).resolve().parents[1]

# EXIF Orientation values that turn the picture, by how far. 2, 4, 5 and 7
# also mirror it, which the rotation alone does not describe.
EXIF_ORIENTATION_TAG = 0x0112
_ROTATION_BY_ORIENTATION = {1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270}

T = TypeVar("T")


def function_ref(fn: Callable[..., Any], helpers: tuple[Callable[..., Any], ...] = ()) -> FunctionRef:
    """Name a function as the code spells it, so renames can't make the page wrong."""
    source = inspect.getsourcefile(fn)
    file = Path(source).resolve().relative_to(APP_ROOT).as_posix() if source else "unknown"
    return FunctionRef(
        file=file,
        name=fn.__name__,
        params=list(inspect.signature(fn).parameters),
        helpers=[function_ref(h) for h in helpers] or None,
    )


def _data_url(img: Image.Image) -> str:
    """Downscaled copy as a data URL: PNG when it has transparency, else JPEG."""
    preview = img.copy()
    preview.thumbnail((MAX_PREVIEW_SIDE, MAX_PREVIEW_SIDE), Image.Resampling.LANCZOS)
    keeps_alpha = preview.mode in ("RGBA", "LA", "PA", "P")
    if keeps_alpha:
        preview, fmt, mime = preview.convert("RGBA"), "PNG", "image/png"
    else:
        preview, fmt, mime = preview.convert("L" if preview.mode == "L" else "RGB"), "JPEG", "image/jpeg"
    buf = io.BytesIO()
    preview.save(buf, format=fmt, **({"quality": JPEG_QUALITY} if fmt == "JPEG" else {}))
    return f"data:{mime};base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"


def _grid_image(grid: np.ndarray) -> str:
    return _data_url(Image.fromarray(grid, mode="L"))


def _range(grid: np.ndarray) -> dict[str, int]:
    return {"min": int(grid.min()), "max": int(grid.max())}


def _shape(img: Image.Image) -> list[int]:
    """Width x height, then channels: the order the player shows dimensions in."""
    bands = len(img.getbands())
    return [img.width, img.height] + ([bands] if bands > 1 else [])


def _orientation_tag(img: Image.Image) -> int | None:
    try:
        tag = img.getexif().get(EXIF_ORIENTATION_TAG)
    except (SyntaxError, ValueError, OSError):
        # fix_orientation ignores a broken tag too.
        return None
    return int(tag) if tag is not None else None


@dataclass
class PipelineResult:
    stages: list[StageResult]
    detected_mime: str
    width: int
    height: int
    format: str


class _Run:
    """Collects stages; a stage that raises becomes a PipelineError naming it."""

    def __init__(self) -> None:
        self.stages: list[StageResult] = []

    def time(
        self,
        key: str,
        fn: Callable[..., T],
        *args: Any,
        helpers: tuple[Callable[..., Any], ...] = (),
    ) -> tuple[T, float, FunctionRef]:
        ref = function_ref(fn, helpers)
        start = perf_counter()
        try:
            result = fn(*args)
        except SynapseError as err:
            raise PipelineError(err, key, ref, list(self.stages)) from err
        return result, (perf_counter() - start) * 1000, ref

    def add(self, key: str, ms: float, ref: FunctionRef, changed: bool, meta: dict[str, Any], **out: Any) -> None:
        self.stages.append(
            StageResult(key=key, duration_ms=round(ms, 3), changed=changed, function=ref, meta=meta, **out)
        )


def run_pipeline(
    data: bytes,
    *,
    filename: str | None,
    declared_mime: str | None,
    received_ms: float,
    received_by: FunctionRef,
) -> PipelineResult:
    """Run received through contrast on one upload. Raises PipelineError on failure."""
    run = _Run()

    run.add(
        "received",
        received_ms,
        received_by,
        False,
        {"filename": filename, "declared_mime": declared_mime, "bytes": len(data)},
    )

    mime, ms, ref = run.time("validated", validate_upload, data)
    run.add(
        "validated",
        ms,
        ref,
        False,
        {
            "signature": list(matched_signature(data)),
            "detected_mime": mime,
            "bytes": len(data),
            "limit_bytes": MAX_UPLOAD_BYTES,
        },
    )

    img, ms, ref = run.time("decoded", decode, data)
    run.add(
        "decoded",
        ms,
        ref,
        True,
        {"format": img.format, "shape": _shape(img), "dtype": "uint8", "max_pixels": MAX_PIXELS},
        image=_data_url(img),
    )

    tag = _orientation_tag(img)
    upright, ms, ref = run.time("orientation", fix_orientation, img)
    turned = tag not in (None, 1)
    run.add(
        "orientation",
        ms,
        ref,
        turned,
        {
            "exif_orientation": tag,
            "rotation_degrees": _ROTATION_BY_ORIENTATION.get(tag or 1, 0),
            "shape": _shape(upright),
        },
        image=_data_url(upright) if turned else None,
    )

    # Same test flatten_alpha makes: an alpha band, or transparency in metadata.
    has_alpha = upright.mode in ("RGBA", "LA", "PA") or "transparency" in upright.info
    flat, ms, ref = run.time("transparency", flatten_alpha, upright)
    run.add(
        "transparency",
        ms,
        ref,
        has_alpha,
        {"mode": upright.mode, "has_alpha": has_alpha},
        image=_data_url(flat) if has_alpha else None,
    )

    gray, ms, ref = run.time("grayscale", to_grayscale, flat)
    run.add(
        "grayscale",
        ms,
        ref,
        True,
        {
            "shape": [gray.shape[1], gray.shape[0]],
            "dtype": str(gray.dtype),
            "range": _range(gray),
            "mean": round(float(gray.mean())),
        },
        image=_grid_image(gray),
    )

    paper = border_median(gray)
    ink, ms, ref = run.time("polarity", normalize_polarity, gray)
    flipped = paper > BRIGHT_BACKGROUND_CUTOFF
    run.add(
        "polarity",
        ms,
        ref,
        flipped,
        {"border_median": round(paper), "flipped": flipped, "range": _range(ink)},
        image=_grid_image(ink) if flipped else None,
    )

    crop, ms, ref = run.time("crop", crop_digit, ink, helpers=(otsu_threshold,))
    run.add(
        "crop",
        ms,
        ref,
        True,
        {
            "input": {"width": ink.shape[1], "height": ink.shape[0]},
            "otsu_cutoff": crop.cutoff,
            "box": {
                "top": crop.top,
                "left": crop.left,
                "width": crop.right - crop.left + 1,
                "height": crop.bottom - crop.top + 1,
            },
            "output_side": crop.square.shape[0],
        },
    )

    small, ms, ref = run.time("downsample", downsample, crop.square)
    run.add(
        "downsample",
        ms,
        ref,
        True,
        {
            "block_size": crop.square.shape[0] // SIDE_MULTIPLE,
            "shape": list(small.shape),
            "range": _range(small),
        },
        grid=small.tolist(),
    )

    stretched, ms, ref = run.time("contrast", stretch_contrast, small)
    run.add(
        "contrast",
        ms,
        ref,
        not np.array_equal(stretched, small),
        {"before": _range(small), "after": _range(stretched), "shape": list(stretched.shape)},
        grid=stretched.tolist(),
    )

    return PipelineResult(run.stages, mime, img.width, img.height, img.format or "unknown")
