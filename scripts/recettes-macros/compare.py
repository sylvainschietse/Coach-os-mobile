import json, collections
from calcul import RECETTES, grammes, P, PIECE, code_de, par_code, poids_piece
from source import lire
CM = {'cucumber': 12, 'ginger': 5}
def g_source(i, rendement):
    x = lire(i.get('original') or '')
    if not x: return None
    q, u = x; p = P.get(i['foodKey'], {})
    if u in ('g', 'ml'): g = q
    elif u == 'tbsp' and 'protein powder' in i['original']: g = q * 8
    elif u == 'tbsp': g = q * (p.get('tbsp') or 15)
    elif u == 'tsp': g = q * (p.get('tbsp') or 15) / 3
    elif u == 'cup': g = q * 240
    elif u == 'cm':
        w = CM.get(i['foodKey'])
        if not w: return None
        g = q * w
    elif u == 'piece':
        w = 120 if 'fillet' in i['original'].lower() and 'salmon' in i['original'].lower() else p.get('piece') or PIECE.get(i['foodKey']) or poids_piece(i)
        if not w: return None
        g = q * w
    return g / rendement
if __name__ == '__main__':
    c = collections.Counter(); ex = []
    for y in RECETTES:
        for v in y['variants']:
            for i in v['ingredients']:
                a, b = grammes(i), g_source(i, y['yield'])
                if a is None and b is None: c['aucun'] += 1
                elif a is None: c['source seul'] += 1
                elif b is None: c['export seul'] += 1
                else:
                    ratio = a / b if b else 99
                    k = 'accord' if 0.67 < ratio < 1.5 else 'désaccord'
                    c[k] += 1
                    if k == 'désaccord' and v['id'] == 'original': ex.append((round(ratio, 2), y['name'], y['yield'], i['original'], i['amount'], i['amountUnit'], round(a), round(b)))
    print(c)
    ex.sort()
    for e in ex[:25] + ex[-25:]: print(e)
    print(len(ex))
