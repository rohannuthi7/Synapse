from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.errors import SynapseError
from app.routers import inferences
from app.schemas import ErrorDetail, ErrorResponse

app = FastAPI(title="Synapse API")
# The browser treats ports 5173 (Vite) and 8000 (API) as different origins and
# blocks the response unless the server opts in.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(inferences.router)


@app.exception_handler(SynapseError)
async def synapse_error_handler(_: Request, exc: SynapseError) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=exc.code, message=exc.message))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
