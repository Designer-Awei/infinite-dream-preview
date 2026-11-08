"""New approved dragon/phoenix whole-rider animation; never key out white pixels."""
import argparse,base64,hashlib,io,json,os,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np,requests
from scipy import ndimage
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/pets/riding-approved'
IDS=['deepseek','grok','claude','gpt','doubao','glm']
NAMES=['大肥鱼','格洛克','克劳德','吉普缇','奶糖包','吉拉姆']
CLIPS=['idle','move','cast']
INPUTS={
 'dragon':'D:/xwechat_files/wxid_oqz97frs2yw122_5f6d/temp/RWTemp/2026-11/de6cf23feafbc6cf7e088b746fec5f04/bc4481b90a00c5f417fd5889a2024c61.png',
 'phoenix':'D:/xwechat_files/wxid_oqz97frs2yw122_5f6d/temp/RWTemp/2026-11/de6cf23feafbc6cf7e088b746fec5f04/1fe5b8720181634a9f98a6a55261b9c4.png'}
COMMON='Exact approved rider and mount, same costume, colours, face and proportions, facing right, fixed camera. Preserve eyes with coloured iris and white highlight; no black empty eyes. Rider remains seated and hands retain reins or book. Far rider leg stays hidden; near wing stays in FRONT of lower rider hair/body consistently, below the face. Never move a wing across the face. No extra limbs, symbols, background, speed lines, exterior magic or particles. Return seamlessly to reference pose.'
ACTIONS={
 'dragon':{
 'idle':'Grounded breathing idle, NOT FLYING. Keep the wing root and upper wing ridge FIXED in their exact supplied position below the rider face. Only the lower wing tips may relax a tiny distance downward. Animate gentle chest/belly breathing, a natural tail sway and soft existing tail-flame flicker. All four feet stay planted. Rider breathes and hair sways slightly. NEVER lift or flap the wings upward. ',
 'move':'WINGS STAY STILL in their exact reference position: this dragon WALKS ON THE GROUND, never flies or lifts its wings. Animate a slow FOUR-LEGGED WALK in place, alternating diagonal weight-bearing steps with bending knees. Chest and hips breathe, tail sways. Rider remains firmly seated with face always visible. No rearing, no airborne forelegs, no raised wings. ',
 'cast':"ONLY THE DRAGON OPENS ITS REPTILIAN MOUTH: the dragon leans its long neck forward and lowers its red lower jaw to reveal teeth, then closes its jaw and recovers. The GIRL keeps her exact neutral face, closed lips and open coloured eyes throughout. Her mouth NEVER opens. All four dragon feet remain planted, wings stay low and fixed, tail sways, chest breathes. Absolutely NO fire, glow, projectile or outside effects. "},
 'phoenix':{
 'idle':'Hover idle in place: BOTH wings flap DOWN TOGETHER gently, then return to the supplied pose as their HIGHEST point. No upward overshoot; never seesaw one wing up while other down. Chest breathes, feathers and tail softly lag behind, rider balances subtly. Keep the face visible throughout. ',
 'move':'Steady flying loop in place: BOTH wings flap DOWN TOGETHER then return to the reference highest pose, restrained downward arc only. Shoulder joints lead, flight feathers bend naturally with delay. Slight chest/hip breathing and tail feather wave. Rider stays seated and balances, hair follows. No leg-walking, no upward wing swing across rider. ',
 'cast':'Flight casting loop in place: BOTH wings beat DOWN TOGETHER in a small controlled arc, return only to reference height. Phoenix extends neck, opens beak slightly with a tiny icy glow INSIDE beak, then recovers. Chest breathes, tail feathers undulate, rider remains seated. No blizzard, rings, external ice, sparks or beams. '}}

def dump(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def preview_font(size):
 from fontTools.ttLib import TTFont
 target=ROOT.parent/'.cache/Cubic-game-preview.ttf'
 if not target.exists():
  font=TTFont(ROOT/'web/assets/font/Cubic_11.woff');font.flavor=None;font.save(target)
 return ImageFont.truetype(str(target),size)
def alpha_clean(im):
 a=np.array(im.convert('RGBA'));a[a[:,:,3]<=8]=0
 labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0
 if n:
  primary=int(sizes.argmax())
  for k in range(1,n+1):
   mask=labels==k
   if k!=primary and sizes[k]<=32:a[mask]=0
 return Image.fromarray(a)

def source_subjects(im,require_margin=True):
 # The reference is a layout, not a spritesheet: tails/heads cross the 512px
 # guide lines. Label the FULL image first, then assign complete silhouettes.
 a=np.array(im.convert('RGBA'));labels,n=ndimage.label(a[:,:,3]>32,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0
 components=[int(i) for i in np.argsort(sizes)[-6:]]
 assert all(sizes[i]>50000 for i in components),'Six complete subjects required'
 subjects={}
 for component in components:
  main=labels==component;yy,xx=np.where(main);col=min(2,int(xx.mean()//512));row=min(1,int(yy.mean()//512));cid=IDS[row*3+col]
  assert cid not in subjects,'Overlapping subject assignment'
  keep=ndimage.binary_dilation(main,iterations=1)&(a[:,:,3]>8)
  isolated=a.copy();isolated[~keep]=0;full=Image.fromarray(isolated);bounds=full.getbbox()
  assert bounds,'Empty source'
  if require_margin:assert min(bounds[:2])>0 and bounds[2]<im.width and bounds[3]<im.height,'Input subject touches outer image boundary'
  subjects[cid]=(full.crop(bounds),bounds,int(sizes[component]))
 assert set(subjects)==set(IDS)
 return subjects

def prepare(species):
 folder=OUT/species;folder.mkdir(parents=True,exist_ok=True)
 original=Path(INPUTS[species]);dest=folder/'source-six.png'
 if dest.exists() and sha(dest)!=sha(original):raise RuntimeError('Existing input differs; preserve it before replacing')
 dest.write_bytes(original.read_bytes());im=Image.open(dest).convert('RGBA');assert im.size==(1536,1024)
 chars=[];subjects=source_subjects(im)
 for n,cid in enumerate(IDS):
  box=(n%3*512,n//3*512,n%3*512+512,n//3*512+512)
  im.crop(box).save(folder/(cid+'-cell-raw.png'))
  figure,bounds,solid=subjects[cid];source=folder/(cid+'-source.png');figure.save(source)
  figure.save(folder/(cid+'-source-clean.png'))
  k=212/max(figure.size);size=tuple(round(v*k) for v in figure.size);offset=((256-size[0])//2,232-size[1])
  ref=Image.new('RGBA',(256,256));ref.paste(figure.resize(size,Image.Resampling.NEAREST),offset)
  target=folder/cid;target.mkdir(exist_ok=True)
  if (target/'reference-256.png').exists() and (target/'reference-256.png').read_bytes()!=ref_bytes(ref):
   previous=target/'reference-before-contour-fix.png'
   if not previous.exists():previous.write_bytes((target/'reference-256.png').read_bytes())
  ref.save(target/'reference-256.png');ref.save(target/'base.png')
  dump(target/'reference.json',{'source_sha256':sha(source),'clean_source_sha256':sha(folder/(cid+'-source-clean.png')),'reference_sha256':sha(target/'reference-256.png'),'canvas':[256,256],'foot':[128,232],'source_bbox':bounds,'size':size,'offset':offset,'scale':k,'alpha_cleanup':'largest connected rider+mount alpha>32, retain its own one-pixel alpha edge; no white colour key','original_white_clothing_and_feathers_preserved':True,'no_128px_intermediate':True})
  chars.append({'cid':cid,'nominal_cell':box,'source_box':bounds,'solid_pixels':solid,'sha256':sha(source),'complete_component':True})
 dump(folder/'sources.json',{'approved_by_user':'2026-11-08','species':species,'stage':3,'ride_only_at_final_stage':True,'original_input':str(original),'source_sha256':sha(dest),'size':im.size,'characters':chars})
 board=Image.new('RGBA',(768,560),'#181329');d=ImageDraw.Draw(board);font=preview_font(18)
 for n,cid in enumerate(IDS):board.alpha_composite(Image.open(folder/cid/'reference-256.png'),(n%3*256,n//3*280+24));d.text((n%3*256+8,n//3*280+2),NAMES[n],font=font,fill='#ffe36a')
 board.convert('RGB').save(folder/'reference-review.png');print('Prepared approved RGBA',species,flush=True)

def ref_bytes(im):
 b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()

def api():
 key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip()
 def call(method,route,body=None):
  for attempt in range(7 if method=='GET' else 1):
   try:r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers={'Authorization':'Bearer '+key},json=body,timeout=180)
   except requests.RequestException:
    if method!='GET' or attempt==6:raise
    time.sleep(min(15,2**attempt));continue
   if method=='GET' and r.status_code in [429,500,502,503,504] and attempt<6:time.sleep(min(15,2**attempt));continue
   if not r.ok:raise RuntimeError(f'PixelLab HTTP {r.status_code}: '+r.text[:220].replace(key,'[redacted]'))
   return r.json()
 return call

def animate(species,cid,clip,revision,engine='pixminimax'):
 folder=OUT/species/cid;suffix='' if revision==0 else f'-r{revision}';state=folder/(clip+suffix+'-job.json');rawpath=folder/(clip+suffix+'-256.png')
 if revision==0 and (folder/(clip+'-selected.json')).exists():
  selected=json.loads((folder/(clip+'-selected.json')).read_text(encoding='utf-8'));record=json.loads((folder/selected['job_file']).read_text(encoding='utf-8'))
  if record['reference_sha256']==sha(folder/'reference-256.png') and (folder/(clip+'.png')).exists():print('Reuse selected',species,cid,clip,flush=True);return
 if rawpath.exists():
  record=json.loads(state.read_text(encoding='utf-8'))
  if record['reference_sha256']!=sha(folder/'reference-256.png'):raise RuntimeError(f'Stale reference: {species}/{cid}/{clip}; use a new revision')
  print('Reuse',species,cid,clip,suffix,flush=True);return
 call=api();refpath=folder/'reference-256.png'
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  ref={'type':'base64','base64':base64.b64encode(refpath.read_bytes()).decode()};action=ACTIONS[species][clip]+COMMON;assert len(action)<=1000
  body={'first_frame':ref,'last_frame':ref,'description':action,'frame_count':8,'no_background':True,'direction':'east','view':'side','enhance_prompt':False,'subject_description':f'The approved {NAMES[IDS.index(cid)]} girl seated on a red four-legged fire dragon' if species=='dragon' else f'The approved {NAMES[IDS.index(cid)]} girl seated on a blue-white ice phoenix','initial_pose':'Seated rider with face visible above the near wing, facing right; supplied wing height is its highest allowed pose.','seed':8110800+IDS.index(cid)+CLIPS.index(clip)*100+(0 if species=='dragon' else 1000)+revision*10000}
  endpoint='/animate-pixminimax'
  if engine=='v3':
   body={k:v for k,v in body.items() if k in ['first_frame','last_frame','frame_count','no_background','seed']};body['action']=action;endpoint='/animate-with-text-v3'
  response=call('POST',endpoint,body);record={'provider':'PixelLab','endpoint':endpoint,'job':response['background_job_id'],'species':species,'cid':cid,'clip':clip,'revision':revision,'reference_sha256':sha(refpath),'request':{k:v for k,v in body.items() if k not in ['first_frame','last_frame']}}
  dump(state,record);print('Submitted',species,cid,clip,suffix,record['job'],flush=True)
 for _ in range(240):
  job=call('GET','/background-jobs/'+record['job'])
  if job.get('status')=='completed':break
  if job.get('status')=='failed':record['failed']=True;dump(state,record);raise RuntimeError('Provider failed '+record['job'])
  time.sleep(5)
 else:raise TimeoutError('Resume '+record['job'])
 response=job.get('last_response') or job;frames=[]
 for item in response['images']:
  raw=item.get('base64') if isinstance(item,dict) else item;frames.append(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA'))
 assert len(frames)==9 and all(f.size==(256,256) for f in frames)
 rawsheet=Image.new('RGBA',(2304,256));sheet=Image.new('RGBA',(2304,256));refim=Image.open(refpath).convert('RGBA')
 for i,f in enumerate(frames):rawsheet.paste(f,(i*256,0));sheet.paste(refim if i in [0,8] else alpha_clean(f),(i*256,0))
 rawsheet.save(rawpath,optimize=True);sheet.save(folder/(clip+'.png'),optimize=True)
 record.update(frames=9,usage=response.get('usage'),runtime=[256,256],raw_sha256=sha(rawpath),sha256=sha(folder/(clip+'.png')),endpoint_alpha='exact approved reference',alpha_cleanup='alpha<=8 and detached components<=32px only; never RGB colour key',selected=True)
 dump(state,record);dump(folder/(clip+'-selected.json'),{'revision':revision,'job_file':state.name,'raw_file':rawpath.name});print('Ready',species,cid,clip,suffix,flush=True)

def review(species):
 folder=OUT/species;report=[];font=preview_font(15)
 for clip in CLIPS:
  board=Image.new('RGBA',(9*256,6*280),'#181329');draw=ImageDraw.Draw(board)
  for row,cid in enumerate(IDS):
   path=folder/cid/(clip+'.png')
   if not path.exists():continue
   sheet=Image.open(path).convert('RGBA');frames=[np.array(sheet.crop((i*256,0,(i+1)*256,256))) for i in range(9)];areas=[int((f[:,:,3]>32).sum()) for f in frames]
   deltas=[float(np.abs(frames[i].astype(float)-frames[i+1].astype(float)).mean()) for i in range(8)]
   report.append({'cid':cid,'clip':clip,'area_ratio':max(areas)/max(1,min(areas)),'frame_deltas':deltas,'endpoint_equal':bool(np.array_equal(frames[0],frames[-1])),'boxes':[Image.fromarray(f).getbbox() for f in frames]})
   for i,f in enumerate(frames):board.alpha_composite(Image.fromarray(f),(i*256,row*280+24));draw.text((i*256+4,row*280+3),NAMES[row]+' '+clip+' '+str(i),font=font,fill='#ffe36a')
  board.convert('RGB').save(folder/(clip+'-review.png'))
 dump(folder/'motion-review.json',report);print('Review board',species,len(report),'clips',flush=True)

def curate(species,cid,clip,indices):
 # Select only inspected low-wing poses; reflect the downstroke back to the
 # approved neutral pose. No warping, recolouring or generated in-between pixels.
 assert len(indices)==9 and indices[0]==0 and indices[-1] in [0,8] and all(0<=i<9 for i in indices)
 folder=OUT/species/cid;selected=json.loads((folder/(clip+'-selected.json')).read_text(encoding='utf-8'));jobpath=folder/selected['job_file'];job=json.loads(jobpath.read_text(encoding='utf-8'));raw=Image.open(folder/selected['raw_file']).convert('RGBA');ref=Image.open(folder/'reference-256.png').convert('RGBA');sheet=Image.new('RGBA',(2304,256))
 for i,j in enumerate(indices):sheet.paste(ref if j in [0,8] else alpha_clean(raw.crop((j*256,0,(j+1)*256,256))),(i*256,0))
 sheet.save(folder/(clip+'.png'),optimize=True);job['sha256']=sha(folder/(clip+'.png'));job['alpha_cleanup']='alpha<=8 and detached components<=32px only; never RGB colour key';job['frame_curation']={'raw_indices':indices,'reason':'Alpha cleanup only; preserve original frame order and approved endpoints.' if indices[:8]==list(range(8)) else 'Select inspected poses and documented ordering; omit wing poses that obscure the rider face. Original provider strip preserved.'};dump(jobpath,job);print('Curated',species,cid,clip,indices,flush=True)

def pack(species):
 folder=OUT/species
 # Keep both dimensions below 4096 for mobile texture limits, with native
 # 256px cells and no destructive 128/160px intermediate.
 atlas=Image.new('RGBA',(3072,3584));meta={'species':species,'ride_stage':3,'cw':256,'ch':256,'anchor':[128,232],'scale':.45,'actors':{},'source_sha256':sha(folder/'source-six.png'),'native_resolution':256}
 for row,cid in enumerate(IDS):
  base=Image.open(folder/cid/'base.png');box=base.getbbox();h=box[3]-box[1]
  actor={'top':box[1],'mouth':[box[2]-(7 if species=='dragon' else 3),box[1]+round(h*(.48 if species=='dragon' else .40))],'mouth_frames':{}}
  for k,clip in enumerate(CLIPS):
   sheet=Image.open(folder/cid/(clip+'.png')).convert('RGBA');assert sheet.size==(2304,256)
   actor[clip+'_e']=[];actor['mouth_frames'][clip+'_e']=[]
   for i in range(9):
    frame=sheet.crop((i*256,0,(i+1)*256,256));index=(row*3+k)*9+i;x=index%12*256;y=index//12*256;atlas.paste(frame,(x,y));actor[clip+'_e'].append([x,y])
    alpha=np.array(frame)[:,:,3];mask=alpha>128;mask[:max(0,box[1]+int(h*.25))]=False;mask[min(256,box[1]+int(h*.61)):]=False;mask[:,:184]=False;yy,xx=np.where(mask);right=int(xx.max());tip=yy[xx>=right-2];mouth=[right-3,int(np.median(tip))+(6 if species=='dragon' else 0)];actor['mouth_frames'][clip+'_e'].append(mouth)
  meta['actors'][cid]=actor
 atlas.save(folder/'mounted.png',optimize=True);meta['sha256']=sha(folder/'mounted.png');dump(folder/'mounted.json',meta);print('Packed native256',species,flush=True)

def validate(species):
 folder=OUT/species;meta=json.loads((folder/'mounted.json').read_text(encoding='utf-8'));atlas=Image.open(folder/'mounted.png').convert('RGBA');report={'species':species,'frames':0,'flags':[],'clips':[]}
 assert meta['sha256']==sha(folder/'mounted.png') and meta['ride_stage']==3 and max(atlas.size)<=4096
 for cid in IDS:
  ref=Image.open(folder/cid/'reference-256.png').convert('RGBA')
  for clip in CLIPS:
   selected=json.loads((folder/cid/(clip+'-selected.json')).read_text(encoding='utf-8'));job=json.loads((folder/cid/selected['job_file']).read_text(encoding='utf-8'));assert job['reference_sha256']==sha(folder/cid/'reference-256.png')
   sheet=Image.open(folder/cid/(clip+'.png')).convert('RGBA');assert sha(folder/cid/(clip+'.png'))==job['sha256'];assert sha(folder/cid/selected['raw_file'])==job['raw_sha256'];raw=Image.open(folder/cid/selected['raw_file']).convert('RGBA');indices=job.get('frame_curation',{}).get('raw_indices',list(range(9)))
   frames=[];areas=[];fragments=[]
   for i,(x,y) in enumerate(meta['actors'][cid][clip+'_e']):
    f=sheet.crop((i*256,0,(i+1)*256,256));assert f.tobytes()==atlas.crop((x,y,x+256,y+256)).tobytes();j=indices[i];expected=ref if i in [0,8] or j in [0,8] else alpha_clean(raw.crop((j*256,0,(j+1)*256,256)));assert f.tobytes()==expected.tobytes(),'Only documented source frame selection and alpha cleanup allowed';a=np.array(f);frames.append(a);box=f.getbbox();areas.append(int((a[:,:,3]>32).sum()))
    if not box or min(box[:2])<3 or box[2]>253 or box[3]>253:report['flags'].append(f'{cid}/{clip}/{i}: touches canvas margin')
    labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0;largest=int(sizes.argmax());extra=max([0]+[int(sizes[j]) for j in range(1,n+1) if j!=largest]);fragments.append(extra)
    if extra>12:report['flags'].append(f'{cid}/{clip}/{i}: detached fragment {extra}px')
    report['frames']+=1
   assert np.array_equal(frames[0],frames[-1]) and np.array_equal(frames[0],np.array(ref)),'Loop must match approved alpha reference'
   delta=[float(np.abs(frames[i].astype(float)-frames[i+1].astype(float)).mean()) for i in range(8)]
   if max(delta)<.5:report['flags'].append(f'{cid}/{clip}: static')
   if max(areas)/min(areas)>1.75:report['flags'].append(f'{cid}/{clip}: body area changes excessively')
   report['clips'].append({'cid':cid,'clip':clip,'revision':selected['revision'],'areaRatio':max(areas)/min(areas),'frameDelta':delta,'detachedMax':max(fragments),'sourceEndpointsExact':True})
 report['passed']=not report['flags'];dump(folder/'asset-check.json',report);print(json.dumps({'species':species,'frames':report['frames'],'passed':report['passed'],'flags':report['flags']}),flush=True)
 if not report['passed']:raise SystemExit(1)

def preview(species):
 folder=OUT/species;frames=[];durations=[];font=preview_font(18)
 for clip,fps in [('idle',6),('move',7),('cast',6)]:
  for i in range(8):
   board=Image.new('RGBA',(768,576),'#181329');d=ImageDraw.Draw(board)
   for n,cid in enumerate(IDS):
    sheet=Image.open(folder/cid/(clip+'.png'));board.alpha_composite(sheet.crop((i*256,0,(i+1)*256,256)),(n%3*256,n//3*288+24));d.text((n%3*256+8,n//3*288+3),NAMES[n]+' '+{'idle':'待机','move':'移动','cast':'施法'}[clip],font=font,fill='#ffe36a')
   frames.append(board.convert('RGB'));durations.append(round(1000/fps))
 frames[0].save(folder/'mounted-preview.png',save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=0,blend=0)
 frames[0].save(folder/'mounted-still.png');print('Truecolour APNG',species,flush=True)

def publish(species):
 folder=OUT/species;check=json.loads((folder/'asset-check.json').read_text(encoding='utf-8'));assert check['passed'] and check['frames']==162
 for ext in ['png','json']:(ROOT/'web/assets/pets'/f'{species}-mounted.{ext}').write_bytes((folder/f'mounted.{ext}').read_bytes())
 print('Published reviewed',species,flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','animate','review','balance','pack','validate','preview','publish','curate']);p.add_argument('--species',choices=list(INPUTS),default='dragon');p.add_argument('--only',nargs='+',default=IDS);p.add_argument('--clip',choices=CLIPS+['all'],default='all');p.add_argument('--revision',type=int,default=0);p.add_argument('--workers',type=int,default=3);p.add_argument('--engine',choices=['pixminimax','v3'],default='pixminimax');p.add_argument('--indices',type=int,nargs=9);a=p.parse_args()
 if a.mode=='prepare':prepare(a.species)
 elif a.mode=='review':review(a.species)
 elif a.mode=='balance':print(json.dumps(api()('GET','/balance'),ensure_ascii=False))
 elif a.mode in ['pack','validate','preview','publish']:globals()[a.mode](a.species)
 elif a.mode=='curate':
  assert a.clip in CLIPS and a.indices
  for cid in a.only:curate(a.species,cid,a.clip,a.indices)
 else:
  tasks=[(cid,clip) for cid in a.only for clip in (CLIPS if a.clip=='all' else [a.clip])]
  with ThreadPoolExecutor(max_workers=a.workers) as pool:list(pool.map(lambda x:animate(a.species,*x,a.revision,a.engine),tasks))
