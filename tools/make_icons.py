"""Draws the home screen icon: a dim calendar with a few traffic-light days.

Run from the repo root: python3 tools/make_icons.py
"""
from PIL import Image, ImageDraw

S = 1024
BG_TOP, BG_BOTTOM = (22, 29, 37), (13, 17, 21)
LINE = (134, 168, 207)
DIM = (41, 50, 61)
GREEN, AMBER, RED = (77, 129, 88), (168, 132, 59), (165, 76, 68)

img = Image.new("RGB", (S, S))
d = ImageDraw.Draw(img)
for y in range(S):
    t = y / (S - 1)
    d.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))

# Calendar body, kept inside the central 60% so a maskable crop never clips it.
x0, y0, x1, y1 = 232, 262, 792, 802
w = 30
d.rounded_rectangle([x0, y0, x1, y1], radius=70, outline=LINE, width=w)
d.line([(x0 + w, 382), (x1 - w, 382)], fill=LINE, width=w)
for rx in (372, 652):
    d.rounded_rectangle([rx - 18, 200, rx + 18, 318], radius=18, fill=LINE)

cells = [DIM, GREEN, DIM, AMBER, DIM, DIM, DIM, RED, GREEN]
cw, gap = 100, 28
gx = (x0 + x1) / 2 - (3 * cw + 2 * gap) / 2
gy = 407
for i, c in enumerate(cells):
    cx = gx + (i % 3) * (cw + gap)
    cy = gy + (i // 3) * (cw + gap)
    d.rounded_rectangle([cx, cy, cx + cw, cy + cw], radius=26, fill=c)

for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
    img.resize((size, size), Image.LANCZOS).save(f"icons/{name}", optimize=True)
print("icons written")
