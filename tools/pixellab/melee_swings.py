# 近战挥击动画（格洛克 光刃 / 吉普缇 白龙枪）: put the chosen PixelLab animate-with-text-v3 swings into
# web/assets/girls.png as new rows and point girls.json's atk_s / atk_e / atk_n clips at them.
# usage: melee_swings.py FRAMES_DIR PICKS_JSON
#   PICKS_JSON: {"grok": {"e": "grok_e_21", "s": ..., "n": ...}, "gpt": {...}} — each value is the stem of the
#   9 frames <stem>_0.png .. <stem>_8.png (frame 0 is the base pose; frames 1..8 are the swing).
# Clean-up per frame: colours close to the girl's own palette snap onto it (steady colours between frames), the
# weapon / light trail keep their drawn colours, floating specks under 4 px go. Idempotent: rows are rebuilt.
# Run it again after tools/build_girls.py (which rebuilds the atlas without these rows).
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import color

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ASSETS = os.path.join(ROOT, 'web', 'assets')
C = 96
DIRS = {'s': 'front', 'e': 'side', 'n': 'back'}


def palette(img):
    a = np.array(img.convert('RGBA'))
    px = a[..., :3][a[..., 3] > 127]
    uniq = np.unique(px, axis=0)
    return uniq, color.rgb2lab(uniq[None] / 255)[0]


def clean(img, pal_rgb, pal_lab):
    a = np.array(img.convert('RGBA'))
    m = a[..., 3] > 127
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s >= 4])
    px = a[..., :3][m].astype(np.float64)
    L = color.rgb2lab(px[None] / 255)[0]
    d = ((L[:, None, :] - pal_lab[None]) ** 2).sum(-1)
    k = d.argmin(1)
    close = d[np.arange(len(k)), k] < 10 ** 2
    px[close] = pal_rgb[k[close]]
    out = np.zeros_like(a)
    out[..., :3][m] = px.astype(np.uint8)
    out[..., 3][m] = 255
    return Image.fromarray(out, 'RGBA')


def main(frames_dir, picks_path):
    picks = json.load(open(picks_path))
    meta = json.load(open(os.path.join(ASSETS, 'girls.json')))
    atlas = Image.open(os.path.join(ASSETS, 'girls.png')).convert('RGBA')
    cols = atlas.width // C
    # rows above any earlier melee rows (rebuild them each run)
    base_h = meta.get('meleeTop', atlas.height)
    cells = [(cid, d) for cid in picks for d in ('s', 'e', 'n')]
    frames = sum(1 for _ in cells) * 8
    rows = (frames + cols - 1) // cols
    out = Image.new('RGBA', (atlas.width, base_h + rows * C))
    out.paste(atlas.crop((0, 0, atlas.width, base_h)), (0, 0))
    i = 0
    for cid, d in cells:
        x0, y0, w, h = meta['frames'][cid][DIRS[d]]
        pal_rgb, pal_lab = palette(atlas.crop((x0, y0, x0 + w, y0 + h)))
        stem = picks[cid][d]
        clip = []
        for f in range(1, 9):
            im = clean(Image.open(os.path.join(frames_dir, f'{stem}_{f}.png')), pal_rgb, pal_lab)
            if im.size != (C, C):
                raise SystemExit(f'{stem}_{f}: expected {C}x{C}, got {im.size}')
            x, y = (i % cols) * C, base_h + (i // cols) * C
            out.paste(im, (x, y))
            clip.append([x, y])
            i += 1
        meta['clips'][cid]['atk_' + d] = clip
    meta['meleeTop'] = base_h
    out.save(os.path.join(ASSETS, 'girls.png'), optimize=True)
    json.dump(meta, open(os.path.join(ASSETS, 'girls.json'), 'w'))
    print('melee rows', rows, 'frames', i, 'atlas', out.size)


if __name__ == '__main__':
    main(*sys.argv[1:3])
