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
# PixelLab drew some raised hands as white gloves: give them back her skin tone (only near-white pixels outside
# where she is white standing still, i.e. the moving hand, never the skirt, collar or eye shine), shading kept from their brightness
SKIN_FIX = {'doubao': {'wave'}}
SKIN_HI, SKIN_LO = np.array([250, 226, 213]), np.array([221, 156, 142])
def skin_fix(a, bm):
    def whiteish(x):
        rgb = x[..., :3].astype(int); mx = rgb.max(-1); mn = rgb.min(-1)
        return (x[..., 3] > 127) & (mn > 185) & (mx - mn < 30)
    rgb = a[..., :3].astype(int)
    m = whiteish(a) & ~ndimage.binary_dilation(whiteish(bm), iterations=3)
    t = np.clip((250 - rgb.mean(-1)) / 50, 0, 1)[..., None]
    out = a.copy(); out[..., :3][m] = (SKIN_HI * (1 - t) + SKIN_LO * t)[m].round().astype(np.uint8)
    return out
for n in NAMES:
    base = np.array(Image.open(os.path.join(SRC, f'base_{n}.png')).convert('RGBA'))
    bm = base[..., 3] > 0
    sheet = Image.new('RGBA', (256 * 8, 256 * len(CLIPS)), (0, 0, 0, 0))
    for r, c in enumerate(CLIPS):
        near = ndimage.binary_dilation(bm, iterations=48)  # room for raised arms, hands and swinging hair; stray specks go by size below
        idx = PICK.get(n, {}).get(c, list(range(8)))
        for i, f in enumerate(idx[:8]):
            p = os.path.join(SRC, n, f'{c}_{f}.png')
            a = np.array(Image.open(p).convert('RGBA')) if os.path.exists(p) else base
            if c in SKIN_FIX.get(n, ()): a = skin_fix(a, base)
            sheet.alpha_composite(Image.fromarray(clean(a, near)), (i * 256, r * 256))
    # 256-colour palette PNG: visually identical for this art, a third of the size
    sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, f'{n}.png'), optimize=True)
    print(n, os.path.getsize(os.path.join(OUT, f'{n}.png')) // 1024, 'KB')
