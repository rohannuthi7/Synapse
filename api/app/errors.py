class SynapseError(Exception):
    """Base for errors the API reports to clients with a specific code."""

    status_code = 400
    code = "SYNAPSE_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class FileTooLargeError(SynapseError):
    code = "FILE_TOO_LARGE"
    status_code = 413


class InvalidImageError(SynapseError):
    code = "INVALID_IMAGE"
