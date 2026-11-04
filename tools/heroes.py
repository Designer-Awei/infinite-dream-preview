# Run after tools/cut_girls.py, from the same scratch folder (reads cut/front_<id>.png).
# Lobby hero art and portraits from the clean cuts: premultiplied Lanczos downscale that keeps the sheet's own
# soft edge (no re-guessed background, no added dark ring).
import numpy as np, json
from PIL import Image
NAMES = ['deepseek','grok','claude','gpt','doubao','glm']
def down(img, th):
    w, h = img.size; tw = round(w * th / h)
    a = np.array(img).astype(np.float32); al = a[..., 3:4] / 255
    prem = np.dstack([a[..., :3] * al, al[..., 0] * 255])
    big = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), 'RGBA')
    sm = np.array(big.resize((tw, th), Image.LANCZOS)).astype(np.float32)
    A = np.clip(sm[..., 3], 0, 255) / 255
    rgb = np.where(A[..., None] > 0.004, sm[..., :3] / np.maximum(A[..., None], 1e-3), 0)
    A[A < 0.06] = 0
    out = np.dstack([np.clip(rgb, 0, 255), A * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')
OUT = __import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'web', 'assets')
for n in NAMES:
    im = Image.open(f'cut/front_{n}.png')
    down(im, 440).save(f'{OUT}/hero_{n}.png', optimize=True)
    down(im, 150).save(f'{OUT}/portrait_{n}.png', optimize=True)
    print(n, Image.open(f'{OUT}/hero_{n}.png').size)
