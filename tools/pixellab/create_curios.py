"""Generate distinct 32px curio icons with PixelLab. Secret comes only from PIXELLAB_KEY_FILE."""
import os,json,base64,io,hashlib,concurrent.futures
from pathlib import Path
import requests
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art'/'curios'; OUT=ROOT/'web'/'assets'/'curios'
ART.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip()
headers={'Authorization':'Bearer '+key}
TASKS={
 'grass_dew':'a round crystal dew drop in a tiny green leaf cup, blue transparent orb, round silhouette',
 'grass_seed':'a golden brown seed with two fresh green sprouts growing upward, asymmetric plant silhouette',
 'grass_lens':'a violet magic magnifying lens with a golden handle, circular glass and diagonal handle',
 'ice_flake':'a delicate six pointed icy blue snowflake, branching star silhouette',
 'ice_bell':'a pale silver hanging wind chime bell with blue ribbon and visible clapper, bell silhouette',
 'ice_crown':'a royal three-pointed ice crown with small sapphire jewels, wide crown silhouette',
 'lava_core':'a square bronze circuit processor core with orange glowing center and four pins on each side',
 'lava_fan':'a steel four-bladed cooling fan propeller with circular central hub, cross silhouette',
 'lava_gem':'a jagged black obsidian crystal cluster emerging from orange lava rock base, sharp asymmetric silhouette'}
def one(item):
 name,subject=item; dest=ART/(name+'.png');meta=ART/(name+'.json')
 if dest.exists(): return name
 body={'description':'One inventory collectible icon: '+subject+'. Cute crisp 16-bit dungeon pixel art, chunky dark purple outline, three tone shading, upper-left light, centered whole object with 3px transparent padding, no letters, no frame, no ground shadow.','image_size':{'width':32,'height':32},'no_background':True,'outline':'single color black outline','shading':'basic shading','detail':'low detail'}
 r=requests.post('https://api.pixellab.ai/v2/create-image-pixflux',headers=headers,json=body,timeout=180)
 if r.status_code!=200: raise RuntimeError(f'{name}: PixelLab HTTP {r.status_code}')
 data=r.json(); raw=data['image']['base64'].split(',')[-1];im=Image.open(io.BytesIO(base64.b64decode(raw))).convert('RGBA')
 if im.size!=(32,32):raise RuntimeError('Unexpected dimensions')
 im.save(dest);meta.write_text(json.dumps({'provider':'PixelLab','endpoint':'/v2/create-image-pixflux','request':body,'usage':data.get('usage')},ensure_ascii=False,indent=2),encoding='utf-8')
 print('generated',name,flush=True);return name
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(one,TASKS.items()))
manifest={}
for name in TASKS:
 im=Image.open(ART/(name+'.png'));im.save(OUT/(name+'.png'))
 manifest[name]={'file':name+'.png','w':32,'h':32,'n':1,'fps':0,'sha256':hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('DONE',len(manifest),flush=True)
