"""Regenerate only the adolescent dragon from its user-selected middle-stage reference.

PIXELLAB_KEY_FILE points at an ignored local credential. Jobs and previews remain in art/work.
"""
import argparse, base64, hashlib, io, json, os, shutil, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from animate_riding_v2 import api
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'art/work/dragon-growth-20261109'
SOURCE = ROOT/'art/references/pets/dragon-growth-user-20261109.png'
CLIPS = ['idle', 'move', 'cast']
PROMPTS = {
 'idle': 'Gentle living idle loop in place: adolescent red dragon breathes, blinks, and shifts its weight. Elbows and knees softly bend, shoulders and hips settle, tail sways. Small wings remain mostly folded so the four legs are easy to read.',
 'move': 'Natural HORSE/DOG DIAGONAL TROT, never a camel pace. NEAR legs are the bright outer foreleg in front of cream belly and outer hindleg on big thigh. Phase A: near FORELEG reaches FORWARD RIGHT while near HINDLEG stretches BACKWARD LEFT. Phase B: near FORELEG reaches BACKWARD LEFT while near HINDLEG swings FORWARD RIGHT. These TWO visible legs must always swing in OPPOSITE directions. The DARKER legs behind them move in opposite phase. Thus near front + far hind advance together; then far front + near hind. Flex knees and lift paws. No same-side pace or paired front hops. Quiet wings, in-place loop.',
 'cast': 'Stationary grounded fire-breath casting loop, matching the other dragon stages. All FOUR PAWS remain PLANTED in their exact original spots for the ENTIRE animation. NO walking, stepping, foot lifting, jumping, pawing or leg swing. Legs only brace with tiny joint flex. Animate the head, neck and chest: inhale, extend neck, OPEN jaws wide, hold a powerful breathing pose, close and recover. Both wings gently unfold and flap TOGETHER, tail sways. Only animate the creature: no external flame, orb, beam, particles or magical effects.',

}
COMMON = ' Preserve the exact supplied youthful dragon, face, horns, colours, anatomy and fine stylized shading. Fixed right-facing side camera, constant size and canvas position. Full silhouette with padding, transparent background. No realistic skin, floor, shadow, aura, rider, text or new objects. Seamlessly return to source pose.'

def dump(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def clean(im):
 a=np.array(im.convert('RGBA')); a[a[:,:,3]<=8]=0
 labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0
 if n:
  main=sizes.argmax()
  for k in range(1,n+1):
   if k!=main and sizes[k]<=32:a[labels==k]=0
 return Image.fromarray(a)
def prepare(source):
 OUT.mkdir(parents=True,exist_ok=True)
 if SOURCE.exists(): assert sha(SOURCE)==sha(source)
 else: shutil.copy2(source,SOURCE)
 original=clean(Image.open(SOURCE));pixels=np.array(original);xs=np.where((pixels[:,:,3]>32).sum(axis=0)>2)[0];spans=[]
 for x in xs:
  if spans and x-spans[-1][1]<30:spans[-1][1]=int(x)
  else:spans.append([int(x),int(x)])
 assert len(spans)==3,spans
 left,right=spans[1];part=original.crop((left,0,right+1,original.height));box=part.getbbox();bb=(left+box[0],box[1],left+box[2],box[3]);crop=original.crop(bb)
 size=tuple(round(v*192/max(crop.size)) for v in crop.size)
 ref=Image.new('RGBA',(256,256));ref.paste(crop.resize(size,Image.Resampling.LANCZOS),((256-size[0])//2,232-size[1]));ref=clean(ref);ref.save(OUT/'reference-256.png')
 bounds=ref.getbbox();dump(OUT/'reference.json',{'source':str(SOURCE.relative_to(ROOT)),'source_sha256':sha(SOURCE),'source_box':list(bb),'native_resolution':256,'reference_sha256':sha(OUT/'reference-256.png'),'reference_body':list(size),'anchor':[128,232],'render_scale':49/max(size),'mouth':[bounds[2]-4,round(bounds[1]+(bounds[3]-bounds[1])*.4)],'no_low_resolution_intermediate':True})
def generate(clip,revision):
 stem=f'{clip}-r{revision}';state=OUT/(stem+'-job.json');target=OUT/(stem+'.png');ref=OUT/'reference-256.png'
 if target.exists():print('Reuse',stem,flush=True);return
 call=api();request={'description':PROMPTS[clip]+COMMON,'frame_count':12,'no_background':True,'direction':'east','view':'side','enhance_prompt':False,'seed':9111900+CLIPS.index(clip)*100+revision}
 assert len(request['description'])<=1000
 if state.exists():record=json.loads(state.read_text());assert record['reference_sha256']==sha(ref)
 else:
  enc={'type':'base64','base64':base64.b64encode(ref.read_bytes()).decode()}
  result=call('POST','/animate-pixminimax',{**request,'first_frame':enc,'last_frame':enc})
  record={'provider':'PixelLab','endpoint':'/animate-pixminimax','job':result['background_job_id'],'reference_sha256':sha(ref),'request':request};dump(state,record);print('Submitted',stem,record['job'],flush=True)
 for _ in range(240):
  result=call('GET','/background-jobs/'+record['job'])
  if result.get('status')=='completed':break
  if result.get('status')=='failed':raise RuntimeError('PixelLab failed: '+stem)
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=result.get('last_response') or result
 frames=[Image.open(io.BytesIO(base64.b64decode((f['base64'] if isinstance(f,dict) else f).split(',')[-1]))).convert('RGBA') for f in response['images']]
 assert len(frames)==13 and all(f.size==(256,256) for f in frames)
 raw=Image.new('RGBA',(3328,256));sheet=Image.new('RGBA',raw.size);reference=Image.open(ref).convert('RGBA')
 for i,f in enumerate(frames):raw.paste(f,(i*256,0));sheet.paste(reference if i in [0,12] else clean(f),(i*256,0))
 raw.save(OUT/(stem+'-raw.png'));sheet.save(target);record.update(sha256=sha(target),raw_sha256=sha(OUT/(stem+'-raw.png')),frames=13,native_resolution=256,usage=response.get('usage'));dump(state,record)
 board=Image.new('RGBA',(1024,840),'#202632');d=ImageDraw.Draw(board)
 for i in range(12):board.alpha_composite(sheet.crop((i*256,0,(i+1)*256,256)),(i%4*256,i//4*280+20));d.text((i%4*256+5,i//4*280+2),clip+' '+str(i),fill='white')
 board.save(OUT/(stem+'-review.png'));print('Completed',stem,flush=True)
def publish(revision,idle_revision=None,cast_revision=None):
 """Replace the existing 34 adolescent-only cells; all other actors remain byte-identical."""
 meta_path=ROOT/'web/assets/pets/pets.json';meta=json.loads(meta_path.read_text());pid='dragon-2'
 atlas_path=ROOT/'web/assets/pets/pets.png';atlas=Image.open(atlas_path).convert('RGBA')
 old=atlas.copy();coords={tuple(x) for c in meta['clips'][pid].values() for x in c}
 others={tuple(x) for k,clips in meta['clips'].items() if k!=pid and meta['actors'][k].get('page',0)==0 for c in clips.values() for x in c}
 assert not coords&others and len(coords)==34
 ref=json.loads((OUT/'reference.json').read_text());reference=Image.open(OUT/'reference-256.png').convert('RGBA')
 writes={};foot_centres=[];library_path=ROOT/'docs/references/pet-animation-recipes.json';library=json.loads(library_path.read_text())
 actor=meta['actors'][pid];actor.update({k:ref[k] for k in ['anchor','mouth','render_scale','native_resolution']});actor['cast_mouth']=ref['mouth'];actor.update(cast_release_frame=4,cast_hold_frames=[4,7],cast_timeline={'windup':.24,'hold':[4,7],'recovery':.3})
 for clip in CLIPS:
  selected=idle_revision if clip=='idle' and idle_revision is not None else cast_revision if clip=='cast' and cast_revision is not None else revision
  stem=f'{clip}-r{selected}';record=json.loads((OUT/(stem+'-job.json')).read_text());strip=Image.open(OUT/(stem+'.png')).convert('RGBA');positions=meta['clips'][pid][clip+'_e'];hashes=[];mouths=[]
  for i,(x,y) in enumerate(positions):
   frame=strip.crop((i*256,0,(i+1)*256,256));bb=frame.getbbox();assert bb and min(bb[:2])>=1 and max(bb[2:])<=255,(clip,i,bb)
   raw=frame.tobytes()
   if clip=='cast' and 'PLANTED' in record['request'].get('description',''):
    a=np.array(frame).astype(int);red,green,blue,alpha=[a[:,:,j] for j in range(4)]
    toes=(alpha>128)&(red>160)&(green>110)&(blue>65)&(red>green)&(green>blue);toes[:216]=False
    xs=np.where(toes.sum(axis=0)>1)[0];groups=[]
    for px in xs:
     if groups and px-groups[-1][-1]<5:groups[-1].append(int(px))
     else:groups.append([int(px)])
    assert len(groups)==4,('Four planted paws must remain visible',i,groups)
    foot_centres.append([(g[0]+g[-1])/2 for g in groups])
   if (x,y) in writes:assert writes[(x,y)]==raw
   writes[(x,y)]=raw;atlas.paste(frame,(x,y));hashes.append(hashlib.sha256(raw).hexdigest())
   # Track the muzzle in a local head window; never attach flame to a wing or tail.
   a=np.array(frame);mx,my=ref['mouth'];roi=a[max(0,my-18):min(256,my+19),max(0,mx-24):min(256,mx+18),3]>128
   yy,xx=np.where(roi)
   if len(xx):
    right=int(xx.max());mouths.append([max(0,mx-24)+right-2,max(0,my-18)+int(np.median(yy[xx>=right-1]))])
   else:mouths.append(ref['mouth'])
  actor['mouth_frames'][clip+'_e']=mouths
  recipe=next(x for x in library['recipes'] if x['id']==f'follow/{pid}/{clip}')
  prompt=record['request']['description'];prompt_id='prompt-'+hashlib.sha256(prompt.encode()).hexdigest()[:16];library['prompts'][prompt_id]=prompt
  recipe.update(prompt_id=prompt_id,provider='PixelLab',endpoint='/animate-pixminimax',request={k:v for k,v in record['request'].items() if k!='description'},selected_job=str((OUT/(stem+'-job.json')).relative_to(ROOT)),selected_job_sha256=sha(OUT/(stem+'-job.json')),reference_png_sha256=sha(OUT/'reference-256.png'),originals=[str(SOURCE.relative_to(ROOT))],preparation=ref,cleanup={'alpha_cleanup':'alpha<=8 and detached components<=32; never RGB key; exact source endpoints'},runtime={'atlas':'web/assets/pets/pets.png','cw':256,'ch':256,'coordinates':positions,'frame_rgba_sha256':hashes})
 if foot_centres:
  drift=float(np.max(np.abs(np.array(foot_centres)-np.array(foot_centres[0]))));assert drift<=2,('Planted paw drift',drift)
 else:drift=None
 if idle_revision is not None:
  for x,y in meta['clips'][pid]['idle_e']:assert old.crop((x,y,x+256,y+256)).tobytes()==atlas.crop((x,y,x+256,y+256)).tobytes()
 for x,y in others:assert old.crop((x,y,x+256,y+256)).tobytes()==atlas.crop((x,y,x+256,y+256)).tobytes()
 atlas.save(atlas_path,optimize=True);digest=sha(atlas_path);meta['sha256']=digest;meta['pages'][0]['sha256']=digest;dump(meta_path,meta)
 library['atlases']['web/assets/pets/pets.png'].update(sha256=digest,size=list(atlas.size));dump(library_path,library)
 crop=reference.crop(reference.getbbox());size=tuple(round(v*84/max(crop.size)) for v in crop.size);portrait=Image.new('RGBA',(96,96));portrait.paste(crop.resize(size,Image.Resampling.LANCZOS),((96-size[0])//2,(96-size[1])//2));portrait.save(ROOT/'web/assets/pets/dragon-2.png')
 catalog_path=ROOT/'art/references/catalog.json';catalog=json.loads(catalog_path.read_text());source_name=str(SOURCE.relative_to(ROOT));existing=next((x for x in catalog['files'] if x['file']==source_name),None)
 if existing:assert existing['sha256']==sha(SOURCE)
 else:catalog['files'].append({'file':source_name,'sha256':sha(SOURCE),'bytes':SOURCE.stat().st_size,'size':list(Image.open(SOURCE).size),'roles':['User-selected middle-stage dragon reference supplied 2026-11-09'],'original_locations':[]})
 dump(catalog_path,catalog)
 dump(OUT/'publish-check.json',{'replacement_cells':len(writes),'changed_cells':sum(old.crop((x,y,x+256,y+256)).tobytes()!=atlas.crop((x,y,x+256,y+256)).tobytes() for x,y in coords),'planted_paw_max_horizontal_drift':drift,'idle_preserved':idle_revision is not None,'other_actor_cells_preserved':len(others),'native_resolution':256,'clip_count':3,'reference_source':source_name,'atlas_sha256':digest})
 print('Published adolescent dragon only:',len(writes),'cells; other actor cells preserved:',len(others),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path);p.add_argument('--publish',action='store_true');p.add_argument('--clip',choices=CLIPS);p.add_argument('--revision',type=int,default=1);p.add_argument('--idle-revision',type=int);p.add_argument('--cast-revision',type=int);p.add_argument('--clips',nargs='+',choices=CLIPS);a=p.parse_args()
 if a.publish:publish(a.revision,a.idle_revision,a.cast_revision)
 elif a.source:prepare(a.source)
 elif a.clip:generate(a.clip,a.revision)
 elif not a.source:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda clip:generate(clip,a.revision),a.clips or CLIPS))
