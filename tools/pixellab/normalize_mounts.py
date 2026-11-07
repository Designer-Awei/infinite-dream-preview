"""Align complete mounted clips to the actual submitted figure, remove input mattes, preserve motion."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image
from animate_mounts import OUT,cut_native_background,approved_reference,IDS
def hair_cavity_alpha(runtime,cid,frame):
 # Reviewed empty loop above Deepseek's ponytail. The white headband extends
 # outside this box, so it is explicitly excluded from the correction.
 if cid!='deepseek' or frame in [0,8]:return []
 rgb=runtime[:,:,:3].astype(int);pale=(runtime[:,:,3]>8)&(rgb.min(2)>=100)&((rgb.max(2)-rgb.min(2))<75)
 labels,n=ndimage.label(pale,np.ones((3,3)));removed=[]
 for label in range(1,n+1):
  mask=labels==label;yy,xx=np.where(mask)
  if len(xx)<=40 and xx.min()>=66 and xx.max()<=86 and yy.min()>=27 and yy.max()<=40:
   removed.extend([[int(x),int(y)] for x,y in zip(xx,yy)]);runtime[mask]=0
 return removed

def normalize(species,cid,clip):
 folder=OUT/species/cid;rawpath=folder/(clip+'-256.png')
 if not rawpath.exists():return
 raw=Image.open(rawpath).convert('RGBA');base=cut_native_background(raw.crop((0,0,256,256)));box=base.getbbox();factor=196/max(box[2]-box[0],box[3]-box[1]);size=round(256*factor)
 offset=(round(128-(box[0]+box[2])/2*factor),round(232-box[3]*factor));base256=Image.new('RGBA',(256,256));base256.paste(base.resize((size,size),Image.Resampling.NEAREST),offset)
 # Only replace contaminated endpoints. Keep the generated middle motion exact.
 base256=approved_reference(species,cid)[1]
 sheet=Image.new('RGBA',(160*9,160));removed=[]
 for i in range(9):
  image=raw.crop((i*256,0,(i+1)*256,256));a=np.array(image);a[a[:,:,3]<=8]=0
  if i not in [0,8]:
   labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));areas=np.bincount(labels.ravel());areas[0]=0;main=int(areas.argmax())
   for label in range(1,n+1):
    mask=labels==label
    # Reviewed white emotes above the head are not part of the approved rider.
    yy,xx=np.where(mask);white_emote=cid in ['grok','claude'] and clip=='cast' and yy.max()<60 and (a[:,:,:3][mask].min(1)>=240).mean()>.6
    if label!=main and (areas[label]<=12 or white_emote):removed.append({'frame':i,'pixels':int(areas[label]),'reason':'detached upper emote' if white_emote else 'small fragment'});a[mask]=0
   if cid=='claude' and clip=='cast' and i in [3,5]:
    # The provider attached a white triangle to orange hair in frame 3.
    # Restrict removal to the reviewed light marker; retain the raw frame.
    region=np.zeros(a.shape[:2],bool);region[15:75,94:145]=True
    marker=region&(a[:,:,:3].min(2)>=220)&(a[:,:,3]>8)
    removed.append({'frame':i,'pixels':int(marker.sum()),'reason':'reviewed white marker above orange hair','region':[94,15,145,75]});a[marker]=0
    labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));areas=np.bincount(labels.ravel());areas[0]=0;main=int(areas.argmax())
    for label in range(1,n+1):
     mask=labels==label;yy,xx=np.where(mask)
     if label!=main and yy.max()<76:
      removed.append({'frame':i,'pixels':int(mask.sum()),'reason':'remaining detached marker edge'});a[mask]=0
  image=Image.fromarray(a);aligned=Image.new('RGBA',(256,256));aligned.paste(image.resize((size,size),Image.Resampling.NEAREST),offset)
  if i in [0,8]:aligned=base256
  runtime=np.array(aligned.resize((160,160),Image.Resampling.NEAREST))
  cavity=hair_cavity_alpha(runtime,cid,i)
  if cavity:removed.append({'frame':i,'reason':'approved ponytail loop is transparent; white headband retained','runtime_pixels':len(cavity),'runtime_coordinates':cavity})
  labels,n=ndimage.label(runtime[:,:,3]>8,np.ones((3,3)));areas=np.bincount(labels.ravel());areas[0]=0;main=int(areas.argmax())
  for label in range(1,n+1):
   mask=labels==label;yy,xx=np.where(mask)
   # Reviewed loose pixels to the right of the fox's mane, separated by sampling.
   if label!=main and (areas[label]<=12 or (areas[label]<=40 and xx.min()>=138)):
    removed.append({'frame':i,'runtime_pixels':int(mask.sum()),'reason':'reviewed detached right-edge residue' if areas[label]>12 else 'runtime fragment'});runtime[mask]=0
  sheet.paste(Image.fromarray(runtime),(i*160,0))
 target=folder/(clip+'.png');sheet.save(target);sheet.crop((0,0,160,160)).save(folder/'base.png')
 state=folder/(clip+'-job.json');record=json.loads(state.read_text(encoding='utf-8'));record['sha256']=hashlib.sha256(target.read_bytes()).hexdigest();record['normalization']={'provider_raw_unchanged':True,'source_first_frame_sha256':hashlib.sha256(raw.crop((0,0,256,256)).tobytes()).hexdigest(),'scale':factor,'offset':offset,'target_foot':[128,232],'runtime':[160,160],'input_white_matte_removed':True,'endpoint_alpha':'original approved RGBA, direct nearest sampling, no white colour key','small_detached_fragments':removed};state.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
 print('normalized full mount',cid,clip,'scale',round(factor,3),'offset',offset,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--species',default='fox');p.add_argument('--only',nargs='+',default=IDS);p.add_argument('--clip',nargs='+',default=['idle','move','cast']);a=p.parse_args()
 for cid in a.only:
  for clip in a.clip:normalize(a.species,cid,clip)
