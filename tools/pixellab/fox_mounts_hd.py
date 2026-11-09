"""Reanimate the approved six fox riders directly from full resolution RGBA."""
import argparse,json,math,shutil
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageDraw
import followers_hd as f
import animate_mounts as old
b=f.b;ROOT=f.ROOT;OUT=ROOT/'art/pets/fox-mounted-hd-v1';EVIDENCE=ROOT.parent/'context/fox-hd-release-2026-11-09';IDS=b.IDS;CLIPS=f.CLIPS

def prepare():
 OUT.mkdir(exist_ok=True);EVIDENCE.mkdir(exist_ok=True);meta=json.loads((ROOT/'web/assets/pets/fox-mounted.json').read_text(encoding='utf-8'));atlas=Image.open(ROOT/'web/assets/pets/fox-mounted.png').convert('RGBA')
 for cid in IDS:
  folder=OUT/cid;folder.mkdir(exist_ok=True)
  if (folder/'reference-256.png').exists():continue
  source=ROOT/f'art/pets/riding-approved/fox/{cid}-source.png';shutil.copy2(source,folder/'source.png');im=f.clean(Image.open(source));crop=im.crop(im.getbbox());actor=meta['actors'][cid];x,y=actor['idle_e'][0];previous=atlas.crop((x,y,x+160,y+160)).getbbox();extent=max(previous[2]-previous[0],previous[3]-previous[1])*1.6;k=extent/max(crop.size);size=tuple(round(v*k) for v in crop.size);ref=Image.new('RGBA',(256,256));ref.paste(crop.resize(size,Image.Resampling.LANCZOS),((256-size[0])//2,232-size[1]));ref=f.clean(ref);ref.save(folder/'reference-256.png');box=ref.getbbox()
  b.dump(folder/'reference.json',{'source_sha256':b.sha(folder/'source.png'),'reference_sha256':b.sha(folder/'reference-256.png'),'native_resolution':256,'no_low_resolution_intermediate':True,'previous_extent':extent/1.6,'scale':.78/1.6,'anchor':[128,232],'mouth':[box[2]-3,round(box[1]+(box[3]-box[1])*.47)]});b.dump(folder/'selected.json',{clip:1 for clip in CLIPS})
 board=Image.new('RGBA',(768,560),'#202632');d=ImageDraw.Draw(board)
 for n,cid in enumerate(IDS):board.alpha_composite(Image.open(OUT/cid/'reference-256.png'),(n%3*256,n//3*280+20));d.text((n%3*256+6,n//3*280+3),cid,fill='#ffe36a')
 board.save(EVIDENCE/'riding-reference-review.png');print('Prepared six native256 whole-rider references',flush=True)

def configure():
 f.OUT=OUT;f.EVIDENCE=EVIDENCE;f.IDS=IDS;f.PROMPTS={cid:{clip:old.ACTIONS[clip] for clip in CLIPS} for cid in IDS};f.COMMON=' Fine clear native sprite detail, original ivory/gold/plum fur and coloured rider eyes. Transparent empty background, complete silhouette with padding.'
 for cid in IDS:f.PROMPTS[cid]['move']+=' Front-left and rear-right step together, then front-right and rear-left; opposite diagonal pairs alternate, not same-side pacing or hopping.'

def cleanup():
 for cid in IDS:
  folder=OUT/cid;selected=json.loads((folder/'selected.json').read_text(encoding='utf-8'));ref=Image.open(folder/'reference-256.png').convert('RGBA')
  for clip,rev in selected.items():
   path=folder/f'{clip}-r{rev}.png';rawpath=folder/f'{clip}-r{rev}-raw.png';recordpath=folder/f'{clip}-r{rev}-job.json';record=json.loads(recordpath.read_text(encoding='utf-8'));raw=Image.open(rawpath).convert('RGBA');sheet=Image.new('RGBA',raw.size);removed=[]
   for i in range(13):
    frame=ref if i in [0,12] else f.clean(raw.crop((i*256,0,(i+1)*256,256)),128);before=ref if i in [0,12] else f.clean(raw.crop((i*256,0,(i+1)*256,256)),32);a=b.np.array(before);after=b.np.array(frame);yy,xx=b.np.where(b.np.any(a!=after,axis=2))
    # Visually reviewed provider-added rings, separate from the entire animal/rider.
    if clip=='cast' and (cid,i) in [('deepseek',11),('doubao',10),('doubao',11)]:
     pixels=b.np.array(frame);labels,n=b.ndimage.label(pixels[:,:,3]>8,b.np.ones((3,3)))
     for label in range(1,n+1):
      yy0,xx0=b.np.where(labels==label)
      if len(xx0)<=256 and len(xx0) and xx0.min()>=216 and yy0.min()>=132 and yy0.max()<=167:pixels[labels==label]=0
     frame=Image.fromarray(pixels);after=b.np.array(frame);yy,xx=b.np.where(b.np.any(a!=after,axis=2))
    if len(xx):removed.append({'frame':i,'count':len(xx),'pixels':[[int(x),int(y)] for x,y in zip(xx,yy)]})
    sheet.paste(frame,(i*256,0))
   sheet.save(path);record.update(sha256=b.sha(path),native_component_cleanup=removed,alpha_cleanup='alpha<=8 and detached components<=128 plus three visually reviewed external rings; no RGB colour key; exact reference endpoints');b.dump(recordpath,record)
 print('Cleaned detached native rider fragments without colour keying',flush=True)

def pack():
 atlas=Image.new('RGBA',(4096,math.ceil(len(IDS)*len(CLIPS)*13/16)*256));meta={'species':'fox','ride_stage':3,'cw':256,'ch':256,'anchor':[128,232],'scale':.78/1.6,'native_resolution':256,'actors':{}};idx=0;flags=[]
 for cid in IDS:
  folder=OUT/cid;reference=json.loads((folder/'reference.json').read_text(encoding='utf-8'));im=Image.open(folder/'reference-256.png').convert('RGBA');box=im.getbbox();a=b.np.array(im);ys,xs=b.np.where((a[:,:,3]>128)&(b.np.indices(a.shape[:2])[1]>=box[2]-4));reference['mouth']=[box[2]-3,int(b.np.median(ys))];b.dump(folder/'reference.json',reference);actor={'top':box[1],'mouth':reference['mouth'],'center':[(box[0]+box[2])/2,(box[1]+box[3])/2],'native_resolution':256,'mouth_frames':{}};selected=json.loads((folder/'selected.json').read_text(encoding='utf-8'))
  for clip,rev in selected.items():
   path=folder/f'{clip}-r{rev}.png';record=json.loads((folder/f'{clip}-r{rev}-job.json').read_text(encoding='utf-8'));assert b.sha(path)==record['sha256'] and record['reference_sha256']==reference['reference_sha256'];sheet=Image.open(path).convert('RGBA');coords=[];mouth=[]
   for i in range(13):
    frame=sheet.crop((i*256,0,(i+1)*256,256));bounds=frame.getbbox()
    if not bounds or min(bounds[:2])<1 or bounds[2]>255 or bounds[3]>255:flags.append(f'{cid}/{clip}/{i}: clipping')
    labels,n=b.ndimage.label(b.np.array(frame)[:,:,3]>8,b.np.ones((3,3)));areas=b.np.bincount(labels.ravel());areas[0]=0
    if n>1 and sorted(areas,reverse=True)[1]>128:flags.append(f'{cid}/{clip}/{i}: detached fragment')
    pos=[idx%16*256,idx//16*256];atlas.paste(frame,tuple(pos));coords.append(pos);mouth.append(f.mouth_frame(frame,reference['mouth']));idx+=1
   actor[clip+'_e']=coords;actor['mouth_frames'][clip+'_e']=mouth
  meta['actors'][cid]=actor
 assert not flags,flags
 atlas=atlas.crop((0,0,4096,math.ceil(idx/16)*256));atlas.save(OUT/'mounted.png',optimize=True);meta['sha256']=b.sha(OUT/'mounted.png');b.dump(OUT/'mounted.json',meta)
 for ext in ['png','json']:shutil.copy2(OUT/f'mounted.{ext}',ROOT/f'web/assets/pets/fox-mounted.{ext}')
 for clip in CLIPS:
  frames=[]
  for i in range(12):
   board=Image.new('RGBA',(768,560),'#202632');d=ImageDraw.Draw(board)
   for n,cid in enumerate(IDS):
    x,y=meta['actors'][cid][clip+'_e'][i];board.alpha_composite(atlas.crop((x,y,x+256,y+256)),(n%3*256,n//3*280+20));d.text((n%3*256+6,n//3*280+3),cid+' '+clip,fill='#ffe36a')
   frames.append(board.convert('RGB'))
  frames[0].save(OUT/f'{clip}-preview.png',save_all=True,append_images=frames[1:],duration=111,loop=0,disposal=0,blend=0)
 b.dump(OUT/'pack-check.json',{'native_resolution':256,'riders':6,'clips':18,'samples':idx,'atlas':atlas.size,'flags':flags});print('Packed native fox mounts',atlas.size,flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','generate','cleanup','pack']);p.add_argument('--only',nargs='+',default=IDS);p.add_argument('--clips',nargs='+',default=CLIPS);p.add_argument('--revision',type=int,default=1);p.add_argument('--workers',type=int,default=3);a=p.parse_args()
 if a.mode=='prepare':prepare()
 elif a.mode=='pack':pack()
 elif a.mode=='cleanup':cleanup()
 else:
  configure()
  with ThreadPoolExecutor(max_workers=a.workers) as pool:list(pool.map(lambda item:f.generate(*item),[(cid,clip,a.revision) for cid in a.only for clip in a.clips]))
