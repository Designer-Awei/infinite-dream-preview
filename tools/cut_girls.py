# Cut the six girls from the 3x2 sheets using the sheets' own alpha channel (no background guessing).
import numpy as np, json
from PIL import Image
from scipy import ndimage
import sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/src_mat/ai-girls/sheets'
NAMES = ['deepseek','grok','claude','gpt','doubao','glm']
VIEWS = {'front':'ai-girls-front-3x2-v1.png','back':'ai-girls-back-3x2-v1.png','side':'ai-girls-side-right-3x2-v1.png'}
def cut(view):
    im = np.array(Image.open(f'{SRC}/{VIEWS[view]}').convert('RGBA'))
    H, W = im.shape[:2]; cw, ch = W//3, H//2
    out = {}
    for i, n in enumerate(NAMES):
        cx, cy = (i%3)*cw, (i//3)*ch
        cell = im[cy:cy+ch, cx:cx+cw].copy()
        a = cell[..., 3].astype(np.float32) / 254.0
        solid = a > 0.5
        lab, nl = ndimage.label(solid)
        sizes = ndimage.sum(solid, lab, range(1, nl+1))
        big = int(np.argmax(sizes)) + 1
        def touches_edge(k):
            ys, xs = np.where(lab == k)
            return xs.min() == 0 or xs.max() == cw - 1 or ys.min() == 0 or ys.max() == ch - 1
        # keep the body plus sizeable detached bits that live inside this cell (a neighbour's wing tip touching the
        # cell border is dropped)
        keep = np.isin(lab, [k+1 for k, s in enumerate(sizes) if k + 1 == big or (s >= sizes.max()*0.004 and not touches_edge(k + 1))])
        # soft alpha kept for the hi-res art, limited to pixels next to the kept body
        near = ndimage.binary_dilation(keep, iterations=2)
        alpha = np.where(near, np.clip(a, 0, 1), 0)
        alpha[alpha < 0.12] = 0
        rgba = cell.copy(); rgba[..., 3] = (alpha*255).astype(np.uint8)
        ys, xs = np.where(alpha > 0)
        box = (xs.min(), ys.min(), xs.max()+1, ys.max()+1)
        out[n] = (Image.fromarray(rgba).crop(box), box, keep[box[1]:box[3], box[0]:box[2]])
    return out
if __name__ == '__main__':
    import os; os.makedirs('cut', exist_ok=True)  # run from a scratch folder
    meta = {}
    for v in VIEWS:
        for n, (img, box, solid) in cut(v).items():
            img.save(f'cut/{v}_{n}.png'); meta[f'{v}_{n}'] = [int(x) for x in box]
    json.dump(meta, open('cut/boxes.json', 'w'))
    print('ok', len(meta))
