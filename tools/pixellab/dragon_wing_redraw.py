"""Redraw complete temporal clips with the approved adult dragon prompts.

Do not split interleaved phases or crop the downstroke into a fixed wing ROI.
Candidates stay ignored until the full cycle and diagonal gait pass review.
"""
import argparse,json
from concurrent.futures import ThreadPoolExecutor
import dragon_growth as growth

def generate(clip,revision):
 library=json.loads((growth.ROOT/'docs/references/pet-animation-recipes.json').read_text())
 recipe=next(r for r in library['recipes'] if r['id']==f'follow/dragon-3/{clip}')
 growth.PROMPTS[clip]=library['prompts'][recipe['prompt_id']]
 growth.COMMON=''
 growth.generate(clip,revision)
 path=growth.OUT/f'{clip}-r{revision}-job.json';record=json.loads(path.read_text())
 record['wing_reference']={'recipe_id':recipe['id'],'prompt_id':recipe['prompt_id'],'role':'exact approved adult prompt; juvenile reference supplied to API'}
 growth.dump(path,record)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--revisions',type=int,nargs='+',default=[9,10]);a=p.parse_args()
 with ThreadPoolExecutor(max_workers=4) as pool:
  list(pool.map(lambda pair:generate(*pair),[(clip,r) for clip in ['idle','move'] for r in a.revisions]))
