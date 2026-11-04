# Strict pixel art from the clean cuts: area-downscale on premultiplied colour, hard alpha, a small per-character
# palette (k-means in Lab), dark 1px silhouette edge, stray-pixel cleanup. Output fits a 64x64 canvas (feet on row 61).
import numpy as np, json, sys
from PIL import Image
from scipy import ndimage
from skimage import color
from sklearn.cluster import KMeans
NAMES = ['deepseek','grok','claude','gpt','doubao','glm']
TH = int(sys.argv[1]) if len(sys.argv) > 1 else 56
NCOL = int(sys.argv[2]) if len(sys.argv) > 2 else 28
INK = np.array([26, 16, 32])
CV, FOOT = 96, 86  # canvas and the row the feet stand on (room for running, digging and effects)
def small(img, th):
    # one scale for every view and girl (the sheets share a scale): the tallest cut (502 px) becomes TH
    w, h = img.size; s = th / 502; tw = max(1, round(w * s)); th = max(1, round(h * s))
    a = np.array(img).astype(np.float32); al = a[..., 3:4] / 255
    prem = np.dstack([a[..., :3] * al, al[..., 0] * 255]).astype(np.float32)
    # two-step area downscale keeps thin dark lines from vanishing
    mid = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), 'RGBA').resize((tw * 4, th * 4), Image.BOX)
    sm = np.array(mid.resize((tw, th), Image.BOX)).astype(np.float32)
    A = sm[..., 3] / 255
    rgb = np.where(A[..., None] > 0.01, sm[..., :3] / np.maximum(A[..., None], 1e-3), 0)
    return np.clip(rgb, 0, 255), A
def pixel(views, th=TH):
    out = {}
    # shared palette across the three views of one girl
    data = {v: small(img, th) for v, img in views.items()}
    pts = np.concatenate([d[0][d[1] > 0.5] for d in data.values()])
    lab = color.rgb2lab(pts[None] / 255)[0]
    km = KMeans(n_clusters=NCOL, n_init=4, random_state=0).fit(lab)
    pal = np.clip(color.lab2rgb(km.cluster_centers_[None])[0] * 255, 0, 255)
    for v, (rgb, A) in data.items():
        mask = A > 0.5
        # remove specks and single-pixel holes
        lab_, n = ndimage.label(mask)
        if n:
            sizes = ndimage.sum(mask, lab_, range(1, n + 1))
            mask = np.isin(lab_, [k + 1 for k, s in enumerate(sizes) if s >= 3])
        idx = km.predict(color.rgb2lab(rgb.reshape(-1, 3)[None] / 255)[0]).reshape(mask.shape)
        q = pal[idx]
        # silhouette edge: body pixels touching the outside get the darkest nearby ink so the outline is unbroken
        edge = mask & ~ndimage.binary_erosion(mask)
        lum = q.mean(-1)
        q[edge & (lum > 70)] = q[edge & (lum > 70)] * 0.35 + INK * 0.65
        img = np.zeros(mask.shape + (4,), np.uint8)
        img[..., :3] = np.clip(q, 0, 255); img[..., 3] = mask * 255
        out[v] = Image.fromarray(img, 'RGBA')
    return out
if __name__ == '__main__':
    import os; os.makedirs('pix', exist_ok=True)
    for n in NAMES:
        views = {v: Image.open(f'cut/{v}_{n}.png') for v in ['front', 'back', 'side']}
        for v, img in pixel(views).items():
            c = Image.new('RGBA', (CV, CV), (0, 0, 0, 0))
            c.alpha_composite(img, ((CV - img.width) // 2, FOOT - img.height))
            c.save(f'pix/{v}_{n}.png')
    print('ok')
