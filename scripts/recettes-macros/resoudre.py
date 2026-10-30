import json, unicodedata, sys
import os
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
C = [c for c in json.load(open(RACINE + '/src/data/nutrition/ciqual.json'))['foods'] if c['kcal'] is not None]
n = lambda t: unicodedata.normalize('NFD', t.lower().replace('œ', 'oe')).encode('ascii', 'ignore').decode().strip()
par_nom = {n(c['name']): c for c in C}; par_code = {c['code']: c for c in C}
def resoudre(v):
    for alt in v.split('|'):
        if alt in par_code: return par_code[alt]
        if n(alt) in par_nom: return par_nom[n(alt)]
    for alt in v.split('|'):  # préfixe
        x = [c for k, c in par_nom.items() if k.startswith(n(alt))]
        if x: return min(x, key=lambda c: len(c['name']))
    return None
if __name__ == '__main__':
    mod = __import__(sys.argv[1])
    for k, v in mod.CARTE.items():
        c = resoudre(v)
        if not c: print('MANQUE', k, '|', v)
