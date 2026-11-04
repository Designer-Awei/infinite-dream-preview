# Submit animate-with-text-v3 jobs with at most 8 running, poll, save frames. tasks: json list of
# {"out": dir, "name": prefix, "first": png, "action": str, "job": optional existing id}
import pl, json, sys, time, os
from PIL import Image
tasks = json.load(open(sys.argv[1]))
run = {}
t0 = time.time()
def submit(t):
    f = Image.open(t['first'])
    body = {'first_frame': pl.b64(f), 'last_frame': pl.b64(f), 'action': t['action'], 'frame_count': 8, 'no_background': True}
    st, j = pl.post('/animate-with-text-v3', body)
    if st == 200: return j['background_job_id']
    if st != 429: print('submit error', t['name'], st, str(j)[:200], flush=True); t['dead'] = True
    return None
todo = [t for t in tasks]
while (todo or run) and time.time() - t0 < 3600:
    for t in list(todo):
        if len(run) >= 8: break
        jid = t.get('job') or submit(t)
        if t.get('dead'): todo.remove(t); continue
        if not jid: break
        run[jid] = t; todo.remove(t)
    for jid, t in list(run.items()):
        j = pl.get('/background-jobs/' + jid)
        if j.get('status') in ('completed', 'failed'):
            lr = j.get('last_response') or {}
            imgs = lr.get('images') or []
            os.makedirs(t['out'], exist_ok=True)
            for n, im in enumerate(imgs): pl.img(im).save(f"{t['out']}/{t['name']}_{n}.png")
            print(t['name'], t['out'], j['status'], len(imgs), str(lr.get('detail', ''))[:150], round(time.time() - t0), flush=True)
            del run[jid]
            if j['status'] == 'failed' and not t.get('retried'): t['retried'] = True; t.pop('job', None); todo.append(t)
    time.sleep(8)
print('DONE left', len(todo), len(run), 'bal', pl.balance(), flush=True)
