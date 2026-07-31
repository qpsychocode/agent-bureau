"""Split the generated 4x2 agent atlas into tightly cropped PNG sprites."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "agents" / "atlas-v1.png"
OUTPUT_DIR = SOURCE.parent
NAMES = [
    "orchestrator",
    "researcher",
    "coder",
    "reviewer",
    "designer",
    "copywriter",
    "marketing",
    "image",
]


def main() -> None:
    atlas = Image.open(SOURCE).convert("RGBA")
    cell_width = atlas.width // 4
    cell_height = atlas.height // 2

    for index, name in enumerate(NAMES):
        column = index % 4
        row = index // 4
        cell = atlas.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        pixels = cell.load()
        for y in range(cell.height):
            for x in range(cell.width):
                red, green, blue, alpha = pixels[x, y]
                if not alpha:
                    pixels[x, y] = (0, 0, 0, 0)
                    continue
                if (
                    alpha
                    and red > 70
                    and blue > 70
                    and green < 75
                    and abs(red - blue) < 42
                ):
                    pixels[x, y] = (0, 0, 0, 0)
        bounds = cell.getchannel("A").getbbox()
        if bounds is None:
            raise RuntimeError(f"No opaque pixels found in atlas cell {name}")

        left, top, right, bottom = bounds
        padding = 10
        cropped = cell.crop(
            (
                max(0, left - padding),
                max(0, top - padding),
                min(cell.width, right + padding),
                min(cell.height, bottom + padding),
            )
        )
        cropped.save(OUTPUT_DIR / f"{name}.png", optimize=True)
        print(f"{name}: {cropped.width}x{cropped.height}")


if __name__ == "__main__":
    main()
