"""Animate user-approved complete rider+mount references without rebuilding their occlusion."""
import argparse,base64,hashlib,io,json,os,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests,numpy as np
from scipy import ndimage
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/pets/riding-approved'
IDS=['deepseek','grok','claude','gpt','doubao','glm']
MOUTHS={'deepseek':[140,81],'grok':[140,79],'claude':[140,81],'gpt':[140,81],'doubao':[140,79],'glm':[140,81]}
ACTIONS={
 'idle':'This exact rider and fox remain together in a living idle LOOP facing right. The fox gently breathes through the chest and belly, shifts weight naturally through bent leg joints, blinks, and its existing tails sway with soft delayed waves. The rider stays seated astride, gently balances and breathes, hair softly follows, hands retain the reins or book exactly. Preserve the exact character, clothes, tail count, anatomy, proportions and NEAR/FAR LEG OCCLUSION. The far leg stays behind the fox body. No dismounting or floating feet. Entire pair remains in place. Empty space stays empty. No symbols, sparks, rings or effects. Return to the same pose.',
 'move':'This exact fox and rider perform a smooth four-legged WALK cycle IN PLACE facing right. All four fox legs step naturally in diagonal pairs with weight-bearing paws, shoulders and hips rise and fall a little, tails follow the movement. The rider remains seated astride, hips stay attached to the back, knees gently absorb each step, hair follows naturally. Preserve exact rider identity, costume, book/reins, fox shape and tail count. Keep the far rider leg HIDDEN BEHIND the animal, near leg visible in front. No standing up, sliding or drifting. Empty space stays empty. No effects. Seamless return to the original pose.',
 'cast':'This exact fox and rider perform a restrained physical casting gesture, facing right. The fox plants all four paws, lowers its chest a little, extends its head and lifts its existing tails in a natural wave, then recovers. The rider leans slightly forward while STAYING SEATED, keeps the same grip on reins/book and balances naturally. Preserve exact anatomy, face, costume, tail count, size and position. The far rider leg stays hidden behind the animal, near leg in front. ONLY physical body movement. Empty space stays empty. Absolutely no magic, glow, bolts, sparks, circles or effects. Return to the starting pose.'
}
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def clean(im):
 a=np.array(im.convert('RGBA'));a[a[:,:,3]<=8]=0;return Image.fromarray(a)
def cut_native_background(im):
 a=np.array(im.convert('RGBA'));white=(a[:,:,:3].min(axis=2)>=248)&(a[:,:,3]>8)
 edge=np.zeros(white.shape,bool);edge[0]=white[0];edge[-1]=white[-1];edge[:,0]=white[:,0];edge[:,-1]=white[:,-1]
 edge|=ndimage.binary_dilation(a[:,:,3]<=8,structure=np.ones((3,3)))&white
 background=ndimage.binary_propagation(edge,structure=np.ones((3,3)),mask=white);a[background]=0
 labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));areas=np.bincount(labels.ravel());areas[0]=0
 if n:a[labels!=int(areas.argmax())]=0
 return Image.fromarray(a)
def client():
 key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip();headers={'Authorization':'Bearer '+key}
 def call(method,route,body=None):
  for attempt in range(8 if method=='GET' else 1):
   try:
    r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers=headers,json=body,timeout=180)
    if method=='GET' and r.status_code in [429,500,502,503,504] and attempt<7:time.sleep(min(20,2**attempt));continue
    break
   except requests.RequestException:
    if method!='GET' or attempt==7:raise
    time.sleep(min(20,2**attempt))
  if not r.ok:raise RuntimeError(f'PixelLab HTTP {r.status_code}: {r.text[:250]}')
  return r.json()
 return call
def prepare(species,cid):
 folder=OUT/species/cid;folder.mkdir(parents=True,exist_ok=True);ref=folder/'reference-256.png'
 if ref.exists():return
 source=OUT/species/(cid+'-source.png');native=folder/'native.png';call=client()
 if not native.exists():
  response=call('POST','/unzoom',{'image':{'type':'base64','base64':base64.b64encode(source.read_bytes()).decode()},'quantize':-1})
  raw=response['image']['base64'];clean(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1])))).save(native)
  dump(folder/'unzoom.json',{k:v for k,v in response.items() if k!='image'})
 im=cut_native_background(Image.open(native));im.save(folder/'native-transparent.png');crop=im.crop(im.getbbox());factor=196/max(crop.size);w,h=[round(v*factor) for v in crop.size]
 image=Image.new('RGBA',(256,256));image.paste(crop.resize((w,h),Image.Resampling.NEAREST),((256-w)//2,232-h));image.save(ref)
 dump(folder/'reference.json',{'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'reference_sha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'canvas':[256,256],'foot':[128,232],'body':[w,h],'pixel_palette_preserved':True})
 print('prepared full mount',species,cid,flush=True)
def animate(species,cid,clip):
 folder=OUT/species/cid;target=folder/(clip+'.png');state=folder/(clip+'-job.json')
 if target.exists():print('reuse full mount',species,cid,clip,flush=True);return
 call=client()
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  ref={'type':'base64','base64':base64.b64encode((folder/'reference-256.png').read_bytes()).decode()}
  body={'first_frame':ref,'last_frame':ref,'action':ACTIONS[clip],'frame_count':8,'no_background':True,'seed':7110790+IDS.index(cid)+['idle','move','cast'].index(clip)*100}
  response=call('POST','/animate-with-text-v3',body);record={'provider':'PixelLab','endpoint':'/animate-with-text-v3','job':response['background_job_id'],'source':'../'+cid+'-source.png','request':{k:v for k,v in body.items() if k not in ['first_frame','last_frame']}};dump(state,record);print('submitted full mount',species,cid,clip,record['job'],flush=True)
 for _ in range(240):
  job=call('GET','/background-jobs/'+record['job'])
  if job.get('status')=='completed':break
  if job.get('status')=='failed':raise RuntimeError(f'{species}/{cid}/{clip} failed')
  time.sleep(5)
 else:raise TimeoutError('Resume '+record['job'])
 response=job.get('last_response') or job;frames=[]
 for item in response['images']:
  raw=item.get('base64') if isinstance(item,dict) else item;frames.append(clean(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1])))))
 assert len(frames)==9 and all(f.size==(256,256) for f in frames)
 rawsheet=Image.new('RGBA',(256*9,256));sheet=Image.new('RGBA',(160*9,160));base=Image.open(folder/'reference-256.png').resize((160,160),Image.Resampling.NEAREST)
 for i,f in enumerate(frames):
  rawsheet.paste(f,(i*256,0));sheet.paste(base if i in [0,8] else f.resize((160,160),Image.Resampling.NEAREST),(i*160,0))
 rawsheet.save(folder/(clip+'-256.png'));sheet.save(target);base.save(folder/'base.png');record.update(frames=9,usage=response.get('usage'),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),runtime=[160,160]);dump(state,record);print('ready full mount',species,cid,clip,flush=True)
def pack(species):
 atlas=Image.new('RGBA',(160*9,160*6*3));meta={'species':species,'ride_stage':3,'cw':160,'ch':160,'anchor':[80,145],'scale':.78,'actors':{}}
 for row,cid in enumerate(IDS):
  base=Image.open(OUT/species/cid/'base.png');box=base.getbbox();actor={'top':box[1],'mouth':MOUTHS[cid]}
  for n,clip in enumerate(['idle','move','cast']):
   y=(row*3+n)*160;atlas.paste(Image.open(OUT/species/cid/(clip+'.png')),(0,y));actor[clip+'_e']=[[i*160,y] for i in range(9)]
  meta['actors'][cid]=actor
 atlas.save(OUT/species/'mounted.png');meta['sha256']=hashlib.sha256((OUT/species/'mounted.png').read_bytes()).hexdigest();dump(OUT/species/'mounted.json',meta)
 print('packed approved full mount',species,flush=True)
def publish(species):
 check=json.loads((OUT/species/'asset-check.json').read_text(encoding='utf-8'));assert check['passed'],'Review must pass before publishing runtime assets'
 dest=ROOT/'web/assets/pets';dest.joinpath(species+'-mounted.png').write_bytes((OUT/species/'mounted.png').read_bytes());dest.joinpath(species+'-mounted.json').write_bytes((OUT/species/'mounted.json').read_bytes());print('published reviewed full mount',species,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','animate','pack','publish']);p.add_argument('--species',default='fox');p.add_argument('--only',nargs='+',default=IDS);p.add_argument('--clip',choices=['idle','move','cast','all'],default='all');a=p.parse_args()
 if a.mode=='prepare':
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda c:prepare(a.species,c),a.only))
 elif a.mode=='pack':pack(a.species)
 elif a.mode=='publish':publish(a.species)
 else:
  jobs=[(c,k) for k in (['idle','move','cast'] if a.clip=='all' else [a.clip]) for c in a.only]
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda ck:animate(a.species,*ck),jobs))
