"""Bring-up check for the FPGA over the USB-UART adapter. Run this before the API.

Steps, stopping at the first failure:
  1. PING gets an ACK: the wiring, baud rate and bitstream work.
  2. A PING with a wrong checksum gets NACK 0x01: packet.sv checks checksums.
  3. The 10 WEIGHTS packets each get an ACK.
  4. N random frames: every RESULT matches the Python emulator byte for byte.

Run from api/ with the board programmed and the adapter plugged in:

    python scripts/board_check.py --port COM5
    python scripts/board_check.py --port COM5 --frames 500
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import serial

API_ROOT = Path(__file__).resolve().parents[1]
# Run as a plain script, so app/ is not importable without this.
sys.path.insert(0, str(API_ROOT))

from app.services.board import BAUD_RATE, READ_TIMEOUT_S, EmulatedBoard, load_weights  # noqa: E402
from app.services.encoder import (  # noqa: E402
    OP_ACK,
    OP_NACK,
    OP_PING,
    SYNC,
    decode_reply,
    encode_frame,
    encode_ping,
    encode_run,
    encode_weights,
)


def transact(conn: serial.Serial, packet: bytes) -> tuple[bytes, float]:
    """Send one packet; return the raw reply (empty on timeout) and round-trip ms."""
    conn.reset_input_buffer()
    start = time.perf_counter()
    conn.write(packet)
    conn.flush()
    first = conn.read(1)
    while first and first[0] != SYNC:
        first = conn.read(1)
    if not first:
        return b"", (time.perf_counter() - start) * 1000
    head = conn.read(2)
    rest = conn.read(head[1] + 1) if len(head) == 2 else b""
    return first + head + rest, (time.perf_counter() - start) * 1000


def expect(step: str, raw: bytes, opcode: int, arg: int | None = None) -> None:
    if not raw:
        sys.exit(f"FAIL {step}: no reply within {READ_TIMEOUT_S * 1000:.0f} ms")
    reply = decode_reply(raw)
    if reply.opcode != opcode or (arg is not None and reply.payload[:1] != bytes([arg])):
        sys.exit(f"FAIL {step}: got {raw.hex(' ')}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", required=True, help="e.g. COM5 or /dev/ttyUSB0")
    parser.add_argument("--frames", type=int, default=100, help="random frames to compare (default 100)")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    weights = load_weights()
    emulated = EmulatedBoard(weights)

    with serial.Serial(args.port, baudrate=BAUD_RATE, timeout=READ_TIMEOUT_S) as conn:
        raw, ms = transact(conn, encode_ping())
        expect("PING", raw, OP_ACK, 0x00)
        print(f"ok   PING -> ACK ({ms:.1f} ms)")

        bad_ping = bytes([SYNC, OP_PING, 0x00, 0x00])
        raw, ms = transact(conn, bad_ping)
        expect("bad checksum", raw, OP_NACK, 0x01)
        print(f"ok   bad checksum -> NACK 01 ({ms:.1f} ms)")

        start = time.perf_counter()
        for digit in range(10):
            raw, _ = transact(conn, encode_weights(digit, weights[digit]))
            expect(f"WEIGHTS {digit}", raw, OP_ACK, 0x00)
        print(f"ok   10 WEIGHTS -> ACK ({(time.perf_counter() - start) * 1000:.1f} ms)")

        rng = np.random.default_rng(args.seed)
        mismatches = 0
        times = []
        for i in range(args.frames):
            grid = rng.integers(0, 256, size=(8, 8), dtype=np.uint8)
            raw, frame_ms = transact(conn, encode_frame(grid))
            expect(f"FRAME {i}", raw, OP_ACK, 0x00)
            got, run_ms = transact(conn, encode_run())
            times.append(frame_ms + run_ms)
            want = emulated.run(grid).reply
            if got != want:
                mismatches += 1
                if mismatches <= 3:
                    print(f"FAIL frame {i}:\n  got  {got.hex(' ')}\n  want {want.hex(' ')}")

    status = "ok  " if mismatches == 0 else "FAIL"
    print(
        f"{status} {args.frames - mismatches}/{args.frames} RESULTs match the emulator "
        f"(FRAME+RUN median {np.median(times):.1f} ms, max {max(times):.1f} ms)"
    )
    sys.exit(1 if mismatches else 0)


if __name__ == "__main__":
    main()
