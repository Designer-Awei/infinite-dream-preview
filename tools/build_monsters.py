# New monsters (PixelLab: a base sprite + a 16-frame loop each) -> critter strips like the original ones.
# art/monsters/<id>/a_<i>.png (64x64, frame 16 = frame 0 dropped) -> web/assets/critters/<id>.png + critters.json entry
# (w, h = the union box of all frames + 2px, n frames, fps, ox = box centre, oy = the feet: the lowest opaque row).
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art', 'monsters'); OUT = os.path.join(ROOT, 'web', 'assets', 'critters')
FPS = 10  # 16 frames ≈ 1.6 s a loop, near the originals' 22-38 frames at 12 fps
cj = json.load(open(os.path.join(OUT, 'critters.json')))
def clean(a):
    # keep the creature and anything touching it; drop specks the model leaves around
    m = a[..., 3] > 40
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s >= 12 or s == sizes.max()])
    out = a.copy(); out[~m] = 0
    return out
for mid in sorted(os.listdir(SRC)):
    d = os.path.join(SRC, mid)
    if not os.path.isdir(d): continue
    fs = sorted([f for f in os.listdir(d) if f.startswith('a_')], key=lambda f: int(f[2:-4]))
    frames = [clean(np.array(Image.open(os.path.join(d, f)).convert('RGBA'))) for f in fs]
    if len(frames) % 2: frames = frames[:-1]  # PixelLab returns the loop's start again as the last frame
    al = np.any([f[..., 3] > 0 for f in frames], axis=0)
    ys, xs = np.where(al)
    x0, x1, y0, y1 = max(0, xs.min() - 2), xs.max() + 3, max(0, ys.min() - 2), ys.max() + 3
    w, h = x1 - x0, y1 - y0
    strip = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames): strip.paste(Image.fromarray(f[y0:y1, x0:x1]), (i * w, 0))
    strip.save(os.path.join(OUT, mid + '.png'), optimize=True)
    cj[mid] = {'w': int(w), 'h': int(h), 'n': len(frames), 'fps': FPS, 'ox': int(w // 2), 'oy': int(ys.max() - y0)}
    print(mid, cj[mid])
json.dump(cj, open(os.path.join(OUT, 'critters.json'), 'w'), separators=(',', ':'))
