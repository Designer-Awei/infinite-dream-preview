"""True-colour, integer-scale review of all six approved final fox riders."""
from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
folder=ROOT/'art/pets/riding-approved/fox'
meta=json.loads((folder/'mounted.json').read_text(encoding='utf-8'))
atlas=Image.open(folder/'mounted.png').convert('RGBA')
font=ImageFont.truetype(str(ROOT.parent/'.cache/Cubic_11.ttf'),22)
names={'deepseek':'大肥鱼','grok':'格洛克','claude':'克劳德','gpt':'吉普缇','doubao':'奶糖包','glm':'吉拉姆'}
frames=[];durations=[]
for clip,title,ms in [('idle','待机',167),('move','行走',100),('cast','施法',167)]:
 for i in range(8):
  board=Image.new('RGBA',(960,640),'#181329');d=ImageDraw.Draw(board)
  for n,(cid,name) in enumerate(names.items()):
   x,y=meta['actors'][cid][clip+'_e'][i]
   sprite=atlas.crop((x,y,x+160,y+160)).resize((320,320),Image.Resampling.NEAREST)
   board.alpha_composite(sprite,(n%3*320,n//3*320))
   d.text((n%3*320+12,n//3*320+10),name+' · '+title,font=font,fill='#ffe36a')
  frames.append(board);durations.append(ms)
frames[0].save(folder/'mounted-preview.png',save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=0,blend=0)
print('Built true-colour 6-rider idle/walk/cast APNG, 24 frames')
