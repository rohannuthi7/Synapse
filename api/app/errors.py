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

    def __init__(self, message: str = "Could not find a digit in the image.") -> None:
        super().__init__(message)
