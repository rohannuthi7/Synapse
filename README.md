# Synapse

Identify a digit from an n×n grid of light cells. Each cell becomes a bit. A fixed weight on every bit votes for a digit.

## Cell

One cell is a small analog circuit.

- `LDR` sits between the supply and the sense node. Light lowers its resistance.
- `Rb` sits between the sense node and ground. Together they set a voltage that is high when the cell is lit and low when it is dark.
- `C` holds that voltage. `Reset` shorts the capacitor to ground before the next frame so a dark cell can return to 0.
- A comparator watches the capacitor. `Vo` is 1 when the capacitor voltage is above `VTH`, and 0 otherwise.
- `Rh` feeds a little of `Vo` back to the comparator input so the bit does not flicker when the voltage sits on the threshold.

## Grid

n×n cells are read together. The bits are the image of one digit.

Each digit from 0 to 9 owns a weight for every cell. Its score is the weighted sum of the bits. The digit with the largest score is the prediction.

The weights are chosen from example digits and then held fixed. The grid is reliable when one digit fills it, stays centered, and is high contrast. Shift, scale, stroke thickness, and handwriting move the lit cells off those weights.

## Outputs

The n×n bits and the winning digit.
