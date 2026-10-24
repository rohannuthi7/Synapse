"""Send a frame to the FPGA over the USB-UART adapter, or compute the same result in Python.

SerialBoard talks to the real board. EmulatedBoard mirrors rtl/score.sv and
rtl/winning_digit.sv bit for bit, so the API, its tests and the web player
still work with no board plugged in. Both return the same BoardRun.
"""

import json
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import serial

from app.errors import BoardProtocolError, BoardUnavailableError, SynapseError
from app.services.encoder import (
    CELLS,
    DIGITS,
    NACK_REASONS,
    OP_ACK,
    OP_NACK,
    OP_RESULT,
    SYNC,
    Reply,
    ReplyError,
    Result,
    decode_reply,
    encode_frame,
    encode_result,
    encode_run,
    encode_weights,
    parse_result,
)

# docs/uart_config.txt: 115200 baud, 8 data bits, no parity, 1 stop bit.
BAUD_RATE = 115200
# Start bit, 8 data bits, stop bit: 86.8 us per byte on the wire.
BYTE_TIME_MS = 10 / BAUD_RATE * 1000

# Bytes on the wire per packet: head and checksum around each payload.
_ACK_BYTES = 5
_FRAME_BYTES = 4 + CELLS
_RUN_BYTES = 4
_WEIGHTS_BYTES = 4 + 1 + CELLS
_RESULT_BYTES = 4 + 4 * DIGITS + 2

# The longest reply, RESULT, is 46 bytes: 4 ms on the wire. USB-UART adapters
# can hold received bytes up to 16 ms before passing them on, so 250 ms is
# generous without making a dead board slow to report.
READ_TIMEOUT_S = 0.25

# One retry covers a byte lost on the wire. packet.sv drops a partial packet
# after 10 ms of silence, which the read timeout above comfortably outlasts.
ATTEMPTS = 2

WEIGHTS_PATH = Path(__file__).resolve().parents[1] / "data" / "weights.json"


@cache
def _weights_file() -> dict[str, Any]:
    return json.loads(WEIGHTS_PATH.read_text(encoding="utf-8"))


def load_weights_source() -> str:
    """Where the weight table came from, as written by scripts/make_weights.py."""
    return str(_weights_file().get("source", "unknown"))


def wire_ms(weights_sent: bool) -> float:
    """Time the bytes of one run spend on the wire, before any USB or host delay."""
    total = _FRAME_BYTES + _ACK_BYTES + _RUN_BYTES + _RESULT_BYTES
    if weights_sent:
        total += DIGITS * (_WEIGHTS_BYTES + _ACK_BYTES)
    return total * BYTE_TIME_MS


@cache
def load_weights() -> np.ndarray:
    """The (10, 64) int8 weight table from app/data/weights.json, made by scripts/make_weights.py."""
    rows = _weights_file()["weights"]
    weights = np.array(rows, dtype=np.int64)
    if weights.shape != (DIGITS, CELLS):
        raise ValueError(f"{WEIGHTS_PATH.name} holds shape {weights.shape}, not ({DIGITS}, {CELLS}).")
    if weights.min() < -128 or weights.max() > 127:
        raise ValueError(f"{WEIGHTS_PATH.name} has weights outside -128 through 127.")
    return weights.astype(np.int8)


def emulate(grid: np.ndarray, weights: np.ndarray) -> Result:
    """The ten scores and winner the RTL computes for this frame and weight table."""
    x = np.asarray(grid, dtype=np.int64).reshape(CELLS)
    # Widen before multiplying: the RTL keeps 16-bit products and a 22-bit sum,
    # which int8 or uint8 math here would wrap.
    scores = weights.astype(np.int64) @ x
    best = scores.max()
    # winning_digit.sv only moves to a higher index on a strictly larger score,
    # so the lowest index wins a tie, and the tie flag says another digit matched.
    winners = np.flatnonzero(scores == best)
    return Result(scores=[int(s) for s in scores], digit=int(winners[0]), tie=winners.size > 1)


@dataclass(frozen=True)
class BoardRun:
    result: Result
    # "fpga" or "emulated": which one actually answered this request.
    source: str
    port: str | None
    # The RESULT packet: as received from the board, or as result.sv would send it.
    reply: bytes
    # Whether this run also sent the 10 WEIGHTS packets, after a connect or reset.
    weights_sent: bool = False


class Board(Protocol):
    def run(self, grid: np.ndarray) -> BoardRun: ...

    def source(self) -> str: ...


class EmulatedBoard:
    def __init__(self, weights: np.ndarray) -> None:
        self._weights = weights

    def run(self, grid: np.ndarray) -> BoardRun:
        result = emulate(grid, self._weights)
        return BoardRun(result=result, source="emulated", port=None, reply=encode_result(result))

    def source(self) -> str:
        return "emulated"


class _NoReply(Exception):
    """The read timed out partway through or before a reply."""


class SerialBoard:
    """The FPGA on one serial port. One request talks to it at a time."""

    def __init__(
        self,
        port: str,
        weights: np.ndarray,
        *,
        serial_factory: Callable[..., Any] = serial.Serial,
    ) -> None:
        self.port = port
        self._weights = weights
        self._serial_factory = serial_factory
        self._conn: Any = None
        # weights.sv clears every weight on reset, and the host can't see a
        # reset happen, so this is only a belief that run() corrects.
        self._weights_loaded = False
        self._lock = threading.Lock()

    def source(self) -> str:
        return "fpga"

    def available(self) -> bool:
        """Whether the port opens. Says nothing about whether the board answers."""
        with self._lock:
            try:
                self._open()
            except BoardUnavailableError:
                return False
            return True

    def run(self, grid: np.ndarray) -> BoardRun:
        frame = encode_frame(grid)
        with self._lock:
            self._open()
            weights_sent = False
            try:
                if not self._weights_loaded:
                    self._load_weights()
                    weights_sent = True
                reply = self._run_once(frame)
                result = self._parse(reply)
                # A board reset since the last load scores every digit 0. Reload
                # once rather than report ten zeros as a tie.
                if not any(result.scores) and np.any(grid) and np.any(self._weights):
                    self._load_weights()
                    weights_sent = True
                    reply = self._run_once(frame)
                    result = self._parse(reply)
            except SynapseError:
                self._weights_loaded = False
                raise
        return BoardRun(result=result, source="fpga", port=self.port, reply=reply.raw, weights_sent=weights_sent)

    def close(self) -> None:
        with self._lock:
            self._close()

    def _open(self) -> None:
        if self._conn is not None:
            return
        if not self.port:
            raise BoardUnavailableError("No serial port is set.", detail="Set SYNAPSE_SERIAL_PORT, e.g. COM5.")
        try:
            self._conn = self._serial_factory(
                self.port,
                baudrate=BAUD_RATE,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=READ_TIMEOUT_S,
            )
        except (serial.SerialException, OSError) as err:
            raise BoardUnavailableError(f"Could not open serial port {self.port}.", detail=str(err)) from err
        self._weights_loaded = False

    def _close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except (serial.SerialException, OSError):
                pass
            self._conn = None

    def _load_weights(self) -> None:
        for digit in range(DIGITS):
            self._transact(encode_weights(digit, self._weights[digit]), OP_ACK)
        self._weights_loaded = True

    def _run_once(self, frame: bytes) -> Reply:
        self._transact(frame, OP_ACK)
        return self._transact(encode_run(), OP_RESULT)

    def _parse(self, reply: Reply) -> Result:
        try:
            return parse_result(reply.payload)
        except ReplyError as err:
            raise BoardProtocolError("Board sent a malformed RESULT.", detail=f"{err} Bytes: {reply.raw.hex(' ')}") from err

    def _transact(self, packet: bytes, expect: int) -> Reply:
        """Send one packet and return the reply, retrying once on silence or a bad answer."""
        failure: SynapseError | None = None
        for _ in range(ATTEMPTS):
            try:
                # Stale bytes from an earlier, abandoned reply would be read as this one's.
                self._conn.reset_input_buffer()
                # One write, so the bytes leave back to back and packet.sv's
                # 10 ms timeout can't fire mid-packet.
                self._conn.write(packet)
                self._conn.flush()
                raw = self._read_packet()
            except _NoReply:
                failure = BoardUnavailableError(
                    f"No reply from the board on {self.port}.",
                    detail=f"Sent opcode 0x{packet[1]:02X}; waited {READ_TIMEOUT_S * 1000:.0f} ms.",
                )
                continue
            except (serial.SerialException, OSError) as err:
                # Unplugged mid-run. Drop the handle so the next request reopens it.
                self._close()
                raise BoardUnavailableError(f"Lost serial port {self.port}.", detail=str(err)) from err

            try:
                reply = decode_reply(raw)
            except ReplyError as err:
                failure = BoardProtocolError("Board sent a corrupt packet.", detail=f"{err} Bytes: {raw.hex(' ')}")
                continue
            if reply.opcode == OP_NACK:
                code = reply.payload[0] if reply.payload else None
                reason = NACK_REASONS.get(code, "unknown reason") if code is not None else "no reason byte"
                failure = BoardProtocolError(
                    f"Board rejected opcode 0x{packet[1]:02X}: {reason}.", detail=f"Bytes: {raw.hex(' ')}"
                )
                continue
            if reply.opcode != expect:
                failure = BoardProtocolError(
                    f"Expected reply opcode 0x{expect:02X}, got 0x{reply.opcode:02X}.",
                    detail=f"Bytes: {raw.hex(' ')}",
                )
                continue
            return reply
        assert failure is not None
        raise failure

    def _read_packet(self) -> bytes:
        # Skip anything before sync, such as a glitch byte from a board reset.
        while True:
            first = self._conn.read(1)
            if not first:
                raise _NoReply
            if first[0] == SYNC:
                break
        head = self._conn.read(2)
        if len(head) < 2:
            raise _NoReply
        # Payload plus the checksum byte.
        rest = self._conn.read(head[1] + 1)
        if len(rest) < head[1] + 1:
            raise _NoReply
        return bytes([SYNC]) + head + rest


class AutoBoard:
    """The FPGA when its port opens, the emulator when it doesn't.

    A board that opens but never answers still raises: falling back there
    would hide a real hardware fault behind a working-looking result.
    """

    def __init__(self, serial_board: SerialBoard, emulated: EmulatedBoard) -> None:
        self._serial = serial_board
        self._emulated = emulated

    def run(self, grid: np.ndarray) -> BoardRun:
        if self._serial.available():
            return self._serial.run(grid)
        return self._emulated.run(grid)

    def source(self) -> str:
        return "fpga" if self._serial.available() else "emulated"


@cache
def get_board() -> Board:
    """The board this process uses, chosen once from SYNAPSE_BOARD and SYNAPSE_SERIAL_PORT."""
    mode = os.environ.get("SYNAPSE_BOARD", "auto").strip().lower()
    port = os.environ.get("SYNAPSE_SERIAL_PORT", "").strip()
    weights = load_weights()
    if mode == "emulated":
        return EmulatedBoard(weights)
    if mode == "fpga":
        return SerialBoard(port, weights)
    if mode != "auto":
        raise ValueError(f"SYNAPSE_BOARD is {mode!r}; expected auto, fpga or emulated.")
    if not port:
        return EmulatedBoard(weights)
    return AutoBoard(SerialBoard(port, weights), EmulatedBoard(weights))

