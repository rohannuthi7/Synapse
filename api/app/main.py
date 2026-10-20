from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.errors import SynapseError
from app.routers import inferences
from app.schemas import ErrorDetail, ErrorResponse

app = FastAPI(title="Synapse API")
app.include_router(inferences.router)


@app.exception_handler(SynapseError)
async def synapse_error_handler(_: Request, exc: SynapseError) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=exc.code, message=exc.message))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
