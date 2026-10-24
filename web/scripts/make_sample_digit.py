"""Write web/public/sample-digit.png, the image behind "Try a sample digit".

The digit is sample 7 of scikit-learn's load_digits (UCI optical recognition
of handwritten digits): an 8x8 grid of 0-16 ink values. It is upscaled
smoothly and drawn as dark ink on light, slightly warm paper with a margin, so
every backend stage has real work to do: grayscale drops the tint, polarity
flips the bright paper, and crop finds the digit inside the margin.

Run once from the repo root; it needs scikit-learn and Pillow, which are not
backend dependencies:

    python -m pip install scikit-learn pillow
    python web/scripts/make_sample_digit.py
"""

from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.datasets import load_digits

SAMPLE_INDEX = 7  # a clear "7"
DIGIT_SIDE = 480  # pixels the padded 10x10 grid is stretched to
CANVAS_SIDE = 640  # the digit sits off-center inside this, so crop has work
DIGIT_OFFSET = (40, 100)  # (top, left) of the digit on the canvas
PAPER = np.array([232, 223, 202], dtype=np.float32)
INK = np.array([37, 65, 143], dtype=np.float32)

OUT = Path(__file__).resolve().parents[1] / "public" / "sample-digit.png"


def main() -> None:
    digits = load_digits()
    assert digits.target[SAMPLE_INDEX] == 7
    # 0-16 ink amount, scaled to 0-255 so Pillow can resample it.
    ink = (digits.images[SAMPLE_INDEX] / 16 * 255).astype(np.uint8)
    # A ring of empty cells lets strokes that touch the 8x8 edge fade out
    # instead of ending in a hard line after resampling.
    ink = np.pad(ink, 1)
    # Bicubic, not nearest: soft strokes look like a pen, not a pixel grid.
    stretched = Image.fromarray(ink).resize((DIGIT_SIDE, DIGIT_SIDE), Image.BICUBIC)

    amount = np.zeros((CANVAS_SIDE, CANVAS_SIDE), dtype=np.float32)
    top, left = DIGIT_OFFSET
    amount[top : top + DIGIT_SIDE, left : left + DIGIT_SIDE] = (
        np.asarray(stretched, dtype=np.float32) / 255
    )

    # Blend paper toward ink by the ink amount at each pixel.
    rgb = PAPER + (INK - PAPER) * amount[..., None]
    Image.fromarray(np.rint(rgb).astype(np.uint8), "RGB").save(OUT, optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
