# Re-subsets the Cubic 11 pixel font to every character used by the game's web sources (keeps the woff small).
# usage: python3 tools/subset_font.py /path/to/Cubic_11.ttf
import glob, sys
from fontTools import subset
from fontTools.ttLib import TTFont
src = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/ext/fonts/Cubic-11/fonts/ttf/Cubic_11.ttf"
chars = set(chr(c) for c in range(0x20, 0x7F))
for p in glob.glob("web/**/*", recursive=True):
    if p.endswith((".js", ".html", ".css", ".json", ".webmanifest")) and "vendor" not in p and "fxmods" not in p:
        chars |= set(open(p, encoding="utf-8").read())
chars = {c for c in chars if ord(c) >= 0x20}
font = TTFont(src)
cmap = font.getBestCmap()

# characters the font lacks but the game needs (a character name): built from the halves of two glyphs it has,
# pixel by pixel. char: (left source, first column taken from the right source, right source)
COMPOSE = {"缇": ("给", 5, "提")}
# hand-drawn ones (no glyph has the right half we need): 13 columns, rows from y=11 down to y=-2, "#" = pixel
BITMAPS = {}  # none needed now: characters the font lacks are renamed instead (宝藏鼹鼠 -> 宝藏地鼠)
def compose(font, cmap):
    from fontTools.pens.pointInsidePen import PointInsidePen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    gs, P = font.getGlyphSet(), 100  # Cubic 11: 100-unit pixels
    def on(ch, x, y):
        pen = PointInsidePen(gs, (x * P + P // 2, y * P + P // 2)); gs[cmap[ord(ch)]].draw(pen); return pen.getResult()
    for ch, (l, split, r) in COMPOSE.items():
        if ord(ch) in cmap or ord(l) not in cmap or ord(r) not in cmap: continue
        adv = font["hmtx"][cmap[ord(r)]][0] // P
        pen = TTGlyphPen(None)
        for y in range(-3, 12):
            row = [on(l if x < split else r, x, y) for x in range(adv)] + [False]
            x0 = None
            for x, v in enumerate(row):
                if v and x0 is None: x0 = x
                if not v and x0 is not None:  # one rectangle per horizontal run, clockwise
                    pen.moveTo((x0 * P, y * P)); pen.lineTo((x0 * P, (y + 1) * P)); pen.lineTo((x * P, (y + 1) * P)); pen.lineTo((x * P, y * P)); pen.closePath(); x0 = None
        name = "uni%04X" % ord(ch)
        font["glyf"][name] = pen.glyph(); font.getGlyphOrder().append(name) if name not in font.getGlyphOrder() else None
        font["hmtx"][name] = font["hmtx"][cmap[ord(r)]]
        for t in font["cmap"].tables:
            if t.isUnicode(): t.cmap[ord(ch)] = name
        cmap[ord(ch)] = name
    for ch, rows in BITMAPS.items():
        if ord(ch) in cmap: continue
        pen = TTGlyphPen(None)
        for i, row in enumerate(rows):
            y = 11 - i
            x0 = None
            for x, v in enumerate(row + "."):
                if v == "#" and x0 is None: x0 = x
                if v != "#" and x0 is not None:
                    pen.moveTo((x0 * P, y * P)); pen.lineTo((x0 * P, (y + 1) * P)); pen.lineTo((x * P, (y + 1) * P)); pen.lineTo((x * P, y * P)); pen.closePath(); x0 = None
        name = "uni%04X" % ord(ch)
        font["glyf"][name] = pen.glyph()
        if name not in font.getGlyphOrder(): font.getGlyphOrder().append(name)
        font["hmtx"][name] = (13 * P, 100)
        for t in font["cmap"].tables:
            if t.isUnicode(): t.cmap[ord(ch)] = name
        cmap[ord(ch)] = name
compose(font, cmap)
have = sorted(c for c in chars if ord(c) in cmap)
miss = sorted(c for c in chars if ord(c) not in cmap and ord(c) > 0x7F)
opt = subset.Options(); opt.flavor = "woff"; opt.layout_features = ["*"]
sub = subset.Subsetter(opt); sub.populate(unicodes=[ord(c) for c in have]); sub.subset(font)
font.flavor = "woff"; font.save("web/assets/font/Cubic_11.woff")
print(len(have), "glyphs kept; not in font:", "".join(c for c in miss if not (0x1F000 <= ord(c) <= 0x1FFFF))[:120])
