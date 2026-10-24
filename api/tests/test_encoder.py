import numpy as np
import pytest

from app.services.encoder import (
    OP_ACK,
    OP_RESULT,
    ReplyError,
    Result,
    checksum,
    decode_reply,
    encode_frame,
    encode_packet,
    encode_ping,
    encode_result,
    encode_run,
    encode_weights,
    parse_result,
)


def test_ping_matches_the_worked_example_in_packet_theory() -> None:
    # docs/packet_theory.md: A5 ^ 01 ^ 00 = A4.
    assert encode_ping() == bytes([0xA5, 0x01, 0x00, 0xA4])


def test_run_has_an_empty_payload() -> None:
    assert encode_run() == bytes([0xA5, 0x04, 0x00, 0xA5 ^ 0x04])


def test_frame_is_row_major_with_length_0x40() -> None:
    grid = np.arange(64, dtype=np.uint8).reshape(8, 8)
    packet = encode_frame(grid)
    assert packet[:3] == bytes([0xA5, 0x02, 0x40])
    # Cell 0 is grid[0][0], cell 8 is grid[1][0], as frame.sv stores them.
    assert list(packet[3:-1]) == list(range(64))
    assert packet[-1] == checksum(packet[:-1])
    assert len(packet) == 68


def test_frame_rejects_the_wrong_shape_or_dtype() -> None:
    with pytest.raises(ValueError, match="8x8"):
        encode_frame(np.zeros((7, 8), dtype=np.uint8))
    with pytest.raises(ValueError, match="uint8"):
        encode_frame(np.zeros((8, 8), dtype=np.int32))


def test_weights_are_two_complement_after_the_digit_byte() -> None:
    row = np.zeros(64, dtype=np.int8)
    row[0], row[1], row[63] = -1, -128, 127
    packet = encode_weights(3, row)
    assert packet[:4] == bytes([0xA5, 0x03, 0x41, 3])
    assert packet[4] == 0xFF
    assert packet[5] == 0x80
    assert packet[67] == 0x7F
    assert len(packet) == 69


def test_weights_reject_a_bad_digit_or_range() -> None:
    with pytest.raises(ValueError, match="Digit"):
        encode_weights(10, np.zeros(64, dtype=np.int8))
    with pytest.raises(ValueError, match="signed byte"):
        encode_weights(0, np.full(64, 200))


def test_result_round_trips_negative_scores_and_the_tie_flag() -> None:
    # -2088960 is the most negative 22-bit sum: 64 * 255 * -128.
    scores = [-2088960, 0, 1, -1, 500, 32640, -32640, 7, 8, 9]
    packet = encode_result(Result(scores=scores, digit=5, tie=True))
    assert packet[:3] == bytes([0xA5, OP_RESULT, 42])
    assert len(packet) == 46
    reply = decode_reply(packet)
    assert parse_result(reply.payload) == Result(scores=scores, digit=5, tie=True)


def test_decode_reply_reads_an_ack() -> None:
    reply = decode_reply(bytes([0xA5, 0x82, 0x01, 0x00, 0x26]))
    assert reply.opcode == OP_ACK
    assert reply.payload == b"\x00"


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        (bytes([0xA5, 0x82, 0x01, 0x00, 0x27]), "Checksum"),
        (bytes([0x5A, 0x82, 0x01, 0x00, 0x26]), "sync"),
        (bytes([0xA5, 0x82, 0x02, 0x00, 0x26]), "Length"),
        (bytes([0xA5, 0x82]), "at least"),
    ],
)
def test_decode_reply_rejects_corrupt_packets(raw: bytes, message: str) -> None:
    with pytest.raises(ReplyError, match=message):
        decode_reply(raw)


def test_parse_result_rejects_a_short_payload() -> None:
    with pytest.raises(ReplyError, match="42"):
        parse_result(b"\x00" * 41)


def test_packet_refuses_more_than_255_payload_bytes() -> None:
    with pytest.raises(ValueError, match="255"):
        encode_packet(0x02, b"\x00" * 256)
