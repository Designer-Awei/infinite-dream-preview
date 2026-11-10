# Build web/assets/girls_hd.png + girls_hd.json: 192px hero frames (k=2, drawn at the same world size as the 96px
# atlas, twice the detail). Girls listed here override their row in girls.json; the rest keep the 96px frames.
# usage: build_girls_hd.py <work dir with base/{front,back,side}_<cid>.png and out/<cid>/*.png> [clips.json]
# clips.json: {"<cid>": {"idle_s": ["a_idle-s", [0,1,2,3]], "run_s": [["l", [0,2,4,6]], ["r", [0,2,4,6]]], ...}}
# (frame n repeats frame 0, so a loop is 0..n-1)
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import color
from skimage.color import rgb2hsv
WORK = sys.argv[1]
CLIPS = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(WORK, 'clips.json')))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'assets')
C, K, PER = 192, 2, 16
VIEW = {'s': 'front', 'n': 'back', 'e': 'side'}

def snap(img, pal_lab, pal_rgb, base_a, kind):
    # same clean-up as build_girls.py, scaled to 192px: nothing above her head (sparkles, bubbles, icons), no
    # colourless streaks outside her outline on attacks, breathing stays inside her outline, colours snapped to
    # her base palette when close, floating specks dropped
    a = np.array(img.convert('RGBA')); m = a[..., 3] > 127
    body0 = base_a > 0
    top = int(np.argwhere(body0)[:, 0].min())
    m[:max(0, top - 6)] = False
    # round the head (horns, antennae, halos the model adds) nothing strays more than a few px outside her outline
    head = ndimage.binary_dilation(body0, iterations=6); m[:top + 30] &= head[:top + 30]
    if kind == 'idle': m &= ndimage.binary_dilation(body0, iterations=6)
    if kind == 'atk':
        near = ndimage.binary_dilation(body0, iterations=6); hsv = rgb2hsv(a[..., :3])
        m &= ~(~near & (hsv[..., 2] > 0.8) & (hsv[..., 1] < 0.09))  # her pale skin is >= 0.13
    px = a[..., :3][m].astype(np.float64)
    L = color.rgb2lab(px[None] / 255)[0]
    d = ((L[:, None, :] - pal_lab[None]) ** 2).sum(-1)
    # these clips hold nothing: colours far from her palette are effects (glow, sparkles, thrown balls)
    # inside her outline they are glow on her skin / sleeve: snapped to her palette below instead of punched out
    farm = np.zeros_like(m); farm[m] = d.min(1) > 22 ** 2
    inner = ndimage.binary_erosion(ndimage.binary_fill_holes(m & ~farm), iterations=2)
    force = farm & inner; m &= ~(farm & ~inner)
    if kind == 'atk':  # white blobs (the thrown ball, puffs): eye highlights are only a few px
        hsv = rgb2hsv(a[..., :3]); wl, wn = ndimage.label(m & (hsv[..., 2] > 0.85) & (hsv[..., 1] < 0.09))
        if wn:
            ws = ndimage.sum(wl > 0, wl, range(1, wn + 1)); gone = np.isin(wl, [i + 1 for i, s in enumerate(ws) if s > 8])
            force |= gone & inner; m &= ~(gone & ~inner)
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        body = lab == (int(np.argmax(sizes)) + 1)
        near = ndimage.binary_dilation(body, iterations=3)
        keep = [k + 1 for k, s in enumerate(sizes) if s >= 160 or (s >= 6 and (near & (lab == k + 1)).any())]
        m = np.isin(lab, keep)
    px = a[..., :3][m].astype(np.float64)
    L = color.rgb2lab(px[None] / 255)[0]
    d = ((L[:, None, :] - pal_lab[None]) ** 2).sum(-1)
    k = d.argmin(1); close = (d[np.arange(len(k)), k] < 12 ** 2) | force[m]
    px[close] = pal_rgb[k[close]]
    out = np.zeros_like(a); out[..., :3][m] = px.astype(np.uint8); out[..., 3][m] = 255
    return Image.fromarray(out, 'RGBA')

cells, meta = [], {'cw': C, 'ch': C, 'k': K, 'frames': {}, 'clips': {}}
for n, clips in CLIPS.items():
    base = {v: Image.open(f'{WORK}/base/{v}_{n}.png').convert('RGBA') for v in ('front', 'back', 'side')}
    b = np.concatenate([np.array(im)[np.array(im)[..., 3] > 0][:, :3] for im in base.values()])
    pal_rgb = np.unique(b, axis=0).astype(np.float64); pal_lab = color.rgb2lab(pal_rgb[None] / 255)[0]
    i0 = len(cells); cells += [base['front'], base['back'], base['side']]
    meta['frames'][n] = {'front': i0, 'back': i0 + 1, 'side': i0 + 2}
    meta['clips'][n] = {}
    for clip, spec in clips.items():
        ba = np.array(base[VIEW[clip[-1]]])[..., 3]
        # a clip is one [src, frames] or a list of them spliced (e.g. a left step clip then a right step clip)
        segs = spec if isinstance(spec[0], list) else [spec]
        new = [snap(Image.open(f'{WORK}/out/{n}/{src}_{i}.png'), pal_lab, pal_rgb, ba, clip[:-2]) for src, idx in segs for i in idx]
        meta['clips'][n][clip] = list(range(len(cells), len(cells) + len(new))); cells += new
pos = lambda i: [(i % PER) * C, (i // PER) * C]
atlas = Image.new('RGBA', (min(len(cells), PER) * C, ((len(cells) + PER - 1) // PER) * C), (0, 0, 0, 0))
for i, im in enumerate(cells): atlas.alpha_composite(im, tuple(pos(i)))
for n in CLIPS:
    meta['frames'][n] = {v: [*pos(i), C, C] for v, i in meta['frames'][n].items()}
    meta['clips'][n] = {k: [pos(i) for i in v] for k, v in meta['clips'][n].items()}
atlas.save(f'{OUT}/girls_hd.png', optimize=True)
json.dump(meta, open(f'{OUT}/girls_hd.json', 'w'))
print('hd atlas', atlas.size, {n: list(meta['clips'][n]) for n in CLIPS})
