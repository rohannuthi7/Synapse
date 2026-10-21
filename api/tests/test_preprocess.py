import io

import pytest
from PIL import Image, ImageDraw

from app.errors import ImageDimensionsTooLargeError, InvalidImageError
from app.services import preprocess
from app.services.preprocess import decode, fix_orientation

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
