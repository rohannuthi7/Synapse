import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.errors import PipelineError, SynapseError
from app.routers import inferences
from app.schemas import ErrorDetail, ErrorResponse, HealthResponse

# Shown in the web footer; bump it when the HTTP contract changes.
# 0.5: inferences return every stage; errors name the stage that failed.
API_VERSION = "0.5"

# Origins allowed to call the API, comma-separated. A deploy sets this to the
# web app's address; the default is the Vite dev server.
DEFAULT_CORS_ORIGINS = "http://localhost:5173"


def cors_origins() -> list[str]:
    raw = os.environ.get("SYNAPSE_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="Synapse API", version=API_VERSION)
# The browser treats the web app and the API as different origins and blocks
# the response unless the server opts in.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(inferences.router)


@app.exception_handler(SynapseError)
async def synapse_error_handler(_: Request, exc: SynapseError) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=exc.code, message=exc.message, detail=exc.detail))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(exclude_none=True))


@app.exception_handler(PipelineError)
async def pipeline_error_handler(_: Request, exc: PipelineError) -> JSONResponse:
    cause = exc.cause
    body = ErrorResponse(
        error=ErrorDetail(
            code=cause.code,
            message=cause.message,
            stage=exc.stage,
            function=exc.function,
            detail=cause.detail,
        ),
        stages=exc.completed,
    )
    return JSONResponse(status_code=cause.status_code, content=body.model_dump(exclude_none=True))


@app.get("/api/health")
def health() -> HealthResponse:
    # Read at call time (not bound at import) so tests can monkeypatch it.
    # Whoever starts the server sets SYNAPSE_COMMIT; nothing infers it.
    commit = os.environ.get("SYNAPSE_COMMIT", "unknown")
    return HealthResponse(status="ok", version=API_VERSION, commit=commit)
