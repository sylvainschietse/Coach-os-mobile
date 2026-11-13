import json, re, unicodedata, collections
import os
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from regles import REGLES
from carte_base import CARTE
from resoudre import resoudre, par_code
r = json.load(open(RACINE + '/src/data/nutrition/recipes.json'))
n = lambda t: unicodedata.normalize('NFD', t.lower().replace('œ', 'oe')).encode('ascii', 'ignore').decode()
noms = {}
for y in r:
    for v in y['variants']:
        for i in v['ingredients']: noms.setdefault(i['foodKey'], i['foodName'])
res, sans = {}, []
for k, nom in noms.items():
    if k in CARTE: res[k] = resoudre(CARTE[k])['code']; continue
    x = n(nom)
    code = next((c for rx, c in REGLES if re.search(rx, x)), 'AUCUNE')
    if code == 'AUCUNE' or code is None: sans.append((k, nom)); continue
    if code not in par_code: print('CODE INCONNU', code, nom); continue
    res[k] = code
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'codes.json'), 'w'), ensure_ascii=False, indent=0)
print(len(res), 'associés,', len(sans), 'sans')
for k, nom in sans: print('  -', nom)
