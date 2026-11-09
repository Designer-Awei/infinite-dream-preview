"""Check all six flight sources, local alpha edits, and exact runtime atlas cells."""
from pathlib import Path
import hashlib,io,json,subprocess
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1];folder=ROOT/'art/pets/riding-v3/phoenix'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
meta=json.loads((ROOT/'web/assets/pets/phoenix-mounted.json').read_text(encoding='utf-8'));atlas=Image.open(ROOT/'web/assets/pets/phoenix-mounted.png').convert('RGBA');riders=[]
confirmed=json.loads((folder/'user-confirmed.json').read_text(encoding='utf-8'))
git='C:/Program Files/Git/cmd/git.exe'
gpt_before=subprocess.check_output([git,'show','6139870:art/pets/riding-v3/phoenix/gpt/accepted-flight.png'],cwd=ROOT)
assert gpt_before==(folder/'gpt/accepted-flight.png').read_bytes(),'Approved GPT flight changed'
oldmeta=json.loads(subprocess.check_output([git,'show','6139870:web/assets/pets/phoenix-mounted.json'],cwd=ROOT))
for cid,actor in meta['actors'].items():
 source=folder/cid;record=json.loads((source/'accepted-flight.json').read_text(encoding='utf-8'));job=json.loads((source/record['job_file']).read_text(encoding='utf-8'))
 if cid in confirmed:assert confirmed[cid]['user_confirmed'] and sha(source/'accepted-flight.png')==confirmed[cid]['sha256']
 assert sha(source/'accepted-flight.png')==record['sha256'] and sha(source/record['source_file'])==record['source_sha256'] and sha(source/record['raw_file'])==record['raw_sha256']
 assert job['request']['frame_count']==12 and job['endpoint']=='/animate-pixminimax'
 assert job['reference_sha256']==sha(source/'reference-256.png')
 before=Image.open(source/record['source_file']).convert('RGBA');accepted=Image.open(source/'accepted-flight.png').convert('RGBA');reference=Image.open(source/'reference-256.png').convert('RGBA');assert accepted.size==(3328,256)
 changes={c['frame']:c for c in record['changes']};cleared=0
 for i in range(13):
  a=np.array(before.crop((i*256,0,(i+1)*256,256)));b=np.array(accepted.crop((i*256,0,(i+1)*256,256)));expected=np.zeros((256,256),bool)
  for x,y in changes.get(i,{}).get('pixels',[]):assert 160<=x<220 and 193<=y<245;expected[y,x]=True
  assert np.array_equal(np.any(a!=b,axis=2),expected) and np.all(b[expected]==0)
  assert np.array_equal(a[~expected],b[~expected]);cleared+=int(expected.sum())
  white=(a[:,:,:3].min(axis=2)>220)&(a[:,:,:3].max(axis=2)-a[:,:,:3].min(axis=2)<15)&(a[:,:,3]>128)
  assert np.array_equal(a[white],b[white]),'Normal white feathers changed'
  if i in [0,12]:assert Image.fromarray(b).tobytes()==reference.tobytes()
 assert actor['shared_flight_cycle'] and actor['idle_e']==actor['move_e']==actor['cast_e']
 for clip in ['idle_e','move_e','cast_e']:
  assert len(actor[clip])==len(actor['mouth_frames'][clip])==13
  for i,(x,y) in enumerate(actor[clip]):assert atlas.crop((x,y,x+256,y+256)).tobytes()==accepted.crop((i*256,0,(i+1)*256,256)).tobytes()
 if cid=='gpt':assert actor['mouth_frames']==oldmeta['actors']['gpt']['mouth_frames']
 riders.append({'cid':cid,'samples':13,'gapPixelsCleared':cleared})
assert atlas.width<=4096 and atlas.height<=4096
assert len(set(tuple(pos) for a in meta['actors'].values() for pos in a['idle_e']))==78
print(json.dumps({'riders':riders,'atlas':atlas.size,'uniqueFrames':78,'gptUnchanged':True,'whiteHighlightsPreserved':True,'endpointsExact':True},ensure_ascii=False))
