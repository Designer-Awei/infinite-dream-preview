"""Regression for white matte at loop endpoints; preserve source and motion frames."""
import io,json,subprocess
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
BASELINE='9ed07c9'
GIT=r'C:\Program Files\Git\cmd\git.exe'
folder=ROOT/'art/pets/riding-approved/fox'
def old(name):
 return subprocess.check_output([GIT,'show',BASELINE+':'+str(name.relative_to(ROOT)).replace('\\','/')],cwd=ROOT)
def rim_count(frame):
 a=np.array(frame);solid=a[:,:,3]>8;rim=solid&~ndimage.binary_erosion(solid,np.ones((3,3)))
 rgb=a[:,:,:3].astype(int);neutral=(rgb.min(2)>=215)&((rgb.max(2)-rgb.min(2))<=15)
 return int((neutral&rim).sum()),int((neutral&rim&(np.indices(solid.shape)[0]>110)).sum())

records=[];identical_middle=0;hair_gap_only=0
assert (folder/'source-six.png').read_bytes()==old(folder/'source-six.png')
for cid in ['deepseek','grok','claude','gpt','doubao','glm']:
 assert (folder/(cid+'-source.png')).read_bytes()==old(folder/(cid+'-source.png'))
 for clip in ['idle','move','cast']:
  p=folder/cid/(clip+'.png');before=Image.open(io.BytesIO(old(p))).convert('RGBA');after=Image.open(p).convert('RGBA')
  assert after.size==before.size==(1440,160)
  assert (folder/cid/(clip+'-256.png')).read_bytes()==old(folder/cid/(clip+'-256.png')),'Provider raw frame changed'
  for i in range(1,8):
   box=(i*160,0,(i+1)*160,160);a=np.array(after.crop(box));b=np.array(before.crop(box))
   changed=np.any(a!=b,axis=2)
   if not changed.any():identical_middle+=1
   else:
    assert cid=='deepseek','Other character motion changed'
    yy,xx=np.where(changed);assert xx.min()>=66 and xx.max()<=86 and yy.min()>=27 and yy.max()<=40,'Changes outside reviewed hair gap'
    assert (a[:,:,3][changed]==0).all(),'Correction repainted visible body'
    assert np.array_equal(a[27:55,87:99],b[27:55,87:99]),'White headband changed'
    hair_gap_only+=1
  first=after.crop((0,0,160,160));assert first.tobytes()==after.crop((1280,0,1440,160)).tobytes(),'Loop endpoint mismatch'
  oldrim,_=rim_count(before.crop((0,0,160,160)));newrim,feet=rim_count(first)
  assert oldrim>20,'Fixture must reproduce reported matte fringe'
  assert newrim<=20 and feet==0,'White outline/foot residue remains'
  records.append({'cid':cid,'clip':clip,'oldNeutralRim':oldrim,'newNeutralRim':newrim,'whiteFootRim':feet})
for clip,i,x,y in [('idle',1,79,35),('move',2,78,33),('cast',4,82,35)]:
 p=folder/'deepseek'/(clip+'.png');a=Image.open(p).convert('RGBA');b=Image.open(io.BytesIO(old(p))).convert('RGBA')
 assert b.getpixel((i*160+x,y))[3]>8,'Fixture must reproduce opaque hair gap'
 assert a.getpixel((i*160+x,y))[3]==0,'Hair gap must be transparent in '+clip
result={'baseline':BASELINE,'clips':18,'originalSourcesUnchanged':True,'providerRawUnchanged':True,'byteIdenticalMiddleFrames':identical_middle,'hairGapAlphaOnlyFrames':hair_gap_only,'headbandUnchanged':True,'hairGapSamples':3,'endpoints':records}
out=ROOT.parent/'context/pet-white-fringe-2026-11-07';out.mkdir(exist_ok=True)
(out/'alpha-regression.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'clips':18,'oldNeutralRimRange':[min(r['oldNeutralRim'] for r in records),max(r['oldNeutralRim'] for r in records)],'newNeutralRimMax':max(r['newNeutralRim'] for r in records),'byteIdenticalMiddleFrames':identical_middle,'hairGapAlphaOnlyFrames':hair_gap_only,'headbandUnchanged':True,'hairGapSamples':3,'allFootRimsZero':True,'originalSourcesUnchanged':True}))
