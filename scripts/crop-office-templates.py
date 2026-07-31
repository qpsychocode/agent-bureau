"""Extract reusable office templates from the eight-department scene."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "office-departments-v3.png"
OUTPUT_DIR = ROOT / "public" / "offices"

# Percent coordinates mirror STAGE_SLOTS in app/page.tsx.
OFFICES = {
    "orchestrator": (42, 6, 76, 53),
    "researcher": (27, 9, 42, 53),
    "reviewer": (76, 9, 100, 53),
    "coder": (0, 55, 20, 96),
    "designer": (20, 55, 39, 96),
    "copywriter": (39, 55, 59, 96),
    "marketing": (59, 55, 80, 96),
    "image": (80, 55, 100, 96),
}


def main() -> None:
    scene = Image.open(SOURCE).convert("RGB")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, (left, top, right, bottom) in OFFICES.items():
        bounds = (
            round(scene.width * left / 100),
            round(scene.height * top / 100),
            round(scene.width * right / 100),
            round(scene.height * bottom / 100),
        )
        office = scene.crop(bounds)
        office.save(OUTPUT_DIR / f"{name}.webp", "WEBP", quality=88, method=6)
        print(f"{name}: {office.width}x{office.height}")


if __name__ == "__main__":
    main()
