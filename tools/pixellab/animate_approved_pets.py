"""Animate user-approved evolution sheets: body motion only, world skills stay in code."""
import argparse
import base64
import hashlib
import io
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/pets/approved-v1'
SOURCES = {
 'dragon': 'dragon-evolution.png',
 'fox': 'fox-evolution.png',
 'phoenix': 'phoenix-evolution.png',
}
NAMES = {'dragon':'赤焰火龙','fox':'霆尾灵狐','phoenix':'霜羽冰凰'}
IDLE = {
 'dragon': 'A seamless calm living IDLE LOOP of the SAME red dragon, in-place. Chest and abdomen gently expand and relax with visible breathing. The tail slowly sways left and right at its base and curls at the tip, its existing small tail flame softly flickers. Both wings gently flex and partially flap once, membrane folds bend naturally. A subtle head lift and blink. Keep every foot planted; preserve exact horns, red/gold scales, face, proportions and size. No walking, no rotation, no new accessories, no spell, no external particles. Return smoothly to the exact first pose.',
 'fox': 'A seamless calm living IDLE LOOP of the SAME ivory gold fox, in-place. Visible gentle chest breathing, soft ear twitch and one blink. Its existing tail or tails naturally sway in a slow flowing wave from base to tips, slightly staggered, without adding or losing any tails. Fur remains detailed and stable. Keep all paws planted, head mostly still. Preserve exact face, anatomy, white/gold/violet palette, silhouette, proportions and size. No walking, no turning, no lightning, no spell effects or particles. Return smoothly to the exact first pose.',
 'phoenix': 'A seamless living HOVER IDLE LOOP of the SAME white and cyan phoenix. The two wings make one smooth natural upstroke and downstroke with distinct feather articulation, restrained enough to fit the canvas. Chest breathes, body rises and falls slightly in response to the wingbeat, long feather tail follows with a flowing delayed sway. Beak and crest keep exact design. Preserve exact blue/white feathers, anatomy, scale and facing. No spinning, no shape transformation, no magic, no energy trails, no rings, no ice or particles. Smoothly return to the exact first pose.'
}
ACTIONS = {
 'dragon': ('The SAME red dragon performs one in-place firebreath CASTING animation. Keep its exact approved design, scale, colors, horns, wing count and canvas position. '
            'It lifts its head slightly, OPENS its jaws wide; a compact bright orange and golden FIRE ORB spins and swirls INSIDE the open mouth, throat glows faintly, wings brace and chest expands. '
            'Hold the jaws open with the tiny swirling orb visible, then close and recover to the original pose. '
            'ONLY animate the BODY and a small effect INSIDE its mouth. No outward fire breath, no beam, no projectile, no big sparks, no scene-wide effects or camera motion. Whole creature stays in frame.'),
 'fox': ('The SAME elegant ivory and golden fox performs one in-place lightning CASTING animation. Preserve its exact approved anatomy, colors, tail count, scale and position. '
         'It lowers its front slightly, raises its golden tail or tails, pricks its ears, eyes brighten, and tiny golden electrical sparks flicker ONLY at its ear tips and tail tips. '
         'Briefly hold the charged pose then smoothly return to the original pose. No lightning bolts leaving the body, no projectiles, no circles on the ground, no camera movement, no extra tails.'),
 'phoenix': ('The SAME white and icy-blue phoenix performs one in-place frost CASTING animation. Keep its approved feather shapes, beak, tail, color, scale and position. '
             'It opens its beak, arches its neck and raises its wings in a controlled small sweep, a tiny cyan frost glow forms ONLY at the beak and wing tips. '
             'Hold a poised spellcasting stance then recover to the exact starting pose. No blizzard, no falling snow across the frame, no expanding ring, no distant ice shards, no background, no camera movement.'),
}

def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')

def prepare(source_dir=None):
    (OUT/'sources').mkdir(parents=True, exist_ok=True)
    records = {'generation_size':[192,192], 'runtime_size':[96,96], 'anchor':[48,88], 'families':{}}
    mouth_y = {'dragon':[.48,.35,.38],'fox':[.43,.40,.36],'phoenix':[.35,.32,.32]}
    for family, source in SOURCES.items():
        original = ((source_dir or OUT/'sources')/source).read_bytes()
        dest = OUT/'sources'/f'{family}-evolution.png'
        dest.write_bytes(original)
        assert dest.read_bytes()==original
        im = Image.open(io.BytesIO(original)).convert('RGBA')
        a = np.asarray(im.getchannel('A'))
        xs = np.where((a>8).sum(axis=0)>1)[0]
        spans=[]
        for x in xs:
            if spans and x-spans[-1][1]<15:spans[-1][1]=int(x)
            else:spans.append([int(x),int(x)])
        assert len(spans)==3,(family,spans)
        crops=[]
        for left,right in spans:
            part=im.crop((left,0,right+1,im.height))
            # Alpha=1 speckles far from the body must not determine scale or emitters.
            # Originals stay byte-identical; only derived crops are cleaned.
            pixels=np.array(part);pixels[pixels[:,:,3]<=8]=0;part=Image.fromarray(pixels)
            bb=part.getbbox();crops.append((part.crop(bb),(left+bb[0],bb[1],left+bb[2],bb[3])))
        ratio = 160/max(max(c.size) for c,_ in crops)
        stages=[]
        for stage,(crop,source_box) in enumerate(crops,1):
            folder=OUT/f'{family}-{stage}';folder.mkdir(exist_ok=True)
            crop.save(folder/'source-crop.png')
            w,h=[max(1,round(v*ratio)) for v in crop.size]
            resized=crop.resize((w,h),Image.Resampling.NEAREST)
            x=(192-w)//2;y=176-h
            ref=Image.new('RGBA',(192,192));ref.paste(resized,(x,y))
            ref.save(folder/'reference-192.png')
            ref.resize((96,96),Image.Resampling.NEAREST).save(folder/'base.png')
            mouth=[round((x+w*.94)/2,1),round((y+h*mouth_y[family][stage-1])/2,1)]
            stages.append({'id':f'{family}-{stage}','stage':stage,'source_box':source_box,'scale_from_source':ratio,'body_size':[w,h],'mouth':mouth,'file':f'{family}-{stage}/base.png'})
        records['families'][family]={'name':NAMES[family],'source':f'sources/{family}-evolution.png','source_sha256':hashlib.sha256(original).hexdigest(),'stages':stages}
    dump(OUT/'sources.json',records)
    print('prepared 3 original sheets, 9 extracted stages, 192px generation and 96px runtime references',flush=True)

def animate(item,clip='cast'):
    family,stage=item;pid=f'{family}-{stage}';folder=OUT/pid;target=folder/f'{clip}.png';state=folder/f'{clip}-job.json'
    if target.exists():print('reuse',pid,clip,flush=True);return
    key=Path(os.environ['PIXELLAB_KEY_FILE']).read_text(encoding='utf-8-sig').strip()
    headers={'Authorization':'Bearer '+key}
    def call(method,route,body=None):
        r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers=headers,json=body,timeout=180)
        if not r.ok:raise RuntimeError(f'PixelLab {pid}: HTTP {r.status_code}')
        return r.json()
    if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
    else:
        reference=folder/'reference-192.png'; factor=1
        # Tight inputs stop small juvenile silhouettes inviting giant scene effects.
        if clip=='idle' or pid in ['dragon-1','phoenix-1','phoenix-2']:
            crop=Image.open(folder/'source-crop.png').convert('RGBA')
            extent=144 if family=='phoenix' and clip=='idle' else 160
            w,h=[round(v*extent/max(crop.size)) for v in crop.size]
            ref_im=Image.new('RGBA',(192,192));ref_im.paste(crop.resize((w,h),Image.Resampling.NEAREST),((192-w)//2,176-h))
            reference=folder/f'{clip}-reference-192.png';ref_im.save(reference)
            bbox=Image.open(folder/'reference-192.png').getbbox();factor=max(bbox[2]-bbox[0],bbox[3]-bbox[1])/extent
        action=ACTIONS[family]
        if pid=='dragon-1':action='The exact same red baby dragon, stationary in-place. Only animate a natural small jaw opening, throat puff and wing bracing, hold the mouth OPEN, then close and recover. Preserve silhouette, red and gold colors, proportions, scale and feet position. BODY MOTION ONLY. No fire, no smoke, no orb, no energy, no projectile, no external visual effects, no camera movement. No growth, no transformation.'
        if pid in ['phoenix-1','phoenix-2']:action='The exact same icy white and blue phoenix makes a natural small in-place wing beat and opens its beak in a spellcasting pose, holds wings lifted, then returns. Preserve feather shapes, color, scale, anatomy and position. ONLY BODY ANIMATION. Absolutely no magic effects, no trails, no circles, no energy rings, no ice, no snow, no glow or particles. No camera motion. Full bird stays in frame.'
        if pid=='phoenix-1':action='The exact same small blue and white bird, SIDE VIEW, looking RIGHT for every frame. A restrained body-only action: the beak opens for a short call, neck stretches slightly forward, chest puffs gently and wings gently flex without changing orientation, then returns. Head remains at the same height and the bird NEVER rotates, rolls, spins, loops, flips or somersaults. Keep the approved beak, eye, wing and tail feather shapes. Absolutely no effects, trails, circles, rings, particles, glow or magic. Fixed camera and fixed size. The bird stays completely visible.'
        if clip=='idle':action=IDLE[family]
        ref={'type':'base64','base64':base64.b64encode(reference.read_bytes()).decode()}
        body={'first_frame':ref,'last_frame':ref,'action':action,'frame_count':12 if clip=='idle' else 8,'no_background':True,'seed':6111700+(1000 if clip=='idle' else 0)+list(SOURCES).index(family)*10+stage}
        response=call('POST','/animate-with-text-v3',body)
        record={'provider':'PixelLab','endpoint':'/v2/animate-with-text-v3','job':response['background_job_id'],'reference':reference.name,'canonical_reference_sha256':hashlib.sha256((folder/'reference-192.png').read_bytes()).hexdigest(),'canonical_scale':factor,'request':{k:v for k,v in body.items() if k not in ['first_frame','last_frame']}}
        dump(state,record);print('submitted',clip,pid,record['job'],flush=True)
    deadline=time.monotonic()+1200
    while time.monotonic()<deadline:
        job=call('GET','/background-jobs/'+record['job'])
        if job.get('status')=='failed':raise RuntimeError(f'PixelLab {pid}: failed job')
        if job.get('status')=='completed':break
        time.sleep(6)
    else:raise TimeoutError(f'{pid}: resume existing job, do not resubmit')
    result=job.get('last_response') or job
    frames=[]
    for raw in result['images']:
        b64=raw.get('base64') if isinstance(raw,dict) else raw
        frames.append(Image.open(io.BytesIO(base64.b64decode(b64.split(',')[-1]))).convert('RGBA'))
    assert len(frames) in ([12,13] if clip=='idle' else [8,9]) and all(f.size==(192,192) for f in frames),(pid,len(frames))
    sheet=Image.new('RGBA',(96*len(frames),96));raw_sheet=Image.new('RGBA',(192*len(frames),192))
    for i,frame in enumerate(frames):
        factor=record.get('canonical_scale',1)
        if factor!=1:
            size=round(192*factor);small=frame.resize((size,size),Image.Resampling.NEAREST)
            normalized=Image.new('RGBA',(192,192));normalized.paste(small,((192-size)//2,176-round(176*factor)));frame=normalized
        pixels=np.array(frame);pixels[pixels[:,:,3]<=8]=0;frame=Image.fromarray(pixels)
        if i in [0,len(frames)-1]:frame=Image.open(folder/'reference-192.png').convert('RGBA')
        raw_sheet.paste(frame,(i*192,0));sheet.paste(frame.resize((96,96),Image.Resampling.NEAREST),(i*96,0))
    sheet.save(target);raw_sheet.save(folder/f'{clip}-192.png')
    dump(folder/f'{clip}-result.json',{'frame_count':len(frames),'job':record['job'],'usage':result.get('usage'),'canonical_reference_sha256':record.get('canonical_reference_sha256'),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'w':96,'h':96,'fps':6 if clip=='idle' else 8})
    print('ready',clip,pid,len(frames),flush=True)

def pack():
    refs=json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
    ids=[s['id'] for f in refs['families'].values() for s in f['stages']]
    counts={(pid,clip):json.loads((OUT/pid/f'{clip}-result.json').read_text(encoding='utf-8'))['frame_count'] for pid in ids for clip in ['idle','cast']}
    atlas=Image.new('RGBA',(96*max(counts.values()),96*len(ids)*3))
    meta={'cw':96,'ch':96,'k':1,'fps':8,'frames':{},'clips':{},'actors':{},'world_fx_included':False}
    for row,pid in enumerate(ids):
        y=row*96*3
        atlas.paste(Image.open(OUT/pid/'base.png'),(0,y))
        family,stage=pid.split('-');ref=refs['families'][family]['stages'][int(stage)-1]
        meta['frames'][pid]={'side':[0,y,96,96]}
        meta['clips'][pid]={}
        for offset,clip in enumerate(['idle','cast'],1):
            atlas.paste(Image.open(OUT/pid/f'{clip}.png'),(0,y+offset*96))
            meta['clips'][pid][clip+'_e']=[[i*96,y+offset*96] for i in range(counts[(pid,clip)])]
        meta['actors'][pid]={'family':family,'stage':int(stage),'name':NAMES[family],'anchor':[48,88],'mouth':ref['mouth'],'cast_release_frame':3,'cast_hold_frames':[3,5],'idle_fps':6}
    atlas.save(OUT/'pets.png');meta['sha256']=hashlib.sha256((OUT/'pets.png').read_bytes()).hexdigest();dump(OUT/'pets.json',meta)
    print('packed approved pet idle/cast clips',len(ids)*2,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','animate','pack']);p.add_argument('--adult-only',action='store_true');p.add_argument('--source-dir',type=Path);p.add_argument('--only',nargs='+');p.add_argument('--clip',choices=['idle','cast'],default='cast');args=p.parse_args()
    if args.mode=='prepare':prepare(args.source_dir)
    elif args.mode=='pack':pack()
    else:
        items=[(f,s) for s in ([3] if args.adult_only else [3,1,2]) for f in SOURCES]
        if args.only:items=[x for x in items if f'{x[0]}-{x[1]}' in args.only]
        with ThreadPoolExecutor(max_workers=3) as pool:
            jobs=[pool.submit(animate,x,args.clip) for x in items]
            for job in as_completed(jobs):job.result()
