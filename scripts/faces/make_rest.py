# Makes public/assets/faces-rest.png (asleep + exhausted) from frame 0 of faces.jpg.
# Run from the repo root: uv run --with pillow --with numpy python scripts/faces/make_rest.py
import sys; sys.path.insert(0,__import__('os').path.dirname(__file__))
from grid import *
base=grid(0)
skin=base[19,13].copy(); shade=base[21,10].copy(); dark=base[15,13].copy()
acc=np.array([0x7e,0xe0,0xf4],np.uint8)
def px(g,pts,c):
    for y,x in pts: g[y,x]=c
# Sleeping
s=base.copy()
px(s,[(17,x) for x in list(range(12,16))+list(range(22,26))],skin)
px(s,[(18,x) for x in (12,13,14,15,22,23,24,25)],dark)          # closed lids
px(s,[(17,12),(17,22)],shade)                                    # soft lid fold
px(s,[(25,x) for x in range(16,22)],skin)
px(s,[(25,18),(25,19),(26,18),(26,19)],dark)                    # small open mouth
Z=["#####","...#.","..#..",".#...","#####"]; z=["####","..#.",".#..","####"]
for yy,row in enumerate(Z):
    for xx,c in enumerate(row):
        if c=="#": s[0+yy,33+xx]=acc
for yy,row in enumerate(z):
    for xx,c in enumerate(row):
        if c=="#": s[7+yy,32+xx]=acc

# Exhausted
e=base.copy()
px(e,[(17,x) for x in range(12,16)]+[(17,x) for x in range(22,26)],shade)  # heavy lids
px(e,[(18,12),(18,15),(18,22),(18,25)],skin)
px(e,[(18,13),(18,24)],base[17,13]); px(e,[(18,14),(18,23)],dark)          # drooped eyes
px(e,[(19,x) for x in (12,13,14,15,22,23,24,25)],shade)                       # bags
px(e,[(25,x) for x in range(16,22)],skin)
px(e,[(25,16),(25,17),(26,18),(26,19),(25,20),(25,21)],dark)                  # wobbly tired mouth
# brows: inner ends up, outer ends down (worn out)
px(e,[(15,x) for x in range(11,27)]+[(16,x) for x in range(11,27)],skin)
px(e,[(15,14),(15,15),(15,16),(15,21),(15,22),(15,23),(16,11),(16,12),(16,13),(16,24),(16,25),(16,26)],dark)
drop=np.array([0x8b,0xe3,0xff],np.uint8); hi=np.array([0xe5,0xe7,0xff],np.uint8)
px(e,[(12,28),(13,27),(13,28),(14,27),(14,28),(14,29),(15,28)],drop); px(e,[(13,27)],hi)
# sweat drop copied from the worried frame (blue pixels)
w=grid(2)
for y in range(0,16):
    for x in range(26,34):
        r,gg,b=[int(v) for v in w[y,x]]
        if b>r+40 and b>120: e[y,x]=w[y,x]
out=np.concatenate([render(s),render(e)],axis=1)
Image.fromarray(out).save('public/assets/faces-rest.png')
Image.fromarray(np.concatenate([s,e],axis=1)).resize((76*12,40*12),Image.NEAREST).save('tmp/rest_x12.png')
