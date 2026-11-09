"""Extend the approved GPT r6 full wingbeat to the other supplied phoenix riders."""
import argparse,base64,io,json,math,time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageDraw
import animate_riding_v4 as v
b=v.b;ROOT=b.ROOT;OUT=v.OUT/'phoenix'
IDS=['deepseek','grok','claude','doubao','glm']
DESCRIPTIONS={
 'deepseek':'blue-haired ponytailed girl, exact eyes, white-and-navy outfit and hands',
 'grok':'peach-pink-haired girl with dark hair bows, exact eyes, dark outfit and hands',
 'claude':'orange-haired girl with flower hair ornament, exact eyes, red-and-white outfit and hands',
 'doubao':'short brown-haired girl, exact eyes, dark outfit and hands',
 'glm':'purple-haired witch-hat girl, exact eyes, dark outfit and hands',
}
PREFERRED=OUT/'gpt/idle-smooth-r6-job.json'
EVIDENCE=ROOT.parent/'context/phoenix-five-2026-11-09'

def generate(cid,revision):
 folder=OUT/cid;stem=f'flight-r{revision}';state=folder/(stem+'-job.json');target=folder/(stem+'.png');rawpath=folder/(stem+'-raw.png');ref=folder/'reference-256.png'
 if target.exists():print('Reuse',cid,revision,flush=True);return
 preferred=json.loads(PREFERRED.read_text(encoding='utf-8'));request=dict(preferred['request'])
 prompt=request['description'].replace('white-haired horned girl, violet eyes, short hair tips, white dress and hands',DESCRIPTIONS[cid]).replace('extra white fabric','extra fabric')
 if revision>1:prompt+=' Keep a solid saddle back under hips; retain near-wing depth and original clothes.'
 assert len(prompt)<=1000
 request.update(description=prompt,seed=8172800+b.IDS.index(cid)+(revision-1)*10000)
 call=b.api()
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'));assert record['reference_sha256']==b.sha(ref)
 else:
  enc={'type':'base64','base64':base64.b64encode(ref.read_bytes()).decode()};result=call('POST','/animate-pixminimax',{**request,'first_frame':enc,'last_frame':enc})
  record={'provider':'PixelLab','endpoint':'/animate-pixminimax','job':result['background_job_id'],'reference_sha256':b.sha(ref),'prompt_source':'gpt/idle-smooth-r6-job.json','prompt_source_sha256':b.sha(PREFERRED),'request':request}
  b.dump(state,record);print('Submitted',cid,revision,record['job'],flush=True)
 for _ in range(180):
  result=call('GET','/background-jobs/'+record['job'])
  if result.get('status')=='completed':break
  if result.get('status')=='failed':raise RuntimeError(f'PixelLab job failed: {cid} {record["job"]}')
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=result.get('last_response') or result;frames=[]
 for item in response['images']:
  raw=item.get('base64') if isinstance(item,dict) else item
  frames.append(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA'))
 assert len(frames)==13 and all(f.size==(256,256) for f in frames)
 reference=Image.open(ref).convert('RGBA');rawsheet=Image.new('RGBA',(3328,256));sheet=Image.new('RGBA',(3328,256))
 for i,f in enumerate(frames):rawsheet.paste(f,(i*256,0));sheet.paste(reference if i in [0,12] else v.clean(f),(i*256,0))
 rawsheet.save(rawpath);sheet.save(target);record.update(raw_sha256=b.sha(rawpath),sha256=b.sha(target),frames=13,usage=response.get('usage'));b.dump(state,record);print('Ready',cid,revision,flush=True)
 review(cid,revision)

def review(cid,revision):
 EVIDENCE.mkdir(exist_ok=True);sheet=Image.open(OUT/cid/f'flight-r{revision}.png').convert('RGBA');board=Image.new('RGBA',(1024,832),'#202632');draw=ImageDraw.Draw(board);anim=[]
 for i in range(12):
  f=sheet.crop((i*256,0,(i+1)*256,256));x=i%4*256;y=i//4*276;board.alpha_composite(f,(x,y+18));draw.text((x+4,y+2),f'{cid} {i}',fill='white')
  bg=Image.new('RGBA',(320,280),'#202632');bg.alpha_composite(f,(32,12));anim.append(bg.convert('RGB'))
 board.save(EVIDENCE/f'{cid}-r{revision}-review.png');anim[0].save(EVIDENCE/f'{cid}-r{revision}-preview.png',save_all=True,append_images=anim[1:],duration=111,loop=0,disposal=0,blend=0)

def select(cid,revision):
 folder=OUT/cid;source=folder/f'flight-r{revision}.png';job=folder/f'flight-r{revision}-job.json';rec=json.loads(job.read_text(encoding='utf-8'))
 assert b.sha(source)==rec['sha256'] and b.sha(folder/'reference-256.png')==rec['reference_sha256']
 # Selection only follows inspection; never overwrite GPT's already accepted pixels.
 im=Image.open(source).convert('RGBA');sheet=Image.new('RGBA',im.size);changes=[]
 for i in range(13):
  f=im.crop((i*256,0,(i+1)*256,256));a=b.np.array(f)
  if i in range(1,12):
   # Same reviewed lower feather-gap residue cleanup as GPT; never key out white.
   r,g,blue=[a[:,:,j].astype(int) for j in range(3)]
   mask=(a[:,:,3]>8)&(r>g+6)&(blue>g+6)&(r>55)&(g>50)&((b.np.maximum(b.np.maximum(r,g),blue)-b.np.minimum(b.np.minimum(r,g),blue))<80)
   roi=b.np.zeros((256,256),bool);roi[193:245,160:220]=True;mask &=roi;yy,xx=b.np.where(mask);a[mask]=0
   if len(xx):changes.append({'frame':i,'count':len(xx),'pixels':[[int(x),int(y)] for x,y in zip(xx,yy)]})
  sheet.paste(Image.fromarray(a),(i*256,0))
 sheet.save(folder/'accepted-flight.png')
 b.dump(folder/'accepted-flight.json',{'source_file':source.name,'source_sha256':b.sha(source),'raw_file':f'flight-r{revision}-raw.png','raw_sha256':rec['raw_sha256'],'job_file':job.name,'frames':13,'shared_flight_cycle':True,'cleanup_roi':[160,193,220,245],'changes':changes,'sha256':b.sha(folder/'accepted-flight.png')})
 print('Selected',cid,revision,'gap pixels',sum(c['count'] for c in changes),flush=True)

def pack():
 EVIDENCE.mkdir(exist_ok=True)
 confirmed=json.loads((OUT/'user-confirmed.json').read_text(encoding='utf-8')) if (OUT/'user-confirmed.json').exists() else {}
 meta=json.loads((ROOT/'web/assets/pets/phoenix-mounted.json').read_text(encoding='utf-8'))
 tiles=[];framesets={};flags=[]
 for cid in b.IDS:
  folder=OUT/cid;record=json.loads((folder/'accepted-flight.json').read_text(encoding='utf-8'));source=folder/'accepted-flight.png';ref=Image.open(folder/'reference-256.png').convert('RGBA')
  assert b.sha(source)==record['sha256']
  if cid in confirmed:assert b.sha(source)==confirmed[cid]['sha256'],'User-confirmed pixels changed: '+cid
  sheet=Image.open(source).convert('RGBA');assert sheet.size==(3328,256)
  actor=meta['actors'][cid];box=ref.getbbox();h=box[3]-box[1];coords=[];mouth=[];frames=[];areas=[]
  for i in range(13):
   f=sheet.crop((i*256,0,(i+1)*256,256));a=b.np.array(f);bounds=f.getbbox();frames.append(f)
   if i in [0,12]:assert f.tobytes()==ref.tobytes()
   if not bounds or min(bounds[:2])<1 or bounds[2]>255 or bounds[3]>255:flags.append(f'{cid}/{i}: clipped')
   areas.append(int((a[:,:,3]>128).sum()))
   labels,n=b.ndimage.label(a[:,:,3]>8,b.np.ones((3,3)));sizes=b.np.bincount(labels.ravel());sizes[0]=0
   if n>1 and sorted(sizes,reverse=True)[1]>128:flags.append(f'{cid}/{i}: detached component')
   idx=len(tiles);tiles.append(f);coords.append([idx%12*256,idx//12*256])
   mask=a[:,:,3]>128;mask[:box[1]+int(h*.25)]=False;mask[box[1]+int(h*.61):]=False;mask[:,:184]=False;yy,xx=b.np.where(mask);right=int(xx.max()) if len(xx) else 230;tip=yy[xx>=right-2];mouth.append([right-3,int(b.np.median(tip)) if len(tip) else 104])
  if min(areas)<areas[0]*.55 or max(areas)>areas[0]*1.8:flags.append(cid+': size drift')
  # Keep the exact GPT muzzle samples as well as pixels from the accepted baseline.
  if cid=='gpt':mouth=actor['mouth_frames']['idle_e']
  for clip in ['idle_e','move_e','cast_e']:actor[clip]=coords;actor['mouth_frames'][clip]=mouth
  actor.update(shared_flight_cycle=True,top=box[1],center=[(box[0]+box[2])/2,(box[1]+box[3])/2],mouth=mouth[0])
  meta.setdefault('overrides',{})[cid]={'source':f'riding-v3/phoenix/{cid}/accepted-flight.json','source_sha256':record['sha256'],'shared_flight_cycle':True}
  framesets[cid]=frames
 assert not flags,flags
 atlas=Image.new('RGBA',(3072,math.ceil(len(tiles)/12)*256))
 for i,f in enumerate(tiles):atlas.paste(f,(i%12*256,i//12*256))
 atlas.save(ROOT/'web/assets/pets/phoenix-mounted.png',optimize=True);meta['sha256']=b.sha(ROOT/'web/assets/pets/phoenix-mounted.png');meta['wing_cycle']='12 native samples in original provider order; complete wingbeat shared continuously across all three modes'
 b.dump(ROOT/'web/assets/pets/phoenix-mounted.json',meta)
 b.dump(OUT/'full-flight-check.json',{'passed':True,'riders':6,'unique_frames':len(tiles),'native_resolution':256,'atlas':atlas.size,'flags':flags,'no_reversed_reconstruction':True})
 preview=[]
 for i in range(12):
  board=Image.new('RGBA',(768,576),'#202632');draw=ImageDraw.Draw(board)
  for j,cid in enumerate(b.IDS):
   x=j%3*256;y=j//3*288;board.alpha_composite(framesets[cid][i],(x,y+24));draw.text((x+8,y+4),b.NAMES[j],font=b.preview_font(18),fill='#ffe36a')
  preview.append(board.convert('RGB'))
 preview[0].save(OUT/'full-flight-preview.png',save_all=True,append_images=preview[1:],duration=111,loop=0,disposal=0,blend=0)
 preview[0].save(EVIDENCE/'full-flight-still.png');print('Packed six full flight cycles',atlas.size,flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['generate','review','select','pack']);p.add_argument('--only',nargs='+',default=IDS);p.add_argument('--revision',type=int,default=1);p.add_argument('--workers',type=int,default=2);a=p.parse_args()
 if a.mode=='pack':pack()
 else:
  fn={'generate':generate,'review':review,'select':select}[a.mode]
  with ThreadPoolExecutor(max_workers=a.workers) as pool:list(pool.map(lambda cid:fn(cid,a.revision),a.only))
