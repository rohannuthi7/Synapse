import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.errors import ImageDimensionsTooLargeError, InvalidImageError
from app.services import preprocess
from app.services.preprocess import decode, fix_orientation, flatten_alpha, to_grayscale

ORIENTATION = 0x0112


def make_image_bytes(fmt: str) -> bytes:
    img = Image.new("RGB", (20, 10), "white")
    ImageDraw.Draw(img).rectangle((5, 2, 14, 7), fill="black")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def make_oriented_jpeg(orientation: int | None) -> bytes:
    # 20x10 white with a black 3x3 block top-left, so any rotation or flip
    # moves the block somewhere checkable.
    img = Image.new("L", (20, 10), 255)
    ImageDraw.Draw(img).rectangle((0, 0, 2, 2), fill=0)
    exif = Image.Exif()
    if orientation is not None:
        exif[ORIENTATION] = orientation
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_decodes_png() -> None:
    img = decode(make_image_bytes("PNG"))
    assert img.size == (20, 10)
    assert img.format == "PNG"


def test_decodes_jpeg() -> None:
    img = decode(make_image_bytes("JPEG"))
    assert img.size == (20, 10)
    assert img.format == "JPEG"


def test_truncated_png_is_invalid() -> None:
    # The signature is intact, so validate.py would accept this; only a full
    # decode notices the missing data.
    data = make_image_bytes("PNG")
    with pytest.raises(InvalidImageError):
        decode(data[: len(data) // 2])


def test_png_signature_with_garbage_is_invalid() -> None:
    with pytest.raises(InvalidImageError):
        decode(b"\x89PNG\r\n\x1a\n" + b"garbage" * 10)


def test_too_many_pixels_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(preprocess, "MAX_PIXELS", 100)
    with pytest.raises(ImageDimensionsTooLargeError):
        decode(make_image_bytes("PNG"))


def test_orientation_6_rotates_pixels_clockwise() -> None:
    img = fix_orientation(decode(make_oriented_jpeg(6)))
    assert img.size == (10, 20)
    assert img.getpixel((8, 1)) < 80  # block moved to top-right
    assert img.getpixel((1, 1)) > 180  # old top-left is now blank


def test_orientation_6_tag_is_removed() -> None:
    img = fix_orientation(decode(make_oriented_jpeg(6)))
    assert img.getexif().get(ORIENTATION, 1) == 1


def test_orientation_2_flips_horizontally() -> None:
    img = fix_orientation(decode(make_oriented_jpeg(2)))
    assert img.size == (20, 10)
    assert img.getpixel((18, 1)) < 80  # block moved to top-right
    assert img.getpixel((1, 1)) > 180


def test_orientation_1_is_unchanged() -> None:
    original = decode(make_oriented_jpeg(1))
    img = fix_orientation(original)
    assert img.size == (20, 10)
    assert img.tobytes() == original.tobytes()


def test_untagged_image_is_unchanged() -> None:
    original = decode(make_oriented_jpeg(None))
    img = fix_orientation(original)
    assert img.size == (20, 10)
    assert img.tobytes() == original.tobytes()


def test_malformed_exif_returns_original(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(_img: Image.Image) -> Image.Image:
        raise SyntaxError("bad exif")

    monkeypatch.setattr(preprocess.ImageOps, "exif_transpose", broken)
    original = decode(make_image_bytes("PNG"))
    assert fix_orientation(original) is original


def test_fully_transparent_pixel_becomes_white() -> None:
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    assert flatten_alpha(img).getpixel((0, 0)) == (255, 255, 255)


def test_half_transparent_black_blends_with_white() -> None:
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 128))
    # Roughly mid-gray proves it blended rather than just dropping alpha.
    assert all(120 <= c <= 135 for c in flatten_alpha(img).getpixel((0, 0)))


def test_opaque_pixel_keeps_its_color() -> None:
    img = Image.new("RGBA", (1, 1), (200, 50, 50, 255))
    assert flatten_alpha(img).getpixel((0, 0)) == (200, 50, 50)


def test_rgb_image_passes_through() -> None:
    img = Image.new("RGB", (4, 3), (10, 20, 30))
    out = flatten_alpha(img)
    assert out.mode == "RGB"
    assert out.size == (4, 3)
    assert out.getpixel((2, 1)) == (10, 20, 30)


def test_grayscale_image_becomes_rgb() -> None:
    out = flatten_alpha(Image.new("L", (2, 2), 90))
    assert out.mode == "RGB"
    assert out.getpixel((0, 0)) == (90, 90, 90)


def test_la_transparent_pixel_becomes_white() -> None:
    img = Image.new("LA", (1, 1), (0, 0))
    assert flatten_alpha(img).getpixel((0, 0)) == (255, 255, 255)


def test_palette_transparency_becomes_white() -> None:
    # Transparency lives in img.info here, not in an alpha band.
    img = Image.new("P", (2, 1))
    img.putpalette([0, 0, 0, 255, 0, 0])  # index 0 black, index 1 red
    img.putpixel((1, 0), 1)
    buf = io.BytesIO()
    img.save(buf, format="PNG", transparency=0)

    out = flatten_alpha(decode(buf.getvalue()))
    assert out.getpixel((0, 0)) == (255, 255, 255)
    assert out.getpixel((1, 0)) == (255, 0, 0)


def test_non_square_size_is_kept() -> None:
    assert flatten_alpha(Image.new("RGBA", (20, 10))).size == (20, 10)


def test_input_is_not_modified() -> None:
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    flatten_alpha(img)
    assert img.mode == "RGBA"
    assert img.getpixel((0, 0)) == (0, 0, 0, 0)


def test_white_image_is_all_ones() -> None:
    assert (to_grayscale(Image.new("RGB", (4, 3), "white")) == 1.0).all()


def test_black_image_is_all_zeros() -> None:
    assert (to_grayscale(Image.new("RGB", (4, 3), "black")) == 0.0).all()


def test_brightness_is_weighted_not_averaged() -> None:
    green = to_grayscale(Image.new("RGB", (1, 1), (0, 255, 0)))[0, 0]
    blue = to_grayscale(Image.new("RGB", (1, 1), (0, 0, 255)))[0, 0]
    assert np.isclose(green, 0.587, atol=0.01)
    assert np.isclose(blue, 0.114, atol=0.01)
    assert green > blue * 4


def test_shape_is_height_then_width() -> None:
    assert to_grayscale(Image.new("RGB", (20, 10))).shape == (10, 20)


def test_dtype_is_float32_within_unit_range() -> None:
    grid = to_grayscale(Image.new("RGB", (4, 3), (10, 200, 90)))
    assert grid.dtype == np.float32
    assert grid.min() >= 0.0
    assert grid.max() <= 1.0


def test_position_is_preserved_as_row_then_column() -> None:
    img = Image.new("RGB", (20, 10), "white")
    img.putpixel((3, 7), (0, 0, 0))  # x=3, y=7
    grid = to_grayscale(img)
    assert grid[7, 3] == 0.0
    assert grid[3, 7] == 1.0


def test_grayscale_input_is_scaled_to_unit_range() -> None:
    grid = to_grayscale(Image.new("L", (2, 2), 51))
    assert np.allclose(grid, 51 / 255)


def test_to_grayscale_does_not_modify_input() -> None:
    img = Image.new("RGB", (2, 2), (10, 20, 30))
    to_grayscale(img)
    assert img.mode == "RGB"
    assert img.getpixel((0, 0)) == (10, 20, 30)


def test_returned_grid_is_writable() -> None:
    grid = to_grayscale(Image.new("RGB", (2, 2), "white"))
    assert grid.flags.writeable
    grid[0, 0] = 0.5
