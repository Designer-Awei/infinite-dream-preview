"""Correct approved creatures' stance before animating; preserve original identity."""
import argparse,base64,hashlib,io,json,os,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests,numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/pets/approved-v1'
PROMPTS={
 'dragon':'Edit ONLY the pose of this exact red and gold dragon. It is now a natural QUADRUPED standing on ALL FOUR FEET: both front arms reach down with straight weight-bearing forelegs and both front clawed paws firmly resting on the same ground plane as the hind paws. Lower the chest and shoulder line into an athletic four-legged dragon stance. NOT a dinosaur, NOT bipedal, NOT sitting upright or begging with lifted hands. Keep its exact face, gold horns, red scale armor, pale gold belly, red bat-wing membranes and flaming tail identity. Two large wings half raised together behind the shoulders with ample room to flap. Entire animal visible. Same right-facing three-quarter view and detailed pixel art. Transparent background, no ground, shadow, saddle, rider, effects or extra limbs.',
 'phoenix':'Edit ONLY the wing pose of this exact white and icy-blue phoenix. BOTH wings are at the SAME phase of a bird wingbeat, simultaneously raised HIGH in a clear upright V above the shoulders, both wing tips ABOVE its head and body. The near wing and far wing have matching shoulder/elbow angles and equal upstroke timing. Do NOT put one wing up and the other wing down. Keep the body level and facing right, exact head, beak, cyan/white feather colors, crest, long flowing tail and the same life stage. Two complete visible feathered wings attached at the shoulders, physically plausible anatomy, no loop-shaped wings. Transparent background, no snow, rings, energy, trails, background, saddle or rider. Entire bird including both raised wings fits inside the canvas with padding.'
}
def clean(im):
 a=np.array(im.convert('RGBA'));a[a[:,:,3]<=8]=0;return Image.fromarray(a)
def run(pid,attempt):
 folder=OUT/pid;target=folder/'pose-192.png';state=folder/'pose-job.json'
 if target.exists():return
 family,stage=pid.split('-');meta=json.loads((OUT/'sources.json').read_text(encoding='utf-8'));recordStage=meta['families'][family]['stages'][int(stage)-1]
 key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip();headers={'Authorization':'Bearer '+key}
 def call(method,route,body=None):
  r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers=headers,json=body,timeout=180)
  if not r.ok:raise RuntimeError(f'{pid} PixelLab HTTP {r.status_code}')
  return r.json()
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  im=clean(Image.open(folder/'source-crop.png'));im=im.crop(im.getbbox());w,h=[round(v*144/max(im.size)) for v in im.size];ref=Image.new('RGBA',(192,192));ref.paste(im.resize((w,h),Image.Resampling.NEAREST),((192-w)//2,176-h));ref.save(folder/'pose-input-192.png')
  encoded={'type':'base64','base64':base64.b64encode((folder/'pose-input-192.png').read_bytes()).decode()}
  body={'method':'edit_with_text','edit_images':[{'image':encoded,'width':192,'height':192}],'image_size':{'width':192,'height':192},'description':PROMPTS[family],'seed':7110700+int(stage)+attempt*100,'no_background':True}
  response=call('POST','/edit-images-v2',body);record={'provider':'PixelLab','endpoint':'/v2/edit-images-v2','job':response['background_job_id'],'reference':'pose-input-192.png','request':{k:v for k,v in body.items() if k!='edit_images'}};state.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');print('pose submitted',pid,record['job'],flush=True)
 for _ in range(240):
  job=call('GET','/background-jobs/'+record['job'])
  if job.get('status')=='completed':break
  if job.get('status')=='failed':raise RuntimeError(pid+' pose failed')
  time.sleep(5)
 else:raise TimeoutError('Resume '+pid)
 result=job.get('last_response') or job;raw=(result.get('images') or [result.get('image')])[0];raw=raw['base64'] if isinstance(raw,dict) else raw
 im=clean(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))));assert im.size==(192,192);im.save(target)
 record.update(sha256=hashlib.sha256(target.read_bytes()).hexdigest(),usage=result.get('usage'));state.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');print('pose ready',pid,flush=True)
def apply():
 meta=json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
 for family,group in meta['families'].items():
  for s in group['stages']:
   folder=OUT/s['id'];pose=folder/'pose-192.png'
   if not pose.exists():continue
   im=clean(Image.open(pose));im=im.crop(im.getbbox());extent=max(s.get('original_body_size',s['body_size']));s.setdefault('original_body_size',s['body_size'])
   w,h=[round(v*extent/max(im.size)) for v in im.size];ref=Image.new('RGBA',(192,192));x=(192-w)//2;y=176-h;ref.paste(im.resize((w,h),Image.Resampling.NEAREST),(x,y));ref.save(folder/'reference-192.png')
   base=Image.new('RGBA',(128,128));base.paste(ref.resize((96,96),Image.Resampling.NEAREST),(16,28 if s['id']=='dragon-3' else 8));base.save(folder/'base.png')
   s.update(body_size=[w,h],pose='pose-192.png',mouth=[round((x+w*.91)/2,1),round((y+h*(.52 if family=='dragon' else .56))/2,1)])
 (OUT/'sources.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8');print('Applied corrected pose references',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['generate','apply']);p.add_argument('--only',nargs='+',default=['dragon-3','phoenix-1','phoenix-2','phoenix-3']);p.add_argument('--attempt',type=int,default=1);a=p.parse_args()
 if a.mode=='apply':apply()
 else:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda pid:run(pid,a.attempt),a.only))
