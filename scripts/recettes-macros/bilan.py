import json, statistics
from calcul import RECETTES, grammes, code_de, par_code
from compare import g_source
import re
# Les conserves sont données au poids de la boîte ; Ciqual donne les valeurs du produit égoutté (environ 60 % de la boîte, 70 % pour le thon et le maïs).
def egoutte(i, c):
    o = (i.get('original') or '').lower()
    if not c or c not in par_code or 'égoutté' not in par_code[c]['name'] or 'drained weight' in o: return 1
    if not re.search(r'\b(cans?|tins?|jars?)\b', o) or i['amountUnit'] == 'boîte': return 1
    if c.startswith('20') and 'tomat' in par_code[c]['name'].lower() or re.search(r'chilli sauce|refried|liquid reserved', o): return 1
    return 0.7 if c in ('26039', '20066') else 0.6
def gr(i, y):
    b = g_source(i, y['yield'])
    g = b if b is not None else grammes(i)
    return None if g is None else g * egoutte(i, code_de(i))
def total(y, v):
    t = {'kcal': 0, 'p': 0, 'c': 0, 'f': 0}; manque = []
    for i in v['ingredients']:
        c, g = code_de(i), gr(i, y)
        if c is None or g is None:
            if i['amountUnit'] != 'selon goût': manque.append(i['label'])
            continue
        f = par_code[c]
        for k, kk in [('kcal', 'kcal'), ('p', 'protein'), ('c', 'carbs'), ('f', 'fat')]: t[k] += (f[kk] or 0) * g / 100
    return t, manque
if __name__ == '__main__':
    L = []
    for y in RECETTES:
        for v in y['variants']:
            t, m = total(y, v); pub = v['macros']
            L.append(((t['kcal'] - pub['kcal']) / max(pub['kcal'], 1), y['name'], v['id'], round(t['kcal']), pub['kcal'], round(t['p'], 1), pub['protein'], m))
    e = [abs(l[0]) for l in L]
    print(len(L), 'médiane', round(statistics.median(e) * 100), '% ; <15 %:', sum(x < .15 for x in e), '; 15-30:', sum(.15 <= x < .3 for x in e), '; >30 %:', sum(x >= .3 for x in e))
    L.sort()
    for l in L[:20] + L[-20:]: print(f"{l[0]*100:+.0f}% {l[1]} / {l[2]} : {l[3]} vs {l[4]} kcal, P {l[5]} vs {l[6]} ; manque {l[7][:3]}")
