from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def test_create_inference_reports_uploaded_bytes() -> None:
    data = PNG_MAGIC + b"\x00" * 100
    response = client.post(
        "/api/inferences",
        files={"image": ("digit.png", data, "image/png")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["bytes"] == len(data)


def test_create_inference_without_file_is_rejected() -> None:
    response = client.post("/api/inferences")
    assert response.status_code == 422


def test_upload_text_file_returns_400_with_code() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("notes.txt", b"just text", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


def test_upload_png_reports_detected_mime() -> None:
    response = client.post(
        "/api/inferences",
        files={"image": ("tiny.png", PNG_MAGIC + b"\x00" * 100, "image/png")},
    )
    assert response.status_code == 201
    assert response.json()["detected_mime"] == "image/png"
