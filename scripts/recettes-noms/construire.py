import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nettoyer import nettoyer, R
from corrections import GLOBAL, NOMS, poulet, fourchette
maj = lambda t: t[:1].upper() + t[1:] if t else t

def nouveau(label):
    s = nettoyer(label)
    s = poulet(s)
    if maj(s) in NOMS: return NOMS[maj(s)]
    for a, b in GLOBAL: s = re.sub(a, b, s)
    s = maj(s.strip())
    return NOMS.get(s, s)

carte = {}   # ancien nom -> nouveau nom
fourch = {}  # ancien nom -> unité lue dans la recette d'origine (fourchette)
for y in R:
    for v in y['variants']:
        for i in v['ingredients']:
            ancien = maj(i['label'].strip())
            n = nouveau(i['label'])
            if i['amountUnit'] == 'selon source':
                f = fourchette(i['original'])
                if f:
                    if 'gousses' in f: n = 'Ail écrasé'
                    if 'feuilles' in f: n = 'Basilic frais finement haché'
                    fourch[ancien] = f
            carte[ancien] = n
json.dump({'noms': {a: b for a, b in carte.items() if a != b}, 'fourchettes': fourch}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'carte.json'), 'w'), ensure_ascii=False, indent=0)
print(len(carte), 'noms', sum(a != b for a, b in carte.items()), 'changés', len(fourch), 'fourchettes', len(set(carte.values())), 'noms distincts après')
for a, f in fourch.items(): print(f'  {carte[a]} : {f}')
