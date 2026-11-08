"""Reuse the user's preferred saved prompt, with twelve generated motion frames."""
import base64,io,time,json,math
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageDraw
import animate_riding_v3 as v
b=v.b;OUT=b.OUT
_original_alpha_clean=b.alpha_clean
def clean(im):
 im=_original_alpha_clean(im);a=b.np.array(im);labels,n=b.ndimage.label(a[:,:,3]>8,b.np.ones((3,3)));sizes=b.np.bincount(labels.ravel());sizes[0]=0
 if n:
  primary=int(sizes.argmax())
  for k in range(1,n+1):
   if k!=primary and sizes[k]<=128:a[labels==k]=0
 return Image.fromarray(a)
b.alpha_clean=clean

def animate(species,cid,clip,revision=0):
 folder=OUT/species/cid;state=folder/(clip+f'-smooth-r{revision}-job.json');target=folder/(clip+f'-smooth-r{revision}.png');ref=folder/'reference-256.png';call=b.api()
 if target.exists():return
 old=b.ROOT/'art/pets/riding-approved/phoenix/deepseek'/('idle-job.json' if clip=='idle' else 'cast-job.json' if clip=='cast' else 'move-r1-job.json');record0=json.loads(old.read_text(encoding='utf-8'));request=record0['request'];prompt=request.get('description') or request.get('action')
 if species=='dragon':
  prompt=prompt.replace('Hover idle in place:','Grounded breathing idle, four paws planted:').replace('Steady flying loop in place:','Grounded four-legged walk in place, diagonal paw pairs alternate with weight:').replace('Flight casting loop in place:','Grounded four-legged walking breath-attack loop:').replace('flight feathers','wing membrane').replace('feathers','wing tips').replace('Phoenix extends neck, opens beak slightly with a tiny icy glow INSIDE beak','ONLY dragon extends neck and opens reptilian jaw, girl mouth closed').replace('No leg-walking,','No rearing,').replace('No blizzard, rings, external ice, sparks or beams.','No external fire, rings, sparks or beams.')
 if revision>0:prompt='Reference wing height is the HIGHEST pose. Flap DOWN first, never cover rider face. Show underside on downstroke, fold and turn edge-on on recovery. No grey shadows or blobs. '+prompt.split('Exact approved rider')[0]+'Same rider, costume, proportions, bright coloured eyes and correct far-leg occlusion. Right-facing side view and fixed camera. Transparent background, no effects. Return seamlessly to supplied pose.'
 if revision>=2:
  if species=='dragon':prompt='Grounded four-legged dragon. Keep upper wing ridge anchored BELOW the rider HANDS. Curl both wing membranes and tips DOWN toward ground, exposing darker inner membrane, then unfold OUTWARD to reference level; never raise wings, never hide head. Gentle chest breathing and tail sway. '+('Slow four-legged diagonal walking steps in place. ' if clip in ['move','cast'] else 'Four paws planted. ')+('Dragon jaw opens, GIRL mouth closed. ' if clip=='cast' else '')+'Rider face, hair, clothing and position unchanged, far leg hidden. No floor, ground, grey blobs, shadow, fire or magic. Return to input pose, facing right, fixed side camera.'
  else:prompt='NO ground, floor, cast shadow, grey blobs or flat patches. '+prompt
 if revision>=4 and species=='phoenix':prompt='SEATED RIDER CONTACT IS THE PRIORITY: girl buttocks and bent thighs rest directly ON the solid feathered back behind the phoenix neck throughout. NO air gap under pelvis, no standing on feet, no rising out of seat. Rider pelvis follows bird torso as ONE unit, hips stay attached, near leg bent downward, far leg hidden. Keep bird torso thick and solid under rider, same baseline and scale; subtle breathing only. Both wings flap DOWN together, turn feathers to expose underside, fold elbows and return smoothly. Rider face, white dress, WHITE lace boots and violet eyes unchanged. Fixed right-facing side view, same size. No shadow, grey blobs, external magic or added objects. Seamless return to supplied seated pose.'
 if revision>=5 and species=='phoenix':prompt='RIDER POSE LOCK: preserve the exact white-haired horned girl from input. Pelvis remains SEATED IN CONTACT with the solid blue feathered BACK, same relative position and scale in EVERY frame. Bird torso and girl hips move as ONE unit; no floating, standing or bouncing out of seat. Her lower dress, thighs and WHITE lace boots stay consistently BEHIND the SAME near-side feather mantle/torso, as in input; do not reveal, swing, redraw or swap legs. Keep face, hair-tip silhouette, white skirt and footwear design identical. Animate ONLY a natural synchronized wingbeat: wings press DOWN, feathers twist to show underside, elbows fold on recovery, then return. Solid back and saddle area keep fixed height and volume underneath rider, subtle chest breathing and soft tail/hair sway. Side view facing RIGHT, fixed camera. No shadows, blobs, effects or extra objects. Seamless loop.'
 if revision>=6 and species=='phoenix':
  prompt='Smooth complete flying wingbeat, both blue phoenix wings DOWN together, feathers twist to show underside, fold edge-on during recovery and return to reference height. Preserve the EXACT supplied seated white-haired horned girl, violet eyes, short hair tips, white dress and hands. Her hips remain in contact with the SOLID thick bird back behind neck; torso and hips gently rise together. In THIS reference her thighs, skirt hem and boots are HIDDEN BEHIND the SAME near feather mantle throughout; never reveal a leg, boot or extra white fabric below hands. Near feathers remain IN FRONT of lower body and hair ends; never swap depth. Rider face above wing stays visible. Subtle breathing, feather lag and tail sway, no sliding or floating rider. Same fixed right-facing camera, same size, transparent background. No magic, grey blobs, floor or shadows. Seamless loop.'
  if revision==7:prompt='Blue phoenix and exact white-haired horned girl, fixed right-facing pixel-art camera. Natural COMPLETE wingbeat: distal flight feathers sweep DOWN, twist underside, fold edge-on and recover to source height. The thick UPPER wing ROOT and near feather mantle stay in their reference position IN FRONT of the rider hips, skirt and thighs, hiding her legs throughout. Only outer flight feathers pivot at elbow; do not drop the shoulder or erase bird back under girl. Her pelvis rests ON the same solid back, gentle body breathing, tail undulates. Keep original face, violet eyes, hair-tip outline, white dress and hands identical. No exposed legs, brown or black boots, extra skin, new clothes, detached saddle or floating rider. All rider details remain at same depth behind near shoulder feathers. Same size, source is first and last pose, transparent background. No shadow, floor, grey blobs or magic.'
  if revision==8:prompt+=' Gentle full wing rotation, preserve all rider details.'
 assert len(prompt)<=1000
 # Same preferred motion instruction, with more temporal samples; no mirrored/reversed replay.
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  enc={'type':'base64','base64':base64.b64encode(ref.read_bytes()).decode()};body={'first_frame':enc,'last_frame':enc,'description':prompt,'frame_count':12,'no_background':True,'direction':'east','view':'side','enhance_prompt':False,'subject_description':'The approved girl seated on a '+('red four-legged fire dragon' if species=='dragon' else 'blue-white ice phoenix'),'initial_pose':'Right-facing side view, rider seated, face above near wing, same exact reference pose and size.','seed':8111800+b.IDS.index(cid)+b.CLIPS.index(clip)*100+revision*10000+(species=='phoenix')*1000};r=call('POST','/animate-pixminimax',body);record={'job':r['background_job_id'],'provider':'PixelLab','endpoint':'/animate-pixminimax','reference_sha256':b.sha(ref),'source_prompt_file':str(old.relative_to(b.ROOT)),'request':{k:x for k,x in body.items() if k not in ['first_frame','last_frame']}};b.dump(state,record);print('Submitted preferred prompt',species,cid,clip,revision,flush=True)
 for _ in range(180):
  r=call('GET','/background-jobs/'+record['job'])
  if r.get('status')=='completed':break
  if r.get('status')=='failed':raise RuntimeError(str(r.get('last_response'))[:250])
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=r.get('last_response') or r;frames=[]
 for item in response['images']:
  raw=item.get('base64') if isinstance(item,dict) else item;frames.append(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA'))
 assert len(frames)==13 and all(f.size==(256,256) for f in frames)
 rawsheet=Image.new('RGBA',(3328,256));sheet=Image.new('RGBA',(3328,256));refim=Image.open(ref).convert('RGBA')
 for i,f in enumerate(frames):rawsheet.paste(f,(i*256,0));sheet.paste(refim if i in [0,12] else b.alpha_clean(f),(i*256,0))
 rawsheet.save(folder/(clip+f'-smooth-r{revision}-raw.png'));sheet.save(target);record.update(frames=13,usage=response.get('usage'),raw_sha256=b.sha(folder/(clip+f'-smooth-r{revision}-raw.png')),sha256=b.sha(target));b.dump(state,record);print('Ready preferred prompt',species,cid,clip,revision,flush=True)

def select(species,cid,clip,revision=0):
 folder=OUT/species/cid;state=folder/(clip+f'-smooth-r{revision}-job.json');rec=json.loads(state.read_text(encoding='utf-8'));rawfile=clip+f'-smooth-r{revision}-raw.png';raw=Image.open(folder/rawfile).convert('RGBA');ref=Image.open(folder/'reference-256.png').convert('RGBA');sheet=Image.new('RGBA',(3328,256))
 for i in range(13):sheet.paste(ref if i in [0,12] else clean(raw.crop((i*256,0,(i+1)*256,256))),(i*256,0))
 sheet.save(folder/(clip+'.png'));rec['sha256']=b.sha(folder/(clip+'.png'));rec['alpha_cleanup']='alpha<=8; remove detached components <=128px only; no RGB colour key';b.dump(state,rec);b.dump(folder/(clip+'-selected.json'),{'revision':revision,'job_file':state.name,'raw_file':rawfile})

def pack(species):
 folder=OUT/species;atlas=Image.new('RGBA',(4096,3840));meta={'species':species,'ride_stage':3,'cw':256,'ch':256,'anchor':[128,232],'scale':.45,'actors':{},'source_sha256':b.sha(folder/'source-six.png'),'native_resolution':256,'wing_cycle':'12 generated frames, original ordering, no reversed-frame reconstruction'};idx=0;flags=[];boardFrames=[]
 for cid in b.IDS:
  base=Image.open(folder/cid/'base.png');box=base.getbbox();h=box[3]-box[1];actor={'cast_walk':False,'top':box[1],'center':[(box[0]+box[2])/2,(box[1]+box[3])/2],'mouth':[box[2]-7,box[1]+round(h*.48)],'mouth_frames':{}}
  for clip in b.CLIPS:
   selected=json.loads((folder/cid/(clip+'-selected.json')).read_text(encoding='utf-8'));rec=json.loads((folder/cid/selected['job_file']).read_text(encoding='utf-8'));sheet=Image.open(folder/cid/(clip+'.png')).convert('RGBA');raw=Image.open(folder/cid/selected['raw_file']).convert('RGBA');assert rec['sha256']==b.sha(folder/cid/(clip+'.png')) and rec['reference_sha256']==b.sha(folder/cid/'reference-256.png');assert sheet.size==(3328,256) and rec['raw_sha256']==b.sha(folder/cid/selected['raw_file']);actor[clip+'_e']=[];actor['mouth_frames'][clip+'_e']=[]
   for i in range(13):
    f=sheet.crop((i*256,0,(i+1)*256,256));expected=base if i in [0,12] else b.alpha_clean(raw.crop((i*256,0,(i+1)*256,256)));assert f.tobytes()==expected.tobytes();bounds=f.getbbox()
    if not bounds or min(bounds[:2])<2 or bounds[2]>254 or bounds[3]>254:flags.append(cid+'/'+clip+'/'+str(i)+': margin')
    labels,n=b.ndimage.label(b.np.array(f)[:,:,3]>8,b.np.ones((3,3)));sizes=b.np.bincount(labels.ravel());sizes[0]=0;extra=sorted(sizes,reverse=True)[1:2]
    if extra and extra[0]>128:flags.append(cid+'/'+clip+'/'+str(i)+': detached fragment '+str(extra[0]))
    x=idx%16*256;y=idx//16*256;idx+=1;atlas.paste(f,(x,y));actor[clip+'_e'].append([x,y]);a=b.np.array(f)[:,:,3];mask=a>128;mask[:max(0,box[1]+int(h*.25))]=False;mask[min(256,box[1]+int(h*.61)):]=False;mask[:,:184]=False;yy,xx=b.np.where(mask);right=int(xx.max()) if len(xx) else actor['mouth'][0];tip=yy[xx>=right-2];actor['mouth_frames'][clip+'_e'].append([right-3,int(b.np.median(tip))+(6 if species=='dragon' else 0) if len(tip) else actor['mouth'][1]])
  meta['actors'][cid]=actor
 atlas.save(folder/'mounted.png',optimize=True);meta['sha256']=b.sha(folder/'mounted.png');b.dump(folder/'mounted.json',meta);b.dump(folder/'asset-check.json',{'species':species,'frames':idx,'passed':not flags,'flags':flags,'native_resolution':256,'source_endpoints_exact':True,'provider_frames_original_order':True});assert not flags,flags;print('Packed reviewed',species,idx,flush=True)
 for clip in b.CLIPS:
  clipFrames=[]
  for i in range(12):
   board=Image.new('RGBA',(768,576),'#181329');d=ImageDraw.Draw(board)
   for n,cid in enumerate(b.IDS):
    f=Image.open(folder/cid/(clip+'.png')).crop((i*256,0,(i+1)*256,256));board.alpha_composite(f,(n%3*256,n//3*288+24));d.text((n%3*256+8,n//3*288+3),b.NAMES[n]+' '+{'idle':'待机','move':'移动','cast':'施法'}[clip],font=b.preview_font(18),fill='#ffe36a')
   clipFrames.append(board.convert('RGB'))
  clipFrames[0].save(folder/(clip+'-preview.png'),save_all=True,append_images=clipFrames[1:],duration=111,loop=0,disposal=0,blend=0);boardFrames.extend(clipFrames)
 boardFrames[0].save(folder/'mounted-preview.png',save_all=True,append_images=boardFrames[1:],duration=111,loop=0,disposal=0,blend=0);boardFrames[0].save(folder/'mounted-still.png')
 for clip in b.CLIPS:
  board=Image.new('RGBA',(13*256,6*280),'#181329');d=ImageDraw.Draw(board)
  for row,cid in enumerate(b.IDS):
   sheet=Image.open(folder/cid/(clip+'.png'))
   for i in range(13):board.alpha_composite(sheet.crop((i*256,0,(i+1)*256,256)),(i*256,row*280+24));d.text((i*256+4,row*280+3),b.NAMES[row]+' '+str(i),font=b.preview_font(15),fill='#ffe36a')
  board.convert('RGB').save(folder/(clip+'-review.png'))
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('mode');p.add_argument('--species',default='phoenix');p.add_argument('--only',nargs='+',default=b.IDS);p.add_argument('--clip',default='all');p.add_argument('--revision',type=int,default=0);p.add_argument('--workers',type=int,default=2);a=p.parse_args();jobs=[(c,k) for c in a.only for k in (b.CLIPS if a.clip=='all' else [a.clip])]
 if a.mode=='animate':
  with ThreadPoolExecutor(max_workers=a.workers) as pool:list(pool.map(lambda x:animate(a.species,*x,a.revision),jobs))
 elif a.mode=='select':
  for x in jobs:select(a.species,*x,a.revision)
 elif a.mode=='pack':pack(a.species)
 elif a.mode=='publish':
  f=OUT/a.species;assert json.loads((f/'asset-check.json').read_text(encoding='utf-8'))['passed']
  for ext in ['png','json']:(b.ROOT/'web/assets/pets'/f'{a.species}-mounted.{ext}').write_bytes((f/f'mounted.{ext}').read_bytes())
