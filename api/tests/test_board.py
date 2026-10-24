import numpy as np
import pytest
import serial

from app.errors import BoardProtocolError, BoardUnavailableError
from app.services.board import AutoBoard, EmulatedBoard, SerialBoard, emulate, load_weights
from app.services.encoder import (
    OP_ACK,
    OP_FRAME,
    OP_NACK,
    OP_PING,
    OP_RUN,
    OP_WEIGHTS,
    Result,
    checksum,
    encode_packet,
    encode_result,
)


def frame_of(cells: list[int]) -> np.ndarray:
    grid = np.zeros(64, dtype=np.uint8)
    grid[: len(cells)] = cells
    return grid.reshape(8, 8)


def weights_of(rows: dict[int, list[int]]) -> np.ndarray:
    weights = np.zeros((10, 64), dtype=np.int8)
    for digit, row in rows.items():
        weights[digit, : len(row)] = row
    return weights


class FakeSerial:
    """Answers like synapse_top: parses whole packets and replies ACK, NACK or RESULT."""

    def __init__(self) -> None:
        self.x = np.zeros(64, dtype=np.uint8)
        self.w = np.zeros((10, 64), dtype=np.int8)
        self.out = bytearray()
        self.received: list[int] = []  # opcodes of good packets, in order
        self.drop_next = 0  # replies to swallow, as if lost on the wire
        self.nack_next = 0  # good packets to answer with a bad-checksum NACK
        self.garbage_next = 0  # replies to corrupt
        self.closed = False

    def reset_board(self) -> None:
        """KEY0: weights.sv and frame.sv clear to 0."""
        self.x[:] = 0
        self.w[:] = 0

    def reset_input_buffer(self) -> None:
        self.out.clear()

    def flush(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True

    def read(self, n: int) -> bytes:
        chunk = bytes(self.out[:n])
        del self.out[:n]
        return chunk

    def write(self, packet: bytes) -> int:
        assert packet[0] == 0xA5 and packet[-1] == checksum(packet[:-1])
        opcode, payload = packet[1], packet[3:-1]
        if self.nack_next:
            self.nack_next -= 1
            self._reply(encode_packet(OP_NACK, b"\x01"))
            return len(packet)
        self.received.append(opcode)
        if opcode == OP_FRAME:
            self.x[:] = np.frombuffer(payload, dtype=np.uint8)
            self._reply(encode_packet(OP_ACK, b"\x00"))
        elif opcode == OP_WEIGHTS:
            self.w[payload[0]] = np.frombuffer(payload[1:], dtype=np.int8)
            self._reply(encode_packet(OP_ACK, b"\x00"))
        elif opcode == OP_PING:
            self._reply(encode_packet(OP_ACK, b"\x00"))
        elif opcode == OP_RUN:
            self._reply(encode_result(emulate(self.x, self.w)))
        return len(packet)

    def _reply(self, packet: bytes) -> None:
        if self.drop_next:
            self.drop_next -= 1
            return
        if self.garbage_next:
            self.garbage_next -= 1
            packet = packet[:-1] + bytes([packet[-1] ^ 0xFF])
        self.out += packet


WEIGHTS = weights_of({0: [1, 1, -1], 1: [1, -1, 1]})


def make_board(fake: FakeSerial, weights: np.ndarray = WEIGHTS) -> SerialBoard:
    return SerialBoard("COM9", weights, serial_factory=lambda *a, **k: fake)


def test_emulator_matches_the_worked_example_in_projectspecs() -> None:
    # docs/projectspecs.txt: x = [200, 0, 50] scores 150 for digit 0 and 250 for digit 1.
    result = emulate(frame_of([200, 0, 50]), WEIGHTS)
    assert result.scores[:2] == [150, 250]
    assert result.digit == 1
    assert result.tie is False


def test_emulator_ties_go_to_the_lowest_digit_with_the_flag_set() -> None:
    weights = weights_of({3: [1], 7: [1]})
    result = emulate(frame_of([10]), weights)
    assert result.digit == 3
    assert result.tie is True


def test_emulator_reaches_the_22_bit_extremes_without_wrapping() -> None:
    weights = np.full((10, 64), -128, dtype=np.int8)
    weights[9] = 127
    result = emulate(np.full((8, 8), 255, dtype=np.uint8), weights)
    assert result.scores[0] == -2088960
    assert result.scores[9] == 64 * 255 * 127
    assert result.digit == 9


def test_serial_board_loads_weights_once_then_sends_frame_and_run() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    first = board.run(frame_of([200, 0, 50]))
    assert first.source == "fpga" and first.port == "COM9"
    assert first.result == Result(scores=[150, 250] + [0] * 8, digit=1, tie=False)
    assert fake.received == [OP_WEIGHTS] * 10 + [OP_FRAME, OP_RUN]
    assert first.reply[:3] == bytes([0xA5, 0x83, 42])
    assert first.weights_sent is True

    fake.received.clear()
    assert board.run(frame_of([0, 0, 50])).weights_sent is False
    assert fake.received == [OP_FRAME, OP_RUN]


def test_serial_board_reloads_weights_after_a_board_reset() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    board.run(frame_of([200, 0, 50]))
    fake.reset_board()
    fake.received.clear()
    result = board.run(frame_of([200, 0, 50])).result
    assert result.digit == 1
    assert fake.received == [OP_FRAME, OP_RUN] + [OP_WEIGHTS] * 10 + [OP_FRAME, OP_RUN]


def test_a_blank_frame_scoring_zero_does_not_trigger_a_reload() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    board.run(frame_of([200]))
    fake.received.clear()
    board.run(frame_of([]))
    assert fake.received == [OP_FRAME, OP_RUN]


def test_one_lost_reply_is_retried() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    board.run(frame_of([1]))
    fake.drop_next = 1
    assert board.run(frame_of([200, 0, 50])).result.digit == 1


def test_one_nack_is_retried() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    board.run(frame_of([1]))
    fake.nack_next = 1
    assert board.run(frame_of([200, 0, 50])).result.digit == 1


def test_a_silent_board_raises_unavailable_and_forgets_its_weights() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    board.run(frame_of([1]))
    fake.drop_next = 2
    with pytest.raises(BoardUnavailableError, match="No reply"):
        board.run(frame_of([1]))
    fake.received.clear()
    board.run(frame_of([1]))
    assert fake.received[:10] == [OP_WEIGHTS] * 10


def test_repeated_nacks_raise_protocol_error_with_the_reason() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    fake.nack_next = 2
    with pytest.raises(BoardProtocolError, match="bad checksum"):
        board.run(frame_of([1]))


def test_repeated_corrupt_replies_raise_protocol_error() -> None:
    fake = FakeSerial()
    board = make_board(fake)
    fake.garbage_next = 2
    with pytest.raises(BoardProtocolError, match="corrupt"):
        board.run(frame_of([1]))


def test_a_port_that_will_not_open_is_unavailable() -> None:
    def refuse(*_args, **_kwargs):
        raise serial.SerialException("could not open port 'COM9'")

    board = SerialBoard("COM9", WEIGHTS, serial_factory=refuse)
    assert board.available() is False
    with pytest.raises(BoardUnavailableError, match="COM9"):
        board.run(frame_of([1]))


def test_no_port_set_is_unavailable() -> None:
    with pytest.raises(BoardUnavailableError, match="No serial port"):
        SerialBoard("", WEIGHTS).run(frame_of([1]))


def test_auto_board_falls_back_only_when_the_port_will_not_open() -> None:
    def refuse(*_args, **_kwargs):
        raise serial.SerialException("no such port")

    auto = AutoBoard(SerialBoard("COM9", WEIGHTS, serial_factory=refuse), EmulatedBoard(WEIGHTS))
    run = auto.run(frame_of([200, 0, 50]))
    assert run.source == "emulated"
    assert run.result.digit == 1
    assert auto.source() == "emulated"

    fake = FakeSerial()
    auto = AutoBoard(make_board(fake), EmulatedBoard(WEIGHTS))
    assert auto.run(frame_of([200, 0, 50])).source == "fpga"
    assert auto.source() == "fpga"


def test_emulated_board_and_fake_fpga_agree_on_the_shipped_weights() -> None:
    weights = load_weights()
    rng = np.random.default_rng(0)
    board = make_board(FakeSerial(), weights)
    emulated = EmulatedBoard(weights)
    for _ in range(20):
        grid = rng.integers(0, 256, size=(8, 8), dtype=np.uint8)
        assert board.run(grid).reply == emulated.run(grid).reply
