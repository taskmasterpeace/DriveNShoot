"""Devlog 01 voice on Breeze (cupcake mk-gateway). Run ON cupcake (localhost needs no key):
    python3 breeze_voice.py [design|clone|all]
design: one narrator take at cfg 4.0 (design text + clarity term, fixed seed) -> narrator_ref.wav + .txt (the freeze).
clone : every script.tsv line cloned from that ref at cfg 1.0 (one voice, same seed) -> voNN.wav
The key comes from the environment only; nothing is written or printed."""
import json, os, sys, time, base64, urllib.request

GW = os.environ.get('GW', 'http://127.0.0.1:8700')  # run ON cupcake: localhost is the keyless 'local' tenant
KEY = os.environ.get('CUPCAKE_GATEWAY_KEY')
SEED = 707
DESIGN = ("Masculine, mature adult, American. Narrator for a game devlog. Warm, gravelly baritone, low and steady. "
          "Road-worn, dry, understated confidence, a storyteller at a campfire, a little grit. Measured pace, clear diction, "
          "calm authority, faint dry humour. Clear, full-bodied, close-mic studio quality.")
REF_TEXT = ("Divided States of America. A hundred years after the bombs, the roads still run, and the towns still hold. "
            "This is where the game stands, what we built overnight, and what comes next.")

def wait_free():
    for _ in range(360):
        try:
            h = json.load(urllib.request.urlopen(GW + '/v1/health', timeout=10))
            if not h.get('running') and not h.get('queue_depth'):
                return
        except Exception:
            pass
        time.sleep(10)
    sys.exit('gateway busy for an hour')

def post(path, body, out):
    for attempt in range(6):
        wait_free()
        req = urllib.request.Request(GW + path, data=json.dumps(body).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + KEY} if KEY else {})})
        try:
            data = urllib.request.urlopen(req, timeout=600).read()
            open(out, 'wb').write(data)
            return
        except urllib.error.HTTPError as e:
            if e.code == 409:
                time.sleep(15); continue
            sys.exit(f'{path}: HTTP {e.code} {e.read()[:300]!r}')
    sys.exit(f'{path}: still busy after retries')

def design():
    post('/v1/audio/breeze-design', {'text': REF_TEXT, 'design': DESIGN, 'cfg_scale': 4.0, 'seed': SEED}, 'narrator_ref.wav')
    open('narrator_ref.txt', 'w', encoding='utf-8', newline='\n').write(REF_TEXT)
    print('designed narrator_ref.wav', os.path.getsize('narrator_ref.wav'), 'bytes', flush=True)

def clone():
    ref = base64.b64encode(open('narrator_ref.wav', 'rb').read()).decode()
    ref_text = open('narrator_ref.txt', encoding='utf-8').read()
    rows = [l.rstrip('\n').split('\t') for l in open('script.tsv', encoding='utf-8') if l.strip()]
    for i, (_img, _label, text) in enumerate(rows):
        out = f'vo{i:02d}.wav'
        post('/v1/audio/breeze-clone', {'text': text, 'ref_audio_b64': ref, 'ref_text': ref_text, 'cfg_scale': 1.0, 'seed': SEED}, out)
        print('cloned', out, os.path.getsize(out), 'bytes', flush=True)

mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
if mode in ('design', 'all'): design()
if mode in ('clone', 'all'): clone()
