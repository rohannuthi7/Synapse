import uuid

from fastapi import APIRouter, UploadFile

from app.schemas import ErrorResponse, InferenceResponse, UploadInfo
from app.services.validate import validate_upload

router = APIRouter(prefix="/api/inferences")


@router.post(
    "",
    response_model=InferenceResponse,
    status_code=201,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
)
async def create_inference(image: UploadFile) -> InferenceResponse:
    data = await image.read()
    detected_mime = validate_upload(data)
    return InferenceResponse(
        id=uuid.uuid4(),
        upload=UploadInfo(
            filename=image.filename,
            declared_mime=image.content_type,
            detected_mime=detected_mime,
            bytes=len(data),
        ),
    )
