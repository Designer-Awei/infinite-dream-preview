"""Pack the user-approved full flight loop; clear only recorded feather-gap residue."""
import hashlib,json,math
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'art/pets/riding-v3/phoenix/gpt'
SOURCE=FOLDER/'idle-smooth-r6.png'
WEB=ROOT/'web/assets/pets'
EVIDENCE=ROOT.parent/'context/phoenix-occlusion-2026-11-09'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')

def finalize():
 EVIDENCE.mkdir(parents=True,exist_ok=True)
 source=Image.open(SOURCE).convert('RGBA');reference=Image.open(FOLDER/'reference-256.png').convert('RGBA')
 assert source.size==(3328,256)
 frames=[];changes=[]
 for i in range(13):
  original=source.crop((i*256,0,(i+1)*256,256));a=np.array(original);before=a.copy()
  if i in range(1,12):
   # The reported grey/pink residue is below the feather vanes, not white feather highlights.
   r,g,b=[a[:,:,j].astype(int) for j in range(3)]
   mask=(a[:,:,3]>8)&(r>g+6)&(b>g+6)&(r>55)&(g>50)&((np.maximum(np.maximum(r,g),b)-np.minimum(np.minimum(r,g),b))<80)
   roi=np.zeros((256,256),bool);roi[193:245,160:220]=True;mask &=roi
   yy,xx=np.where(mask);a[mask]=0
   if len(xx):changes.append({'frame':i,'count':len(xx),'pixels':[[int(x),int(y)] for x,y in zip(xx,yy)]})
   assert np.array_equal(a[~mask],before[~mask])
  else:assert original.tobytes()==reference.tobytes()
  frames.append(Image.fromarray(a))
 sheet=Image.new('RGBA',(3328,256))
 for i,f in enumerate(frames):sheet.paste(f,(i*256,0))
 sheet.save(FOLDER/'accepted-flight.png')
 record={'source_file':SOURCE.name,'source_sha256':sha(SOURCE),'raw_file':'idle-smooth-r6-raw.png','raw_sha256':sha(FOLDER/'idle-smooth-r6-raw.png'),'job_file':'idle-smooth-r6-job.json','approved':'User accepted r6 idle frame board; requested feather-gap cleanup at frame 6.','cleanup_roi':[160,193,220,245],'changes':changes,'frames':13,'shared_flight_cycle':True,'sha256':sha(FOLDER/'accepted-flight.png')}
 dump(FOLDER/'accepted-flight.json',record)
 # Repack the existing runtime atlas; every other rider stays pixel-for-pixel unchanged.
 baseline=EVIDENCE/'runtime-before'
 baseline.mkdir(exist_ok=True)
 for ext in ['png','json']:
  saved=baseline/('phoenix-mounted.'+ext)
  if not saved.exists():saved.write_bytes((WEB/('phoenix-mounted.'+ext)).read_bytes())
 meta=json.loads((baseline/'phoenix-mounted.json').read_text(encoding='utf-8'))
 old=Image.open(baseline/'phoenix-mounted.png').convert('RGBA');tiles=[];actors=meta['actors']
 def slot(frame):
  index=len(tiles);tiles.append(frame);return[(index%12)*256,(index//12)*256]
 for cid,actor in actors.items():
  if cid=='gpt':continue
  for clip in ['idle_e','move_e','cast_e']:
   actor[clip]=[slot(old.crop((x,y,x+256,y+256))) for x,y in actor[clip]]
 actor=actors['gpt'];coords=[slot(f) for f in frames]
 box=reference.getbbox();h=box[3]-box[1];mouth=[]
 for f in frames:
  a=np.array(f);mask=a[:,:,3]>128;mask[:box[1]+int(h*.25)]=False;mask[box[1]+int(h*.61):]=False;mask[:,:184]=False;yy,xx=np.where(mask);right=int(xx.max()) if len(xx) else 230;tip=yy[xx>=right-2];mouth.append([right-3,int(np.median(tip)) if len(tip) else 104])
 for clip in ['idle_e','move_e','cast_e']:actor[clip]=coords;actor['mouth_frames'][clip]=mouth
 actor.update(shared_flight_cycle=True,top=box[1],center=[(box[0]+box[2])/2,(box[1]+box[3])/2],mouth=mouth[0])
 atlas=Image.new('RGBA',(3072,math.ceil(len(tiles)/12)*256))
 for i,f in enumerate(tiles):atlas.paste(f,((i%12)*256,(i//12)*256))
 atlas.save(WEB/'phoenix-mounted.png',optimize=True)
 meta['sha256']=sha(WEB/'phoenix-mounted.png');meta['overrides']={'gpt':{'source':'riding-v3/phoenix/gpt/accepted-flight.json','source_sha256':record['sha256'],'shared_flight_cycle':True}}
 dump(WEB/'phoenix-mounted.json',meta)
 # Human-readable alpha review and lossless animation, same original frame ordering.
 board=Image.new('RGBA',(1024,832),'#202632');d=ImageDraw.Draw(board)
 previews=[]
 for i,f in enumerate(frames[:12]):
  x=(i%4)*256;y=(i//4)*276;board.alpha_composite(f,(x,y+18));d.text((x+6,y+3),str(i),fill='white')
  bg=Image.new('RGBA',(384,300),'#202632');bg.alpha_composite(f,(64,26));previews.append(bg.convert('RGB'))
 board.save(EVIDENCE/'accepted-flight-review.png')
 previews[0].save(FOLDER/'accepted-flight-preview.png',save_all=True,append_images=previews[1:],duration=111,loop=0,disposal=0,blend=0)
 dump(EVIDENCE/'cleanup-and-pack.json',{'changes':changes,'runtime_tiles':len(tiles),'size':atlas.size,'other_rider_pixels_preserved':True,'no_unused_old_gpt_tiles':True})
 print('Accepted flight:',[(c['frame'],c['count']) for c in changes],len(tiles),'unique runtime tiles')

if __name__=='__main__':finalize()
