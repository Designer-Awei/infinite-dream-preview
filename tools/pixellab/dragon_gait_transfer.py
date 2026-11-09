"""Transfer the approved young fox gait to the selected adolescent dragon at native 256.
Official endpoint: https://api.pixellab.ai/v2/docs#tag/Animate/operation/transfer_outfit_v2_transfer_outfit_v2_post
Local request/results remain under ignored art/work. Never store API credentials in records.
"""
import argparse,base64,hashlib,io,json,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image,ImageDraw
from animate_riding_v2 import api
from dragon_growth import OUT,clean,dump,sha
ROOT=Path(__file__).resolve().parents[2]
GROUPS=[[0,4,8],[1,5,9],[2,6,10],[3,7,11]]
PROMPT='Transfer the COMPLETE APPEARANCE of the reference red juvenile dragon onto each motion frame. Input animation fox is ONLY a motion/pose guide: replace it entirely with the exact red dragon, NOT a fox wearing accessories. Preserve the reference dragon face, horns, cream belly, crimson bat wings, red tail with flame and short youthful proportions. No fox ears, fur or fluffy tail. MOST IMPORTANT: keep the input frame four leg poses and relative foot placements EXACTLY; do not invent a different gait. Its diagonal pairs step simultaneously, the two near-side legs move opposite directions. Near front and far rear share a phase; far front and near rear share the opposite phase. Retain which legs are near/far, bending joints, paw lift and contact timing from each fox frame. Fold dragon wings quietly above back without hiding legs. Same right-facing side view, stationary canvas position, full silhouette, native 256x256 transparent canvas. ALL four paws retain clear IVORY CLAW TIPS exactly like the dragon reference, NEVER plain dark fox boots. Keep the dragon tail thin, red and extending LOW BACKWARDS behind the hips with its flame; do NOT copy the fox upright curled bushy-tail shape or its tail motion. Transfer only leg/body gait, not tail, ears or fox anatomy. Original sharp stylized shading, no additional realistic skin texture, glow, floor, shadow or text.'
def encode(im):
 b=io.BytesIO();im.save(b,'PNG');return {'image':{'type':'base64','base64':base64.b64encode(b.getvalue()).decode()},'size':{'width':256,'height':256}}
def run_batch(batch,revision):
 name=f'move-transfer-r{revision}-batch{batch}';state=OUT/(name+'-job.json');target=OUT/(name+'.png')
 if target.exists():print('Reuse transfer batch',batch,flush=True);return
 ref=Image.open(OUT/'reference-256.png').convert('RGBA');fox=Image.open(OUT/'fox-gait-reference/selected-strip.png').convert('RGBA');indices=GROUPS[batch]
 request={'image_size':{'width':256,'height':256},'seed':9112900+revision,'no_background':True,'additional_instructions':PROMPT}
 call=api()
 if state.exists():record=json.loads(state.read_text());assert record['reference_sha256']==sha(OUT/'reference-256.png')
 else:
  frames=[fox.crop((i*256,0,(i+1)*256,256)) for i in indices]
  result=call('POST','/transfer-outfit-v2',{**request,'reference_image':encode(ref),'frames':[encode(f) for f in frames]})
  record={'provider':'PixelLab','endpoint':'/transfer-outfit-v2','job':result['background_job_id'],'reference_sha256':sha(OUT/'reference-256.png'),'motion_reference':'follow/fox-1/move','motion_strip_sha256':sha(OUT/'fox-gait-reference/selected-strip.png'),'phase_indices':indices,'request':request};dump(state,record);print('Submitted transfer batch',batch,record['job'],flush=True)
 for _ in range(240):
  result=call('GET','/background-jobs/'+record['job'])
  if result.get('status')=='completed':break
  if result.get('status')=='failed':raise RuntimeError('Transfer failed: '+str(batch))
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=result.get('last_response') or result
 frames=[Image.open(io.BytesIO(base64.b64decode((f['base64'] if isinstance(f,dict) else f).split(',')[-1]))).convert('RGBA') for f in response['images']]
 assert len(frames)==3 and all(f.size==(256,256) for f in frames)
 sheet=Image.new('RGBA',(768,256));board=Image.new('RGBA',(768,560),'#202632');d=ImageDraw.Draw(board)
 for j,(i,f) in enumerate(zip(indices,frames)):
  sheet.paste(f,(j*256,0));board.alpha_composite(fox.crop((i*256,0,(i+1)*256,256)),(j*256,20));board.alpha_composite(f,(j*256,300));d.text((j*256+5,2),'fox phase '+str(i),fill='white');d.text((j*256+5,282),'dragon transfer '+str(i),fill='white')
 sheet.save(target);board.save(OUT/(name+'-review.png'));record.update(output_sha256=sha(target),usage=response.get('usage'));dump(state,record);print('Completed transfer batch',batch,flush=True)
def assemble(revision):
 frames={};batches=[]
 for batch,indices in enumerate(GROUPS):
  stem=f'move-transfer-r{revision}-batch{batch}';record=json.loads((OUT/(stem+'-job.json')).read_text());sheet=Image.open(OUT/(stem+'.png')).convert('RGBA');assert sha(OUT/(stem+'.png'))==record['output_sha256']
  for j,phase in enumerate(indices):frames[phase]=clean(sheet.crop((j*256,0,(j+1)*256,256)))
  batches.append({k:record[k] for k in ['job','phase_indices','request','motion_strip_sha256']})
 assert set(frames)==set(range(12))
 strip=Image.new('RGBA',(3328,256));board=Image.new('RGBA',(1024,840),'#202632');d=ImageDraw.Draw(board)
 for i in range(13):
  frame=frames[i%12];strip.paste(frame,(i*256,0))
  if i<12:board.alpha_composite(frame,(i%4*256,i//4*280+20));d.text((i%4*256+5,i//4*280+2),'fox gait phase '+str(i),fill='white')
 target=OUT/f'move-r{revision}.png';strip.save(target);board.save(OUT/f'move-r{revision}-review.png')
 dump(OUT/f'move-r{revision}-job.json',{'provider':'PixelLab','endpoint':'/transfer-outfit-v2','prompt':PROMPT,'request':{'frame_count':12,'assembly':'four native 256x256 three-frame transfer requests; duplicate phase 0 as cycle endpoint','batches':batches},'reference_sha256':sha(OUT/'reference-256.png'),'motion_reference':{'recipe_id':'follow/fox-1/move','strip_sha256':sha(OUT/'fox-gait-reference/selected-strip.png'),'phases':list(range(12)),'frame_rgba_sha256':[hashlib.sha256(Image.open(OUT/'fox-gait-reference/selected-strip.png').convert('RGBA').crop((i*256,0,(i+1)*256,256)).tobytes()).hexdigest() for i in range(12)]},'sha256':sha(target),'frames':13,'native_resolution':256})
 print('Assembled fox-guided cycle',revision,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--revision',type=int,default=6);p.add_argument('--assemble',action='store_true');p.add_argument('--batch',type=int,choices=range(4));a=p.parse_args()
 if a.assemble:assemble(a.revision)
 elif a.batch is not None:run_batch(a.batch,a.revision)
 else:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda i:run_batch(i,a.revision),range(4)))
