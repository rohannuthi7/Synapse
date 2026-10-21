# Synapse

Identify a digit, 0 through 9, from an 8×8 grid of light cells. Each cell becomes one bit. Each digit owns a weight for every cell. The digit with the largest weighted sum is the prediction.

```text
light on a cell  →  one bit  →  ten weighted sums  →  the winning digit
```

The sensing happens in a small analog circuit on each cell. The sum happens after the bits exist. On the Von Neumann path the weights live in memory, and the same stored weights are reused for the next frame.

## Software to hardware

![Software to hardware bridge. Python and FastAPI send bytes over USB to a UART adapter. Three jumpers carry the frame and the weights into the FPGA and carry the result back. The FPGA is SystemVerilog.](hardware_schemas/hardwaresoftware_bridge.png)

The browser is TypeScript. It posts the picture to a Python FastAPI server. That server is the side that opens the serial port. One USB cable runs from the laptop to a USB-UART adapter. The adapter is the only translator. Python speaks bytes. The FPGA speaks a pin that sits high or low. The chip on the adapter, commonly an FT232, CP2102, or CH340, turns one into the other.

Three jumpers leave the adapter. Each `tx` pin faces the other machine.

| Adapter | FPGA, DE1-SoC GPIO_0 | Quartus pin | What moves |
|---|---|---|---|
| TX | `rx` | `PIN_AC18` | `FRAME` and `WEIGHTS`, into the board |
| RX | `tx` | `PIN_Y17` | `RESULT`, back to Python |
| GND | GND | | shared 0 V, no bits |

The adapter is 3.3 V. Its 5 V pin stays unconnected. The 50 MHz clock is already on the board at `PIN_AF14`. The USB-Blaster is a second cable and only loads the bitstream.

The line is 115200 baud, 8 data bits, no parity, 1 stop bit, least-significant bit first. One bit is 434 clocks of the 50 MHz clock, 8.68 µs. A byte on the wire is a low start bit, eight data bits, and a high stop bit, 86.8 µs.

`FRAME` is 8 bytes, not 64. Cell 0 is bit 0 of byte 0. A lit cell is 1. `WEIGHTS` is one digit byte plus 64 signed weight bytes. The weights are loaded once and then kept. Each later picture is just the 8-byte frame.

`rtl/uart_rx.sv` samples `rx`. `rtl/score.sv` scores the bits. `rtl/uart_tx.sv` drives `tx`. `rtl/synapse_top.sv` is where those three meet the pins.

## 8×8 datapath

![Von Neumann 8×8 architecture. Software sends a frame and ten weight maps across UART. Each lit cell adds its weight, and an adder tree reduces those values to one score per digit.](hardware_schemas/VNarch_8x8.png)

Software owns the frame and the weights. The frame is 64 bits, one per cell: 1 is lit, 0 is dark. Each digit has its own 64 weights, so memory holds 10 × 64 = 640 weights. A UART link is the bridge. The host writes the bits into an 8×8 register file and writes each digit's weights into `W0` through `W9`.

A cell is one bit, so a lit cell contributes its weight and a dark cell contributes 0. The multiply boxes in the figure are that choice. `score.sv` writes it as `x[i] ? weight : 0`. There is no 8-by-8 multiplier. The 64 chosen values for one digit then fold down an adder tree:

| Stage | Adders | What they combine |
|---|---|---|
| L0 | 32 | 64 cell values, taken in pairs |
| L1 | 16 | the 32 pair-sums |
| L2 | 8 | |
| L3 | 4 | |
| L4 | 2 | |
| L5 | 1 | the score for that digit |

Ten of those trees produce `s0` through `s9`. The largest score is the prediction. A tie stays a tie. The ten sums go back across the UART to the host.

Each weight is a signed 8-bit number, from −128 to 127. The sum is signed 16-bit. Sixty-four weights of ±127 reach at most ±8128, which fits. The figure left that width open. The RTL has chosen it.

## Cell

The bit itself comes from one analog circuit per cell. The weight is not in this circuit. The LDR only decides whether the cell is lit.

```text
Vdd
 │
LDR                        resistance falls when the cell is lit
 │
 ├─ VL ── C ────── GND     holds the voltage
 │        Rb ───── GND     sets the dark level
 │        Reset ── GND     clears the cell before the next frame
 │
Rser
 │
 ├──────── (+) comparator
 │           (−) comparator  = VTH
Rh
 │
Vo                         1 when VL is above the threshold
```

| Part | What it does |
|---|---|
| `LDR`, `Rb` | A divider. Light lowers the LDR resistance, so `VL` rises. Darkness makes `VL` fall toward 0. |
| `C` | Holds `VL` and slows the edges. A brief shadow does not flip the bit by itself. |
| `Reset` | Shorts `C` to ground before the next frame, so a cell that was 1 can become 0. |
| Comparator | `Vo` is 1 when `VL` is above `VTH`, and 0 otherwise. Everything above the threshold is the same 1. |
| `Rh`, `Rser` | A little of `Vo` shifts the threshold. Once the bit is 1, it takes a slightly lower voltage to fall back to 0, so the bit does not chatter on the threshold. |

```text
VL  →  Vdd · Rb / (Rb + LDR)
```

A frame is one pass over the grid:

1. Close `Reset`. Every capacitor is forced to ground.
2. Open `Reset`. Light on each LDR starts charging that cell's `C`.
3. Wait the same settle time on every frame. It has to be long enough for the dimmest stroke that should still count as lit.
4. Read all 64 comparator outputs into `x`.
5. Compute the ten scores and emit `x` together with the winning digit.

## Score

Number the cells in row-major order. Cell 0 is the top-left bit of the first byte. Digit `d` scores

```text
score(d)  =  Σ  w(d, i) · x(i)     i = 0 … 63
```

A dark cell adds nothing, because `x(i)` is `1'b0`. A lit cell adds `w(d, i)` itself, because `x(i)` is `1'b1`. Negative weights are allowed: a lit cell can vote against a digit. A cell that lights only for an 8 should carry a large positive weight on 8 and a small or negative weight on the digits that are dark there.

```text
x        =  [ 1,  0,  1 ]
w(0)     =  [ 1,  1, −1 ]     score(0) = 1·1 + 0·1 + 1·(−1) = 0
w(1)     =  [ 1, −1,  1 ]     score(1) = 1·1 + 0·(−1) + 1·1 = 2
```

The middle cell is dark, so its weights never enter the sum. The third cell is lit, which counts for digit 1 and against digit 0. The prediction is 1.

The weights come from example digits and are then held fixed. The grid is reliable when one digit fills it, stays centered, and is much brighter than an empty cell. It classifies the pattern already sitting on the cells. It does not search a page for a digit.

The same cells stop lining up with the weights when the digit is shifted by a cell, drawn larger or smaller than the examples, drawn with a much thicker or thinner stroke, or written in a hand the weights never saw. Ambient light can turn empty cells on. A threshold that differs from cell to cell can make the same brightness a 1 on one cell and a 0 on its neighbor. An 8 and a 0 differ by only a few middle cells, so one flipped bit there can swap the winner.

## Outputs

| Output | What it is |
|---|---|
| Bits | The 8×8 image, one bit per cell |
| Scores | Ten sums, digits 0 through 9 |
| Digit | The winner of those scores. A tie is reported as a tie. |
