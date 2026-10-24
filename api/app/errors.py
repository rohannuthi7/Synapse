from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas import FunctionRef, StageResult


class SynapseError(Exception):
    """Base for errors the API reports to clients with a specific code."""

    status_code = 400
    code = "SYNAPSE_ERROR"

    def __init__(self, message: str, detail: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        # Optional measured facts behind the message, e.g. the contrast that
        # fell short. Shown only when present.
        self.detail = detail


class FileTooLargeError(SynapseError):
    code = "FILE_TOO_LARGE"
    status_code = 413


# Separate from FileTooLargeError: that limits bytes on the wire, this limits
# the pixel count once unpacked, which a small compressed file can still blow up.
class ImageDimensionsTooLargeError(SynapseError):
    code = "IMAGE_DIMENSIONS_TOO_LARGE"
    status_code = 413


class InvalidImageError(SynapseError):
    code = "INVALID_IMAGE"


# A problem with the uploaded picture (blank, too faint, or just noise), so it
# is a client error, not a server error.
class NoDigitFoundError(SynapseError):
    code = "NO_DIGIT_FOUND"
    status_code = 400

    def __init__(
        self, message: str = "Could not find a digit in the image.", detail: str | None = None
    ) -> None:
        super().__init__(message, detail)


class PipelineError(Exception):
    """A SynapseError raised inside a pipeline stage, with where it happened.

    Carries the stages that finished first, so the response can show how far
    the run got.
    """

    def __init__(
        self,
        cause: SynapseError,
        stage: str,
        function: FunctionRef,
        completed: list[StageResult],
    ) -> None:
        super().__init__(cause.message)
        self.cause = cause
        self.stage = stage
        self.function = function
        self.completed = completed
