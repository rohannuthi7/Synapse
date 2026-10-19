from fastapi import APIRouter, UploadFile

from app.services.validate import validate_upload

router = APIRouter(prefix="/api/inferences")


@router.post("", status_code=201)
async def create_inference(image: UploadFile) -> dict[str, str | int | None]:
    data = await image.read()
    detected_mime = validate_upload(data)
    return {
        "filename": image.filename,
        "declared_mime": image.content_type,
        "detected_mime": detected_mime,
        "bytes": len(data),
    }
