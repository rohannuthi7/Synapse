import io

import pytest
from PIL import Image, ImageDraw

from app.errors import ImageDimensionsTooLargeError, InvalidImageError
from app.services import preprocess
from app.services.preprocess import decode


def make_image_bytes(fmt: str) -> bytes:
    img = Image.new("RGB", (20, 10), "white")
    ImageDraw.Draw(img).rectangle((5, 2, 14, 7), fill="black")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
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
