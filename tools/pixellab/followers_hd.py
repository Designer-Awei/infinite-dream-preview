"""Native 256px follower clips, with world size kept separate from source pixels."""
import argparse,base64,hashlib,io,json,math,re,shutil,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image,ImageDraw
import animate_riding_v2 as b

ROOT=b.ROOT;OUT=ROOT/'art/pets/followers-hd-v1';EVIDENCE=ROOT.parent/'context/followers-hd-2026-11-09'
IDS=[f'{family}-{stage}' for family in ['dragon','phoenix'] for stage in [1,2,3]]
CLIPS=['idle','move','cast'];sha=b.sha;dump=b.dump
PROMPTS={
 'dragon':{
  'idle':'A clearly VISIBLE LARGE WING FLAP while grounded: BOTH red bat wings lift together, unfold their membranes widely, sweep DOWN together showing the darker underside, then fold edge-on on recovery and return to reference height. Animate shoulders, elbows and tips, not a tiny twitch. All FOUR paws remain planted, chest breathes, tail and existing flame sway. No takeoff, rearing or begging.',
  'move':'A natural four-legged WALK cycle IN PLACE facing right, WITH LARGE SYNCHRONIZED WING FLAPS. Both wings unfold upward and outward, sweep DOWN TOGETHER showing membrane undersides, fold edge-on and recover. Clearly visible wing motion, not rigid wings or a small twitch. Alternate diagonal weight-bearing paw pairs with bending joints, shoulders and hips rise and fall, tail balances. No takeoff, sliding, bipedal pose or rearing.',
  'cast':'Grounded breathing-attack with LARGE SYNCHRONIZED WING FLAPS: both wings unfold widely, sweep DOWN together showing darker membrane undersides, fold edge-on and recover to reference height. Keep all four paws planted. Chest expands, neck extends and jaws open, briefly hold then close. Tail and its existing flame sway. No takeoff or rearing. Only physical creature motion, no outward fire, projectile, orb, beam, ring, sparks or new spell effects.'},
 'phoenix':{
  'idle':'A smooth in-place flying wingbeat loop. BOTH feathered wings sweep DOWN together and recover UP together in the same phase. Feathers twist to show undersides on the downstroke, fold edge-on on recovery, then return to the supplied pose. Body gently bobs with delayed flowing tail feathers. No alternating seesaw wings, rolling, flipping or loops.',
  'move':'Steady forward flight IN PLACE facing right. Both wings beat down TOGETHER and recover up TOGETHER in the same phase, with natural feather folding and delayed flowing tail sway. Gentle body rise and fall; do not translate across the canvas. No seesaw wings, roll, spin, flip or extra wings. Seamlessly return to the supplied pose.',
  'cast':'A physical flying casting loop. Neck extends slightly, beak opens, both feathered wings sweep down TOGETHER and recover up TOGETHER while the body remains level. Tail feathers follow with gentle lag. Recover to the supplied pose. No snow, glow, rings, beams, projectiles, trails or exterior spell effects.'}}
COMMON=' Preserve the exact supplied creature, life stage, face, horns or crest, colours, anatomy and fine scales or feather edges. Sharp detailed sprite, no chunky enlarged pixels or blur. Fixed right-facing camera, same size and position, complete silhouette with clear canvas padding throughout. Transparent background, no floor, shadow, rider, saddle, text or new objects. No grey blobs, beige patches or opaque scraps in gaps between wings, horns and back. Seamless loop.'

def clean(im):
 a=np.array(im.convert('RGBA'));a[a[:,:,3]<=8]=0
 labels,n=b.ndimage.label(a[:,:,3]>8,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0
 if n:
  main=int(sizes.argmax())
  for k in range(1,n+1):
   if k!=main and sizes[k]<=32:a[labels==k]=0
 return Image.fromarray(a)

def prepare(dragon):
 (OUT/'sources').mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(parents=True,exist_ok=True)
 if (OUT/'sources.json').exists():
  assert sha(OUT/'sources/dragon-evolution.png')==sha(Path(dragon))
  print('Reuse preserved six prepared references',flush=True);return
 old=json.loads((ROOT/'web/assets/pets/pets.json').read_text(encoding='utf-8'));atlas=Image.open(ROOT/'web/assets/pets/pets.png').convert('RGBA');records={}
 for family,source in [('dragon',Path(dragon)),('phoenix',ROOT/'art/pets/approved-v1/sources/phoenix-evolution.png')]:
  dest=OUT/'sources'/f'{family}-evolution.png'
  if dest.exists():assert sha(dest)==sha(source),'Never overwrite a different supplied source'
  else:shutil.copy2(source,dest)
  im=Image.open(dest).convert('RGBA');a=np.array(im);xs=np.where((a[:,:,3]>32).sum(axis=0)>2)[0];spans=[]
  for x in xs:
   if spans and x-spans[-1][1]<30:spans[-1][1]=int(x)
   else:spans.append([int(x),int(x)])
  assert len(spans)==3,(family,spans)
  for stage,(left,right) in enumerate(spans,1):
   pid=f'{family}-{stage}';folder=OUT/pid;folder.mkdir(exist_ok=True)
   crop=clean(im.crop((left,0,right+1,im.height)));box=crop.getbbox();crop=crop.crop(box);crop.save(folder/'source-crop.png')
   extent=192 if family=='dragon' else 176;k=extent/max(crop.size);size=tuple(round(v*k) for v in crop.size)
   ref=Image.new('RGBA',(256,256));offset=((256-size[0])//2,232-size[1]);ref.paste(crop.resize(size,Image.Resampling.LANCZOS),offset);ref=clean(ref);ref.save(folder/'reference-256.png')
   x,y,w,h=old['frames'][pid]['side'];oldbase=atlas.crop((x,y,x+w,y+h));bb=oldbase.getbbox();body=max(bb[2]-bb[0],bb[3]-bb[1]);bounds=ref.getbbox();height=bounds[3]-bounds[1]
   my={'dragon':[.48,.35,.38],'phoenix':[.35,.32,.32]}[family][stage-1];mouth=[bounds[2]-3,round(bounds[1]+height*my)]
   record={'source':f'sources/{family}-evolution.png','source_sha256':sha(dest),'source_box':[left+box[0],box[1],left+box[2],box[3]],'source_crop_sha256':sha(folder/'source-crop.png'),'reference_sha256':sha(folder/'reference-256.png'),'native_resolution':256,'reference_body':size,'anchor':[128,232],'render_scale':body/max(bounds[2]-bounds[0],height),'previous_body_extent':body,'mouth':mouth,'no_low_resolution_intermediate':True}
   dump(folder/'reference.json',record);records[pid]=record
 dump(OUT/'sources.json',records)
 board=Image.new('RGBA',(1024,840),'#202632');d=ImageDraw.Draw(board)
 for n,pid in enumerate(IDS):
  x=n%3*336;y=n//3*410;ref=Image.open(OUT/pid/'reference-256.png');board.alpha_composite(ref,(x+40,y+24));d.text((x+8,y+4),pid+' native 256',fill='#ffe36a')
  ox,oy,w,h=old['frames'][pid]['side'];oldbase=atlas.crop((ox,oy,ox+w,oy+h));oldbase=oldbase.crop(oldbase.getbbox());oldbase.thumbnail((96,96),Image.Resampling.NEAREST);board.alpha_composite(oldbase,(x+20,y+304));d.text((x+130,y+318),'old runtime crop',fill='white')
 board.save(EVIDENCE/'references-and-old.png');print('Prepared six references directly from full-resolution sheets',flush=True)

def replace_phoenix_source(source):
 source=Path(source);canonical=OUT/'sources/phoenix-evolution.png';records=json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
 if sha(canonical)==sha(source) and records['phoenix-3']['source_sha256']==sha(source):print('Reuse updated adult phoenix reference',flush=True);return
 previous=OUT/'sources/phoenix-evolution-before-adult-replacement.png';shutil.copy2(canonical,previous);assert sha(previous)==records['phoenix-1']['source_sha256']
 archive=EVIDENCE/'source-replacement/phoenix-3';archive.mkdir(parents=True,exist_ok=True)
 for name in ['reference-256.png','reference.json','source-crop.png']:shutil.copy2(OUT/'phoenix-3'/name,archive/name)
 for pid in ['phoenix-1','phoenix-2']:
  records[pid]['source']='sources/'+previous.name;dump(OUT/pid/'reference.json',records[pid])
 shutil.copy2(source,canonical)
 # Keep the historical 128px action provenance while replacing the canonical sheet.
 legacy=ROOT/'art/pets/approved-v1';historical=legacy/'sources/phoenix-evolution-before-20261109.png';legacy_meta=json.loads((legacy/'sources.json').read_text(encoding='utf-8'))
 if not historical.exists():shutil.copy2(legacy/'sources/phoenix-evolution.png',historical)
 assert sha(historical)==legacy_meta['families']['phoenix']['source_sha256'];legacy_meta['families']['phoenix']['source']='sources/'+historical.name;dump(legacy/'sources.json',legacy_meta);shutil.copy2(source,legacy/'sources/phoenix-evolution.png')
 im=Image.open(canonical).convert('RGBA');a=np.array(im);xs=np.where((a[:,:,3]>32).sum(axis=0)>2)[0];spans=[]
 for x in xs:
  if spans and x-spans[-1][1]<30:spans[-1][1]=int(x)
  else:spans.append([int(x),int(x)])
 assert len(spans)==3,spans
 left,right=spans[2];crop=clean(im.crop((left,0,right+1,im.height)));box=crop.getbbox();crop=crop.crop(box);folder=OUT/'phoenix-3';crop.save(folder/'source-crop.png');k=176/max(crop.size);size=tuple(round(v*k) for v in crop.size);ref=Image.new('RGBA',(256,256));offset=((256-size[0])//2,232-size[1]);ref.paste(crop.resize(size,Image.Resampling.LANCZOS),offset);ref=clean(ref);ref.save(folder/'reference-256.png');bounds=ref.getbbox();height=bounds[3]-bounds[1];previous_extent=records['phoenix-3']['previous_body_extent']
 records['phoenix-3'].update(source='sources/phoenix-evolution.png',source_sha256=sha(canonical),source_box=[left+box[0],box[1],left+box[2],box[3]],source_crop_sha256=sha(folder/'source-crop.png'),reference_sha256=sha(folder/'reference-256.png'),reference_body=size,render_scale=previous_extent/max(bounds[2]-bounds[0],height),mouth=[bounds[2]-3,round(bounds[1]+height*.32)],user_replaced_adult_wing_reference=True)
 dump(folder/'reference.json',records['phoenix-3']);dump(OUT/'sources.json',records);dump(folder/'selected.json',{clip:2 for clip in CLIPS});print('Replaced canonical phoenix sheet; only adult follower reference regenerated',flush=True)

def generate(pid,clip,revision):
 folder=OUT/pid;stem=f'{clip}-r{revision}';target=folder/(stem+'.png');state=folder/(stem+'-job.json');ref=folder/'reference-256.png'
 if target.exists():print('Reuse',pid,stem,flush=True);return
 request={'description':PROMPTS[pid.split('-')[0]][clip]+COMMON,'frame_count':12,'no_background':True,'direction':'east','view':'side','enhance_prompt':False,'seed':9110900+IDS.index(pid)*100+CLIPS.index(clip)*10+revision*10000}
 if pid.startswith('dragon') and clip=='move' and revision>=3:
  request['description']='Four-legged WALK IN PLACE with large synchronized wing flaps, facing right. Alternate diagonal weight-bearing paws, bend elbows and knees, shoulders and hips rise and fall, tail balances. Both wings unfold, sweep down TOGETHER, fold edge-on and recover. WING COLOUR IS LOCKED: inner AND outer membranes stay RED/CRIMSON like the supplied reference in EVERY frame. Dark red underside, red lit surfaces. NEVER yellow, orange, beige, cream or gold wing membranes, even during a twist. Gold stays only on original horns, belly, claws and tail flame. Preserve exact creature design, face, life stage, sharp scale detail and size. Fixed camera, no takeoff, rearing or sliding. Transparent background; no floor, shadow, grey blobs, new effects or rider. Full silhouette inside the canvas. Seamlessly return to the supplied pose.'
 if pid.startswith('dragon') and clip=='move' and revision>=4:
  request.update(description='Four-legged walking loop IN PLACE, facing right. Alternating diagonal weight-bearing paws step with bending joints; shoulders and hips rise and fall, tail follows. Both bat wings lift, unfold, sweep down together, fold edge-on and recover. BOTH SURFACES OF BOTH WINGS ARE CRIMSON RED MEMBRANES, with deep RED shadows and rose RED highlights, exactly matching the supplied reference. This single RED membrane palette stays identical through lift, downstroke, turning and recovery in EVERY frame. Preserve the exact supplied face, horns, belly, tail flame, anatomy, life stage, sharp detail and size. All empty gaps between horns, head, back and wings remain completely transparent. Only the physical creature moves, four-legged and grounded. Entire silhouette fits the canvas with padding. Fixed camera, seamless return to the supplied pose.',drift_threshold=0)
 assert len(request['description'])<=1000
 call=b.api()
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'));assert record['reference_sha256']==sha(ref)
 else:
  enc={'type':'base64','base64':base64.b64encode(ref.read_bytes()).decode()};result=call('POST','/animate-pixminimax',{**request,'first_frame':enc,'last_frame':enc});record={'provider':'PixelLab','endpoint':'/animate-pixminimax','job':result['background_job_id'],'reference_sha256':sha(ref),'request':request};dump(state,record);print('Submitted',pid,stem,record['job'],flush=True)
 for _ in range(240):
  result=call('GET','/background-jobs/'+record['job'])
  if result.get('status')=='completed':break
  if result.get('status')=='failed':raise RuntimeError('Failed '+pid+'/'+stem)
  time.sleep(5)
 else:raise TimeoutError('Resume existing job '+record['job'])
 response=result.get('last_response') or result;frames=[]
 for item in response['images']:
  raw=item.get('base64') if isinstance(item,dict) else item;frames.append(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA'))
 assert len(frames)==13 and all(f.size==(256,256) for f in frames)
 sheet=Image.new('RGBA',(3328,256));rawsheet=Image.new('RGBA',sheet.size);reference=Image.open(ref).convert('RGBA')
 for i,f in enumerate(frames):rawsheet.paste(f,(i*256,0));sheet.paste(reference if i in [0,12] else clean(f),(i*256,0))
 rawpath=folder/(stem+'-raw.png');rawsheet.save(rawpath);sheet.save(target);record.update(frames=13,native_resolution=256,raw_sha256=sha(rawpath),sha256=sha(target),usage=response.get('usage'),alpha_cleanup='alpha<=8 and detached components<=32, never RGB colour key; exact supplied endpoints');dump(state,record);print('Ready',pid,stem,flush=True);review(pid,clip,revision)

def review(pid,clip,revision):
 sheet=Image.open(OUT/pid/f'{clip}-r{revision}.png').convert('RGBA');board=Image.new('RGBA',(1024,832),'#202632');d=ImageDraw.Draw(board);anim=[]
 for i in range(12):
  f=sheet.crop((i*256,0,(i+1)*256,256));x=i%4*256;y=i//4*276;board.alpha_composite(f,(x,y+18));d.text((x+4,y+2),pid+' '+clip+' '+str(i),fill='white');frame=Image.new('RGBA',(280,280),'#202632');frame.alpha_composite(f,(12,12));anim.append(frame.convert('RGB'))
 board.save(EVIDENCE/f'{pid}-{clip}-r{revision}-review.png');anim[0].save(EVIDENCE/f'{pid}-{clip}-r{revision}-preview.png',save_all=True,append_images=anim[1:],duration=111 if clip!='move' or pid.startswith('phoenix') else 95,loop=0,disposal=0,blend=0)

def cleanup_reviewed_fragments():
 # Only these two inspected detached orange arcs are external effects, not body.
 folder=OUT/'dragon-1';path=folder/'cast-r2.png';record_path=folder/'cast-r2-job.json';record=json.loads(record_path.read_text(encoding='utf-8'));raw=Image.open(folder/'cast-r2-raw.png').convert('RGBA');ref=Image.open(folder/'reference-256.png').convert('RGBA');sheet=Image.new('RGBA',raw.size);removed=[]
 for i in range(13):
  f=ref if i in [0,12] else clean(raw.crop((i*256,0,(i+1)*256,256)));a=np.array(f)
  if i in [1,2]:
   labels,n=b.ndimage.label(a[:,:,3]>8,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0
   for k in range(1,n+1):
    if k!=sizes.argmax() and 32<sizes[k]<=128:
     yy,xx=np.where(labels==k);removed.append({'frame':i,'count':len(xx),'pixels':[[int(x),int(y)] for x,y in zip(xx,yy)]});a[labels==k]=0
  sheet.paste(Image.fromarray(a),(i*256,0))
 sheet.save(path);record.update(sha256=sha(path),reviewed_detached_effect_cleanup=removed);dump(record_path,record);review('dragon-1','cast',2)
 selected=OUT/'dragon-1/selected.json';sel=json.loads(selected.read_text(encoding='utf-8'));sel['idle']=3;dump(selected,sel)
 dump(OUT/'user-confirmed.json',{'phoenix-1/idle':{'revision':1,'sha256':sha(OUT/'phoenix-1/idle-r1.png'),'user_confirmed':True}})
 print('Removed reviewed external arcs',sum(x['count'] for x in removed),'pixels; selected young dragon idle r3',flush=True)

def mouth_frame(im,point):
 a=np.array(im);x,y=point;mask=a[:,:,3]>128;roi=np.zeros((256,256),bool);roi[max(0,y-18):min(256,y+19),max(0,x-24):min(256,x+18)]=True;yy,xx=np.where(mask&roi)
 if not len(xx):return point
 right=int(xx.max());ys=yy[xx>=right-1];return[right-2,int(np.median(ys))]

def pack(revision):
 legacy=json.loads((ROOT/'web/assets/pets/pets.json').read_text(encoding='utf-8'));old=Image.open(ROOT/'web/assets/pets/pets.png').convert('RGBA');meta={'cw':128,'ch':128,'k':1,'fps':8,'frames':{},'clips':{},'actors':{},'world_fx_included':False,'native_followers':256};tiles=[];seen={};flags=[]
 for key,lock in json.loads((OUT/'user-confirmed.json').read_text(encoding='utf-8')).items():
  pid,clip=key.split('/');assert sha(OUT/pid/f'{clip}-r{lock["revision"]}.png')==lock['sha256'],'User-confirmed source changed'
 def add(frame):
  key=hashlib.sha256(frame.tobytes()).hexdigest()
  if key not in seen:seen[key]=len(tiles);tiles.append(frame)
  i=seen[key];return[i%16*256,i//16*256]
 for pid in IDS:
  folder=OUT/pid;ref=json.loads((folder/'reference.json').read_text(encoding='utf-8'));base=Image.open(folder/'reference-256.png').convert('RGBA');family,stage=pid.split('-');coords=add(base);actor={**legacy['actors'][pid],**{k:ref[k] for k in ['anchor','render_scale','mouth']},'cw':256,'ch':256,'native_resolution':256,'cast_mouth':ref['mouth'],'mouth_frames':{},'idle_fps':6,'clip_samples':12};meta['frames'][pid]={'side':coords+[256,256]};meta['clips'][pid]={}
  for clip in CLIPS:
   selected=json.loads((folder/'selected.json').read_text(encoding='utf-8')) if (folder/'selected.json').exists() else {};rev=selected.get(clip,revision);stem=f'{clip}-r{rev}';record=json.loads((folder/(stem+'-job.json')).read_text(encoding='utf-8'));path=folder/(stem+'.png');assert sha(path)==record['sha256'] and ref['reference_sha256']==record['reference_sha256'];sheet=Image.open(path).convert('RGBA');positions=[];mouth=[]
   for i in range(13):
    f=sheet.crop((i*256,0,(i+1)*256,256));box=f.getbbox()
    if not box or min(box[:2])<1 or box[2]>255 or box[3]>255:flags.append(f'{pid}/{clip}/{i}: clipped')
    a=np.array(f);rgb=a[:,:,:3].astype(int);neutral=(a[:,:,3]>128)&(rgb.max(axis=2)-rgb.min(axis=2)<12)&(rgb.mean(axis=2)>70)&(rgb.mean(axis=2)<190)
    if family=='dragon' and neutral.sum()>50:flags.append(f'{pid}/{clip}/{i}: inspect neutral blob ({neutral.sum()} pixels)')
    positions.append(add(f));mouth.append(mouth_frame(f,ref['mouth']))
   meta['clips'][pid][clip+'_e']=positions;actor['mouth_frames'][clip+'_e']=mouth
  meta['actors'][pid]=actor
 highrows=math.ceil(len(tiles)/16);low=[]
 for pid in ['fox-1','fox-2','fox-3']:
  meta['actors'][pid]=legacy['actors'][pid];meta['clips'][pid]={};x,y,w,h=legacy['frames'][pid]['side'];i=len(low);low.append(old.crop((x,y,x+w,y+h)));meta['frames'][pid]={'side':[i%32*128,highrows*256+i//32*128,128,128]}
  for clip,coords in legacy['clips'][pid].items():
   positions=[]
   for x,y in coords:i=len(low);low.append(old.crop((x,y,x+128,y+128)));positions.append([i%32*128,highrows*256+i//32*128])
   meta['clips'][pid][clip]=positions
 height=highrows*256+math.ceil(len(low)/32)*128;assert height<=4096,(len(tiles),len(low),height)
 assert not flags,flags
 atlas=Image.new('RGBA',(4096,height))
 for i,f in enumerate(tiles):atlas.paste(f,(i%16*256,i//16*256))
 for i,f in enumerate(low):atlas.paste(f,(i%32*128,highrows*256+i//32*128))
 atlas.save(OUT/'pets.png',optimize=True);meta['sha256']=sha(OUT/'pets.png');dump(OUT/'pets.json',meta)
 for name in ['pets.png','pets.json']:shutil.copy2(OUT/name,ROOT/'web/assets/pets'/name)
 for pid in IDS:
  ref=Image.open(OUT/pid/'reference-256.png');crop=ref.crop(ref.getbbox());k=84/max(crop.size);size=tuple(round(v*k) for v in crop.size);portrait=Image.new('RGBA',(96,96));portrait.paste(crop.resize(size,Image.Resampling.LANCZOS),((96-size[0])//2,(96-size[1])//2));portrait.save(ROOT/'web/assets/pets'/f'{pid}.png')
 dump(OUT/'pack-check.json',{'native_resolution':256,'followers':6,'clips':18,'unique_native_tiles':len(tiles),'unchanged_fox_tiles':len(low),'atlas':atlas.size,'flags':flags,'no_frame_resampling':True});print('Packed',atlas.size,'native tiles',len(tiles),'fox tiles',len(low),flush=True)
 previews()

def previews():
 for clip in CLIPS:
  frames=[]
  for i in range(12):
   board=Image.new('RGBA',(768,560),'#202632');d=ImageDraw.Draw(board)
   for n,pid in enumerate(IDS):
    selected=json.loads((OUT/pid/'selected.json').read_text(encoding='utf-8'));im=Image.open(OUT/pid/f'{clip}-r{selected[clip]}.png').convert('RGBA');board.alpha_composite(im.crop((i*256,0,(i+1)*256,256)),(n%3*256,n//3*280+20));d.text((n%3*256+6,n//3*280+3),pid+' '+clip,fill='#ffe36a')
   frames.append(board.convert('RGB'))
  frames[0].save(OUT/f'{clip}-preview.png',save_all=True,append_images=frames[1:],duration=111,loop=0,disposal=0,blend=0)

def archive_unselected():
 target=EVIDENCE/'unselected';target.mkdir(exist_ok=True);manifest=target/'relocation.json';records=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else []
 for pid in IDS:
  selected=json.loads((OUT/pid/'selected.json').read_text(encoding='utf-8'))
  for source in (OUT/pid).iterdir():
   match=re.fullmatch(r'(idle|move|cast)-r(\d+)(-raw\.png|-job\.json|\.png)',source.name)
   if not match or int(match[2])==selected[match[1]]:continue
   dest=target/pid/source.name;assert source.resolve().is_relative_to(OUT.resolve()) and dest.resolve().is_relative_to(ROOT.parent.resolve())
   dest.parent.mkdir(exist_ok=True);before=sha(source)
   if dest.exists():assert sha(dest)==before
   else:shutil.copy2(source,dest)
   assert sha(dest)==before;source.unlink();records.append({'source':str(source.relative_to(ROOT)),'saved':str(dest.relative_to(ROOT.parent)),'sha256':before})
 dump(manifest,records);print('Archived unselected files',len(records),'with verified hashes',flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','replace-phoenix','generate','collect','review','cleanup','pack','archive']);p.add_argument('--dragon');p.add_argument('--phoenix');p.add_argument('--only',nargs='+',default=IDS);p.add_argument('--clips',nargs='+',default=CLIPS);p.add_argument('--revision',type=int,default=1);p.add_argument('--workers',type=int,default=3);a=p.parse_args()
 if a.mode=='prepare':prepare(a.dragon)
 elif a.mode=='replace-phoenix':replace_phoenix_source(a.phoenix)
 elif a.mode=='pack':pack(a.revision)
 elif a.mode=='cleanup':cleanup_reviewed_fragments()
 elif a.mode=='archive':archive_unselected()
 else:
  fn=generate if a.mode in ['generate','collect'] else review
  items=[(pid,clip,a.revision) for pid in a.only for clip in a.clips if a.mode!='collect' or (OUT/pid/f'{clip}-r{a.revision}-job.json').exists()]
  with ThreadPoolExecutor(max_workers=a.workers) as pool:list(pool.map(lambda args:fn(*args),items))
