"""Remove isolated generated effect fragments above the bird, preserving its connected body.

This does not animate or redraw the sprite. Original 256px provider frames are kept.
Only the four explicitly rejected locomotion strips are processed and logged.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy import ndimage
from PIL import Image
OUT=Path(__file__).resolve().parents[2]/'art/pets/approved-v1'

def main():
    for pid in ['phoenix-1','phoenix-2']:
        for clip in ['idle','move']:
            path=OUT/pid/(clip+'.png');sheet=Image.open(path).convert('RGBA');frames=sheet.width//128;removed=[]
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            for i in range(1,frames-1):
                a=np.array(sheet.crop((i*128,0,(i+1)*128,128)))
                labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)))
                areas=np.bincount(labels.ravel());areas[0]=0;main=int(areas.argmax());slices=ndimage.find_objects(labels)
                top=slices[main-1][0].start
                for j,sl in enumerate(slices,1):
                    if j!=main and sl[0].stop<=top-2:
                        count=int((labels==j).sum());a[labels==j]=0
                        removed.append({'frame':i,'pixels':count,'box':[sl[1].start,sl[0].start,sl[1].stop,sl[0].stop]})
                sheet.paste(Image.fromarray(a),(i*128,0))
            if not removed:continue
            sheet.save(path)
            state=OUT/pid/(clip+'-result.json');data=json.loads(state.read_text(encoding='utf-8'))
            data['stray_cleanup']={'method':'isolated 8-connected fragments fully above connected bird body by >=2px','input_sha256':before,'removed':removed,'provider_raw_unchanged':True}
            data['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();state.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
            print(pid,clip,'removed',sum(v['pixels'] for v in removed),'detached pixels; connected bird preserved')

if __name__=='__main__':main()
