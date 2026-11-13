import json, sys, unicodedata, re
import os
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
C = json.load(open(RACINE + '/src/data/nutrition/ciqual.json'))['foods']
n = lambda t: unicodedata.normalize('NFD', t.lower().replace('œ', 'oe')).encode('ascii', 'ignore').decode().strip()
for t in sys.argv[1:]:
    r = [f"{c['code']}:{c['name']}" for c in C if all(w in n(c['name']) for w in n(t).split('+')) and c['kcal'] is not None]
    r.sort(key=lambda s: (not n(s.split(':',1)[1]).startswith(n(t).split('+')[0]), len(s)))
    print(f"[{t}] " + ' ; '.join(r[:8]))
