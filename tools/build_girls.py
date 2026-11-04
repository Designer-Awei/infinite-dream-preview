# Build web/assets/girls.png + girls.json from the strict pixel base sprites and the PixelLab animation frames.
# Layout: one row per girl, 96x96 cells: idle front, back, side | run-s x8 | run-e x8 | run-n x8 | dig-side | dig-down
# Generated frames are snapped back to the girl's base palette where a base colour is close (keeps colours steady
# between frames); colours far from it (the shovel) stay as drawn. Stray specks under 3 px are removed.
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import color
PIX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'girls', 'base')
GEN = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'girls', 'pixellab')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'assets')
NAMES = ['deepseek', 'grok', 'claude', 'gpt', 'doubao', 'glm']
C = 96
# which generated frames each clip uses (frame 8 repeats frame 0, so a loop is 0..7); per-girl overrides allowed
CLIPS = json.load(open(os.path.join(GEN, 'clips.json')))
def snap(img, pal_lab, pal_rgb, top=None):
    a = np.array(img.convert('RGBA'))
    m = a[..., 3] > 127
    if top is not None:
        # run clips hold no tools: nothing belongs above the head (sparkles / icons the model sometimes adds),
        # and colours far from her palette are effects, not her
        m[:max(0, top - 3)] = False
        px = a[..., :3][m].astype(np.float64)
        L = color.rgb2lab(px[None] / 255)[0]
        d = ((L[:, None, :] - pal_lab[None]) ** 2).sum(-1).min(1)
        idx = np.argwhere(m)
        far = idx[d > 22 ** 2]
        m[far[:, 0], far[:, 1]] = False
    lab, n = ndimage.label(m)
    if n:
        # keep the body and anything touching it (or big enough to be a held tool); drop floating sparkles/specks
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        body = lab == (int(np.argmax(sizes)) + 1)
        near = ndimage.binary_dilation(body, iterations=2)
        keep = [k + 1 for k, s in enumerate(sizes) if s >= 40 or (s >= 3 and (near & (lab == k + 1)).any())]
        m = np.isin(lab, keep)
    px = a[..., :3][m].astype(np.float64)
    L = color.rgb2lab(px[None] / 255)[0]
    d = ((L[:, None, :] - pal_lab[None]) ** 2).sum(-1)
    k = d.argmin(1); close = d[np.arange(len(k)), k] < 12 ** 2
    px[close] = pal_rgb[k[close]]
    out = np.zeros_like(a); out[..., :3][m] = px.astype(np.uint8); out[..., 3][m] = 255
    return Image.fromarray(out, 'RGBA')
rows, meta = [], {'cw': C, 'ch': C, 'k': 1, 'frames': {}, 'clips': {}}
for r, n in enumerate(NAMES):
    base = {v: Image.open(f'{PIX}/{v}_{n}.png').convert('RGBA') for v in ('front', 'back', 'side')}
    b = np.concatenate([np.array(im)[np.array(im)[..., 3] > 0][:, :3] for im in base.values()])
    pal_rgb = np.unique(b, axis=0).astype(np.float64)
    pal_lab = color.rgb2lab(pal_rgb[None] / 255)[0]
    cells = [base['front'], base['back'], base['side']]
    meta['frames'][n] = {'front': [0, r * C, C, C], 'back': [C, r * C, C, C], 'side': [2 * C, r * C, C, C]}
    meta['clips'][n] = {}
    for clip, spec in CLIPS.items():
        src, idx = (spec.get(n) or spec['default'])
        files = [f'{GEN}/{n}/{src}_{i}.png' for i in idx]
        if not all(os.path.exists(f) for f in files):
            print('missing', n, clip); continue
        meta['clips'][n][clip] = [len(cells), len(idx)]
        view = {'run_s': 'front', 'run_n': 'back', 'run_e': 'side'}.get(clip)
        top = int(np.argwhere(np.array(base[view])[..., 3] > 0)[:, 0].min()) if view else None
        cells += [snap(Image.open(f), pal_lab, pal_rgb, top) for f in files]
    rows.append(cells)
W = max(len(c) for c in rows)
atlas = Image.new('RGBA', (W * C, len(rows) * C), (0, 0, 0, 0))
for r, cells in enumerate(rows):
    for i, im in enumerate(cells): atlas.alpha_composite(im, (i * C, r * C))
atlas.save(f'{OUT}/girls.png', optimize=True)
json.dump(meta, open(f'{OUT}/girls.json', 'w'))
print('atlas', atlas.size, {n: list(meta['clips'][n]) for n in NAMES})
