"""Check all native follower pages and approved fox rider generation sources."""
from pathlib import Path
import hashlib,io,json,subprocess
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];F=ROOT/'art/pets/followers-hd-v1';M=ROOT/'art/pets/fox-mounted-hd-v1';G='C:/Program Files/Git/cmd/git.exe';BASE='7cfa0a0'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
blob=lambda p:subprocess.check_output([G,'show',BASE+':'+p],cwd=ROOT)
meta=json.loads((ROOT/'web/assets/pets/pets.json').read_text(encoding='utf-8'));pages=[Image.open(ROOT/'web/assets/pets'/p['file']).convert('RGBA') for p in meta['pages']];oldmeta=json.loads(blob('web/assets/pets/pets.json'));old=Image.open(io.BytesIO(blob('web/assets/pets/pets.png'))).convert('RGBA');samples=0;unchanged=0
assert len(pages)==2 and all(max(p.size)<=4096 for p in pages)
for info in meta['pages']:assert sha(ROOT/'web/assets/pets'/info['file'])==info['sha256']
for pid,actor in meta['actors'].items():
 ref=json.loads((F/pid/'reference.json').read_text(encoding='utf-8'));source=Image.open(F/pid/'reference-256.png').convert('RGBA');selected=json.loads((F/pid/'selected.json').read_text(encoding='utf-8'));atlas=pages[actor['page']]
 assert sha(F/ref['source'])==ref['source_sha256'] and sha(F/pid/'reference-256.png')==ref['reference_sha256'] and actor['cw']==actor['ch']==256
 box=source.getbbox();assert abs(max(box[2]-box[0],box[3]-box[1])*actor['render_scale']-ref['previous_body_extent'])<.001
 for clip,rev in selected.items():
  path=F/pid/f'{clip}-r{rev}.png';job=json.loads((F/pid/f'{clip}-r{rev}-job.json').read_text(encoding='utf-8'));sheet=Image.open(path).convert('RGBA');assert sha(path)==job['sha256'] and sha(F/pid/f'{clip}-r{rev}-raw.png')==job['raw_sha256'] and sheet.size==(3328,256)
  for i,(x,y) in enumerate(meta['clips'][pid][clip+'_e']):
   frame=sheet.crop((i*256,0,(i+1)*256,256));assert atlas.crop((x,y,x+256,y+256)).tobytes()==frame.tobytes();bb=frame.getbbox();assert bb and min(bb[:2])>0 and bb[2]<256 and bb[3]<256
   if i in [0,12]:assert frame.tobytes()==source.tobytes()
   if not pid.startswith('fox'):
    ox,oy=oldmeta['clips'][pid][clip+'_e'][i];assert frame.tobytes()==old.crop((ox,oy,ox+256,oy+256)).tobytes();unchanged+=1
   samples+=1
mount=json.loads((ROOT/'web/assets/pets/fox-mounted.json').read_text(encoding='utf-8'));atlas=Image.open(ROOT/'web/assets/pets/fox-mounted.png').convert('RGBA');rider_samples=0
assert mount['cw']==mount['ch']==256 and max(atlas.size)<=4096 and mount['scale']==.78/1.6
for cid,actor in mount['actors'].items():
 ref=json.loads((M/cid/'reference.json').read_text(encoding='utf-8'));source=Image.open(M/cid/'reference-256.png').convert('RGBA');assert sha(M/cid/'source.png')==ref['source_sha256'] and sha(M/cid/'reference-256.png')==ref['reference_sha256'] and ref['no_low_resolution_intermediate'];selected=json.loads((M/cid/'selected.json').read_text(encoding='utf-8'))
 for clip,rev in selected.items():
  path=M/cid/f'{clip}-r{rev}.png';job=json.loads((M/cid/f'{clip}-r{rev}-job.json').read_text(encoding='utf-8'));assert sha(path)==job['sha256'] and sha(M/cid/f'{clip}-r{rev}-raw.png')==job['raw_sha256'];sheet=Image.open(path).convert('RGBA')
  for i,(x,y) in enumerate(actor[clip+'_e']):
   frame=sheet.crop((i*256,0,(i+1)*256,256));assert atlas.crop((x,y,x+256,y+256)).tobytes()==frame.tobytes();bb=frame.getbbox();assert bb and min(bb[:2])>0 and bb[2]<256 and bb[3]<256
   if i in [0,12]:assert frame.tobytes()==source.tobytes()
   rider_samples+=1
for kind in ['dragon','phoenix']:
 for ext in ['png','json']:
  path=f'web/assets/pets/{kind}-mounted.{ext}';current=(ROOT/path).read_bytes();before=blob(path);assert (current==before if ext=='png' else json.loads(current)==json.loads(before))
print(json.dumps({'followers':9,'followerClips':27,'nativeFollowerSamples':samples,'priorDragonPhoenixSamplesUnchanged':unchanged,'followerPages':[im.size for im in pages],'foxRiders':6,'nativeFoxRiderSamples':rider_samples,'foxRiderAtlas':atlas.size,'dragonPhoenixRidersUnchanged':True}))
