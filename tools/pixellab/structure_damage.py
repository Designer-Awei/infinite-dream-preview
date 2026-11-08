"""PixelLab edits of actual in-game block references, two damage states."""
import base64,io,json,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageDraw
from animate_riding_v2 import api,dump,sha,preview_font
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/structures/damage-v1'
def generate(name,stage):
 source=OUT/(name+'-reference.png');target=OUT/(name+'-damage-'+str(stage)+'.png');state=target.with_suffix('.json')
 if target.exists():return
 im=Image.open(source).convert('RGBA');ref=Image.new('RGBA',(32,48));ref.paste(im,(0,0));buf=io.BytesIO();ref.save(buf,format='PNG')
 material='wood planks' if name in ['wall-0','crate'] else 'stone slabs'
 change='Moderately damaged: several BROKEN pieces, missing corner chips and splintered planks with exposed dark interior and scattered tiny fragments; retain about 80 percent of volume.' if stage==1 else 'Heavily damaged: large ragged holes and MISSING plank/slab sections, hanging splinters, exposed deep interior, chipped corners and small rubble at base; retain about 55 percent of volume.'
 prompt='Edit this exact game '+material+' block in place. '+change+' Same 3/4 top and front perspective, palette, scale, rectangular footprint and pixel grid. Do NOT just draw zigzag lines. No fire, text, shadow or background. Keep all fragments inside original canvas.'
 call=api()
 if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
 else:
  r=call('POST','/edit-image-pixen',{'image':{'type':'base64','base64':base64.b64encode(buf.getvalue()).decode()},'description':prompt,'no_background':True,'seed':8110810+stage+(['wall-0','wall-1','wall-2','wall-3','crate'].index(name))*10})
  record={'job':r['background_job_id'],'endpoint':'/edit-image-pixen','source_sha256':sha(source),'prompt':prompt};dump(state,record);print('Submitted damage',name,stage,flush=True)
 for _ in range(120):
  r=call('GET','/background-jobs/'+record['job'])
  if r.get('status')=='completed':break
  if r.get('status')=='failed':raise RuntimeError(str(r.get('last_response'))[:250])
  time.sleep(5)
 else:raise TimeoutError(record['job'])
 response=r.get('last_response') or r;item=response.get('image') or response.get('images',[None])[0]
 if item is None:raise RuntimeError('Response keys '+str(list(response)))
 raw=item.get('base64') if isinstance(item,dict) else item;im=Image.open(io.BytesIO(base64.b64decode(raw.split(',')[-1]))).convert('RGBA');assert im.size==(32,48);im.save(target);record.update(sha256=sha(target),usage=response.get('usage'));dump(state,record);print('Ready damage',name,stage,flush=True)
def pack():
 # Walls now use the approved code-native wear; publish only the two crate tiles.
 atlas=Image.new('RGBA',(64,48))
 for stage in [1,2]:atlas.paste(Image.open(OUT/('crate-damage-'+str(stage)+'.png')),((stage-1)*32,0))
 # Historical source board only: current runtime uses native wall wear, no crate damage art.
 atlas.save(OUT/'damage-atlas.png')
 # Separate rows for original, moderate and heavy, readable at 4x.
 board=Image.new('RGBA',(640,640),'#181329')
 for k,name in enumerate(['wall-0','wall-1','wall-2','wall-3','crate']):
  for stage in [0,1,2]:
   p=OUT/(name+('-reference' if stage==0 else '-damage-'+str(stage))+'.png');im=Image.open(p).convert('RGBA');board.alpha_composite(im.resize((128,im.height*4),Image.Resampling.NEAREST),(k*128,stage*210+12))
 board.convert('RGB').save(OUT/'damage-review.png');print('Packed damage art',flush=True)
if __name__=='__main__':
 import sys
 if 'pack' in sys.argv:pack()
 else:
  with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda x:generate(*x),[(n,s) for n in ['wall-0','wall-1','wall-2','wall-3','crate'] for s in [1,2]]))
