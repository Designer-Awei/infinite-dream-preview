# animate-with-text-v3 on our strict pixel frames. usage: anim.py cid kind dir [extra-seed]
import pl, sys, json
from PIL import Image, ImageOps
cid, kind, d = sys.argv[1:4]
V = {'s': 'front', 'n': 'back', 'e': 'side'}
f = Image.open(f'/home/claude/work/sprites/pix/{V[d]}_{cid}.png')
ACT = {
 'run': {'s': 'running toward the viewer, legs stepping alternately, arms swinging, hair and skirt bouncing, running cycle in place, seamless loop',
         'n': 'running away from the viewer, seen from behind, legs stepping alternately, arms swinging, hair bouncing, running cycle in place, seamless loop',
         'e': 'running to the right, side view, legs striding alternately, arms swinging, hair streaming back and bouncing, running cycle in place, seamless loop'},
 'dig': {'e': 'holding a small golden shovel in both hands and digging the ground in front of her: raises the shovel, strikes it down and forward, pulls it back, seamless loop',
         's': 'holding a small golden shovel in both hands and digging straight down at her feet: lifts the shovel, stabs it down into the ground, pulls it up, seamless loop'},
}
body = {'first_frame': pl.b64(f), 'last_frame': pl.b64(f), 'action': ACT[kind][d], 'frame_count': 8, 'no_background': True}
if len(sys.argv) > 4: body['seed'] = int(sys.argv[4])
st, j = pl.post('/animate-with-text-v3', body)
print(cid, kind, d, st, j.get('background_job_id') if isinstance(j, dict) else j, str(j)[:200] if st != 200 else '')
