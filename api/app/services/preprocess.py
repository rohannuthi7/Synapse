import io
import struct

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import ImageDimensionsTooLargeError, InvalidImageError

# Phone photos are roughly 12-48 MP; this bounds the memory a decode can use
# before we unpack any pixels.
MAX_PIXELS = 50_000_000

# Pillow only warns past this limit and only raises past 2x, so decode() also
# checks explicitly; setting it keeps Pillow's own guard in agreement with ours.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# Midpoint of the 0-255 brightness scale: a border brighter than this is
# treated as paper, darker as a blackboard.
BRIGHT_BACKGROUND_CUTOFF = 127.5


def decode(data: bytes) -> Image.Image:
    """Turn validated file bytes into a fully loaded Pillow image."""
    try:
        # open() is lazy: it reads only the header, so size is known before
        # any pixels are decoded.
        img = Image.open(io.BytesIO(data))
    except Image.DecompressionBombError as err:
        raise ImageDimensionsTooLargeError("Image has too many pixels.") from err
    except (UnidentifiedImageError, OSError, ValueError) as err:
        raise InvalidImageError("File could not be read as an image.") from err

    # Read at call time (not bound at import) so tests can monkeypatch it.
    if img.width * img.height > MAX_PIXELS:
        raise ImageDimensionsTooLargeError(
            f"Image is {img.width}x{img.height}; limit is {MAX_PIXELS} pixels."
        )

    try:
        # Force the full decode now so truncated or corrupt files fail here
        # rather than in a later step.
        img.load()
    except (OSError, ValueError, SyntaxError) as err:
        raise InvalidImageError("Image data is corrupt or truncated.") from err

    # Mode is left as-is (RGB/RGBA/L/P); later steps normalize it.
    return img


def fix_orientation(img: Image.Image) -> Image.Image:
    """Apply the EXIF Orientation tag to the pixels and drop the tag."""
    try:
        # Rotates/flips the real pixels and removes the tag so a later step
        # can't rotate the image a second time. A no-op copy if there is no tag.
        fixed = ImageOps.exif_transpose(img)
    except (SyntaxError, ValueError, struct.error):
        # Orientation is metadata; a broken tag shouldn't reject an otherwise
        # valid image.
        return img
    # Only None when in_place=True, but the stubs type it as optional.
    return fixed if fixed is not None else img


def flatten_alpha(img: Image.Image) -> Image.Image:
    """Lay the image on white so transparent areas become white; return RGB."""
    # Palette (and some other) modes keep transparency in metadata rather than
    # in an alpha band, so the mode alone would miss them.
    has_transparency = img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info
    if not has_transparency:
        return img.convert("RGB")

    # RGBA turns every transparent mode into one code path.
    rgba = img.convert("RGBA")
    background = Image.new("RGB", rgba.size, (255, 255, 255))
    # Only the alpha band is the mask: it says how much of each pixel to keep.
    # Passing the whole RGBA image would be read as a color mask, not opacity.
    background.paste(rgba, mask=rgba.getchannel("A"))
    return background


def to_grayscale(img: Image.Image) -> np.ndarray:
    """Return a (height, width) uint8 grid, 0 black to 255 white.

    The image must already be flattened: convert("L") silently drops alpha,
    which is the bug flatten_alpha exists to prevent.
    """
    # Weighted luminance (0.299R + 0.587G + 0.114B) rather than a plain average,
    # because the eye sees green as brighter than blue.
    gray = img.convert("L")

    # Stays uint8 because the final grid goes to the hardware as one byte per
    # pixel. Later steps must widen before adding (200 + 100 wraps to 44).
    # asarray can be a read-only view of Pillow's memory, so copy to own it.
    # NumPy is rows first, (height, width): the opposite of Pillow's img.size.
    return np.asarray(gray).copy()


def normalize_polarity(grid: np.ndarray) -> np.ndarray:
    """Return a copy where ink is bright (near 255) and background is dark.

    Known limits, left until real photos show them failing: a tight crop where
    the digit touches every edge fools the border check, and uneven lighting
    is not handled.
    """
    # Top/bottom rows have `width` values, left/right columns have `height`;
    # slicing the wrong axis fails silently on a non-square grid. Corners are
    # counted twice, which is harmless.
    border = np.concatenate([grid[0, :], grid[-1, :], grid[:, 0], grid[:, -1]])

    # Median, not mean: a mark or shadow touching part of the edge should not
    # outvote the paper.
    if np.median(border) > BRIGHT_BACKGROUND_CUTOFF:
        return 255 - grid
    # Copy so callers always get an array they own, whichever way this went.
    return grid.copy()


def otsu_threshold(grid: np.ndarray) -> float:
    """Pick the paper/ink cutoff that best separates the grid's brightness.

    Expects a non-empty uint8 grid (0-255, as from to_grayscale); nothing is
    clipped or rescaled. Pixels STRICTLY GREATER than the returned value count
    as ink, i.e. `grid > cutoff` is the ink mask.
    """
    if grid.size == 0:
        raise ValueError("Cannot threshold an empty grid.")
    # Catches an old 0.0-1.0 float grid passed in by mistake, which would
    # otherwise give a meaningless cutoff without any error.
    if grid.dtype != np.uint8:
        raise ValueError(f"Expected a uint8 grid, got {grid.dtype}.")

    # A uint8 image has only 256 possible values, so one bucket per value is an
    # exact histogram, and trying every cutoff loops 256 buckets, not millions
    # of pixels.
    counts = np.bincount(grid.ravel(), minlength=256).astype(np.float64)
    levels = np.arange(256, dtype=np.float64)
    total = counts.sum()

    # Running totals give each cutoff's group sizes and averages in one pass.
    cum_count = np.cumsum(counts)
    cum_sum = np.cumsum(levels * counts)
    # Cutoff b: "below" is values <= b, "above" is values > b.
    count_below = cum_count
    count_above = total - cum_count
    valid = (count_below > 0) & (count_above > 0)  # avoids dividing by zero

    # No valid cutoff means every pixel has the same value. Returning the max
    # makes `grid > cutoff` all False, so a later step can report "no digit".
    if not valid.any():
        return float(grid.max())

    mean_below = cum_sum[valid] / count_below[valid]
    mean_above = (cum_sum[-1] - cum_sum[valid]) / count_above[valid]
    # Multiplying the two group fractions stops a tiny group (even one lone
    # pixel) from winning; the squared gap rewards groups far apart.
    score = np.zeros(256)
    score[valid] = (
        (count_below[valid] / total)
        * (count_above[valid] / total)
        * (mean_below - mean_above) ** 2
    )

    # With an empty gap between two clumps every cutoff inside it scores the
    # same, and argmax would pick the first, hugging the dark clump. A grid of
    # only 25s and 230s ties for every cutoff from 25 to 229; the middle (127)
    # is the sensible answer.
    tied = np.flatnonzero(np.isclose(score, score.max(), rtol=1e-9))
    return float((tied[0] + tied[-1]) / 2)
