import io
from uuid import UUID

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.schemas import ErrorResponse, InferenceResponse
from app.services.validate import MAX_UPLOAD_BYTES

client = TestClient(app)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def make_image_bytes(fmt: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (20, 10), "white").save(buf, format=fmt)
    return buf.getvalue()


def test_create_inference_reports_upload_info() -> None:
    data = make_image_bytes("PNG")
    response = client.post(
        "/api/inferences",
        files={"image": ("digit.png", data, "image/png")},
    )
    assert response.status_code == 201
    body = response.json()
    UUID(body["id"])
    assert body["upload"]["bytes"] == len(data)
    assert body["upload"]["detected_mime"] == "image/png"
    assert body["upload"]["filename"] == "digit.png"
    assert body["upload"]["declared_mime"] == "image/png"
    assert body["upload"]["width"] == 20
    assert body["upload"]["height"] == 10
    assert body["upload"]["format"] == "PNG"


def test_success_body_matches_inference_response() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("tiny.png", make_image_bytes("PNG"), "image/png")},
    )
    assert response.status_code == 201
    InferenceResponse.model_validate(response.json())


def test_upload_jpeg_reports_detected_mime() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("photo.jpg", make_image_bytes("JPEG"), "image/jpeg")},
    )
    assert response.status_code == 201
    assert response.json()["upload"]["detected_mime"] == "image/jpeg"
    assert response.json()["upload"]["format"] == "JPEG"


def test_create_inference_without_file_is_rejected() -> None:
    response = client.post("/api/inferences")
    assert response.status_code == 422


def test_text_file_declared_as_png_returns_400_with_code() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("fake.png", b"just text", "image/png")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"
    ErrorResponse.model_validate(response.json())


def test_truncated_png_returns_400_with_error_shape() -> None:
    data = make_image_bytes("PNG")
    response = client.post(
        "/api/inferences",
        files={"image": ("cut.png", data[: len(data) // 2], "image/png")},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_IMAGE"
    assert body["error"]["message"]
    ErrorResponse.model_validate(body)


def test_pdf_upload_is_rejected_with_400() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("doc.pdf", b"%PDF-1.7\n" + b"\x00" * 100, "application/pdf")},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_IMAGE"
    assert body["error"]["message"]
    ErrorResponse.model_validate(body)


def test_oversized_upload_returns_413_with_code() -> None:
    data = PNG_MAGIC + b"\x00" * MAX_UPLOAD_BYTES
    response = client.post(
        "/api/inferences",
        files={"image": ("big.png", data, "image/png")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
