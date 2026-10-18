# UART config

Cyclone V and the Python host. 

## Line

| Setting | Value |
|---|---|
| Baud | 115200 |
| Data bits | 8 |
| Parity | None |
| Stop bits | 1 |
| Flow control | None |
| Bit order | Least significant bit first |
| Idle level | High |

`CLKS_PER_BIT` is the board clock divided by 115200, rounded to the nearest integer. A 50 MHz clock uses **434**.

| FPGA | Adapter |
|---|---|
| TX | RX |
| RX | TX |
| GND | GND |

Pins are **3.3 V**. The two wires can carry traffic at the same time. The host still sends one command and waits for the reply before the next write.

## Packet

Every message, in both directions:

```
+----------+----------+----------+----------------+------------+
| Sync     | Opcode   | Length   | Payload        | Checksum   |
| 1 byte   | 1 byte   | 1 byte   | Length bytes   | 1 byte     |
| 0xA5     |          |          |                | XOR        |
+----------+----------+----------+----------------+------------+
```

| Field | Size | Value |
|---|---|---|
| Sync | 1 | `0xA5` |
| Opcode | 1 | see below |
| Length | 1 | number of payload bytes |
| Payload | Length | command data |
| Checksum | 1 | XOR of every preceding byte |

## Host to board

| Opcode | Name | Payload | Reply |
|---|---|---|---|
| `0x01` | PING | empty | ACK |
| `0x02` | FRAME | 8 bytes, the 8×8 image | ACK |
| `0x03` | WEIGHTS | 65 bytes | ACK |
| `0x04` | RUN | empty | RESULT |

A bad packet is answered with NACK signal. 

**FRAME**. Cell 0 is bit 0 of byte 0. A lit cell is 1.

**WEIGHTS**. Digits 0-9, the next 64 bytes are signed weights for cells 0 through 63.

## Board to host

| Opcode | Name | Payload |
|---|---|---|
| `0x81` | PONG | 1 byte, version `0x01` |
| `0x82` | ACK | 1 byte, the opcode just accepted |
| `0x83` | RESULT | 22 bytes |
| `0x84` | NACK | 1 byte, reason |

### RESULT

| Offset | Size | Field |
|---|---|---|
| 0 | 20 | Ten little-endian int16 scores, digits 0 through 9 |
| 20 | 1 | Winner |
| 21 | 1 | Flags |

Flags bit 0 set means the top score was a tie, and the winner byte is ignored.

### NACK reasons

| Code | Reason |
|---|---|
| `0x01` | Bad checksum |
| `0x02` | Unknown opcode |
| `0x03` | Length does not match the opcode |
