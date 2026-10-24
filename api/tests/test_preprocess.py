import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.errors import (
    ImageDimensionsTooLargeError,
    InvalidImageError,
    NoDigitFoundError,
)
from app.services import preprocess
from app.services.preprocess import (
    crop_and_center,
    decode,
    downsample,
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


def grid_with_block(
    shape: tuple[int, int],
    top: int,
    left: int,
    height: int,
    width: int,
    paper: int = 20,
    ink: int = 200,
) -> np.ndarray:
    grid = np.full(shape, paper, dtype=np.uint8)
    grid[top : top + height, left : left + width] = ink
    return grid


def basic_digit() -> np.ndarray:
    return grid_with_block((300, 400), top=100, left=150, height=60, width=40)


def test_crop_and_center_basic_shape_and_position() -> None:
    result = crop_and_center(basic_digit())
    assert result.shape == (72, 72)
    assert (result[6:66, 16:56] == 200).all()
    assert result[0, 0] == 20
    assert result[-1, -1] == 20


def test_crop_keeps_every_ink_pixel() -> None:
    assert (crop_and_center(basic_digit()) == 200).sum() == 60 * 40


def test_padding_matches_the_paper() -> None:
    result = crop_and_center(grid_with_block((300, 400), 100, 150, 60, 40, paper=33))
    assert {result[0, 0], result[0, -1], result[-1, 0], result[-1, -1]} == {33}


def test_tall_thin_digit_is_centered_horizontally() -> None:
    result = crop_and_center(grid_with_block((300, 400), 100, 150, 100, 10))
    assert result.shape == (120, 120)
    cols = np.where((result == 200).any(axis=0))[0]
    left_pad, right_pad = cols[0], result.shape[1] - 1 - cols[-1]
    assert abs(left_pad - right_pad) <= 1


def test_wide_block_is_centered_vertically() -> None:
    result = crop_and_center(grid_with_block((300, 400), 100, 150, 10, 100))
    assert result.shape == (120, 120)
    rows = np.where((result == 200).any(axis=1))[0]
    top_pad, bottom_pad = rows[0], result.shape[0] - 1 - rows[-1]
    assert abs(top_pad - bottom_pad) <= 1


def test_odd_padding_is_still_square() -> None:
    # margin is ceil(6.1) = 7, side 75, rounded up to 80.
    result = crop_and_center(grid_with_block((300, 400), 100, 150, 61, 40))
    assert result.shape == (80, 80)
    assert (result == 200).sum() == 61 * 40


@pytest.mark.parametrize("size", [(3, 3), (5, 17), (30, 30), (77, 13)])
def test_result_is_always_a_valid_square(size: tuple[int, int]) -> None:
    result = crop_and_center(grid_with_block((300, 400), 100, 150, *size))
    assert result.ndim == 2
    assert result.shape[0] == result.shape[1]
    assert result.dtype == np.uint8
    assert result.shape[0] % 8 == 0
    assert result.shape[0] >= 8


def test_dust_speck_is_ignored() -> None:
    clean = basic_digit()
    specked = clean.copy()
    specked[5, 380] = 255  # one ink pixel: its row and column don't count
    assert np.array_equal(crop_and_center(specked), crop_and_center(clean))


def test_dim_digit_still_works() -> None:
    result = crop_and_center(grid_with_block((300, 400), 100, 150, 60, 40, ink=100))
    assert (result == 100).sum() == 60 * 40


def test_too_faint_digit_is_rejected() -> None:
    with pytest.raises(NoDigitFoundError):
        crop_and_center(grid_with_block((300, 400), 100, 150, 60, 40, ink=60))


@pytest.mark.parametrize("value", [0, 128, 255])
def test_blank_grid_is_rejected(value: int) -> None:
    with pytest.raises(NoDigitFoundError):
        crop_and_center(np.full((50, 60), value, dtype=np.uint8))


def test_noise_only_grid_is_rejected() -> None:
    rng = np.random.default_rng(0)
    noise = np.clip(rng.normal(100, 5, (100, 100)), 0, 255).astype(np.uint8)
    with pytest.raises(NoDigitFoundError):
        crop_and_center(noise)


def test_digit_touching_the_border_works() -> None:
    result = crop_and_center(grid_with_block((300, 400), 0, 0, 60, 40))
    assert result.shape == (72, 72)
    assert (result == 200).sum() == 60 * 40


def test_non_square_input_works() -> None:
    result = crop_and_center(grid_with_block((120, 300), 30, 100, 50, 30))
    assert result.shape[0] == result.shape[1]
    assert (result == 200).sum() == 50 * 30


@pytest.mark.parametrize(
    "bad",
    [
        np.full((10, 20), 0.5, dtype=np.float32),
        np.zeros((4, 4, 3), dtype=np.uint8),
        np.empty((0, 0), dtype=np.uint8),
    ],
    ids=["float32", "3d", "empty"],
)
def test_crop_rejects_wrong_inputs(bad: np.ndarray) -> None:
    with pytest.raises(ValueError):
        crop_and_center(bad)


def test_crop_does_not_modify_input_or_share_memory() -> None:
    grid = basic_digit()
    before = grid.copy()
    result = crop_and_center(grid)
    assert np.array_equal(grid, before)
    assert not np.shares_memory(grid, result)


def test_no_digit_found_error_attributes() -> None:
    err = NoDigitFoundError()
    assert err.status_code == 400
    assert err.code == "NO_DIGIT_FOUND"
    assert err.message


def test_downsample_flat_grid() -> None:
    result = downsample(np.full((16, 16), 100, dtype=np.uint8))
    assert (result == 100).all()


def test_downsample_left_right_split() -> None:
    grid = np.zeros((16, 16), dtype=np.uint8)
    grid[:, 8:] = 200
    result = downsample(grid)
    assert (result[:, :4] == 0).all()
    assert (result[:, 4:] == 200).all()


def test_downsample_top_bottom_split() -> None:
    grid = np.zeros((16, 16), dtype=np.uint8)
    grid[8:, :] = 200
    result = downsample(grid)
    assert (result[:4, :] == 0).all()
    assert (result[4:, :] == 200).all()


def test_downsample_block_lands_in_the_right_cell() -> None:
    top_left = np.zeros((16, 16), dtype=np.uint8)
    top_left[0:2, 0:2] = 255
    result = downsample(top_left)
    assert result[0, 0] == 255
    assert result.sum() == 255

    top_right = np.zeros((16, 16), dtype=np.uint8)
    top_right[0:2, 14:16] = 255
    result = downsample(top_right)
    assert result[0, 7] == 255
    assert result.sum() == 255


def test_downsample_partial_coverage_gives_in_between_shade() -> None:
    grid = np.zeros((16, 16), dtype=np.uint8)
    grid[:, 1::2] = 200  # each 2x2 box: two pixels of 0, two of 200
    assert (downsample(grid) == 100).all()


def test_downsample_rounds_to_nearest_not_down() -> None:
    # An exact .5 average goes to 100 (np.rint rounds half to even), which
    # truncation would also give, so the second case uses 101.75 to tell them
    # apart: rounding gives 102, truncating gives 101.
    grid = np.full((16, 16), 100, dtype=np.uint8)
    grid[0, 0:2] = 101  # box (0, 0): (101 + 101 + 100 + 100) / 4 = 100.5
    assert downsample(grid)[0, 0] == 100
    grid[0:2, 0:2] = 102
    grid[1, 1] = 101  # (102 * 3 + 101) / 4 = 101.75
    assert downsample(grid)[0, 0] == 102


@pytest.mark.parametrize("value", [250, 255])
def test_downsample_does_not_wrap_around(value: int) -> None:
    assert (downsample(np.full((64, 64), value, dtype=np.uint8)) == value).all()


def test_downsample_larger_grid_lights_exactly_one_cell() -> None:
    grid = np.zeros((720, 720), dtype=np.uint8)
    grid[90:180, 270:360] = 255  # exactly box (1, 3)
    result = downsample(grid)
    assert result[1, 3] == 255
    assert result.sum() == 255


def test_downsample_shape_and_dtype() -> None:
    grid = np.zeros((16, 16), dtype=np.uint8)
    result = downsample(grid)
    assert result.shape == (8, 8)
    assert result.dtype == np.uint8
    assert downsample(grid, size=4).shape == (4, 4)


def test_downsample_does_not_modify_input_or_share_memory() -> None:
    grid = np.random.default_rng(0).integers(0, 256, (16, 16), dtype=np.uint8)
    before = grid.copy()
    result = downsample(grid)
    assert np.array_equal(grid, before)
    assert not np.shares_memory(grid, result)


@pytest.mark.parametrize(
    "bad",
    [
        np.zeros((16, 24), dtype=np.uint8),
        np.zeros((16, 16), dtype=np.float32),
        np.zeros((20, 20), dtype=np.uint8),
        np.zeros((4, 4), dtype=np.uint8),
        np.zeros((16, 16, 3), dtype=np.uint8),
    ],
    ids=["non-square", "float32", "not-multiple", "too-small", "3d"],
)
def test_downsample_rejects_bad_input(bad: np.ndarray) -> None:
    with pytest.raises(ValueError):
        downsample(bad)


def test_downsample_matches_pillow_box_filter() -> None:
    grid = np.random.default_rng(0).integers(0, 256, (64, 64), dtype=np.uint8)
    pillow = np.asarray(Image.fromarray(grid).resize((8, 8), Image.Resampling.BOX))
    diff = downsample(grid).astype(np.int16) - pillow.astype(np.int16)
    assert np.abs(diff).max() <= 1


def test_pipeline_end_to_end_on_a_thick_L() -> None:
    img = Image.new("RGB", (300, 300), "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle((100, 60, 130, 240), fill="black")  # vertical stroke
    draw.rectangle((100, 210, 220, 240), fill="black")  # foot of the L

    grid = downsample(
        crop_and_center(normalize_polarity(to_grayscale(flatten_alpha(img))))
    )
    assert grid.shape == (8, 8)
    assert grid.dtype == np.uint8
    # The stroke fills column 2 (column 1 only grazes its edge); the top-right
    # corner is empty paper.
    assert grid[1:6, 2].min() > 200
    assert grid[0:3, 5:8].max() < 20


def test_stretch_contrast_maps_min_to_0_and_max_to_255() -> None:
    from app.services.preprocess import stretch_contrast

    grid = np.array([[32, 104], [177, 32]], dtype=np.uint8)
    result = stretch_contrast(grid)
    assert result.dtype == np.uint8
    # (104 - 32) * 255 / (177 - 32) = 126.6, rounded rather than truncated.
    assert result.tolist() == [[0, 127], [255, 0]]


def test_stretch_contrast_leaves_a_flat_grid_alone() -> None:
    from app.services.preprocess import stretch_contrast

    grid = np.full((8, 8), 90, dtype=np.uint8)
    assert stretch_contrast(grid).tolist() == grid.tolist()


def test_crop_digit_reports_cutoff_and_inclusive_box() -> None:
    from app.services.preprocess import crop_digit

    crop = crop_digit(grid_with_block((300, 400), 100, 150, 60, 40))
    assert (crop.top, crop.left, crop.bottom, crop.right) == (100, 150, 159, 189)
    assert 10 < crop.cutoff < 200


def test_faint_ink_error_says_what_was_measured() -> None:
    from app.services.preprocess import crop_digit

    with pytest.raises(NoDigitFoundError) as raised:
        crop_digit(grid_with_block((300, 400), 100, 150, 60, 40, ink=60, paper=30))
    assert "needs 50" in raised.value.detail
