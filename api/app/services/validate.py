from app.errors import FileTooLargeError, InvalidImageError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MiB

# First bytes of each format we accept. Checked instead of the client's
# declared Content-Type, which is user-controlled and cannot be trusted.
# PDF is intentionally excluded until first-page rasterization exists.
_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
}


def detect_mime(data: bytes) -> str:
    """Return the MIME type implied by the file signature, or raise."""
    for mime, prefixes in _SIGNATURES.items():
        if data.startswith(prefixes):
            return mime
    raise InvalidImageError("File is not a PNG or JPEG.")


def validate_upload(data: bytes) -> str:
    """Run cheap checks in order; return the detected MIME type."""
    if len(data) == 0:
        raise InvalidImageError("Uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise FileTooLargeError(
            f"File is {len(data)} bytes; limit is {MAX_UPLOAD_BYTES}."
        )
    return detect_mime(data)
