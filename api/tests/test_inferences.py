import io
from uuid import UUID

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.schemas import ErrorResponse, InferenceResponse
from app.services.validate import MAX_UPLOAD_BYTES

client = TestClient(app)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def make_image_bytes(fmt: str, *, blank: bool = False) -> bytes:
    """A 20 x 10 white image with a dark mark the pipeline can crop to."""
    img = Image.new("RGB", (20, 10), "white")
    if not blank:
        img.paste((20, 20, 20), (8, 2, 12, 8))
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


STAGE_KEYS = [
    "received",
    "validated",
    "decoded",
    "orientation",
    "transparency",
    "grayscale",
    "polarity",
    "crop",
    "downsample",
    "contrast",
]


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


def post(data: bytes, name: str = "digit.png", mime: str = "image/png"):
    return client.post("/api/inferences", files={"image": (name, data, mime)})


def test_every_stage_is_returned_in_pipeline_order() -> None:
    body = post(make_image_bytes("PNG")).json()
    assert [s["key"] for s in body["stages"]] == STAGE_KEYS
    for stage in body["stages"]:
        assert stage["duration_ms"] >= 0
        assert stage["function"]["name"]


def test_stages_name_the_real_functions_and_parameters() -> None:
    stages = {s["key"]: s for s in post(make_image_bytes("PNG")).json()["stages"]}
    assert stages["received"]["function"] == {
        "file": "routers/inferences.py",
        "name": "create_inference",
        "params": ["image"],
    }
    assert stages["crop"]["function"]["name"] == "crop_digit"
    assert stages["crop"]["function"]["helpers"][0]["name"] == "otsu_threshold"
    assert stages["contrast"]["function"]["file"] == "services/preprocess.py"


def test_pictures_are_sent_only_for_stages_that_changed_them() -> None:
    stages = {s["key"]: s for s in post(make_image_bytes("PNG")).json()["stages"]}
    assert stages["decoded"]["image"].startswith("data:image/jpeg;base64,")
    assert "image" not in stages["orientation"]  # no EXIF tag
    assert "image" not in stages["transparency"]  # opaque RGB
    assert stages["grayscale"]["image"].startswith("data:image/")
    assert stages["polarity"]["changed"] is True  # white paper flipped
    assert "image" not in stages["crop"]


def test_final_grid_is_8_by_8_and_stretched_to_the_full_range() -> None:
    stages = {s["key"]: s for s in post(make_image_bytes("PNG")).json()["stages"]}
    grid = stages["contrast"]["grid"]
    assert len(grid) == 8 and all(len(row) == 8 for row in grid)
    assert stages["contrast"]["meta"]["after"] == {"min": 0, "max": 255}


def test_crop_reports_its_box_in_input_pixels() -> None:
    meta = {s["key"]: s for s in post(make_image_bytes("PNG")).json()["stages"]}["crop"]["meta"]
    assert meta["input"] == {"width": 20, "height": 10}
    assert meta["box"] == {"top": 2, "left": 8, "width": 4, "height": 6}
    assert meta["output_side"] % 8 == 0


def test_blank_image_stops_at_crop_with_the_stages_before_it() -> None:
    response = post(make_image_bytes("PNG", blank=True))
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "NO_DIGIT_FOUND"
    assert body["error"]["stage"] == "crop"
    assert body["error"]["function"]["name"] == "crop_digit"
    assert body["error"]["detail"]
    assert [s["key"] for s in body["stages"]] == STAGE_KEYS[:7]
    ErrorResponse.model_validate(body)


def test_invalid_file_stops_at_validated() -> None:
    body = post(b"just text", "notes.txt", "text/plain").json()
    assert body["error"]["stage"] == "validated"
    assert body["error"]["function"]["file"] == "services/validate.py"
    assert [s["key"] for s in body["stages"]] == ["received"]
