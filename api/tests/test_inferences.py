from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import ErrorResponse, InferenceResponse
from app.services.validate import MAX_UPLOAD_BYTES

client = TestClient(app)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff\xe0"


def test_create_inference_reports_upload_info() -> None:
    data = PNG_MAGIC + b"\x00" * 100
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


def test_success_body_matches_inference_response() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("tiny.png", PNG_MAGIC + b"\x00" * 100, "image/png")},
    )
    assert response.status_code == 201
    InferenceResponse.model_validate(response.json())


def test_upload_jpeg_reports_detected_mime() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("photo.jpg", JPEG_MAGIC + b"\x00" * 100, "image/jpeg")},
    )
    assert response.status_code == 201
    assert response.json()["upload"]["detected_mime"] == "image/jpeg"


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


def test_oversized_upload_returns_413_with_code() -> None:
    data = PNG_MAGIC + b"\x00" * MAX_UPLOAD_BYTES
    response = client.post(
        "/api/inferences",
        files={"image": ("big.png", data, "image/png")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
