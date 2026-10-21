import io
import struct

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
