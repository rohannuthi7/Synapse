# These models describe the HTTP boundary only. They mirror docs/api.md and
# must change together with web/src/api/types.ts when the contract changes.
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


class InferenceResponse(BaseModel):
    """Success body for POST /api/inferences."""

    id: UUID
    upload: UploadInfo


class ErrorDetail(BaseModel):
    """Machine-readable code plus human-readable message for one failure."""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Body returned for every SynapseError."""

    error: ErrorDetail
