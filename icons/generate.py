#!/usr/bin/env python3
# Run: python3 icons/generate.py   (requires Pillow)
# "Aa" on a terracotta tile with a small speech-bubble tail, drawn at 1024px and downsampled.
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
S = 1024
TERRA = (181, 72, 44, 255)
CREAM = (255, 248, 236, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=TERRA)

# Speech bubble: the meaning "pops up" next to the word.
bx0, by0, bx1, by1 = S * 0.14, S * 0.16, S * 0.86, S * 0.72
d.rounded_rectangle([bx0, by0, bx1, by1], radius=int(S * 0.12), fill=CREAM)
d.polygon([(S * 0.30, by1 - 2), (S * 0.46, by1 - 2), (S * 0.27, S * 0.86)], fill=CREAM)

font = None
for path, index in (("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", 0), ("/System/Library/Fonts/Helvetica.ttc", 1)):
    try:
        font = ImageFont.truetype(path, int(S * 0.36), index=index)
        break
    except OSError:
        continue
font = font or ImageFont.load_default()
text = "Aa"
box = d.textbbox((0, 0), text, font=font)
tw, th = box[2] - box[0], box[3] - box[1]
cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
d.text((cx - tw / 2 - box[0], cy - th / 2 - box[1]), text, fill=TERRA, font=font)

for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(HERE / f"icon{size}.png")
img.resize((512, 512), Image.LANCZOS).save(HERE / "icon512.png")
print("icons written")
