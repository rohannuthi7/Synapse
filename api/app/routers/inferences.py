import uuid
from time import perf_counter

from fastapi import APIRouter, UploadFile
from starlette.concurrency import run_in_threadpool

from app.schemas import ErrorResponse, InferenceResponse, UploadInfo
from app.services.pipeline import function_ref, run_pipeline

router = APIRouter(prefix="/api/inferences")


@router.post(
    "",
    response_model=InferenceResponse,
    # Stages without a picture or grid leave those fields out entirely.
    response_model_exclude_none=True,
    status_code=201,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
)
async def create_inference(image: UploadFile) -> InferenceResponse:
    # Received is the time spent reading the multipart body.
    start = perf_counter()
    data = await image.read()
    received_ms = (perf_counter() - start) * 1000

    # The board stage blocks on the serial port; a worker thread keeps the
    # event loop free for other requests meanwhile.
    result = await run_in_threadpool(
        run_pipeline,
        data,
        filename=image.filename,
        declared_mime=image.content_type,
        received_ms=received_ms,
        received_by=function_ref(create_inference),
    )
    return InferenceResponse(
        id=uuid.uuid4(),
        upload=UploadInfo(
            filename=image.filename,
            declared_mime=image.content_type,
            detected_mime=result.detected_mime,
            bytes=len(data),
            width=result.width,
            height=result.height,
            format=result.format,
        ),
        stages=result.stages,
    )
