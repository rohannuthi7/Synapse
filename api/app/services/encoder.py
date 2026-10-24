"""Turn the 8x8 grid and the weights into UART packets, and read the board's replies.

Pure functions, no I/O: board.py does the talking. The layout follows
docs/uart_config.txt and rtl/packet.sv: sync, opcode, length, payload, then
the XOR of every byte before it.
"""

import struct
from dataclasses import dataclass
from functools import reduce

import numpy as np

SYNC = 0xA5

# Host to board.
OP_PING = 0x01
OP_FRAME = 0x02
OP_WEIGHTS = 0x03
OP_RUN = 0x04

# Board to host. PONG is reserved: the RTL answers PING with ACK.
OP_ACK = 0x82
OP_RESULT = 0x83
OP_NACK = 0x84

# Why packet.sv sent a NACK, from its `reason` output.
NACK_REASONS = {0x01: "bad checksum", 0x02: "unknown opcode", 0x03: "length does not match opcode"}

GRID_SIDE = 8
CELLS = GRID_SIDE * GRID_SIDE
DIGITS = 10

# Ten int32 scores, the winning digit, then flags.
RESULT_PAYLOAD_BYTES = 4 * DIGITS + 2
# Bit 0 of flags: another digit has the same score as the winner.
FLAG_TIE = 0x01

# Sync, opcode, length in front of the payload; checksum after it.
HEAD_BYTES = 3


class ReplyError(ValueError):
    """Bytes from the board that are not a well-formed packet."""


def checksum(data: bytes) -> int:
    """XOR of every byte, the value packet.sv compares against the last byte."""
    return reduce(lambda acc, b: acc ^ b, data, 0)


def encode_packet(opcode: int, payload: bytes = b"") -> bytes:
    if len(payload) > 0xFF:
        raise ValueError(f"Payload is {len(payload)} bytes; the length byte holds at most 255.")
    head = bytes([SYNC, opcode, len(payload)]) + payload
    return head + bytes([checksum(head)])


def encode_ping() -> bytes:
    return encode_packet(OP_PING)


def encode_run() -> bytes:
    return encode_packet(OP_RUN)


def encode_frame(grid: np.ndarray) -> bytes:
    """FRAME packet for an 8x8 uint8 grid. Row-major, so cell 0 is grid[0][0], as in frame.sv."""
    grid = np.asarray(grid)
    if grid.shape != (GRID_SIDE, GRID_SIDE):
        raise ValueError(f"Expected an {GRID_SIDE}x{GRID_SIDE} grid, got {grid.shape}.")
    # Catches a stray float or wider int grid, whose values would not fit a byte.
    if grid.dtype != np.uint8:
        raise ValueError(f"Expected a uint8 grid, got {grid.dtype}.")
    return encode_packet(OP_FRAME, grid.tobytes(order="C"))


def encode_weights(digit: int, row: np.ndarray) -> bytes:
    """WEIGHTS packet: the digit byte, then its 64 weights as two's-complement bytes."""
    if not 0 <= digit < DIGITS:
        raise ValueError(f"Digit {digit} is not 0 through 9.")
    row = np.asarray(row)
    if row.shape != (CELLS,):
        raise ValueError(f"Expected {CELLS} weights, got shape {row.shape}.")
    if row.min() < -128 or row.max() > 127:
        raise ValueError("Weights must fit a signed byte, -128 through 127.")
    # int8 to bytes gives two's complement: -1 goes out as 0xFF, which
    # weights.sv reads back with signed'().
    return encode_packet(OP_WEIGHTS, bytes([digit]) + row.astype(np.int8).tobytes())


@dataclass(frozen=True)
class Reply:
    opcode: int
    payload: bytes
    # The whole packet as it arrived, for error details and the result stage.
    raw: bytes


def decode_reply(buf: bytes) -> Reply:
    """Check one complete packet from the board and split it into its fields."""
    if len(buf) < HEAD_BYTES + 1:
        raise ReplyError(f"Reply is {len(buf)} bytes; a packet is at least {HEAD_BYTES + 1}.")
    if buf[0] != SYNC:
        raise ReplyError(f"Reply starts with 0x{buf[0]:02X}, not sync 0x{SYNC:02X}.")
    length = buf[2]
    if len(buf) != HEAD_BYTES + length + 1:
        raise ReplyError(f"Length byte says {length} payload bytes; reply has {len(buf) - HEAD_BYTES - 1}.")
    if checksum(buf[:-1]) != buf[-1]:
        raise ReplyError(f"Checksum is 0x{buf[-1]:02X}; the bytes XOR to 0x{checksum(buf[:-1]):02X}.")
    return Reply(opcode=buf[1], payload=bytes(buf[HEAD_BYTES:-1]), raw=bytes(buf))


@dataclass(frozen=True)
class Result:
    scores: list[int]
    digit: int
    tie: bool


def parse_result(payload: bytes) -> Result:
    """Read a RESULT payload: 10 little-endian int32 scores, the winning digit, then flags."""
    if len(payload) != RESULT_PAYLOAD_BYTES:
        raise ReplyError(f"RESULT payload is {len(payload)} bytes, not {RESULT_PAYLOAD_BYTES}.")
    # result.sv sign-extends each 22-bit sum to 32 bits, so "<i" reads negatives correctly.
    scores = list(struct.unpack(f"<{DIGITS}i", payload[: 4 * DIGITS]))
    return Result(scores=scores, digit=payload[-2], tie=bool(payload[-1] & FLAG_TIE))


def encode_result(result: Result) -> bytes:
    """The RESULT packet result.sv would send. Used by tests and the bench tool."""
    payload = struct.pack(f"<{DIGITS}i", *result.scores) + bytes([result.digit, FLAG_TIE if result.tie else 0])
    return encode_packet(OP_RESULT, payload)
