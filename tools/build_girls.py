# Build web/assets/girls.png + girls.json from the strict pixel base sprites and the PixelLab animation frames.
# Layout: one row per girl, 96x96 cells: idle front, back, side | run-s x8 | run-e x8 | run-n x8 | dig-side | dig-down
# Generated frames are snapped back to the girl's base palette where a base colour is close (keeps colours steady
# between frames); colours far from it (the shovel) stay as drawn. Stray specks under 3 px are removed.
import json, os, sys, colorsys
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
def snap(img, pal_lab, pal_rgb, top=None, inside=None, near=None):
    a = np.array(img.convert('RGBA'))
    m = a[..., 3] > 127
    if near is not None:
        # attack poses: white swoosh streaks the model draws around her (bright, colourless, outside her outline)
        from skimage.color import rgb2hsv
        hsv = rgb2hsv(a[..., :3])
        m &= ~(~near & (hsv[..., 2] > 0.8) & (hsv[..., 1] < 0.18))
    if inside is not None: m &= inside  # breathing stays within her own outline (+ a few px): no hearts / sweat drops
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
def tool_mask(img, pal_lab):
    # the golden shovel blade: saturated gold pixels (none of the girls wear that colour) plus touching pixels that
    # are not in her palette (its shading / outline); the game recolours these for copper / silver shovels
    a = np.array(img); m = a[..., 3] > 0
    rgb = a[..., :3].astype(np.float64) / 255
    from skimage.color import rgb2hsv
    hsv = rgb2hsv(rgb)
    gold = m & (hsv[..., 0] > 0.09) & (hsv[..., 0] < 0.18) & (hsv[..., 1] > 0.42) & (hsv[..., 2] > 0.45)
    L = color.rgb2lab(rgb.reshape(1, -1, 3))[0].reshape(rgb.shape)
    dmin = ((L[..., None, :] - pal_lab[None, None]) ** 2).sum(-1).min(-1)
    foreign = m & (dmin > 10 ** 2)
    grow = ndimage.binary_dilation(gold, iterations=2) & foreign
    return gold | grow
rows, masks, meta = [], [], {'cw': C, 'ch': C, 'k': 1, 'frames': {}, 'clips': {}}
for r, n in enumerate(NAMES):
    base = {v: Image.open(f'{PIX}/{v}_{n}.png').convert('RGBA') for v in ('front', 'back', 'side')}
    b = np.concatenate([np.array(im)[np.array(im)[..., 3] > 0][:, :3] for im in base.values()])
    pal_rgb = np.unique(b, axis=0).astype(np.float64)
    pal_lab = color.rgb2lab(pal_rgb[None] / 255)[0]
    cells = [base['front'], base['back'], base['side']]
    mrow = [None, None, None]
    meta['frames'][n] = {'front': [0, r * C, C, C], 'back': [C, r * C, C, C], 'side': [2 * C, r * C, C, C]}
    meta['clips'][n] = {}
    for clip, spec in CLIPS.items():
        src, idx = (spec.get(n) or spec['default'])
        files = [f'{GEN}/{n}/{src}_{i}.png' for i in idx]
        if not all(os.path.exists(f) for f in files):
            print('missing', n, clip); continue
        meta['clips'][n][clip] = [len(cells), len(idx)]
        view = {'s': 'front', 'n': 'back', 'e': 'side'}.get(clip[-1]) if clip[:3] in ('run', 'idl', 'atk') else None
        top = int(np.argwhere(np.array(base[view])[..., 3] > 0)[:, 0].min()) if view else None
        inside = ndimage.binary_dilation(np.array(base[view])[..., 3] > 0, iterations=3) if clip.startswith('idle') else None
        near = ndimage.binary_dilation(np.array(base[view])[..., 3] > 0, iterations=3) if clip.startswith('atk') else None
        new = [snap(Image.open(f), pal_lab, pal_rgb, top, inside, near) for f in files]
        cells += new
        mrow += [tool_mask(im, pal_lab) if clip.startswith('dig') else None for im in new]
    rows.append(cells)
    masks.append(mrow)
# wrap each girl's cells into lines of PER cells (keeps the sheet narrow for phones), clips list their cells
PER = 32
lines = [(r, k) for r, cells in enumerate(rows) for k in range((len(cells) + PER - 1) // PER)]
atlas = Image.new('RGBA', (PER * C, len(lines) * C), (0, 0, 0, 0))
tool = np.zeros((len(lines) * C, PER * C, 4), np.uint8)
line0 = {}
for li, (r, k) in enumerate(lines): line0.setdefault(r, li)
pos = lambda r, i: ((i % PER) * C, (line0[r] + i // PER) * C)
for r, cells in enumerate(rows):
    for i, im in enumerate(cells):
        x, y = pos(r, i); atlas.alpha_composite(im, (x, y))
        mk = masks[r][i]
        if mk is not None: tool[y:y + C, x:x + C][mk] = (255, 255, 255, 255)
for r, n in enumerate(NAMES):
    meta['frames'][n] = {v: [*pos(r, j), C, C] for j, v in enumerate(('front', 'back', 'side'))}
    meta['clips'][n] = {k: [pos(r, i) for i in range(i0, i0 + cnt)] for k, (i0, cnt) in meta['clips'][n].items()}
atlas.save(f'{OUT}/girls.png', optimize=True)
json.dump(meta, open(f'{OUT}/girls.json', 'w'))
print('atlas', atlas.size, {n: list(meta['clips'][n]) for n in NAMES})
json.dump(meta, open(f'{OUT}/girls.json', 'w'))
print('atlas', atlas.size, {n: list(meta['clips'][n]) for n in NAMES})
