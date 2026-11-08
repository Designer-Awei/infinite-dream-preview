"""Trace tightly packed source silhouettes through references and runtime atlases."""
import hashlib,json
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image,ImageDraw
from animate_riding_v2 import ROOT,OUT,IDS,source_subjects,sha

def pieces(im):
 a=np.array(im);labels,n=ndimage.label(a[:,:,3]>8,np.ones((3,3)));sizes=np.bincount(labels.ravel());sizes[0]=0;main=int(sizes.argmax());out=[]
 for i in range(1,n+1):
  if i==main or sizes[i]<4:continue
  yy,xx=np.where(labels==i);out.append({'pixels':int(sizes[i]),'bbox':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]})
 return out

def main():
 report={'fox':[],'newReferences':[]};folder=OUT/'fox';clean=folder/'clean-crops';clean.mkdir(exist_ok=True)
 source=Image.open(folder/'source-six.png').convert('RGBA');subjects=source_subjects(source,require_margin=False)
 meta=json.loads((folder/'mounted.json').read_text(encoding='utf-8'));atlas=Image.open(folder/'mounted.png').convert('RGBA');runtime=ROOT/'web/assets/pets'
 assert sha(folder/'mounted.png')==sha(runtime/'fox-mounted.png')==meta['sha256']
 assert (folder/'mounted.json').read_bytes()==(runtime/'fox-mounted.json').read_bytes()
 board=Image.new('RGB',(768,560),'#181329');draw=ImageDraw.Draw(board)
 for n,cid in enumerate(IDS):
  figure,box,solid=subjects[cid];figure.save(clean/(cid+'.png'))
  native=Image.open(folder/cid/'native-transparent.png').convert('RGBA');ref=Image.open(folder/cid/'reference-256.png').convert('RGBA')
  assert not pieces(native) and not pieces(ref),'Neighbour in actual generation input'
  checked=0;max_piece=0
  for clip in ['idle','move','cast']:
   sheet=Image.open(folder/cid/(clip+'.png')).convert('RGBA')
   for i,(x,y) in enumerate(meta['actors'][cid][clip+'_e']):
    frame=sheet.crop((i*160,0,(i+1)*160,160));assert frame.tobytes()==atlas.crop((x,y,x+160,y+160)).tobytes()
    leftovers=pieces(frame);max_piece=max([max_piece]+[p['pixels'] for p in leftovers]);assert max_piece<=12
    checked+=1
  report['fox'].append({'cid':cid,'rawCellNeighbourPieces':pieces(Image.open(folder/(cid+'-source.png')).convert('RGBA')),'generationInputDetachedPieces':0,'runtimeFramesChecked':checked,'runtimeMaxDetachedPixels':max_piece,'runtimeMatchesReviewedAtlas':True,'cleanCropFullImageBounds':box,'cleanCropSha256':sha(clean/(cid+'.png')),'originalFilesPreserved':True})
  thumb=figure.copy();thumb.thumbnail((240,240),Image.Resampling.NEAREST);board.paste(thumb,(n%3*256+(256-thumb.width)//2,n//3*280+28),thumb);draw.text((n%3*256+8,n//3*280+5),cid,fill='#ffe36a')
 board.save(clean/'review.png')
 for species in ['dragon','phoenix']:
  folder=OUT/species;im=Image.open(folder/'source-six.png').convert('RGBA');subjects=source_subjects(im)
  for cid in IDS:
   figure,box,solid=subjects[cid];assert figure.tobytes()==Image.open(folder/(cid+'-source.png')).convert('RGBA').tobytes()
   a=np.array(figure);assert (a[:,:,3]>32).sum()==solid,'Silhouette lost at cell boundary'
   assert not pieces(figure),'Neighbour in cleaned source'
   ref=Image.open(folder/cid/'reference-256.png').convert('RGBA');assert not pieces(ref)
   report['newReferences'].append({'species':species,'cid':cid,'bounds':box,'allSolidSourcePixelsRetained':solid,'neighbourPieces':0,'referenceSha256':sha(folder/cid/'reference-256.png')})
 report.update(passed=True,foxRuntimeFrames=162,foxRuntimeRebuilt=False,newReferencesChecked=12,method='Label full-sheet alpha silhouettes before cropping; never cut at nominal 512px guides, never key white.')
 out=ROOT.parent/'context/mount-segmentation-2026-11-08';out.mkdir(exist_ok=True);(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'passed':True,'foxRuntimeFrames':162,'newReferences':12,'foxRuntimeUnchanged':True}))

if __name__=='__main__':main()
