# Makes public/assets/faces-rest.png: the game's guy asleep (eyes closed, small open mouth),
# helmet on, ZZZZ rising on the right. No nightcap (Matt, 2026-11-24: the cap looked out of place).
# Built from frame 0 of faces.jpg. Run from the repo root:
#   uv run --with pillow --with numpy python scripts/faces/make_rest.py
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from grid import *

base = grid(0)
skin = base[19, 13].copy(); shade = base[21, 10].copy(); dark = base[15, 13].copy()
zc = np.array([0x7e, 0xe0, 0xf4], np.uint8)  # accent

s = base.copy()
# Eyes closed
for x in list(range(12, 16)) + list(range(22, 26)):
    s[17, x] = skin; s[18, x] = dark
s[17, 12] = shade; s[17, 22] = shade
# Small open mouth
for x in range(16, 22): s[25, x] = skin
for y, x in ((25, 18), (25, 19), (26, 18), (26, 19)): s[y, x] = dark
# Widen the picture with dark space on the right, then ZZZZ rising up and to the right
s = np.concatenate([s, np.zeros((s.shape[0], 14, 3), np.uint8)], axis=1)
Z3 = ["###", ".#.", "###"]
Z4 = ["####", "..#.", ".#..", "####"]
Z45 = ["####", "...#", "..#.", ".#..", "####"]
Z5 = ["#####", "...#.", "..#..", ".#...", "#####"]
Z6 = ["######", "....#.", "...#..", "..#...", ".#....", "######"]
for pat, (oy, ox) in ((Z45, (20, 34)), (Z45, (14, 38)), (Z5, (7, 41)), (Z6, (0, 46))):
    for yy, row in enumerate(pat):
        for xx, c in enumerate(row):
            if c == "#": s[oy + yy, ox + xx] = zc

H, W, _ = s.shape  # scale back up the way grid() sampled it (5.05 px per art pixel)
Image.fromarray(s).resize((round(W * CS), round(H * CS)), Image.NEAREST).save("public/assets/faces-rest.png")
os.makedirs("tmp", exist_ok=True)
Image.fromarray(s).resize((s.shape[1] * 12, s.shape[0] * 12), Image.NEAREST).save("tmp/rest_x12.png")
