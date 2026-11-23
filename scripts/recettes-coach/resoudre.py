# Trouve l'aliment de la base de l'app pour chaque ligne d'ingrédient (code Ciqual ou début de nom).
import json, os, unicodedata
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
A = json.load(open(RACINE + '/src/data/aliments-base.json'))
n = lambda t: unicodedata.normalize('NFD', t.lower().replace('œ', 'oe')).encode('ascii', 'ignore').decode().strip()
PAR_CODE = {a['codeCiqual']: a for a in A if a.get('codeCiqual')}
# Poudres protéinées : absentes de Ciqual, valeurs déduites des versions « + whey » publiées (voir scripts/recettes-macros)
ETIQUETTES = {'etiquette:whey': {'nom': 'Whey vanille', 'kcal': 379, 'proteines': 72, 'glucides': 8.9, 'lipides': 5.9, 'contient': ['lait']}}
def aliment(req):
    if req in ETIQUETTES: return ETIQUETTES[req]
    if req in PAR_CODE: return PAR_CODE[req]
    x = [a for a in A if n(a['nom']).startswith(n(req))]
    if not x: x = [a for a in A if all(w in n(a['nom']) for w in n(req).split())]
    return min(x, key=lambda a: len(a['nom'])) if x else None
