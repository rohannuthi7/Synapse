from fastapi import APIRouter, UploadFile

router = APIRouter(prefix="/api/inferences")


@router.post("", status_code=201)
async def create_inference(image: UploadFile) -> dict[str, str | int | None]:
    data = await image.read()
    return {
        "filename": image.filename,
        "content_type": image.content_type,
        "size_bytes": len(data),
        "first_bytes_hex": data[:8].hex(),
    }
