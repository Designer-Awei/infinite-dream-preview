"""Regression checks for pet exports, atlas coordinates, motion and loop seams."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

OUT=Path(__file__).resolve().parents[2]/'art/pets/approved-v1'

def main():
    sources=json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
    meta=json.loads((OUT/'pets.json').read_text(encoding='utf-8'))
    atlas=Image.open(OUT/'pets.png').convert('RGBA')
    assert hashlib.sha256((OUT/'pets.png').read_bytes()).hexdigest()==meta['sha256']
    report={'actors':9,'clips':18,'sourceHashes':True,'atlasCoordinates':True,'clipsChecked':[]};issues=[]
    for group in sources['families'].values():
        assert hashlib.sha256((OUT/group['source']).read_bytes()).hexdigest()==group['source_sha256']
        for stage in group['stages']:
            pid=stage['id'];base=Image.open(OUT/pid/'base.png').convert('RGBA');assert base.size==(96,96)
            x,y,w,h=meta['frames'][pid]['side'];assert atlas.crop((x,y,x+w,y+h)).tobytes()==base.tobytes()
            for clip in ['idle','cast']:
                result=json.loads((OUT/pid/f'{clip}-result.json').read_text(encoding='utf-8'))
                path=OUT/pid/f'{clip}.png';assert hashlib.sha256(path.read_bytes()).hexdigest()==result['sha256']
                sheet=Image.open(path).convert('RGBA');count=result['frame_count'];assert sheet.size==(96*count,96)
                frames=[];boxes=[];areas=[]
                for i,(x,y) in enumerate(meta['clips'][pid][clip+'_e']):
                    assert 0<=x<=atlas.width-96 and 0<=y<=atlas.height-96
                    frame=sheet.crop((i*96,0,(i+1)*96,96));assert frame.tobytes()==atlas.crop((x,y,x+96,y+96)).tobytes()
                    a=np.array(frame);assert a[:,:,3].min()==0 and a[:,:,3].max()>200
                    bbox=frame.getbbox();assert bbox;boxes.append(bbox);areas.append(int((a[:,:,3]>32).sum()));frames.append(a.astype(float))
                    if min(bbox[:2])==0 or bbox[2]>=96 or bbox[3]>=96:issues.append(f'{pid}/{clip}/{i}: edge contact')
                def delta(a,b):
                    union=(a[:,:,3]>32)|(b[:,:,3]>32)
                    aa=a[:,:,:3]*(a[:,:,3:4]/255);bb=b[:,:,:3]*(b[:,:,3:4]/255)
                    return float(np.abs(aa-bb)[union].mean())
                motion=[delta(frames[i],frames[i+1]) for i in range(count-1)];seam=delta(frames[-1],frames[0]);ratio=max(areas)/min(areas)
                assert max(motion)>1,f'{pid}/{clip}: static clip'
                if clip=='idle' and seam>max(12,float(np.median(motion))*1.8):issues.append(f'{pid}/idle: loop seam {seam:.1f}')
                if clip=='idle' and max(motion[0],motion[-1])>max(60,float(np.median(motion[1:-1]))*2):issues.append(f'{pid}/idle: first/last transition jumps')
                if ratio>(1.9 if clip=='idle' else 2.8):issues.append(f'{pid}/{clip}: silhouette area variation {ratio:.2f}')
                regions={}
                if clip=='idle':
                    # Anatomical regions are approximate review aids, paired with contact sheets.
                    family=pid.rsplit('-',1)[0]
                    definitions={
                      'dragon':{'chest':(.5,.4,.85,.8),'wings':(.05,0,.65,.55),'tail':(0,.6,.45,1)},
                      'fox':{'chest':(.65,.4,.85,.75),'ears':(.7,0,1,.4),'tails':(0,.1,.65,.8)},
                      'phoenix':{'chest':(.6,.35,.9,.7),'wings':(0,0,.65,.65),'tail':(0,.65,.6,1)}
                    }[family]
                    x0,y0,x1,y1=boxes[0]
                    for name,(left,top,right,bottom) in definitions.items():
                        l=x0+round((x1-x0)*left);r=x0+round((x1-x0)*right);t=y0+round((y1-y0)*top);b=y0+round((y1-y0)*bottom)
                        values=[float(np.abs(a[t:b,l:r]-frames[0][t:b,l:r]).mean()) for a in frames[1:]]
                        regions[name]=round(max(values),2)
                        if max(values)<.5:issues.append(f'{pid}/idle: {name} lacks visible changes')
                report['clipsChecked'].append({'id':pid,'clip':clip,'frames':count,'minArea':min(areas),'maxArea':max(areas),'areaRatio':round(ratio,3),'motionMean':round(float(np.mean(motion)),2),'seamDelta':round(seam,2),'regionChanges':regions,'boxes':boxes})
    report['reviewFlags']=issues;report['passed']=not issues
    (OUT/'asset-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'clips':len(report['clipsChecked']),'reviewFlags':issues,'passed':report['passed']},ensure_ascii=False))
    if issues:raise SystemExit(1)

if __name__=='__main__':main()
