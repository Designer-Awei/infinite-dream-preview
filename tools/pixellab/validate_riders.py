"""Check complete rider exports, source identity, loop seams and stable seated body size."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/pets/riders-v1'
def main():
 meta=json.loads((OUT/'riders.json').read_text(encoding='utf-8'));atlas=Image.open(OUT/'riders.png').convert('RGBA')
 front=Image.open(OUT/'riders-front.png').convert('RGBA');back=Image.open(OUT/'riders-back.png').convert('RGBA')
 for name in ['riders-front','riders-back']:assert hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest()==meta[name+'_sha256']
 f=np.array(front);b=np.array(back);a=np.array(atlas)
 assert not np.any((f[:,:,3]>0)&(b[:,:,3]>0)),'Occlusion layers overlap'
 assert np.array_equal(f+b,a),'Layers must preserve the entire source body'
 assert hashlib.sha256((OUT/'riders.png').read_bytes()).hexdigest()==meta['sha256'];assert len(meta['actors'])==6
 source_atlas=Image.open(ROOT/'web/assets/girls.png').convert('RGBA');gj=json.loads((ROOT/'web/assets/girls.json').read_text(encoding='utf-8'))
 review=Image.new('RGB',(9*144,6*168),'#181329');draw=ImageDraw.Draw(review);rows=[]
 for row,(cid,actor) in enumerate(meta['actors'].items()):
  source=Image.open(OUT/cid/'source.png').convert('RGBA');x,y,w,h=gj['frames'][cid]['side'];original=np.array(source_atlas.crop((x,y,x+w,y+h)));original[original[:,:,3]<=8]=0
  assert source.tobytes()==Image.fromarray(original).tobytes();assert hashlib.sha256((OUT/cid/'source.png').read_bytes()).hexdigest()==actor['source_sha256']
  sheet=Image.open(OUT/cid/'idle.png').convert('RGBA');assert sheet.size==(96*9,96);frames=[];areas=[]
  for i,(x,y) in enumerate(actor['idle_e']):
   frame=sheet.crop((i*96,0,(i+1)*96,96));assert frame.tobytes()==atlas.crop((x,y,x+96,y+96)).tobytes()
   box=frame.getbbox();assert box and min(box[:2])>0 and box[2]<96 and box[3]<96,(cid,i,box)
   a=np.array(frame);areas.append(int((a[:,:,3]>32).sum()));frames.append(a)
   review.paste(frame.resize((144,144),Image.Resampling.NEAREST),(i*144,row*168+24),frame.resize((144,144),Image.Resampling.NEAREST))
  assert np.array_equal(frames[0],frames[-1]);motion=[float(np.abs(frames[i].astype(float)-frames[i+1]).mean()) for i in range(8)]
  assert max(motion)>.1,cid+' static';assert max(areas)/min(areas)<1.5,cid+' seated silhouette changes too much'
  assert max(motion[0],motion[-1])<max(9,np.median(motion[1:-1])*2.5),cid+' loop jumps'
  draw.text((6,row*168+4),cid+' / full seated body',fill='white');rows.append({'id':cid,'frames':9,'areaRatio':round(max(areas)/min(areas),3),'motion':motion,'sourceIdentity':True})
 review.save(OUT/'rider-review.png');report={'actors':6,'clips':6,'frames':54,'fullBodySourcePoses':True,'farLegSeparateLayer':True,'layersRecombineExactly':True,'sourceIdentity':True,'checks':rows,'passed':True}
 (OUT/'rider-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS six full seated riders,54 frames,source identity,atlas and loops')
if __name__=='__main__':main()
