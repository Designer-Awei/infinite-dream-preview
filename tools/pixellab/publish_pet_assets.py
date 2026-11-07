"""Copy the reviewed atlas to the game and make tightly cropped UI-only portraits."""
from pathlib import Path
import hashlib,json,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art/pets/approved-v1'
DEST=ROOT/'web/assets/pets'

def main():
    meta=json.loads((SOURCE/'pets.json').read_text(encoding='utf-8'))
    assert len(meta['actors'])==9 and meta['cw']==meta['ch']==128
    assert all(len(clips)==3 for clips in meta['clips'].values())
    DEST.mkdir(parents=True,exist_ok=True)
    for name in ['pets.json','pets.png']:
        shutil.copy2(SOURCE/name,DEST/name)
        assert (DEST/name).read_bytes()==(SOURCE/name).read_bytes()
    for pid in meta['actors']:
        sprite=Image.open(SOURCE/pid/'base.png').convert('RGBA')
        crop=sprite.crop(sprite.getbbox());factor=84/max(crop.size)
        w,h=[max(1,round(v*factor)) for v in crop.size]
        portrait=Image.new('RGBA',(96,96));portrait.paste(crop.resize((w,h),Image.Resampling.NEAREST),((96-w)//2,(96-h)//2));portrait.save(DEST/(pid+'.png'))
    assert hashlib.sha256((DEST/'pets.png').read_bytes()).hexdigest()==meta['sha256']
    print('Published 128px atlas, 27 clips, 9 trimmed portraits')

if __name__=='__main__':main()
