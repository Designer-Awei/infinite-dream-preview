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
Idle actions: crystal pulses / tosses and catches the die / floats and bobs / breathes, tongue wags, blinks.
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "assets" / "npc"
IDS = ["altar", "gamble", "spring", "curse"]
N, CELL, FPS = 9, 96, 8
# the mimic's eye stays shut for frames 3..7: play its open-eyed frames twice, then the blink once
SEQ = {"curse": [0, 1, 2, 1, 0, 1, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]}

def main(work):
    work = Path(work)
    sheet = Image.new("RGBA", (N * CELL, len(IDS) * CELL), (0, 0, 0, 0))
    meta = {"cell": CELL, "fps": FPS, "npcs": {}}
    for row, nid in enumerate(IDS):
        bottom = 0
        for n in range(N):
            im = Image.open(work / "anim" / f"{nid}_{n}.png").convert("RGBA")
            assert im.size == (CELL, CELL), (nid, n, im.size)
            # hard alpha: no half-transparent fringe on the pixel art
            a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
            im.putalpha(a)
            bottom = max(bottom, im.getbbox()[3])
            sheet.alpha_composite(im, (n * CELL, row * CELL))
        meta["npcs"][nid] = {"row": row, "n": N, "ox": CELL // 2, "oy": bottom, **({"seq": SEQ[nid]} if nid in SEQ else {})}
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "npc.png", optimize=True)
    (OUT / "npc.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("npc atlas", sheet.size, meta["npcs"])

if __name__ == "__main__":
    main(sys.argv[1])
