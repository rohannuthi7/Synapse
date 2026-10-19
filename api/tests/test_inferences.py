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
    assert body["size_bytes"] == len(data)
    assert body["first_bytes_hex"] == PNG_MAGIC.hex()


def test_create_inference_without_file_is_rejected() -> None:
    response = client.post("/api/inferences")
    assert response.status_code == 422
