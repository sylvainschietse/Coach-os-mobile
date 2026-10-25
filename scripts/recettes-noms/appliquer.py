# Applique la carte des noms aux copies locales (données d'import et démo), comme le fait le SQL en ligne.
import json, os, re
from nettoyer import RACINE
ICI = os.path.dirname(os.path.abspath(__file__))
c = json.load(open(os.path.join(ICI, 'carte.json')))

def nettoyer(liste):
    for e in liste:
        a = e.get('nom', '')
        if e.get('unite') == 'selon source' and a in c['fourchettes']: e['unite'] = c['fourchettes'][a]
        if re.search(r'facultatif|en option', a, re.I): e['facultatif'] = True
        if a in c['noms']: e['nom'] = c['noms'][a]
        if e.get('unite') == 'tasse (240 ml)' and 'quantite' in e: e['unite'], e['quantite'] = 'ml', round(e['quantite'] * 240)
    return liste

for f in ['supabase/donnees/recettes-zite.json', 'src/data/recettes-demo.json']:
    chemin = os.path.join(RACINE, f)
    R = json.load(open(chemin))
    for r in R:
        nettoyer(r['ingredients'])
        for v in r.get('variantes') or []: nettoyer(v['ingredients'])
        if r['titre'] == 'Pâtes tomate, courgette et crevettes' and r.get('regimeSource') == 'vegetarien':
            r['regimeSource'] = 'omnivore'
            for e in r['ingredients']:
                if e['nom'].lower().startswith('crevette'): e['contient'] = ['fruits_de_mer']
    json.dump(R, open(chemin, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f, len(R))
