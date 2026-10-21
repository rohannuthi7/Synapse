import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.errors import ImageDimensionsTooLargeError, InvalidImageError
from app.services import preprocess
from app.services.preprocess import (
    decode,
    fix_orientation,
    flatten_alpha,
    normalize_polarity,
    otsu_threshold,
    to_grayscale,
)

ORIENTATION = 0x0112


def make_image_bytes(fmt: str) -> bytes:
    img = Image.new("RGB", (20, 10), "white")
    ImageDraw.Draw(img).rectangle((5, 2, 14, 7), fill="black")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def make_oriented_jpeg(orientation: int | None) -> bytes:
    # 20x10 white with a black 3x3 block top-left, so any rotation or flip
    # moves the block somewhere checkable.
    img = Image.new("L", (20, 10), 255)
    ImageDraw.Draw(img).rectangle((0, 0, 2, 2), fill=0)
    exif = Image.Exif()
    if orientation is not None:
        exif[ORIENTATION] = orientation
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_decodes_png() -> None:
    img = decode(make_image_bytes("PNG"))
    assert img.size == (20, 10)
    assert img.format == "PNG"


def test_decodes_jpeg() -> None:
    img = decode(make_image_bytes("JPEG"))
    assert img.size == (20, 10)
    assert img.format == "JPEG"


def test_truncated_png_is_invalid() -> None:
    # The signature is intact, so validate.py would accept this; only a full
    # decode notices the missing data.
    data = make_image_bytes("PNG")
    with pytest.raises(InvalidImageError):
        decode(data[: len(data) // 2])


def test_png_signature_with_garbage_is_invalid() -> None:
    with pytest.raises(InvalidImageError):
        decode(b"\x89PNG\r\n\x1a\n" + b"garbage" * 10)


def test_too_many_pixels_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(preprocess, "MAX_PIXELS", 100)
    with pytest.raises(ImageDimensionsTooLargeError):
        decode(make_image_bytes("PNG"))


def test_orientation_6_rotates_pixels_clockwise() -> None:
    img = fix_orientation(decode(make_oriented_jpeg(6)))
    assert img.size == (10, 20)
    assert img.getpixel((8, 1)) < 80  # block moved to top-right
    assert img.getpixel((1, 1)) > 180  # old top-left is now blank


def test_orientation_6_tag_is_removed() -> None:
    img = fix_orientation(decode(make_oriented_jpeg(6)))
    assert img.getexif().get(ORIENTATION, 1) == 1


def test_orientation_2_flips_horizontally() -> None:
    img = fix_orientation(decode(make_oriented_jpeg(2)))
    assert img.size == (20, 10)
    assert img.getpixel((18, 1)) < 80  # block moved to top-right
    assert img.getpixel((1, 1)) > 180


def test_orientation_1_is_unchanged() -> None:
    original = decode(make_oriented_jpeg(1))
    img = fix_orientation(original)
    assert img.size == (20, 10)
    assert img.tobytes() == original.tobytes()


def test_untagged_image_is_unchanged() -> None:
    original = decode(make_oriented_jpeg(None))
    img = fix_orientation(original)
    assert img.size == (20, 10)
    assert img.tobytes() == original.tobytes()


def test_malformed_exif_returns_original(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(_img: Image.Image) -> Image.Image:
        raise SyntaxError("bad exif")

    monkeypatch.setattr(preprocess.ImageOps, "exif_transpose", broken)
    original = decode(make_image_bytes("PNG"))
    assert fix_orientation(original) is original


def test_fully_transparent_pixel_becomes_white() -> None:
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    assert flatten_alpha(img).getpixel((0, 0)) == (255, 255, 255)


def test_half_transparent_black_blends_with_white() -> None:
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 128))
    # Roughly mid-gray proves it blended rather than just dropping alpha.
    assert all(120 <= c <= 135 for c in flatten_alpha(img).getpixel((0, 0)))


def test_opaque_pixel_keeps_its_color() -> None:
    img = Image.new("RGBA", (1, 1), (200, 50, 50, 255))
    assert flatten_alpha(img).getpixel((0, 0)) == (200, 50, 50)


def test_rgb_image_passes_through() -> None:
    img = Image.new("RGB", (4, 3), (10, 20, 30))
    out = flatten_alpha(img)
    assert out.mode == "RGB"
    assert out.size == (4, 3)
    assert out.getpixel((2, 1)) == (10, 20, 30)


def test_grayscale_image_becomes_rgb() -> None:
    out = flatten_alpha(Image.new("L", (2, 2), 90))
    assert out.mode == "RGB"
    assert out.getpixel((0, 0)) == (90, 90, 90)


def test_la_transparent_pixel_becomes_white() -> None:
    img = Image.new("LA", (1, 1), (0, 0))
    assert flatten_alpha(img).getpixel((0, 0)) == (255, 255, 255)


def test_palette_transparency_becomes_white() -> None:
    # Transparency lives in img.info here, not in an alpha band.
    img = Image.new("P", (2, 1))
    img.putpalette([0, 0, 0, 255, 0, 0])  # index 0 black, index 1 red
    img.putpixel((1, 0), 1)
    buf = io.BytesIO()
    img.save(buf, format="PNG", transparency=0)

    out = flatten_alpha(decode(buf.getvalue()))
    assert out.getpixel((0, 0)) == (255, 255, 255)
    assert out.getpixel((1, 0)) == (255, 0, 0)


def test_non_square_size_is_kept() -> None:
    assert flatten_alpha(Image.new("RGBA", (20, 10))).size == (20, 10)


def test_input_is_not_modified() -> None:
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    flatten_alpha(img)
    assert img.mode == "RGBA"
    assert img.getpixel((0, 0)) == (0, 0, 0, 0)




def test_white_image_is_all_255() -> None:
    assert (to_grayscale(Image.new("RGB", (4, 3), "white")) == 255).all()


def test_black_image_is_all_zeros() -> None:
    assert (to_grayscale(Image.new("RGB", (4, 3), "black")) == 0).all()


def test_brightness_is_weighted_not_averaged() -> None:
    green = int(to_grayscale(Image.new("RGB", (1, 1), (0, 255, 0)))[0, 0])
    blue = int(to_grayscale(Image.new("RGB", (1, 1), (0, 0, 255)))[0, 0])
    assert abs(green - 150) <= 2  # 0.587 * 255
    assert abs(blue - 29) <= 2  # 0.114 * 255
    assert green > blue * 4


def test_shape_is_height_then_width() -> None:
    assert to_grayscale(Image.new("RGB", (20, 10))).shape == (10, 20)


def test_grayscale_dtype_is_uint8() -> None:
    assert to_grayscale(Image.new("RGB", (4, 3), (10, 200, 90))).dtype == np.uint8


def test_position_is_preserved_as_row_then_column() -> None:
    img = Image.new("RGB", (20, 10), "white")
    img.putpixel((3, 7), (0, 0, 0))  # x=3, y=7
    grid = to_grayscale(img)
    assert grid[7, 3] == 0
    assert grid[3, 7] == 255


def test_grayscale_input_passes_through_unchanged() -> None:
    assert (to_grayscale(Image.new("L", (2, 2), 51)) == 51).all()


def test_to_grayscale_does_not_modify_input() -> None:
    img = Image.new("RGB", (2, 2), (10, 20, 30))
    to_grayscale(img)
    assert img.mode == "RGB"
    assert img.getpixel((0, 0)) == (10, 20, 30)


def test_returned_grid_is_writable() -> None:
    grid = to_grayscale(Image.new("RGB", (2, 2), "white"))
    assert grid.flags.writeable
    grid[0, 0] = 100


# 10 tall x 20 wide, so mixing up rows and columns would fail.
def make_grid(background: int, ink: int) -> np.ndarray:
    grid = np.full((10, 20), background, dtype=np.uint8)
    grid[3:7, 8:12] = ink
    return grid


def test_dark_digit_on_white_is_flipped() -> None:
    result = normalize_polarity(make_grid(background=255, ink=0))
    assert (result[3:7, 8:12] == 255).all()
    assert result[0, 0] == 0


def test_bright_digit_on_dark_is_unchanged() -> None:
    grid = make_grid(background=0, ink=255)
    assert np.array_equal(normalize_polarity(grid), grid)


def test_polarity_keeps_shape_and_dtype() -> None:
    for grid in (make_grid(255, 0), make_grid(0, 255)):
        result = normalize_polarity(grid)
        assert result.shape == (10, 20)
        assert result.dtype == np.uint8


def test_polarity_does_not_modify_input() -> None:
    for grid in (make_grid(255, 0), make_grid(0, 255)):
        before = grid.copy()
        normalize_polarity(grid)
        assert np.array_equal(grid, before)


def test_unflipped_result_is_a_separate_array() -> None:
    grid = make_grid(background=0, ink=255)
    result = normalize_polarity(grid)
    assert result is not grid
    result[0, 0] = 230
    assert grid[0, 0] == 0


def test_median_beats_a_big_dark_mark_on_the_edge() -> None:
    # Light gray paper (153) with the whole top row and the top of the left
    # column dark: 25 of the 60 border values are 0, so the border mean is about
    # 89 (would not flip) but the median is 153 (must flip).
    grid = np.full((10, 20), 153, dtype=np.uint8)
    grid[0, :] = 0
    grid[:4, 0] = 0
    assert np.array_equal(normalize_polarity(grid), 255 - grid)


def test_border_just_below_cutoff_is_not_flipped() -> None:
    grid = np.full((10, 20), 127, dtype=np.uint8)
    assert np.array_equal(normalize_polarity(grid), grid)


def test_border_just_above_cutoff_is_flipped() -> None:
    grid = np.full((10, 20), 128, dtype=np.uint8)
    assert np.array_equal(normalize_polarity(grid), 255 - grid)


def two_clumps() -> np.ndarray:
    grid = np.full((10, 20), 25, dtype=np.uint8)
    grid[:, 10:] = 230
    return grid


def dim_ink() -> np.ndarray:
    grid = np.full((10, 20), 25, dtype=np.uint8)
    grid[3:7, 8:12] = 100
    return grid


def noisy_clumps(spread: float = 13) -> np.ndarray:
    rng = np.random.default_rng(0)
    is_ink = rng.random(10_000) < 0.15
    values = np.where(
        is_ink, rng.normal(204, spread, 10_000), rng.normal(38, spread, 10_000)
    )
    return np.rint(np.clip(values, 0, 255)).astype(np.uint8).reshape(100, 100)


def test_two_clumps_cutoff_is_in_the_middle_of_the_gap() -> None:
    # Plain argmax would land at 25; the tie handling must pick the middle.
    cutoff = otsu_threshold(two_clumps())
    assert 25 < cutoff < 230
    assert abs(cutoff - 127.5) <= 13


def test_dim_image_cutoff_is_below_a_fixed_127() -> None:
    cutoff = otsu_threshold(dim_ink())
    assert 25 < cutoff < 100
    assert cutoff < 127  # a fixed 127 would have missed the ink


def test_cutoff_separates_ink_from_paper() -> None:
    for grid in (two_clumps(), dim_ink()):
        bright = grid > grid.min()
        assert np.array_equal(grid > otsu_threshold(grid), bright)


def test_noisy_clumps_cutoff_lands_between_them() -> None:
    assert 77 < otsu_threshold(noisy_clumps()) < 166


def test_tiny_ink_group_is_still_found() -> None:
    grid = np.full((100, 100), 25, dtype=np.uint8)
    grid[:4, :4] = 230  # 16 pixels
    assert 25 < otsu_threshold(grid) < 230


@pytest.mark.parametrize("value", [77, 0, 255])
def test_constant_grid_has_no_ink(value: int) -> None:
    grid = np.full((10, 20), value, dtype=np.uint8)
    cutoff = otsu_threshold(grid)
    assert isinstance(cutoff, float)
    assert not (grid > cutoff).any()


def test_empty_grid_raises() -> None:
    with pytest.raises(ValueError):
        otsu_threshold(np.empty((0, 0), dtype=np.uint8))


def test_float_grid_raises() -> None:
    with pytest.raises(ValueError):
        otsu_threshold(np.full((10, 20), 0.5, dtype=np.float32))


def test_otsu_does_not_modify_input_and_returns_float() -> None:
    grid = dim_ink()
    before = grid.copy()
    cutoff = otsu_threshold(grid)
    assert np.array_equal(grid, before)
    assert isinstance(cutoff, float)


def test_cutoff_matches_scikit_image() -> None:
    filters = pytest.importorskip("skimage.filters")
    # Wide spread so the clumps overlap: with an empty gap between them scikit-image
    # takes the first tied cutoff and we take the middle, by design.
    grid = noisy_clumps(spread=30)
    assert abs(otsu_threshold(grid) - filters.threshold_otsu(grid)) <= 3
