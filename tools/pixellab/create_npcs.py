"""Event visitors for 梦境航线 (one 96px idle row each) -> web/assets/npc/npc.png + npc.json.

Made with PixelLab: /generate-image-v2 (96x96, style_image = Claude's front cell from girls.png, chibi
front view, no background), then /animate-with-text-v3 with first = last frame (8 frames, seamless idle).
The raw outputs stay outside the repo; pass their folder: python tools/pixellab/create_npcs.py WORK_DIR
(WORK_DIR/anim/<id>_<n>.png, n = 0..8). Secrets only via PIXELLAB_KEY_FILE when generating.

Prompts (subject + shared tail "cute chibi pixel art character, big head small body, front three-quarter
view, full body, crisp dark outline, same style and size as the style image"):
  altar  - hooded shrine priestess in a purple robe with gold trim, staff with a floating violet crystal
  gamble - fox-eared gambler girl, red and gold vest, tiny top hat, holding up a big white die
  spring - small water spirit girl of translucent light blue water, fountain hair, star droplets
  curse  - mimic treasure chest in purple glowing chains, open toothy lid, tongue, one big eye
  merchant - 256px high-resolution strip (merchant.png). Design chosen at 96px first (/generate-image-v2, own prompt:
             orange-haired merchant girl, straw hat with a teal ribbon, brown cloak, sitting in a dark wooden rocking chair on the
             left; on the right a large burlap sack overflowing with big spotted eggs, a small golden shovel leaning on it; seed 23,
             candidate 0), then redrawn natively at 256 by /generate-image-v2 with that 96px image as reference_images and a
             256 pet frame as style_image (seed 23), animated by /animate-pixminimax (first = last frame, 12 frames + the
             closing one, seed 9): the chair rocks, the eggs wobble, sack and shovel stay put.
Idle actions (96px row visitors): crystal pulses / tosses and catches the die / floats and bobs / breathes, tongue wags, blinks.
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "assets" / "npc"
IDS = ["altar", "gamble", "spring", "curse"]
# visitors drawn in high resolution get their own strip (WORK_DIR/anim/<id>_<n>.png at `cell` px, n = 0..len-1):
# k = world px per source px (0.5 = 1:1 on the 2x canvas); the strip's last generated frame closes the loop and is dropped
HD = {"merchant": {"cell": 256, "k": 0.5, "n": 12, "face": [36, 28, 136]}}  # face: portrait crop x, y, side (source px)
N, CELL, FPS = 9, 96, 8
# the mimic's eye stays shut for frames 3..7: play its open-eyed frames twice, then the blink once
SEQ = {"curse": [0, 1, 2, 1, 0, 1, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]}

def main(work):
    work = Path(work)
    sheet = Image.new("RGBA", (N * CELL, len(IDS) * CELL), (0, 0, 0, 0))
    meta = {"cell": CELL, "fps": FPS, "npcs": {}}
    for row, nid in enumerate(IDS):
        bottom, top = 0, CELL
        for n in range(N):
            im = Image.open(work / "anim" / f"{nid}_{n}.png").convert("RGBA")
            assert im.size == (CELL, CELL), (nid, n, im.size)
            # hard alpha: no half-transparent fringe on the pixel art
            a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
            im.putalpha(a)
            bottom, top = max(bottom, im.getbbox()[3]), min(top, im.getbbox()[1])
            sheet.alpha_composite(im, (n * CELL, row * CELL))
        meta["npcs"][nid] = {"row": row, "n": N, "ox": CELL // 2, "oy": bottom, "h": bottom - top, **({"seq": SEQ[nid]} if nid in SEQ else {})}
    for nid, o in HD.items():
        cell, k, n = o["cell"], o["k"], o["n"]
        strip = Image.new("RGBA", (n * cell, cell), (0, 0, 0, 0))
        box = None
        for i in range(n):
            im = Image.open(work / "anim" / f"{nid}_{i}.png").convert("RGBA")
            assert im.size == (cell, cell), (nid, i, im.size)
            im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
            b = im.getbbox()
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
            strip.alpha_composite(im, (i * cell, 0))
        OUT.mkdir(parents=True, exist_ok=True)
        strip.save(OUT / f"{nid}.png", optimize=True)
        # ox / oy in source px (the group's middle, its lowest point); h in world px for the "talk" label
        meta["npcs"][nid] = {"file": f"{nid}.png", "cell": cell, "k": k, "n": n, "ox": (box[0] + box[2]) // 2, "oy": box[3], "h": round((box[3] - box[1]) * k), **({"face": o["face"]} if "face" in o else {})}
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "npc.png", optimize=True)
    (OUT / "npc.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("npc atlas", sheet.size, meta["npcs"])

if __name__ == "__main__":
    main(sys.argv[1])
