# second pass: loop that starts and ends on a frame where she already holds the shovel. usage: anim2.py cid kind startframe.png
import pl, sys
from PIL import Image
cid, kind, start = sys.argv[1:4]
ACT = {
 'digside': 'side view, keeps holding the small golden shovel in both hands: lifts it up behind her shoulder, swings it down and forward to strike the wall in front of her, pulls it back to the start pose, one smooth seamless loop, the shovel never disappears',
 'digdown': 'side view, keeps holding the small golden shovel in both hands: lifts it up in front of her chest, stabs it straight down into the ground at her feet, bends a little, pulls it back up to the start pose, one smooth seamless loop, the shovel never disappears',
}
f = Image.open(start)
st, j = pl.post('/animate-with-text-v3', {'first_frame': pl.b64(f), 'last_frame': pl.b64(f), 'action': ACT[kind], 'frame_count': 8, 'no_background': True})
print(cid, kind, st, j.get('background_job_id') if isinstance(j, dict) else j, '' if st == 200 else str(j)[:300])
