import requests, base64, json, time, io, os, sys
from PIL import Image
KEY = os.environ.get('PIXELLAB_KEY') or open(os.environ['PIXELLAB_KEY_FILE']).read().strip()  # never commit the key
B = 'https://api.pixellab.ai/v2'
H = {'Authorization': f'Bearer {KEY}'}
LOG = os.environ.get('PIXELLAB_LOG', 'pixellab_calls.log')
def b64(img):
    buf = io.BytesIO(); img.save(buf, 'PNG'); return {'type': 'base64', 'base64': base64.b64encode(buf.getvalue()).decode()}
def img(o):
    s = o['base64'] if isinstance(o, dict) else o
    if s.startswith('data:'): s = s.split(',', 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(s))).convert('RGBA')
def balance():
    return requests.get(B + '/balance', headers=H, timeout=30).json()['subscription']['generations']
def post(path, body):
    b0 = balance()
    r = requests.post(B + path, headers=H, json=body, timeout=180)
    try: j = r.json()
    except Exception: j = {'text': r.text}
    with open(LOG, 'a') as f: f.write(json.dumps({'t': time.time(), 'path': path, 'status': r.status_code, 'bal0': b0, 'resp': {k: v for k, v in j.items() if k not in ('images', 'image', 'spritesheet')} if isinstance(j, dict) else str(j)[:300]}) + '\n')
    return r.status_code, j
def get(path):
    return requests.get(B + path, headers=H, timeout=60).json()
def job(jid, every=4, limit=900):
    t0 = time.time()
    while time.time() - t0 < limit:
        j = get(f'/background-jobs/{jid}')
        if j.get('status') in ('completed', 'failed'): return j
        time.sleep(every)
    return {'status': 'timeout'}
