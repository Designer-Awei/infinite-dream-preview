"""Verify provider-native follower pixels, source identity and untouched mounted/fox art."""
from pathlib import Path
import hashlib,io,json,subprocess
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'art/pets/followers-hd-v1';GIT='C:/Program Files/Git/cmd/git.exe';BASE='f4a76b8'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
blob=lambda name:subprocess.check_output([GIT,'show',BASE+':'+name],cwd=ROOT)
meta=json.loads((ROOT/'web/assets/pets/pets.json').read_text(encoding='utf-8'));atlas=Image.open(ROOT/'web/assets/pets/pets.png').convert('RGBA');oldmeta=json.loads(blob('web/assets/pets/pets.json'));old=Image.open(io.BytesIO(blob('web/assets/pets/pets.png'))).convert('RGBA')
assert atlas.width<=4096 and atlas.height<=4096 and sha(ROOT/'web/assets/pets/pets.png')==meta['sha256']
sources=json.loads((OUT/'sources.json').read_text(encoding='utf-8'));samples=0;fox=0;rows=[]
legacy_sources=json.loads((ROOT/'art/pets/approved-v1/sources.json').read_text(encoding='utf-8'))
for family in legacy_sources['families'].values():assert sha(ROOT/'art/pets/approved-v1'/family['source'])==family['source_sha256'],'Historical source provenance broken'
assert sha(ROOT/'art/pets/approved-v1/sources/phoenix-evolution.png')==sources['phoenix-3']['source_sha256'],'Canonical phoenix sheet not replaced'
assert sources['phoenix-3']['user_replaced_adult_wing_reference'] and sources['phoenix-1']['source_sha256']==sources['phoenix-2']['source_sha256']!=sources['phoenix-3']['source_sha256']
for key,lock in json.loads((OUT/'user-confirmed.json').read_text(encoding='utf-8')).items():
 pid,clip=key.split('/');assert sha(OUT/pid/f'{clip}-r{lock["revision"]}.png')==lock['sha256'] and lock['user_confirmed']
for pid,ref in sources.items():
 folder=OUT/pid;assert sha(OUT/ref['source'])==ref['source_sha256'] and sha(folder/'reference-256.png')==ref['reference_sha256']
 reference=Image.open(folder/'reference-256.png').convert('RGBA');assert reference.size==(256,256) and max(ref['reference_body'])>=176 and ref['no_low_resolution_intermediate']
 actor=meta['actors'][pid];assert actor['cw']==actor['ch']==actor['native_resolution']==256
 box=reference.getbbox();ox,oy,w,h=oldmeta['frames'][pid]['side'];before=old.crop((ox,oy,ox+w,oy+h)).getbbox();previous=max(before[2]-before[0],before[3]-before[1])
 assert abs(max(box[2]-box[0],box[3]-box[1])*actor['render_scale']-previous)<.001,'World size accidentally changes with source resolution'
 for clip in ['idle','move','cast']:
  revision=json.loads((folder/'selected.json').read_text(encoding='utf-8'))[clip];record=json.loads((folder/f'{clip}-r{revision}-job.json').read_text(encoding='utf-8'));path=folder/f'{clip}-r{revision}.png';raw=folder/f'{clip}-r{revision}-raw.png';sheet=Image.open(path).convert('RGBA')
  assert sha(path)==record['sha256'] and sha(raw)==record['raw_sha256'] and record['native_resolution']==256 and record['reference_sha256']==ref['reference_sha256']
  assert sheet.size==Image.open(raw).size==(3328,256) and record['request']['frame_count']==12
  for fragment in record.get('reviewed_detached_effect_cleanup',[]):
   assert fragment['frame'] in [1,2] and fragment['count']==len(fragment['pixels'])
   for x,y in fragment['pixels']:assert sheet.getpixel((fragment['frame']*256+x,y))[3]==0
  coords=meta['clips'][pid][clip+'_e'];assert len(coords)==len(actor['mouth_frames'][clip+'_e'])==13;unique=set()
  for i,(x,y) in enumerate(coords):
   f=sheet.crop((i*256,0,(i+1)*256,256));assert 0<=x<=atlas.width-256 and 0<=y<=atlas.height-256
   assert atlas.crop((x,y,x+256,y+256)).tobytes()==f.tobytes(),'Frame resampled or wrong atlas coordinates'
   bb=f.getbbox();assert bb and min(bb[:2])>0 and bb[2]<256 and bb[3]<256,'Clipped silhouette'
   if i in [0,12]:assert f.tobytes()==reference.tobytes()
   unique.add(hashlib.sha256(f.tobytes()).hexdigest());samples+=1
  assert len(unique)>=6,'Animation largely frozen';rows.append({'id':pid,'clip':clip,'native':256,'uniqueFrames':len(unique)})
for pid in ['fox-1','fox-2','fox-3']:
 assert meta['actors'][pid]==oldmeta['actors'][pid]
 x,y,w,h=meta['frames'][pid]['side'];ox,oy,ow,oh=oldmeta['frames'][pid]['side'];assert atlas.crop((x,y,x+w,y+h)).tobytes()==old.crop((ox,oy,ox+ow,oy+oh)).tobytes()
 for clip,coords in meta['clips'][pid].items():
  for (x,y),(ox,oy) in zip(coords,oldmeta['clips'][pid][clip]):assert atlas.crop((x,y,x+128,y+128)).tobytes()==old.crop((ox,oy,ox+128,oy+128)).tobytes();fox+=1
for species in ['dragon','phoenix']:
 for ext in ['png','json']:
  name=f'web/assets/pets/{species}-mounted.{ext}';current=(ROOT/name).read_bytes();prior=blob(name)
  assert (current==prior if ext=='png' else json.loads(current)==json.loads(prior)),'Accepted mounted art changed'
print(json.dumps({'clips':rows,'nativeSamples':samples,'foxSamplesUnchanged':fox,'mountedArtUnchanged':True,'worldSizePreserved':True,'atlas':atlas.size}))
