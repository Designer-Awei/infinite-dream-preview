# Lobby hero sheets from the PixelLab clips in art/lobby/<id>/<clip>_<i>.png -> web/assets/lobby/<id>.png
# 256 px cells, rows idle / wave / joy / cast, 8 frames each (frame 8 of a clip repeats frame 0 and is dropped).
# Cleanup: only pixels near her own outline (a wider margin for reactions, where arms and hair move), and no
# small detached bits (sparkles the model sometimes adds).
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art', 'lobby'); OUT = os.path.join(ROOT, 'web', 'assets', 'lobby')
NAMES = ['deepseek', 'grok', 'claude', 'gpt', 'doubao', 'glm']
CLIPS = ['idle', 'wave', 'joy', 'cast']
PICK = json.load(open(os.path.join(SRC, 'pick.json'))) if os.path.exists(os.path.join(SRC, 'pick.json')) else {}
os.makedirs(OUT, exist_ok=True)
def clean(a, near):
    m = (a[..., 3] > 127) & near
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s >= 60 or s == sizes.max()])
    out = a.copy(); out[..., 3] = m * 255; out[~m] = 0
    return out
for n in NAMES:
    base = np.array(Image.open(os.path.join(SRC, f'base_{n}.png')).convert('RGBA'))
    bm = base[..., 3] > 0
    sheet = Image.new('RGBA', (256 * 8, 256 * len(CLIPS)), (0, 0, 0, 0))
    for r, c in enumerate(CLIPS):
        near = ndimage.binary_dilation(bm, iterations=8 if c == 'idle' else 22)
        idx = PICK.get(n, {}).get(c, list(range(8)))
        for i, f in enumerate(idx[:8]):
            p = os.path.join(SRC, n, f'{c}_{f}.png')
            a = np.array(Image.open(p).convert('RGBA')) if os.path.exists(p) else base
            sheet.alpha_composite(Image.fromarray(clean(a, near)), (i * 256, r * 256))
    # 256-colour palette PNG: visually identical for this art, a third of the size
    sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, f'{n}.png'), optimize=True)
    print(n, os.path.getsize(os.path.join(OUT, f'{n}.png')) // 1024, 'KB')
