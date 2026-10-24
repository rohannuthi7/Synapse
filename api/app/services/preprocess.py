import io
import struct

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import (
    ImageDimensionsTooLargeError,
    InvalidImageError,
    NoDigitFoundError,
)

# Phone photos are roughly 12-48 MP; this bounds the memory a decode can use
# before we unpack any pixels.
MAX_PIXELS = 50_000_000

# Pillow only warns past this limit and only raises past 2x, so decode() also
# checks explicitly; setting it keeps Pillow's own guard in agreement with ours.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# Midpoint of the 0-255 brightness scale: a border brighter than this is
# treated as paper, darker as a blackboard.
BRIGHT_BACKGROUND_CUTOFF = 127.5

# Training digits have space around them. A whole-number percent lets the
# margin use integer math.
MARGIN_PERCENT = 10

# A row or column only counts as ink with at least this many ink pixels, so
# one dust speck cannot stretch the box.
MIN_INK_PIXELS = 2

# The ink group's average must be at least this much brighter than the paper
# group's. Otsu always returns SOME cutoff, even on a blank page or pure noise,
# so this check is what turns "above the cutoff" into "significantly brighter".
MIN_INK_CONTRAST = 50

# The later downsample step splits the square into 8x8 equal boxes.
SIDE_MULTIPLE = 8


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


def _find_ink_box(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """Return (top, bottom, left, right), all inclusive, or None if no ink."""
    # Mixing the axes up fails silently: summing over axis=1 collapses each
    # row to one number (length = height); axis=0 does that per column
    # (length = width).
    row_counts = mask.sum(axis=1)
    col_counts = mask.sum(axis=0)
    rows = np.where(row_counts >= MIN_INK_PIXELS)[0]
    cols = np.where(col_counts >= MIN_INK_PIXELS)[0]
    if rows.size == 0 or cols.size == 0:
        return None
    return int(rows[0]), int(rows[-1]), int(cols[0]), int(cols[-1])


def _pad_to_square(cropped: np.ndarray, background: int) -> np.ndarray:
    """Center the crop in a square with a margin; side is a multiple of 8."""
    height, width = cropped.shape
    longest = max(height, width)
    # Integer ceiling division (-(-a // b)) throughout: a float like
    # longest * 1.2 can land on 72.00000000000001 and silently jump to the next
    # multiple of 8.
    margin = -(-longest * MARGIN_PERCENT // 100)
    side = longest + 2 * margin
    side = -(-side // SIDE_MULTIPLE) * SIDE_MULTIPLE

    pad_y = side - height
    pad_x = side - width
    # The far side takes the remainder, not pad // 2 again, or odd padding
    # would come up one pixel short of square.
    top = pad_y // 2
    left = pad_x // 2
    return np.pad(
        cropped,
        ((top, pad_y - top), (left, pad_x - left)),
        mode="constant",
        constant_values=background,
    )


def crop_and_center(grid: np.ndarray) -> np.ndarray:
    """Return a square uint8 grid holding just the digit, centered, with a margin.

    Expects an ink-bright grid (from normalize_polarity). Side is a multiple of
    8 and at least 8, still full resolution and 0-255. Raises NoDigitFoundError
    when there is no clearly brighter ink. Known limits, left on purpose:
    uneven lighting is not handled, and centering uses the bounding box, not
    the center of mass (a possible later improvement).
    """
    if grid.ndim != 2 or grid.size == 0:
        raise ValueError("Expected a non-empty 2D grid.")
    # Catches a stray 0.0-1.0 float grid passed in by mistake.
    if grid.dtype != np.uint8:
        raise ValueError(f"Expected a uint8 grid, got {grid.dtype}.")

    mask = grid > otsu_threshold(grid)
    if not mask.any() or mask.all():
        raise NoDigitFoundError()
    if grid[mask].mean() - grid[~mask].mean() < MIN_INK_CONTRAST:
        raise NoDigitFoundError()

    box = _find_ink_box(mask)
    if box is None:
        raise NoDigitFoundError()
    top, bottom, left, right = box

    # Pad with the paper's brightness so the padding blends in; the median keeps
    # stray marks from skewing it.
    background = int(np.median(grid[~mask]))
    # +1 because slice ends are exclusive but the box is inclusive.
    cropped = grid[top : bottom + 1, left : right + 1]
    return _pad_to_square(cropped, background)


def to_frame(img: Image.Image) -> list[int]:
    """Return 64 brightness bytes, row-major, cell 0 first.

    Ink is bright (near 255) and the background is dark. This is the FRAME
    payload the FPGA stores in x[0:63].
    """
    oriented = fix_orientation(img)
    flat = flatten_alpha(oriented)
    gray = to_grayscale(flat)
    ink_bright = normalize_polarity(gray)
    centered = crop_and_center(ink_bright)
    small = downsample(centered)
    return [int(value) for value in small.reshape(-1)]


def downsample(grid: np.ndarray, size: int = 8) -> np.ndarray:
    """Average a square uint8 grid down to (size, size), still 0-255."""
    if grid.ndim != 2 or grid.shape[0] != grid.shape[1]:
        raise ValueError("Expected a square 2D grid.")
    # Catches a stray 0.0-1.0 float grid passed in by mistake.
    if grid.dtype != np.uint8:
        raise ValueError(f"Expected a uint8 grid, got {grid.dtype}.")
    # Unequal boxes would silently skew the average; crop_and_center is
    # responsible for giving us a multiple of the size.
    side = grid.shape[0]
    if side < size or side % size != 0:
        raise ValueError(f"Side {side} must be a multiple of {size}, at least {size}.")

    block = side // size
    # Float first: uint8 wraps around (200 + 100 = 44), so summing thousands of
    # pixels as uint8 gives garbage. The order is (box row, row inside box,
    # box column, column inside box); (size, size, block, block) runs without
    # error but scrambles which pixels belong to which box.
    boxes = grid.astype(np.float32).reshape(size, block, size, block)
    # Axes 1 and 3 are the "inside the box" directions, leaving one number per box.
    averaged = boxes.mean(axis=(1, 3))
    # Round to whole numbers, not truncate, so 99.9 becomes 100 and not 99.
    return np.rint(averaged).astype(np.uint8)
