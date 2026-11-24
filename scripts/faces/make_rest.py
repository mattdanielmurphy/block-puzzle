# Makes public/assets/faces-rest.png: the game's guy asleep in an old-school striped nightcap, with Zs.
# Built from frame 0 of faces.jpg. Run from the repo root:
#   uv run --with pillow --with numpy python scripts/faces/make_rest.py
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from grid import *

base = grid(0)
skin = base[19, 13].copy(); shade = base[21, 10].copy(); dark = base[15, 13].copy()
bg = np.array([0, 0, 0], np.uint8)
# Colours from the app's own palette (styles.css / theme.ts)
# Cap: red (Matt: "use red instead of blue"), kept dim ("cap is too bright"). The red is the
# game's own panic-face red; stripes alternate it with the dimmed text colour.
blue = np.array([0x9a, 0x16, 0x1c], np.uint8)   # panic-face red (faces.jpg frame 4)
white = (np.array([0xe5, 0xe7, 0xff]) * 0.6).astype(np.uint8)
fluff = (np.array([0xe5, 0xe7, 0xff]) * 0.7).astype(np.uint8)  # --text-color, dimmed
edge = np.array([0x0a, 0x0d, 0x1a], np.uint8)   # theme gridLines
zc = np.array([0x7e, 0xe0, 0xf4], np.uint8)     # accent

s = base.copy()
# 1. Helmet off: clear the dome and the side guards down to the collar.
for y in range(0, 26):
    for x in range(38):
        if y < 13 or x <= 10 or x >= 29:
            s[y, x] = bg
# Ears and a bit of hair at the temples
for y in range(16, 20):
    s[y, 9] = shade; s[y, 10] = skin; s[y, 29] = skin; s[y, 30] = shade
for y in (14, 15):
    s[y, 10] = dark; s[y, 29] = dark
# 2. Eyes closed, small open mouth
for x in list(range(12, 16)) + list(range(22, 26)):
    s[17, x] = skin; s[18, x] = dark
s[17, 12] = shade; s[17, 25] = shade
for x in range(16, 22): s[25, x] = skin
for y, x in ((25, 18), (25, 19), (26, 18), (26, 19)): s[y, x] = dark
# 3. Nightcap: cone over the head leaning right, tip flopping down to a pompom.
cone = {11: (10, 29), 10: (11, 29), 9: (12, 29), 8: (13, 29), 7: (14, 30), 6: (16, 30), 5: (18, 31),
        4: (21, 32), 3: (24, 33), 2: (27, 34)}
tip = {3: (34, 35), 4: (33, 35), 5: (33, 35), 6: (34, 35), 7: (34, 35), 8: (34, 35)}
cap = set()
for y, (a, b) in list(cone.items()) + list(tip.items()):
    for x in range(a, b + 1): cap.add((y, x))
for y, x in cap:
    s[y, x] = blue if ((x - y) // 3) % 2 == 0 else white
# Brim: a fluffy white band across the forehead
brim = {(y, x) for y in (12, 13) for x in range(9, 31)}
for y, x in brim: s[y, x] = fluff
# Pompom
pom = {(9, 34), (9, 35), (10, 33), (10, 34), (10, 35), (10, 36), (11, 33), (11, 34), (11, 35), (11, 36), (12, 34), (12, 35)}
for y, x in pom: s[y, x] = fluff
# Outline everything new so it reads as pixel art
shape = cap | brim | pom
for y, x in list(shape):
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < s.shape[0] and 0 <= nx < s.shape[1] and (ny, nx) not in shape and (s[ny, nx] == bg).all():
            s[ny, nx] = edge
# 4. ZZZZ rising up-left
Z5 = ["#####", "...#.", "..#..", ".#...", "#####"]
Z4 = ["####", "...#", "..#.", ".#..", "####"]
for pat, (oy, ox) in ((Z4, (20, 4)), (Z4, (14, 1)), (Z5, (7, 3)), (Z5, (0, 0))):
    for yy, row in enumerate(pat):
        for xx, c in enumerate(row):
            if c == "#": s[oy + yy, ox + xx] = zc

frame = render(s)
Image.fromarray(frame).save("public/assets/faces-rest.png")
os.makedirs("tmp", exist_ok=True)
Image.fromarray(s).resize((s.shape[1] * 12, s.shape[0] * 12), Image.NEAREST).save("tmp/rest_x12.png")
