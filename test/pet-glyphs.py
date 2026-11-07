"""Adding pet strings must not change any previously published pixel-font glyph."""
import io,json,subprocess
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
ROOT=Path(__file__).resolve().parents[1]
baseline='8d863c9'
raw=subprocess.check_output([r'C:\Program Files\Git\cmd\git.exe','show',baseline+':web/assets/font/Cubic_11.woff'],cwd=ROOT)
old=TTFont(io.BytesIO(raw));new=TTFont(ROOT/'web/assets/font/Cubic_11.woff')
before=old.getBestCmap();after=new.getBestCmap();a=old.getGlyphSet();b=new.getGlyphSet()
for code,name in before.items():
    assert code in after,'Removed legacy glyph '+chr(code)
    p=DecomposingRecordingPen(a);q=DecomposingRecordingPen(b)
    a[name].draw(p);b[after[code]].draw(q)
    assert p.value==q.value and old['hmtx'][name]==new['hmtx'][after[code]],'Changed legacy glyph '+chr(code)
print(json.dumps({'baseline':baseline,'unchangedGlyphs':len(before),'addedGlyphs':len(after)-len(before)}))
