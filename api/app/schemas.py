# These models describe the HTTP boundary only. They mirror docs/api.md and
# must change together with web/src/api/types.ts when the contract changes.
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class UploadInfo(BaseModel):
    """Facts about the uploaded file, as received and as verified."""

    # Clients are not obliged to send a filename.
    filename: str | None
    # Kept separate from detected_mime: this is what the client claimed and
    # can be wrong or hostile; detected_mime comes from the file's magic bytes.
    declared_mime: str | None
    detected_mime: str
    bytes: int
    width: int
    height: int
    # Pillow's format name, e.g. "PNG" or "JPEG".
    format: str


class FunctionRef(BaseModel):
    """The Python function that produced a stage, read from the code itself."""

    # Path under api/app, e.g. "services/preprocess.py".
    file: str
    name: str
    params: list[str]
    helpers: list["FunctionRef"] | None = None


class StageResult(BaseModel):
    """One finished preprocessing stage, in the order the pipeline ran them.

    The web player mirrors these in web/src/pipeline/types.ts, including the
    per-stage shape of `meta`, which is kept open here.
    """

    key: str
    # Wall time of the stage's function alone, not of encoding this response.
    duration_ms: float
    # Whether the stage altered the picture; the player only animates real changes.
    changed: bool
    function: FunctionRef
    meta: dict[str, Any]
    # Data URL of the stage's output, longest side at most 384px. Only sent
    # when the stage changed the picture, which keeps the response small.
    image: str | None = None
    # 8 x 8 values, rows first, once the image has been downsampled.
    grid: list[list[int]] | None = None


class InferenceResponse(BaseModel):
    """Success body for POST /api/inferences."""

    id: UUID
    upload: UploadInfo
    stages: list[StageResult]


class ErrorDetail(BaseModel):
    """Machine-readable code plus human-readable message for one failure."""

    code: str
    message: str
    # Which stage failed and in which function; absent for errors raised
    # outside the pipeline.
    stage: str | None = None
    function: FunctionRef | None = None
    # Measured facts behind the message, when the check has any.
    detail: str | None = None


class ErrorResponse(BaseModel):
    """Body returned for every SynapseError."""

    error: ErrorDetail
    # Stages that finished before the failure, so the client can show how far
    # the run got.
    stages: list[StageResult] | None = None


class HealthResponse(BaseModel):
    """Body for GET /api/health: liveness plus which build is answering."""

    # Only "ok" for now: a server that can answer at all is up.
    status: Literal["ok"]
    version: str
    # Git commit of the running build, or "unknown" when none was provided.
    commit: str
