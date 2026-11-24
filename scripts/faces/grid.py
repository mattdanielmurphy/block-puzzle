from PIL import Image
import numpy as np
CS,OX,OY=5.05,0.0,3.0
im=np.asarray(Image.open('public/assets/faces.jpg').convert('RGB'))
def grid(i):
    f=im[:,round(i*193):round(i*193)+193]
    W=int(193/CS); H=int((206-OY)/CS)
    g=np.zeros((H,W,3),np.uint8)
    for y in range(H):
        for x in range(W):
            g[y,x]=f[int((y+.5)*CS+OY), int((x+.5)*CS+OX)]
    return g
def render(g,scale=1):
    H,W,_=g.shape
    out=np.zeros((206,193,3),np.uint8)
    for py in range(206):
        y=min(max(int((py-OY)//CS),0),H-1)
        for px in range(193):
            x=min(int((px-OX)//CS),W-1)
            out[py,px]=g[y,x]
    return out
