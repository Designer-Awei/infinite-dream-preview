"""Generate a transparent mine entry icon through the project's PixelLab account."""
import base64,hashlib,io,json,os,time
from pathlib import Path
import requests
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/ui';OUT.mkdir(parents=True,exist_ok=True)
state=OUT/'mine-pick-job.json'
key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip()
headers={'Authorization':'Bearer '+key}
def call(method,route,body=None):
    r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers=headers,json=body,timeout=180)
    if not r.ok:raise RuntimeError(f'PixelLab HTTP {r.status_code}')
    return r.json()
if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
else:
    body={'description':'A single finely crafted mining PICKAXE item icon, native 64x64 pixel art for a polished fantasy roguelike mobile game. One elegant gently curved double-ended steel pick head, icy silver-blue steel bevels with crisp white edge highlights and deep navy underside, small brass fastening ring with one visible rivet, warm reddish oak handle with subtle grain, dark leather grip wrap and a small brass pommel. Diagonal handle from lower-left to upper-right, pick head across the upper half. Compact balanced readable silhouette, dark selective 1-pixel outline, deliberate clusters, four-tone materials, light from upper-left. Entire tool visible with 5px transparent padding. No background, no rocks, no gems, no flames, no sparkle particles, no frame, no letters. Only one beautifully rendered pickaxe.', 'image_size':{'width':64,'height':64},'seed':6110715,'no_background':True}
    result=call('POST','/generate-image-v2',body);record={'provider':'PixelLab','endpoint':'/v2/generate-image-v2','job':result['background_job_id'],'request':body};state.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');print('submitted mine icon',record['job'],flush=True)
for _ in range(180):
    job=call('GET','/background-jobs/'+record['job'])
    if job.get('status')=='completed':break
    if job.get('status')=='failed':raise RuntimeError('Mine icon job failed')
    time.sleep(5)
else:raise TimeoutError('Resume saved mine icon job')
result=job.get('last_response') or job
raw=(result.get('images') or [result.get('image')])[0];raw=raw['base64'] if isinstance(raw,dict) else raw
im=Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA');assert im.size==(64,64) and im.getchannel('A').getextrema()[0]==0
dest=ROOT/'web/assets/ui/mine-pick.png';dest.parent.mkdir(parents=True,exist_ok=True);im.save(dest)
record.update(usage=result.get('usage'),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),size=list(im.size));state.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');print('Mine icon ready',flush=True)
