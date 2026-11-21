"""Build pet / rider masks for the mounted atlases (web/assets/pets/<species>-mounted-mask.png).

A mounted frame is one generated picture of the girl riding her pet, so 异色 recolouring needs to know which pixels
are the pet. Per (species, girl) pair:
  1. colour models: the pet's own stage-3 follower frames vs the girl's sprite frames (girls.png / girls_hd.png),
     5-bit RGB histograms; a pixel's evidence = log P(colour | pet) - log P(colour | girl);
  2. the evidence map is smoothed (Gaussian, sigma 2.5 px) so ambiguous colours (outlines, whites, a girl whose hair
     shares the pet's hue) follow their neighbourhood;
  3. a body prior: the girl sits on the pet's back, so the upper middle of the frame leans girl, the lower part and
     the far sides lean pet;
  4. threshold, keep the pet's largest connected pieces, close small holes.
The mask atlas has the same layout as the mounted atlas: white (alpha 255) where a pixel belongs to the pet.
usage: python3 tools/pixellab/mount_masks.py [species ...]   (writes masks + a review sheet in /tmp/mount-masks)
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
PETS = ROOT / "web/assets/pets"
ASSETS = ROOT / "web/assets"
REVIEW = Path("/tmp/mount-masks")


def hist(pixels):
    q = (pixels[:, :3] >> 3).astype(np.int32)
    idx = (q[:, 0] << 10) | (q[:, 1] << 5) | q[:, 2]
    h = np.bincount(idx, minlength=1 << 15).astype(np.float64) + 0.5
    # spread each colour a little to its neighbours so a shade not seen exactly still scores
    h3 = ndimage.gaussian_filter(h.reshape(32, 32, 32), 0.8)
    return np.log(h3 / h3.sum()).ravel()


def frames_of(img, rects):
    out = []
    for x, y, w, h in rects:
        a = np.array(img.crop((x, y, x + w, y + h)).convert("RGBA"))
        out.append(a.reshape(-1, 4))
    px = np.concatenate(out)
    return px[px[:, 3] > 128]


def pet_pixels(species):
    meta = json.loads((PETS / "pets.json").read_text())
    pages = [Image.open(PETS / p["file"]).convert("RGBA") for p in meta["pages"]]
    a = meta["actors"][f"{species}-3"]
    cw, ch = int(a.get("cw", meta["cw"])), int(a.get("ch", meta["ch"]))
    img = pages[int(a.get("page", 0))]
    rects = [(x, y, cw, ch) for clip in meta["clips"][f"{species}-3"].values() for x, y in clip]
    return frames_of(img, rects)


def girl_pixels(cid):
    px = []
    for name in ["girls.json", "girls_hd.json"]:
        meta = json.loads((ASSETS / name).read_text())
        img = Image.open(ASSETS / name.replace(".json", ".png")).convert("RGBA")
        cw, ch = meta["cw"], meta["ch"] if "ch" in meta else meta["cw"]
        rects = []
        if cid in meta.get("frames", {}):
            rects += [tuple(v) for v in meta["frames"][cid].values()]
        for clip in meta.get("clips", {}).get(cid, {}).values():
            rects += [(x, y, cw, ch) for x, y in clip]
        if rects:
            px.append(frames_of(img, rects))
    return np.concatenate(px)


def segment(frame, lp_pet, lp_girl, anchor, center):
    a = np.array(frame)
    alpha = a[:, :, 3] > 100
    if not alpha.any():
        return np.zeros(alpha.shape, bool)
    q = (a[:, :, :3] >> 3).astype(np.int32)
    idx = (q[:, :, 0] << 10) | (q[:, :, 1] << 5) | q[:, :, 2]
    ev = (lp_pet[idx] - lp_girl[idx]).clip(-6, 6)
    # neutral pixels (outline / near white / near black) carry little colour evidence
    mx, mn = a[:, :, :3].max(2).astype(float), a[:, :, :3].min(2).astype(float)
    sat = (mx - mn) / np.maximum(mx, 1)
    ev = np.where((sat < 0.18) | (mx < 50), ev * 0.25, ev)
    ev = np.where(alpha, ev, 0)
    w = ndimage.gaussian_filter(alpha.astype(float), 2.5) + 1e-6
    sm = ndimage.gaussian_filter(ev, 2.5) / w
    # body prior from the figure's own bounding box: rider = upper middle, pet = lower band and the sides
    ys, xs = np.where(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    v = (yy - y0) / max(1, y1 - y0)  # 0 top .. 1 feet
    u = np.abs(xx - center[0]) / max(1, (x1 - x0) / 2)  # 0 middle .. 1 sides
    prior = np.where(v < 0.62, -2.6 * (1 - u.clip(0, 1)) ** 1.5 * (0.62 - v) / 0.62 - 0.4 * (1 - u.clip(0, 1)), 1.4 * (v - 0.62) / 0.38) + 0.6 * (u - 0.5).clip(0, None)
    score = sm + prior
    pet = alpha & (score > 0)
    # tidy: drop specks, fill pinholes, keep pieces of a reasonable size
    pet = ndimage.binary_opening(pet, np.ones((2, 2)))
    pet = ndimage.binary_closing(pet, np.ones((3, 3))) & alpha
    lab, n = ndimage.label(pet)
    if n:
        sizes = ndimage.sum(pet, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(30, sizes.max() * 0.04)]
        pet = np.isin(lab, keep)
    # small girl islands inside the pet become pet
    girl = alpha & ~pet
    lab, n = ndimage.label(girl)
    if n:
        sizes = ndimage.sum(girl, lab, range(1, n + 1))
        tiny = [i + 1 for i, s in enumerate(sizes) if s < 25]
        pet |= np.isin(lab, tiny)
    return pet & alpha


def build(species):
    meta = json.loads((PETS / f"{species}-mounted.json").read_text())
    atlas = Image.open(PETS / f"{species}-mounted.png").convert("RGBA")
    cw, ch = meta["cw"], meta["ch"]
    lp_pet = hist(pet_pixels(species))
    mask = np.zeros((atlas.height, atlas.width), np.uint8)
    review = []
    for cid, act in meta["actors"].items():
        lp_girl = hist(girl_pixels(cid))
        center = act.get("center") or [cw / 2, ch / 2]
        n = 0
        for clip in ["idle_e", "move_e", "cast_e"]:
            for x, y in act.get(clip, []):
                fr = atlas.crop((x, y, x + cw, y + ch))
                m = segment(fr, lp_pet, lp_girl, meta["anchor"], center)
                mask[y:y + ch, x:x + cw] |= (m * 255).astype(np.uint8)
                if n % 9 == 0 and len(review) < 400:
                    review.append((cid, fr, m))
                n += 1
    out = Image.new("LA", (atlas.width, atlas.height))
    out.putalpha(Image.fromarray(mask))
    out = Image.merge("RGBA", [Image.fromarray(mask)] * 3 + [Image.fromarray(mask)])
    out.save(PETS / f"{species}-mounted-mask.png", optimize=True)
    # review: each sampled frame next to its pet (red tint) / rider (blue tint) split
    REVIEW.mkdir(exist_ok=True)
    tiles = []
    for cid, fr, m in review:
        a = np.array(fr).astype(float)
        tint = a.copy()
        al = a[:, :, 3] > 100
        tint[m, :3] = tint[m, :3] * 0.45 + np.array([255, 40, 40]) * 0.55
        tint[al & ~m, :3] = tint[al & ~m, :3] * 0.45 + np.array([40, 120, 255]) * 0.55
        pair = Image.new("RGBA", (cw * 2, ch), (30, 24, 50, 255))
        pair.alpha_composite(fr, (0, 0))
        pair.alpha_composite(Image.fromarray(tint.astype(np.uint8)), (cw, 0))
        tiles.append(pair.resize((cw, ch // 2)))
    cols = 6
    sheet = Image.new("RGBA", (cw * cols, (ch // 2) * ((len(tiles) + cols - 1) // cols)), (20, 16, 30, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t, ((i % cols) * cw, (i // cols) * (ch // 2)))
    sheet.save(REVIEW / f"{species}.png")
    print(species, "frames", sum(len(a.get(c, [])) for a in meta["actors"].values() for c in ["idle_e", "move_e", "cast_e"]), "review", REVIEW / f"{species}.png")


if __name__ == "__main__":
    for s in sys.argv[1:] or ["fox", "dragon", "phoenix"]:
        build(s)
