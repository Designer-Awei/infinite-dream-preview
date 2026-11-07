"""Normalize provider frames without changing body scale; reserve extra room for adult dragon wings."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image
OUT=Path(__file__).resolve().parents[2]/'art/pets/approved-v1'

def normalize_frames(pid,clip,frames,record):
    folder=OUT/pid;anchor_y=116 if pid=='dragon-3' else 96
    sheet=Image.new('RGBA',(128*len(frames),128));raw_sheet=Image.new('RGBA',(256*len(frames),256))
    reference=Image.open(folder/'reference-192.png').convert('RGBA').resize((96,96),Image.Resampling.NEAREST)
    base=Image.new('RGBA',(128,128));base.paste(reference,(16,anchor_y-88));base.save(folder/'base.png')
    for i,frame in enumerate(frames):
        raw_sheet.paste(frame,(i*256,0));factor=record['canonical_scale']*.5;size=round(256*factor)
        small=frame.resize((size,size),Image.Resampling.NEAREST);normalized=Image.new('RGBA',(128,128))
        normalized.paste(small,(round(64-128*factor),round(anchor_y-224*factor)))
        pixels=np.array(normalized);pixels[pixels[:,:,3]<=8]=0;normalized=Image.fromarray(pixels)
        if i in [0,len(frames)-1]:normalized=base
        sheet.paste(normalized,(i*128,0))
    sheet.save(folder/(clip+'.png'));raw_sheet.save(folder/(clip+'-256.png'))
    return {'sha256':hashlib.sha256((folder/(clip+'.png')).read_bytes()).hexdigest(),'anchor':[64,anchor_y],'w':128,'h':128}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--only',nargs='+',required=True);args=p.parse_args()
    for pid in args.only:
        for clip in ['idle','move','cast']:
            folder=OUT/pid;record=json.loads((folder/(clip+'-job.json')).read_text(encoding='utf-8'));raw=Image.open(folder/(clip+'-256.png')).convert('RGBA')
            result_path=folder/(clip+'-result.json');result=json.loads(result_path.read_text(encoding='utf-8'))
            frames=[raw.crop((i*256,0,(i+1)*256,256)) for i in range(result['frame_count'])]
            result.update(normalize_frames(pid,clip,frames,record));result_path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Normalized',args.only)
