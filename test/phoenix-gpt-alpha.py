"""Prove the reported feather residue alone changed; preserve all other rider art."""
from pathlib import Path
import hashlib,io,json,subprocess
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'art/pets/riding-v3/phoenix/gpt'
record=json.loads((folder/'accepted-flight.json').read_text(encoding='utf-8'))
source=Image.open(folder/record['source_file']).convert('RGBA')
final=Image.open(folder/'accepted-flight.png').convert('RGBA')
assert hashlib.sha256((folder/record['source_file']).read_bytes()).hexdigest()==record['source_sha256']
assert hashlib.sha256((folder/'accepted-flight.png').read_bytes()).hexdigest()==record['sha256']
changes={c['frame']:c for c in record['changes']};cleared=0
for i in range(13):
 a=np.array(source.crop((i*256,0,(i+1)*256,256)));b=np.array(final.crop((i*256,0,(i+1)*256,256)))
 expected=np.zeros((256,256),bool)
 for x,y in changes.get(i,{}).get('pixels',[]):
  assert 160<=x<220 and 193<=y<245;expected[y,x]=True
 actual=np.any(a!=b,axis=2);assert np.array_equal(expected,actual)
 assert np.all(b[expected]==0);assert np.array_equal(a[~expected],b[~expected])
 white=(a[:,:,:3].min(axis=2)>220)&(a[:,:,:3].max(axis=2)-a[:,:,:3].min(axis=2)<15)&(a[:,:,3]>128)
 assert np.array_equal(a[white],b[white]),'True white feather highlights changed'
 cleared+=int(actual.sum())
assert changes[6]['count']==124
git='C:/Program Files/Git/cmd/git.exe'
def blob(name):return subprocess.check_output([git,'show','feafaef:'+name],cwd=ROOT)
oldmeta=json.loads(blob('web/assets/pets/phoenix-mounted.json'));old=Image.open(io.BytesIO(blob('web/assets/pets/phoenix-mounted.png'))).convert('RGBA')
meta=json.loads((ROOT/'web/assets/pets/phoenix-mounted.json').read_text(encoding='utf-8'));atlas=Image.open(ROOT/'web/assets/pets/phoenix-mounted.png').convert('RGBA');others=0
for cid,actor in meta['actors'].items():
 for clip in ['idle_e','move_e','cast_e']:
  if cid=='gpt':
   assert len(actor[clip])==13
   for i,(x,y) in enumerate(actor[clip]):assert atlas.crop((x,y,x+256,y+256)).tobytes()==final.crop((i*256,0,(i+1)*256,256)).tobytes()
  else:
   accepted=ROOT/'art/pets/riding-v3/phoenix'/cid/'accepted-flight.png'
   if actor.get('shared_flight_cycle') and accepted.exists():
    replacement=Image.open(accepted).convert('RGBA');assert len(actor[clip])==13
    for i,(x,y) in enumerate(actor[clip]):assert atlas.crop((x,y,x+256,y+256)).tobytes()==replacement.crop((i*256,0,(i+1)*256,256)).tobytes();others+=1
   else:
    assert len(actor[clip])==len(oldmeta['actors'][cid][clip])
    assert actor['mouth_frames'][clip]==oldmeta['actors'][cid]['mouth_frames'][clip]
    for pos,prior in zip(actor[clip],oldmeta['actors'][cid][clip]):
     x,y=pos;ox,oy=prior;assert atlas.crop((x,y,x+256,y+256)).tobytes()==old.crop((ox,oy,ox+256,oy+256)).tobytes();others+=1
assert meta['actors']['gpt']['shared_flight_cycle']
assert atlas.width<=4096 and atlas.height<=4096
print('PASS',cleared,'recorded GPT gap pixels cleared; white feathers/endpoints preserved;',others,'other rider source frame samples exact; three modes share reviewed flight')
