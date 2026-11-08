"""PixelLab temporal edit, preserve the preferred wing motion while fixing seat contact."""
import base64,io,json,time,argparse
from pathlib import Path
from PIL import Image
import animate_riding_v4 as v
b=v.b

def edit(cid,clip,group):
 folder=v.OUT/'phoenix'/cid;selected=json.loads((folder/(clip+'-selected.json')).read_text(encoding='utf-8'));source=folder/(clip+'.png');sheet=Image.open(source).convert('RGBA');indices=list(range(1,12))[group*4:(group+1)*4];state=folder/(clip+f'-seat-g{group}-job.json');target=folder/(clip+f'-seat-g{group}.png');call=b.api()
 if target.exists():return
 prompt='Fix ONLY rider sitting anatomy, keep the existing wing movement and frame poses. Girl must SIT astride the phoenix: buttocks and bent upper thighs REST ON its solid feathered back directly behind the neck. Remove the floating gap under her pelvis. Lower her pelvis/body as needed and restore thick blue feathered back under her seat. Hips and phoenix torso remain in contact as one unit in every frame, never standing on feet. Near knee bent down beside bird, FAR leg hidden. Preserve face, bright violet eyes, white dress, WHITE lace boots, hair and horns. Same right-facing side view, body size, position and animation timing. Wings and tail retain these exact motion phases. No extra objects, shadow, grey patch or outside magic. Transparent alpha.'
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  frames=[]
  for i in indices:
   f=sheet.crop((i*256,0,(i+1)*256,256));buf=io.BytesIO();f.save(buf,format='PNG');frames.append({'image':{'type':'base64','base64':base64.b64encode(buf.getvalue()).decode()},'size':{'width':256,'height':256}})
  r=call('POST','/edit-animation-v2',{'description':prompt,'frames':frames,'image_size':{'width':256,'height':256},'no_background':True,'seed':8111900+group});record={'job':r['background_job_id'],'endpoint':'/edit-animation-v2','source_sha256':b.sha(source),'source_selection':selected,'indices':indices,'prompt':prompt};b.dump(state,record);print('Submitted seat edit',cid,clip,group,flush=True)
 for _ in range(180):
  r=call('GET','/background-jobs/'+record['job'])
  if r.get('status')=='completed':break
  if r.get('status')=='failed':raise RuntimeError(str(r.get('last_response'))[:250])
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=r.get('last_response') or r;frames=[]
 for item in response.get('images',response.get('frames',[])):
  item=item.get('image',item) if isinstance(item,dict) else item;raw=item.get('base64') if isinstance(item,dict) else item;frames.append(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA'))
 if len(frames)!=len(indices):raise RuntimeError('Unexpected response '+str(list(response)))
 result=Image.new('RGBA',(len(indices)*256,256))
 for j,f in enumerate(frames):result.paste(f,(j*256,0))
 result.save(target);record.update(sha256=b.sha(target),usage=response.get('usage'));b.dump(state,record);print('Ready seat edit',cid,clip,group,flush=True)
def assemble(clip):
 folder=v.OUT/'phoenix'/'gpt';selected=json.loads((folder/(clip+'-selected.json')).read_text(encoding='utf-8'));
 if selected['job_file']==clip+'-seat-job.json':print('Reuse assembled seated',clip,flush=True);return
 ref=Image.open(folder/'reference-256.png').convert('RGBA');raw=Image.new('RGBA',(3328,256));sheet=Image.new('RGBA',(3328,256));raw.paste(ref,(0,0));raw.paste(ref,(12*256,0));jobs=[]
 for group in range(3):
  state=folder/(clip+f'-seat-g{group}-job.json');record=json.loads(state.read_text(encoding='utf-8'));im=Image.open(folder/(clip+f'-seat-g{group}.png')).convert('RGBA');assert b.sha(folder/(clip+f'-seat-g{group}.png'))==record['sha256'];jobs.append(state.name)
  for j,i in enumerate(record['indices']):raw.paste(im.crop((j*256,0,(j+1)*256,256)),(i*256,0))
 for i in range(13):sheet.paste(ref if i in [0,12] else v.clean(raw.crop((i*256,0,(i+1)*256,256))),(i*256,0))
 rawfile=clip+'-seat-raw.png';raw.save(folder/rawfile);sheet.save(folder/(clip+'.png'));state=folder/(clip+'-seat-job.json');record={'provider':'PixelLab','endpoint':'/edit-animation-v2','edit_jobs':jobs,'parent_selection':selected,'reference_sha256':b.sha(folder/'reference-256.png'),'raw_sha256':b.sha(folder/rawfile),'sha256':b.sha(folder/(clip+'.png')),'frames':13,'alpha_cleanup':'alpha<=8 and detached components<=128px only; never RGB key','edit':'Pelvis seated in contact with back; wing phase retained'};b.dump(state,record);b.dump(folder/(clip+'-selected.json'),{'revision':'seat','job_file':state.name,'raw_file':rawfile});print('Assembled seated',clip,flush=True)
if __name__=='__main__':
 from concurrent.futures import ThreadPoolExecutor
 p=argparse.ArgumentParser();p.add_argument('--clip',default='idle');p.add_argument('--group',type=int,default=0);p.add_argument('--all',action='store_true');p.add_argument('--assemble',action='store_true');a=p.parse_args()
 if a.assemble:
  for c in b.CLIPS:assemble(c)
 elif a.all:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda x:edit('gpt',*x),[(c,g) for c in b.CLIPS for g in range(3)]))
 else:edit('gpt',a.clip,a.group)
