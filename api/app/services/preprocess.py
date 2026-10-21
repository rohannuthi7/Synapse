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
    """Return a (height, width) float32 grid, 0.0 black to 1.0 white.

    The image must already be flattened: convert("L") silently drops alpha,
    which is the bug flatten_alpha exists to prevent.
    """
    # Weighted luminance (0.299R + 0.587G + 0.114B) rather than a plain average,
    # because the eye sees green as brighter than blue.
    gray = img.convert("L")

    # float32 avoids uint8 wraparound (200 + 100 would give 44) when later steps
    # add pixels, and 0-1 makes invert (1.0 - grid) trivial. astype copies, so
    # we own a writable array instead of a read-only view of Pillow's memory.
    # NumPy is rows first, (height, width): the opposite of Pillow's img.size.
    return np.asarray(gray).astype(np.float32) / 255.0
