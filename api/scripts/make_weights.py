"""Write app/data/weights.json, the placeholder weight table the board is loaded with.

Placeholder, not trained: each digit's weights are its average 8x8 picture,
taken from 0-9 drawn in Pillow's built-in font at several sizes and stroke
widths. Every drawing goes through the same preprocessing the API runs on an
upload, so the templates look exactly like the frames the board will score.

Two shifts turn averages into weights (docs/projectspecs.txt):
  - subtract the average over all digits, so a cell lit for every digit
    carries little weight and a cell lit only for an 8 stands out on the 8;
  - subtract each digit's own average, so a uniformly brighter frame raises
    every score equally instead of favoring digits with more ink.
Then scale so the largest magnitude is 127, the int8 limit.

Run from api/ whenever the preprocessing changes; it needs only Pillow and NumPy:

    python scripts/make_weights.py
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

API_ROOT = Path(__file__).resolve().parents[1]
# Run as a plain script, so app/ is not importable without this.
sys.path.insert(0, str(API_ROOT))

from app.services.preprocess import (  # noqa: E402
    crop_and_center,
    downsample,
    normalize_polarity,
    stretch_contrast,
)

OUT = API_ROOT / "app" / "data" / "weights.json"

CANVAS_SIDE = 160
FONT_SIZES = (56, 80, 112)
STROKE_WIDTHS = (0, 2, 4)
# Small turns stand in for handwriting that isn't perfectly upright.
ROTATIONS = (-8, 0, 8)


def render(digit: int, size: int, stroke: int, rotation: int) -> np.ndarray:
    """Dark digit on white paper, as an uploaded photo would mostly look."""
    img = Image.new("L", (CANVAS_SIDE, CANVAS_SIDE), 255)
    font = ImageFont.load_default(size=size)
    ImageDraw.Draw(img).text(
        (CANVAS_SIDE / 2, CANVAS_SIDE / 2), str(digit), fill=0, font=font, anchor="mm", stroke_width=stroke, stroke_fill=0
    )
    img = img.rotate(rotation, resample=Image.Resampling.BICUBIC, fillcolor=255)
    return np.asarray(img).copy()


def frame(gray: np.ndarray) -> np.ndarray:
    """The 8x8 grid the API would send for this grayscale picture."""
    return stretch_contrast(downsample(crop_and_center(normalize_polarity(gray))))


def frames_for(digit: int) -> list[np.ndarray]:
    return [
        frame(render(digit, size, stroke, rotation))
        for size in FONT_SIZES
        for stroke in STROKE_WIDTHS
        for rotation in ROTATIONS
    ]


def main() -> None:
    samples = {d: frames_for(d) for d in range(10)}
    templates = np.array([np.mean([f.astype(np.float64) for f in samples[d]], axis=0).ravel() for d in range(10)])

    centered = templates - templates.mean(axis=0)
    centered -= centered.mean(axis=1, keepdims=True)
    weights = np.rint(centered * (127 / np.abs(centered).max())).astype(int)

    # How often the table picks the right digit on its own drawings: a floor
    # for a placeholder, not a measure of how it does on photos.
    correct = sum(
        int(np.argmax(weights @ f.astype(int).ravel()) == d) for d, frames in samples.items() for f in frames
    )
    total = sum(len(frames) for frames in samples.values())

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # One digit's 64 weights per line, so a regenerated table diffs by digit.
    rows = ",\n".join(f"  {json.dumps(row)}" for row in weights.tolist())
    source = json.dumps("scripts/make_weights.py: placeholder templates from Pillow's built-in font")
    OUT.write_text(f'{{\n "source": {source},\n "weights": [\n{rows}\n ]\n}}\n', encoding="utf-8", newline="\n")
    print(f"Wrote {OUT} ({correct}/{total} of its own drawings classified correctly)")


if __name__ == "__main__":
    main()
