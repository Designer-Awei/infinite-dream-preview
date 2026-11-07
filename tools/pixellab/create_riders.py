"""Generate complete seated character poses from original girl sprites, then animate them."""
import argparse,base64,hashlib,io,json,os,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests,numpy as np
from scipy import ndimage
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/pets/riders-v1'
IDS=['deepseek','gpt','grok','claude','doubao','glm']
FAR_LEG={
 'deepseek':[(64,65),(73,65),(77,84),(63,84),(63,73)],
 'gpt':[(61,65),(68,65),(72,84),(61,84),(60,74)],
 'grok':[(62,65),(68,65),(72,85),(61,85),(61,73)],
 'claude':[(61,67),(69,67),(72,84),(60,84),(60,74)],
 'doubao':[(53,65),(60,65),(65,83),(53,83)],
 'glm':[(60,64),(68,64),(73,84),(60,84)],
}
POSE='Change ONLY the POSE of this exact character into a complete FULL-BODY seated RIDER, facing RIGHT in a three-quarter side view. She sits ASTRIDE an invisible wide saddle, torso leaning slightly forward, hips seated, BOTH THIGHS present and bent forward, knees bent about 90 degrees, lower legs hanging downward with BOTH FEET and shoes visible. Near leg wraps down the near side; far leg is partly visible on the far side. Arms reach forward naturally to hold imaginary reins. Keep EXACT face, hair, outfit, accessories, chibi proportions, colors and pixel style. Show the ENTIRE character from head to shoes. Never cut the body at the waist. No standing legs. No animal, saddle, chair, reins, background, floor or effects: only the full seated person on transparency. This is a rider sprite that will be layered on an animated animal.'

def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def clean(im):
 a=np.array(im.convert('RGBA'));a[a[:,:,3]<=8]=0;return Image.fromarray(a)
def run(cid,mode):
 folder=OUT/cid;folder.mkdir(parents=True,exist_ok=True)
 target=folder/('pose-192.png' if mode=='pose' else 'idle.png');state=folder/(mode+'-job.json')
 if target.exists():print('reuse rider',cid,mode,flush=True);return
 key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip();headers={'Authorization':'Bearer '+key}
 def call(method,route,body=None):
  for attempt in range(8 if method=='GET' else 1):
   try:r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers=headers,json=body,timeout=180);break
   except requests.RequestException:
    if method!='GET' or attempt==7:raise
    time.sleep(min(15,2**attempt))
  if not r.ok:raise RuntimeError(f'{cid}/{mode} HTTP {r.status_code}: {r.text[:300]}')
  return r.json()
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  if mode=='pose':
   gj=json.loads((ROOT/'web/assets/girls.json').read_text(encoding='utf-8'));x,y,w,h=gj['frames'][cid]['side']
   source=clean(Image.open(ROOT/'web/assets/girls.png').crop((x,y,x+w,y+h)));source.save(folder/'source.png')
   crop=source.crop(source.getbbox());factor=144/max(crop.size);size=tuple(round(v*factor) for v in crop.size)
   image=Image.new('RGBA',(192,192));image.paste(crop.resize(size,Image.Resampling.NEAREST),((192-size[0])//2,176-size[1]));image.save(folder/'pose-input-192.png')
   encoded={'type':'base64','base64':base64.b64encode((folder/'pose-input-192.png').read_bytes()).decode()}
   body={'method':'edit_with_text','edit_images':[{'image':encoded,'width':192,'height':192}],'image_size':{'width':192,'height':192},'description':POSE,'no_background':True,'seed':7110720+IDS.index(cid)}
   endpoint='/edit-images-v2';request={k:v for k,v in body.items() if k!='edit_images'}
  else:
   pose=clean(Image.open(folder/'pose-192.png'));crop=pose.crop(pose.getbbox());factor=56/crop.height;w,h=[round(v*factor) for v in crop.size]
   base=Image.new('RGBA',(96,96));base.paste(crop.resize((w,h),Image.Resampling.NEAREST),(48-w//2,64-round(h*.68)));base.save(folder/'base.png')
   base.resize((192,192),Image.Resampling.NEAREST).save(folder/'idle-input-192.png');encoded={'type':'base64','base64':base64.b64encode((folder/'idle-input-192.png').read_bytes()).decode()}
   body={'first_frame':encoded,'last_frame':encoded,'action':'The same FULL-BODY seated rider makes a gentle living idle LOOP. Remain SEATED ASTRIDE, hips fixed in position, knees bent and both shoes visible below. Subtle breathing, natural small hair sway, blink, hands stay forward holding imaginary reins. Tiny seated balance movement, never stand up or swing legs out. Preserve exact face, hair, outfit, proportions and size. Empty space stays empty. No animal, seat, props or effects. Return to the exact starting seated pose.','frame_count':8,'no_background':True,'seed':7110740+IDS.index(cid)}
   endpoint='/animate-with-text-v3';request={k:v for k,v in body.items() if k not in ['first_frame','last_frame']}
  response=call('POST',endpoint,body);record={'provider':'PixelLab','endpoint':endpoint,'job':response['background_job_id'],'request':request};dump(state,record);print('submitted rider',mode,cid,record['job'],flush=True)
 for _ in range(240):
  job=call('GET','/background-jobs/'+record['job'])
  if job.get('status')=='completed':break
  if job.get('status')=='failed':raise RuntimeError(cid+' failed')
  time.sleep(5)
 else:raise TimeoutError('Resume '+cid)
 result=job.get('last_response') or job;images=result.get('images') or [result.get('image')];frames=[]
 for item in images:
  raw=item.get('base64') if isinstance(item,dict) else item;frames.append(clean(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1])))))
 if mode=='pose':frames[0].save(target)
 else:
  assert len(frames)==9;sheet=Image.new('RGBA',(96*9,96));rawsheet=Image.new('RGBA',(192*9,192));base=Image.open(folder/'base.png')
  for i,frame in enumerate(frames):
   rawsheet.paste(frame,(i*192,0));small=frame.resize((96,96),Image.Resampling.NEAREST);sheet.paste(base if i in [0,8] else small,(i*96,0))
  sheet.save(target);rawsheet.save(folder/'idle-192.png')
 record.update(sha256=hashlib.sha256(target.read_bytes()).hexdigest(),usage=result.get('usage'));dump(state,record);print('ready rider',mode,cid,flush=True)

def pack():
 atlas=Image.new('RGBA',(96*9,96*6));front=atlas.copy();back=atlas.copy();meta={'cw':96,'ch':96,'anchor':[48,64],'far_offset':[-4,-3],'fps':5,'actors':{}}
 for row,cid in enumerate(IDS):
  sheet=Image.open(OUT/cid/'idle.png');base=Image.open(OUT/cid/'base.png');atlas.paste(sheet,(0,row*96));meta['actors'][cid]={'idle_e':[[i*96,row*96] for i in range(9)],'top':base.getbbox()[1],'far_leg_polygon':FAR_LEG[cid],'source_sha256':hashlib.sha256((OUT/cid/'source.png').read_bytes()).hexdigest()}
  mask=Image.new('L',(96,96));ImageDraw.Draw(mask).polygon(FAR_LEG[cid],fill=255);inside=np.array(mask)>0
  for i in range(9):
   a=np.array(sheet.crop((i*96,0,(i+1)*96,96)));f=a.copy();f[inside]=0;b=np.zeros_like(a);b[inside]=a[inside]
   front.paste(Image.fromarray(f),(i*96,row*96));back.paste(Image.fromarray(b),(i*96,row*96))
 for name,im in [('riders',atlas),('riders-front',front),('riders-back',back)]:
  im.save(OUT/(name+'.png'));meta[name+'_sha256']=hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest()
 meta['sha256']=meta['riders_sha256'];dump(OUT/'riders.json',meta)
 dest=ROOT/'web/assets/pets'
 for name in ['riders-front.png','riders-back.png','riders.json']:dest.joinpath(name).write_bytes((OUT/name).read_bytes())
 print('packed six complete riders',flush=True)

def clean_strays():
 for cid in ['claude','glm']:
  path=OUT/cid/'idle.png';sheet=Image.open(path).convert('RGBA');removed=[]
  for i in range(1,8):
   a=np.array(sheet.crop((i*96,0,(i+1)*96,96)));labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));areas=np.bincount(labels.ravel());areas[0]=0;main=int(areas.argmax());parts=ndimage.find_objects(labels);top=parts[main-1][0].start
   for j,sl in enumerate(parts,1):
    if j!=main and sl[0].stop<=top-2:
     removed.append({'frame':i,'pixels':int((labels==j).sum()),'box':[sl[1].start,sl[0].start,sl[1].stop,sl[0].stop]});a[labels==j]=0
   sheet.paste(Image.fromarray(a),(i*96,0))
  if removed:
   record_path=OUT/cid/'idle-job.json';record=json.loads(record_path.read_text(encoding='utf-8'));record['stray_cleanup']={'input_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'removed':removed,'provider_raw_unchanged':True};sheet.save(path);record['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();dump(record_path,record);print('cleaned rider overhead fragments',cid,len(removed),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['pose','idle','clean','pack']);p.add_argument('--only',nargs='+',default=IDS);a=p.parse_args()
 if a.mode=='pack':pack()
 elif a.mode=='clean':clean_strays()
 else:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda cid:run(cid,a.mode),a.only))
