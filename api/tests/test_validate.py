import pytest

from app.errors import FileTooLargeError, InvalidImageError
from app.services.validate import MAX_UPLOAD_BYTES, validate_upload

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def test_detects_png() -> None:
    assert validate_upload(PNG) == "image/png"


def test_detects_jpeg() -> None:
    assert validate_upload(JPEG) == "image/jpeg"


def test_rejects_unknown_signature() -> None:
    with pytest.raises(InvalidImageError):
        validate_upload(b"hello, this is text")


def test_rejects_empty() -> None:
    with pytest.raises(InvalidImageError):
        validate_upload(b"")


def test_rejects_oversized() -> None:
    with pytest.raises(FileTooLargeError):
        validate_upload(PNG + b"\x00" * MAX_UPLOAD_BYTES)
