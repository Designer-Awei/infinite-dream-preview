# Hero front walk via PixelLab animate-with-skeleton-v3 (text prompts kept giving hops / crossed legs for front view).
# skeleton json: POST /estimate-skeleton on the 192px front base.
# Front walk for animate-with-skeleton-v3: knees lift straight up in turn, ankles stay under the hips (no crossing,
# no kicking out), arms swing opposite, a small bob. usage: skel_walk.py base.png skel.json out_prefix seed [desc]
import sys, json, copy, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import pl  # key via PIXELLAB_KEY_FILE
from PIL import Image
base, sk, pre, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
desc = sys.argv[5] if len(sys.argv) > 5 else 'chibi girl with long wavy platinum blonde twin tails tied with black ribbons, black short-sleeve dress with belt and pleated skirt, dark tights, black boots'
K0 = [{k: p[k] for k in ('x', 'y', 'label')} for p in json.load(open(sk))['keypoints']]
P = 1 / 192
UPPER = {'NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR', 'NECK', 'LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW', 'LEFT ARM', 'RIGHT ARM'}
# (lift of the right leg, lift of the left leg) in px; arms swing opposite to the lifted leg
CYC = [(0, 0), (4, 0), (7, 0), (3, 0), (0, 0), (0, 4), (0, 7), (0, 3)]
def pose(lr, ll):
    k = copy.deepcopy(K0)
    bob = -1 if max(lr, ll) >= 4 else 0
    for p in k:
        L = p['label']
        if L in UPPER: p['y'] += bob * P
        side = 'R' if L.startswith('RIGHT') else 'L' if L.startswith('LEFT') else None
        lift = lr if side == 'R' else ll
        if L.endswith('KNEE'): p['y'] -= lift * 0.6 * P
        if L.endswith('ANKLE') or L.endswith('LEG') or L.endswith('FOOT'): p['y'] -= lift * P
        if L.endswith('ARM'):  # wrist: the arm on the side of the lifted leg swings back (up a little), the other forward
            other = ll if side == 'R' else lr
            p['y'] += (other - lift) * 0.35 * P
    return k
frames = [pose(*c) for c in CYC]
body = {'description': desc, 'action': 'walk', 'view': 'low top-down', 'direction': 'south', 'first_frame': pl.b64(Image.open(base)),
        'first_frame_keypoints': K0, 'keypoints': frames, 'template_id': 'mannequin', 'seed': seed, 'no_background': True}
st, j = pl.post('/animate-with-skeleton-v3', body)
print(st, str(j)[:300], flush=True)
if st != 200: sys.exit(1)
jid = j['background_job_id']
for _ in range(80):
    time.sleep(10); r = pl.get('/background-jobs/' + jid)
    if r.get('status') in ('completed', 'failed'): break
lr = r.get('last_response') or {}
os.makedirs(os.path.dirname(pre) or '.', exist_ok=True)
for n, im in enumerate(lr.get('images') or []): pl.img(im).save(f'{pre}_{n}.png')
print(pre, r.get('status'), len(lr.get('images') or []), str(lr.get('detail', ''))[:200])
