# Frame QA for PixelLab melee clips (used before melee_swings.py; re-roll a seed until its clip passes): consistency with the weapon-holding ready pose.
# usage: melee_qa.py [--base=BASE_VIEW.png] READY.png FRAME0.png FRAME1.png ...  -> per-frame metrics + PASS/FAIL with reasons
# checks (per frame, after the same clean-up the atlas tool applies):
#   specks   floating components < 30 px that are not the body/weapon (stray fragments)
#   foreign  opaque pixels far (ΔE>20) from the ready pose's colours (stray colours / smears)
#   feet     lowest body row vs the ready pose (±3 px)
#   mass     opaque pixel count vs the ready pose (0.6–1.6)
#   weapon   weapon-colour pixels (colours in the ready pose that the base sprite lacks) ≥ 35 % of the ready pose's
#   jump     mask IoU with the previous frame ≥ 0.35 (no teleports / pops)
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import color

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from melee_swings import palette, clean


def lab(px):
    return color.rgb2lab(px[None] / 255)[0]


def analyse(ready_path, frames, base_path=None):
    ready = Image.open(ready_path).convert('RGBA')
    pal_rgb, pal_lab = palette(ready)
    ra = np.array(ready); rm = ra[..., 3] > 127
    base_lab = palette(Image.open(base_path))[1] if base_path else None
    # weapon colours: ready-pose colours not near any base-sprite colour
    if base_lab is not None:
        d = ((pal_lab[:, None] - base_lab[None]) ** 2).sum(-1).min(1)
        wpn = pal_lab[d > 15 ** 2]
    else:
        wpn = pal_lab[:0]

    def wcount(a, m):
        if not len(wpn): return 0
        L = lab(a[..., :3][m].astype(float))
        return int((((L[:, None] - wpn[None]) ** 2).sum(-1).min(1) < 8 ** 2).sum())

    # weapon by shape too (a white spear shares her colours): opaque pixels outside her dilated base silhouette
    body = ndimage.binary_dilation(np.array(Image.open(base_path).convert('RGBA'))[..., 3] > 127, iterations=3) if base_path else np.zeros_like(rm)
    def ocount(m): return int((m & ~body).sum())
    r_mass, r_feet, r_w, r_o = rm.sum(), np.where(rm.any(1))[0].max(), wcount(ra, rm), ocount(rm)
    out, prev = [], None
    for f in frames:
        im = clean(Image.open(f), pal_rgb, pal_lab); a = np.array(im); m = a[..., 3] > 127
        labm, n = ndimage.label(m)
        sizes = ndimage.sum(m, labm, range(1, n + 1)) if n else []
        big = max(sizes) if n else 0
        specks = int(sum(1 for s in sizes if s < 30 and s < big))
        L = lab(a[..., :3][m].astype(float))
        foreign = int((((L[:, None] - pal_lab[None]) ** 2).sum(-1).min(1) > 20 ** 2).sum()) if m.any() else 0
        feet = int(np.where(m.any(1))[0].max()) if m.any() else -1
        mass = m.sum() / max(1, r_mass)
        w = max(wcount(a, m) / max(1, r_w) if r_w else 0, ocount(m) / max(1, r_o) if r_o else 0)
        iou = (m & prev).sum() / max(1, (m | prev).sum()) if prev is not None else 1
        why = []
        if specks > 0: why.append(f'specks {specks}')
        if foreign > 40: why.append(f'foreign {foreign}')
        if abs(feet - r_feet) > 3: why.append(f'feet {feet - r_feet:+d}')
        if not 0.6 <= mass <= 1.6: why.append(f'mass {mass:.2f}')
        if (r_w or r_o) and w < 0.35: why.append(f'weapon {w:.2f}')
        if iou < 0.35: why.append(f'jump {iou:.2f}')
        out.append({'f': f.split('/')[-1], 'specks': specks, 'foreign': foreign, 'feet': feet - int(r_feet), 'mass': round(float(mass), 2), 'weapon': round(float(w), 2), 'iou': round(float(iou), 2), 'ok': not why, 'why': why})
        prev = m
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    base = None
    if args[0].startswith('--base='): base = args.pop(0)[7:]
    res = analyse(args[0], args[1:], base)
    for r in res: print(('PASS ' if r['ok'] else 'FAIL ') + r['f'], r['why'] or '', {k: r[k] for k in ('specks', 'foreign', 'feet', 'mass', 'weapon', 'iou')})
    print('CLIP', 'PASS' if all(r['ok'] for r in res) else 'FAIL', sum(not r['ok'] for r in res), 'bad frames')
