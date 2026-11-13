import json, collections
import os
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
B=RACINE + '/src/data/nutrition/'
f=json.load(open(B+'recipeFoods.json')); P=f['products']
r=json.load(open(B+'recipes.json'))
def grammes(i):
    u, a, p = i['amountUnit'], i['amount'], P[i['foodKey']]
    if a is None: return None
    if u == 'g': return a
    if u == 'ml': return a  # densité ≈ 1
    if u == 'c. à soupe': return a * (p.get('tbsp') or 15)
    if u == 'c. à café': return a * (p.get('tbsp') or 15) / 3
    if u == 'tasse (240 ml)': return a * 240
    if u == 'pièce': return a * p['piece'] if p.get('piece') else (a * p['size'] if p.get('unit') == 'g' and p.get('pack') == 'pièce' else None)
    if u == 'boîte': return a * (p.get('size') if p.get('unit') in ('g','ml') else 400)
    return None
if __name__ == '__main__':
    tot = collections.Counter(); manque = collections.Counter(); nom = {}
    for y in r:
        v = next(v for v in y['variants'] if v['id'] == 'original')
        for i in v['ingredients']:
            g = grammes(i); nom[i['foodKey']] = i['foodName']
            if g is None: manque[(i['foodKey'], i['amountUnit'])] += 1
            else: tot[i['foodKey']] += g / y['yield']
    print('sans poids', sum(manque.values()), manque.most_common(40))
    json.dump([[k, nom[k], round(g)] for k, g in tot.most_common()], open('cles.json', 'w'), ensure_ascii=False)
    print(len(tot))
