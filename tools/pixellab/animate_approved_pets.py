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
from normalize_pet_clips import normalize_frames

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/pets/approved-v1'
SOURCES = {
 'dragon': 'dragon-evolution.png',
 'fox': 'fox-evolution.png',
 'phoenix': 'phoenix-evolution.png',
}
NAMES = {'dragon':'赤焰火龙','fox':'霆尾灵狐','phoenix':'霜羽冰凰'}
IDLE = {
 'dragon': 'The SAME quadrupedal red dragon in a natural living idle LOOP. ALL FOUR CLAWED FEET remain planted on the ground, including BOTH FRONT PAWS; never lift front arms into a begging or bipedal pose. Clear chest and belly breathing. BOTH red wings perform a LARGE synchronized lift into a high V, then lower together to a wide horizontal spread, then return; strong readable wing motion with membrane folds, not a tiny twitch. Wings stay above the ground. Tail gently sways and existing tail flame flickers. A tiny head bob. Preserve exact face, horns, red/gold palette, scale and proportions. Full creature stays inside the canvas. No walking, no spin, no added effects. Return to the same four-foot standing pose.',
 'fox': 'The SAME ivory golden fox makes a living in-place idle LOOP. Show clearly VISIBLE CHEST AND BELLY BREATHING: ribcage expands, shoulders and hips gently rise and sink. Softly shift weight by bending the hind knees and flexing the foreleg joints; lift one front paw just a little, place it down, and settle, without walking away. Legs and torso MUST animate, not only tails. Existing tail or tails sway in staggered waves; blink and twitch an ear. Preserve exactly the approved face, tail count, ivory/gold/plum colors and anatomy. No new tails, no spinning or effects. Fixed position and size, smooth return to start.',
 'phoenix': 'The SAME icy blue and white phoenix makes a natural in-place flying idle LOOP. BOTH WINGS FLAP IN PERFECT SYNCHRONY: frame start BOTH wing tips HIGH ABOVE shoulders; middle BOTH wings sweep DOWN together BELOW shoulder level; end BOTH wings return UP together to the original high V. Both shoulders, elbows and feather tips share the same phase, like a real bird. NEVER a seesaw, NEVER one wing up while the other is down, NEVER alternating left and right. Feather fans flex naturally, body gently rises/falls and long tail feathers follow with delayed sway. Keep body level facing RIGHT, exact crest/beak/feathers, colors and size. No roll, spin, flip, loops, rings, trails, magic or particles. Full wings fit canvas.'
}
MOVE = {
 'dragon':'The SAME red dragon performs a seamless four-legged WALK cycle IN PLACE facing right. All four limbs step naturally in a quadruped gait: alternating diagonal foot pairs, elbows and knees bend, front feet reach down and bear weight. Never rear up or hold both front paws in the air. Gentle shoulder/hip movement, wings partly open with a coordinated flap, tail counterbalances. Preserve design, horns, scale, red/gold palette. Fixed screen position, no sliding, no camera, no effects. Return to starting pose.',
 'fox':'The SAME ivory gold fox performs a graceful four-legged TROT cycle IN PLACE facing right. Clearly animate all four legs with alternating diagonal pairs, weight-bearing paws and small shoulder/hip rise and fall. Body moves naturally rather than frozen. Its existing tail count is exact, tails stream behind with delayed sways, ears alert. Preserve face, proportions, ivory/gold/plum colors and size. No translation, no spin, no effects, seamless loop to starting pose.',
 'phoenix':'A blue and white bird flies IN PLACE facing right. Both feathered wings flap DOWN TOGETHER then UP TOGETHER, in the same phase. Gentle body bob and natural tail feather sway. Preserve exact bird design, feather colors, size and position. ONLY physical bird movement. Empty space remains entirely empty: no magic, glow, lines, circles, rings, particles or trails. Seamlessly return to the starting pose.'
}
ACTIONS = {
 'dragon': ('The SAME red dragon performs one in-place firebreath CASTING animation. Keep its exact approved design, scale, colors, horns, wing count and canvas position. '
            'It lifts its head slightly, OPENS its jaws wide; a compact bright orange and golden FIRE ORB spins and swirls INSIDE the open mouth, throat glows faintly, wings brace and chest expands. '
            'Hold the jaws open with the tiny swirling orb visible, then close and recover to the original pose. '
            'ONLY animate the BODY and a small effect INSIDE its mouth. No outward fire breath, no beam, no projectile, no big sparks, no scene-wide effects or camera motion. Whole creature stays in frame.'),
 'fox': ('The SAME elegant ivory and golden fox performs a physical spellcasting gesture IN PLACE, with NO effects at all. Preserve exact anatomy, fur colors, tail count, scale and position. '
         'Its forelegs bend and shoulders lower into a grounded braced crouch, chest expands with an inhalation, head tilts forward, ears prick up; its existing tails lift in a coordinated natural wave. '
         'Hold the braced stance briefly, then extend the legs and recover smoothly. All movement is anatomically plausible BODY motion. Absolutely NO lightning, bolts, sparks, glow, stars, projectiles, symbols or lines anywhere. Do not generate any effect pixels, not even ear or tail sparkles. Fixed camera, same facing and proportions.'),
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
        for attempt in range(8 if method=='GET' else 1):
            try:
                r=requests.request(method,'https://api.pixellab.ai/v2'+route,headers=headers,json=body,timeout=180)
                if method=='GET' and r.status_code in [429,500,502,503,504] and attempt<7:
                    time.sleep(min(20,2**attempt));continue
                break
            except requests.RequestException:
                if method!='GET' or attempt==7:raise
                time.sleep(min(20,2**attempt))
        if not r.ok:raise RuntimeError(f'PixelLab {pid}/{clip}: HTTP {r.status_code}: {r.text[:600]}')
        return r.json()
    if state.exists():record=json.loads(state.read_text(encoding='utf-8'))
    else:
        canonical=Image.open(folder/'reference-192.png').convert('RGBA')
        crop=canonical.crop(canonical.getbbox());extent=120 if family=='phoenix' else 144
        w,h=[round(v*extent/max(crop.size)) for v in crop.size]
        ref_im=Image.new('RGBA',(256,256));ref_im.paste(crop.resize((w,h),Image.Resampling.NEAREST),((256-w)//2,224-h))
        reference=folder/f'{clip}-reference-256.png';ref_im.save(reference)
        bbox=canonical.getbbox();factor=max(bbox[2]-bbox[0],bbox[3]-bbox[1])/extent
        action=IDLE[family] if clip=='idle' else MOVE[family] if clip=='move' else ACTIONS[family]
        if clip=='cast' and family=='dragon':action+=' ALL FOUR FEET remain planted, especially both front paws. No rearing upright; wings flex together. The tiny mouth glow never grows beyond the muzzle.'
        if clip=='cast' and family=='fox':action+=' The ribcage, shoulders and leg joints visibly flex as it gathers power, not only the tails.'
        if clip=='cast' and family=='phoenix':action='The SAME ice phoenix performs one restrained casting gesture: neck extends forward and beak opens, BOTH wings lower TOGETHER and rise TOGETHER, always the SAME phase, never one wing up and the other down. Both visible wing tips highest together at start and end, lowest together in the middle. Body stays level and faces right. Preserve exact feather shapes, anatomy, size and colors. Only BODY motion and a tiny beak glow. No spin, flip, rings, trails, distant snow, blizzard or external effects. Full bird stays in frame.'
        if clip=='cast' and stage==2:
            action={
             'dragon':'A four-legged red dragon in place, right-facing: its chest expands with a breath, jaws OPEN WIDE and neck extends forwards; wings brace, four paws firmly grounded. Hold jaws open and return. ONLY the physical animal moves. Its scales and horns remain their original colors. Empty space stays completely empty. No magic, glow, sparks, rings, or other effect pixels. Same size, body design and camera.',
             'fox':'A gold and ivory fox in place, right-facing: smoothly bends its forelegs, lowers its chest into a braced crouch, ears prick up, head extends forward and tails sway. Hold, then straighten legs back to standing. ONLY natural body motion. Original tail count, fur colors, anatomy and size. Empty space stays completely empty. No magic, lightning, trails, sparks, rings, glowing lines or effects.',
             'phoenix':'A blue and white bird performs a slow physical wingbeat in place facing right. Both wings lower together, neck extends and beak opens, both wings lift together, then return to the starting pose. Preserve its feathers, anatomy, colors and body size. ONLY the physical bird moves. Empty space stays completely empty. No magic, glow, circles, rings, lines, particles, snow or effects.'
            }[family]
        if clip=='cast' and family=='dragon' and stage==3:
            action='The SAME four-legged red dragon prepares to breathe, facing RIGHT: all four paws remain grounded, chest expands, neck extends a little forward and jaws OPEN WIDE. Hold jaws open, then recover. Wings brace gently and tail balances. Preserve exact anatomy, horns, red scale colors, size and camera. ONLY physical body movement. Empty space stays empty. No fire orb, glow, particles, rings, beams or effects anywhere.'
        ref={'type':'base64','base64':base64.b64encode(reference.read_bytes()).decode()}
        body={'first_frame':ref,'last_frame':ref,'action':action,'frame_count':8,'no_background':True,'seed':8111700+({'idle':1000,'move':2000,'cast':0}[clip])+list(SOURCES).index(family)*10+stage}
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
    assert len(frames) in [8,9] and all(f.size==(256,256) for f in frames),(pid,len(frames))
    normalized=normalize_frames(pid,clip,frames,record)
    dump(folder/f'{clip}-result.json',{'frame_count':len(frames),'job':record['job'],'usage':result.get('usage'),'canonical_reference_sha256':record.get('canonical_reference_sha256'),**normalized,'fps':8 if clip=='cast' else 6 if family=='phoenix' or clip=='idle' else 10})
    print('ready',clip,pid,len(frames),flush=True)

def pack():
    refs=json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
    refs.update(generation_size=[256,256],pose_reference_size=[192,192],runtime_size=[128,128],anchor=[64,96]);dump(OUT/'sources.json',refs)
    ids=[s['id'] for f in refs['families'].values() for s in f['stages']]
    counts={(pid,clip):json.loads((OUT/pid/f'{clip}-result.json').read_text(encoding='utf-8'))['frame_count'] for pid in ids for clip in ['idle','move','cast']}
    atlas=Image.new('RGBA',(128*max(counts.values()),128*len(ids)*4))
    meta={'cw':128,'ch':128,'k':1,'fps':8,'frames':{},'clips':{},'actors':{},'world_fx_included':False}
    for row,pid in enumerate(ids):
        y=row*128*4
        atlas.paste(Image.open(OUT/pid/'base.png'),(0,y))
        family,stage=pid.split('-');ref=refs['families'][family]['stages'][int(stage)-1]
        meta['frames'][pid]={'side':[0,y,128,128]}
        meta['clips'][pid]={}
        for offset,clip in enumerate(['idle','move','cast'],1):
            atlas.paste(Image.open(OUT/pid/f'{clip}.png'),(0,y+offset*128))
            meta['clips'][pid][clip+'_e']=[[i*128,y+offset*128] for i in range(counts[(pid,clip)])]
        anchor_y=116 if pid=='dragon-3' else 96
        mouths={'dragon-1':[79,81],'dragon-2':[86,67],'dragon-3':[101,74],'fox-1':[81,74],'fox-2':[88,65],'fox-3':[101,56],'phoenix-1':[79,77],'phoenix-2':[85,68],'phoenix-3':[95,53]}
        meta['actors'][pid]={'family':family,'stage':int(stage),'name':NAMES[family],'anchor':[64,anchor_y],'mouth':mouths[pid],'cast_mouth':{'dragon-1':[80,80],'dragon-2':[91,66],'dragon-3':[105,73]}.get(pid,mouths[pid]),'cast_release_frame':2,'cast_hold_frames':[1,3] if pid=='dragon-1' else [3,5],'idle_fps':6}
    atlas.save(OUT/'pets.png');meta['sha256']=hashlib.sha256((OUT/'pets.png').read_bytes()).hexdigest();dump(OUT/'pets.json',meta)
    print('packed approved pet idle/move/cast clips',len(ids)*3,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','animate','pack']);p.add_argument('--adult-only',action='store_true');p.add_argument('--source-dir',type=Path);p.add_argument('--only',nargs='+');p.add_argument('--clip',choices=['idle','move','cast','all'],default='cast');args=p.parse_args()
    if args.mode=='prepare':prepare(args.source_dir)
    elif args.mode=='pack':pack()
    else:
        items=[(f,s) for s in ([3] if args.adult_only else [3,1,2]) for f in SOURCES]
        if args.only:items=[x for x in items if f'{x[0]}-{x[1]}' in args.only]
        with ThreadPoolExecutor(max_workers=3) as pool:
            jobs=[pool.submit(animate,x,clip) for stage in ([3] if args.adult_only else [3,1,2]) for clip in (['idle','move','cast'] if args.clip=='all' else [args.clip]) for x in items if x[1]==stage]
            for job in as_completed(jobs):job.result()
