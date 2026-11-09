"""Rejected r8 batch experiment retained for provenance.

Interleaved edits broke wing timing and the fixed ROI clipped the downstroke.
Use dragon_wing_redraw.py for complete temporal clips instead.
"""
import argparse,base64,hashlib,io,json,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image,ImageDraw
from animate_riding_v2 import api
from dragon_growth import OUT,clean,dump,sha
GROUPS=[[0,3,6,9],[1,4,7,10],[2,5,8,11]]
POSES=['both wings at original raised resting pose','both wings lifting together','both wings fully UP and spread together','both wings starting DOWN together','both wings halfway DOWN together','both wings near bottom of downstroke','both wings fully DOWN together, membranes folding','both wings beginning recovery UP together','both wings halfway UP together','both wings nearly raised together','both wings settling to original raised pose','both wings back at original raised pose']
BASE={'idle':3,'move':7}
# Keep generated edits behind this shoulder seam. In particular every leg/foot
# pixel below row 180 comes from the approved source, never the wing editor.
WING_REGION=[(0,0),(162,0),(162,85),(150,102),(143,120),(135,142),(125,149),(112,162),(98,165),(85,160),(68,166),(0,180)]
COMMON='Edit ONLY the TWO BAT WINGS of this same juvenile red dragon. All four leg outlines, foot positions, diagonal gait, face, horns, neck, torso, tail and flame MUST remain EXACTLY as in each input frame. Do not re-pose, re-animate, move, rescale or redesign the body. Both wings flap synchronously in the SAME phase like the final adult dragon: rise together, sweep down together, fold and recover together. NEVER seesaw, alternate, or keep one high while the other is low. Far wing is foreshortened but follows the same up/down phase. Preserve CRIMSON RED membranes on BOTH surfaces, red shadows, no yellow/gold wing undersides. Clear wing motion, not just a twitch. Fixed camera and full silhouette in the 256 canvas with padding, clean transparent background, no new objects, external effects, shadow or glow. The four frames have the following exact wing poses, in this order: '
def encode(im):
 b=io.BytesIO();im.save(b,'PNG');return {'image':{'type':'base64','base64':base64.b64encode(b.getvalue()).decode()},'size':{'width':256,'height':256}}
def batch(clip,index,revision):
 stem=f'{clip}-wings-r{revision}-batch{index}';state=OUT/(stem+'-job.json');target=OUT/(stem+'.png');source=OUT/f'{clip}-r{BASE[clip]}.png';sheet=Image.open(source).convert('RGBA');phases=GROUPS[index]
 if target.exists():print('Reuse',stem,flush=True);return
 prompt=COMMON+'; '.join(f'frame {k+1}: {POSES[i]}' for k,i in enumerate(phases))+'. Keep every paw from the corresponding input frame unchanged.'
 assert len(prompt)<=2000
 request={'description':prompt,'image_size':{'width':256,'height':256},'seed':9113900+revision,'no_background':True};call=api()
 if state.exists():record=json.loads(state.read_text());assert record['source_sha256']==sha(source)
 else:
  result=call('POST','/edit-animation-v2',{**request,'frames':[encode(sheet.crop((i*256,0,(i+1)*256,256))) for i in phases]})
  record={'provider':'PixelLab','endpoint':'/edit-animation-v2','job':result['background_job_id'],'phase_indices':phases,'source_sha256':sha(source),'source_file':str(source),'request':request};dump(state,record);print('Submitted',stem,record['job'],flush=True)
 for _ in range(240):
  result=call('GET','/background-jobs/'+record['job'])
  if result.get('status')=='completed':break
  if result.get('status')=='failed':raise RuntimeError('Wing edit failed: '+stem)
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=result.get('last_response') or result
 frames=[Image.open(io.BytesIO(base64.b64decode((f['base64'] if isinstance(f,dict) else f).split(',')[-1]))).convert('RGBA') for f in response['images']]
 assert len(frames)==4 and all(f.size==(256,256) for f in frames)
 result_sheet=Image.new('RGBA',(1024,256));board=Image.new('RGBA',(1024,560),'#202632');d=ImageDraw.Draw(board)
 for k,(phase,f) in enumerate(zip(phases,frames)):
  result_sheet.paste(f,(k*256,0));board.alpha_composite(sheet.crop((phase*256,0,(phase+1)*256,256)),(k*256,20));board.alpha_composite(f,(k*256,300));d.text((k*256+5,2),'input '+str(phase),fill='white');d.text((k*256+5,282),'wing edit '+str(phase),fill='white')
 result_sheet.save(target);board.save(OUT/(stem+'-review.png'));record.update(output_sha256=sha(target),usage=response.get('usage'));dump(state,record);print('Completed',stem,flush=True)
def assemble(clip,revision):
 source=OUT/f'{clip}-r{BASE[clip]}.png';original=Image.open(source).convert('RGBA');frames={};jobs=[]
 mask=Image.new('L',(256,256));ImageDraw.Draw(mask).polygon(WING_REGION,fill=255)
 for k,phases in enumerate(GROUPS):
  stem=f'{clip}-wings-r{revision}-batch{k}';record=json.loads((OUT/(stem+'-job.json')).read_text());path=OUT/(stem+'.png');assert sha(path)==record['output_sha256'];sheet=Image.open(path).convert('RGBA')
  for j,phase in enumerate(phases):
   frame=original.crop((phase*256,0,(phase+1)*256,256));legs=frame.crop((0,180,256,256)).tobytes();edit=clean(sheet.crop((j*256,0,(j+1)*256,256)))
   frame.paste(edit,(0,0),mask);assert frame.crop((0,180,256,256)).tobytes()==legs
   frames[phase]=frame
  jobs.append({k:record[k] for k in ['job','phase_indices','request','source_sha256','output_sha256']})
 # Idle and cast share the canonical source cell. Moving has its own loop cell.
 if clip=='idle':frames[0]=original.crop((0,0,256,256))
 strip=Image.new('RGBA',(3328,256));board=Image.new('RGBA',(1024,840),'#202632');draw=ImageDraw.Draw(board)
 for i in range(13):
  frame=frames[i%12];strip.paste(frame,(i*256,0))
  if i<12:board.alpha_composite(frame,(i%4*256,i//4*280+20));draw.text((i%4*256+5,i//4*280+2),f'{clip} phase {i}',fill='white')
 target=OUT/f'{clip}-r{revision}.png';strip.save(target);board.save(OUT/f'{clip}-r{revision}-review.png')
 base=json.loads((OUT/f'{clip}-r{BASE[clip]}-job.json').read_text())
 record={'provider':'PixelLab','endpoint':'/edit-animation-v2','prompt':COMMON+'; '.join(POSES),'request':{'frame_count':12,'batches':jobs,'assembly':'wing-region-only RGBA replacement; all source pixels outside polygon retained; phase 0 repeated at end','wing_region':WING_REGION,'protected_leg_rows':[180,256],'idle_source_endpoint':clip=='idle','body_source':{'endpoint':base['endpoint'],'prompt':base.get('prompt') or base['request'].get('description'),'request':base['request']}},'wing_reference':{'recipe_id':'follow/dragon-3/move','role':'visual phase reference; not an API image input'},'source_job_sha256':sha(OUT/f'{clip}-r{BASE[clip]}-job.json'),'sha256':sha(target),'native_resolution':256}
 if 'motion_reference' in base:record['motion_reference']=base['motion_reference']
 dump(OUT/f'{clip}-r{revision}-job.json',record);print('Assembled synchronized wings',clip,revision,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--clip',choices=BASE,default='move');p.add_argument('--batch',type=int,choices=range(3));p.add_argument('--revision',type=int,default=8);p.add_argument('--assemble',action='store_true');a=p.parse_args()
 if a.assemble:assemble(a.clip,a.revision)
 elif a.batch is not None:batch(a.clip,a.batch,a.revision)
 else:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda i:batch(a.clip,i,a.revision),range(3)))
