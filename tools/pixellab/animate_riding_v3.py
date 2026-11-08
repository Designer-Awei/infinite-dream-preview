"""Prepare versioned whole-rider inputs without colour-keying or cutting grid boundaries."""
import animate_riding_v2 as b
from PIL import Image
b.OUT=b.ROOT/'art/pets/riding-v3'
b.INPUTS={
 'dragon':str(b.ROOT.parent/'assets/characters/ai-girls/sheets/ai-girls-fire-dragon-ride-3x2-v15.png'),
 'phoenix':'C:/Users/19743/AppData/Local/Temp/codex-clipboard-5ac7c08d-0dde-4176-a050-6be7ebcd9d1a.png'}
for species,path in list(b.INPUTS.items()):
 from pathlib import Path
 if not Path(path).exists():b.INPUTS[species]=str(b.OUT/species/'source-six.png')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare']);p.add_argument('--species',choices=list(b.INPUTS),default='dragon');a=p.parse_args();b.prepare(a.species)
 for cid in b.IDS:
  fig=Image.open(b.OUT/a.species/(cid+'-source-clean.png')).convert('RGBA');k=424/max(fig.size);sz=tuple(round(v*k) for v in fig.size);ref=Image.new('RGBA',(512,512));ref.paste(fig.resize(sz,Image.Resampling.LANCZOS),((512-sz[0])//2,464-sz[1]));ref.save(b.OUT/a.species/cid/'reference-512.png')
