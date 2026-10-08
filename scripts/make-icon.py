"""Render images/icon.png (128x128) for the Marketplace listing.

Three query lines, each starting with a pipe, coloured like the extension's
default token colours (function, field, pattern). Drawn at 8x and
downsampled for smooth edges. Requires Pillow: python3 -I scripts/make-icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

SIZE, SCALE = 128, 8
S = SIZE * SCALE

BG_TOP, BG_BOTTOM = (38, 44, 58), (24, 28, 38)
RAIL = (212, 212, 212)
STEPS = [  # (colour, length as a fraction of the step area)
    ((220, 220, 170), 1.00),  # function  #DCDCAA
    ((156, 220, 254), 0.72),  # field     #9CDCFE
    ((206, 145, 120), 0.86),  # pattern   #CE9178
]


def px(v: float) -> int:
    return round(v * SCALE)


def main() -> None:
    # Vertical gradient background clipped to a rounded square.
    bg = Image.new("RGBA", (S, S))
    draw = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / (S - 1)
        draw.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=px(24), fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(bg, mask=mask)

    d = ImageDraw.Draw(img)
    top, bottom, bar = 28, 100, 14
    pipe_x, pipe_w, start, end = 24, 7, 40, 104
    gap = (bottom - top - bar) / (len(STEPS) - 1)
    for i, (colour, frac) in enumerate(STEPS):
        y = top + i * gap
        # `| step`: a pipe slightly taller than the step bar, then the step.
        d.rounded_rectangle([px(pipe_x), px(y - 4), px(pipe_x + pipe_w), px(y + bar + 4)], radius=px(pipe_w / 2), fill=RAIL)
        d.rounded_rectangle([px(start), px(y), px(start + (end - start) * frac), px(y + bar)], radius=px(bar / 2), fill=colour)

    out = Path(__file__).resolve().parent.parent / "images" / "icon.png"
    out.parent.mkdir(exist_ok=True)
    img.resize((SIZE, SIZE), Image.LANCZOS).save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
