"""Source/atlas/alpha/loop/motion checks for approved whole rider+mount animations."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image,ImageDraw
from animate_mounts import OUT,IDS
def main(species):
 folder=OUT/species;sources=json.loads((folder/'sources.json').read_text(encoding='utf-8'));meta=json.loads((folder/'mounted.json').read_text(encoding='utf-8'));atlas=Image.open(folder/'mounted.png').convert('RGBA')
 assert sources['stage']==meta['ride_stage']==3
 assert hashlib.sha256((folder/'source-six.png').read_bytes()).hexdigest()==sources['source_sha256']
 assert hashlib.sha256((folder/'mounted.png').read_bytes()).hexdigest()==meta['sha256'];assert len(meta['actors'])==6
 for record in sources['characters']:assert hashlib.sha256((folder/(record['cid']+'-source.png')).read_bytes()).hexdigest()==record['sha256']
 report={'species':species,'stage':3,'actors':6,'clips':18,'frames':162,'originalSourcePreserved':True,'checks':[]};flags=[]
 for clip in ['idle','move','cast']:
  board=Image.new('RGB',(9*192,6*216),'#181329');d=ImageDraw.Draw(board)
  for row,cid in enumerate(IDS):
   p=folder/cid;sheet=Image.open(p/(clip+'.png')).convert('RGBA');assert sheet.size==(160*9,160);job=json.loads((p/(clip+'-job.json')).read_text(encoding='utf-8'));assert hashlib.sha256((p/(clip+'.png')).read_bytes()).hexdigest()==job['sha256']
   frames=[];areas=[];boxes=[]
   for i,(x,y) in enumerate(meta['actors'][cid][clip+'_e']):
    frame=sheet.crop((i*160,0,(i+1)*160,160));assert frame.tobytes()==atlas.crop((x,y,x+160,y+160)).tobytes();a=np.array(frame);box=frame.getbbox();assert box;boxes.append(box);areas.append(int((a[:,:,3]>32).sum()));frames.append(a)
    if min(box[:2])<=0 or box[2]>=160 or box[3]>=160:flags.append(f'{cid}/{clip}/{i}: clipped edge')
    whites=int(((a[:,:,:3].min(2)>=248)&(a[:,:,3]>8)).sum())
    if whites/max(1,areas[-1])>.25:flags.append(f'{cid}/{clip}/{i}: white background matte')
    labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));counts=np.bincount(labels.ravel());counts[0]=0;primary=int(counts.argmax())
    if any(v>12 for j,v in enumerate(counts) if j not in [0,primary]):flags.append(f'{cid}/{clip}/{i}: detached foreground fragment')
    big=frame.resize((192,192),Image.Resampling.NEAREST);board.paste(big,(i*192,row*216+20),big)
   assert np.array_equal(frames[0],frames[-1]),(cid,clip,'loop endpoint')
   def delta(a,b):
    mask=(a[:,:,3]>32)|(b[:,:,3]>32);return float(np.abs(a.astype(float)-b.astype(float))[mask].mean())
   motion=[delta(frames[i],frames[i+1]) for i in range(8)];ratio=max(areas)/min(areas)
   if max(motion)<1:flags.append(f'{cid}/{clip}: static')
   if ratio>(1.6 if clip=='idle' else 2):flags.append(f'{cid}/{clip}: body area ratio {ratio:.2f}')
   if max(motion[0],motion[-1])>max(65,float(np.median(motion[1:-1]))*2):flags.append(f'{cid}/{clip}: first/last transition jump')
   d.text((6,row*216+3),cid+' / '+clip,fill='white');report['checks'].append({'cid':cid,'clip':clip,'areaRatio':round(ratio,3),'motion':[round(m,2) for m in motion],'boxes':boxes})
  board.save(folder/(clip+'-review.png'))
 report['reviewFlags']=flags;report['passed']=not flags;(folder/'asset-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'species':species,'clips':18,'passed':report['passed'],'flags':flags},ensure_ascii=False))
 if flags:raise SystemExit(1)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--species',default='fox');a=p.parse_args();main(a.species)
