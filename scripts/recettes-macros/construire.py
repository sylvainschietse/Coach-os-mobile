# Relie chaque ingrédient des recettes importées à un aliment de la base (Ciqual) et lui donne un poids en grammes.
# Sortie : sql (fichier pour l'éditeur SQL), appliquer (mêmes changements dans les JSON du dépôt), ecarts (recettes dont les macros publiées divergent).
import json, os, statistics, sys
from calcul import RECETTES, code_de, par_code
from poids import RACINE
from bilan import egoutte, gr, total

BASE = {a['codeCiqual']: a for a in json.load(open(RACINE + '/src/data/aliments-base.json')) if a.get('codeCiqual')}
def r1(x):
    x = round(x * 10) / 10
    return int(x) if x == int(x) else x
CLES = [('kcal', 'kcal'), ('proteines', 'protein'), ('glucides', 'carbs'), ('lipides', 'fat')]


def valeurs(code):
    """Valeurs pour 100 g et identifiant de l'aliment : celles de la base de l'app (les mêmes que le journal), sinon l'étiquette."""
    if code in BASE:
        a = BASE[code]
        return {'alimentId': a['id'], **{k: a[k] for k, _ in CLES}}
    f = par_code[code]
    return {k: f[c] for k, c in CLES}


def lignes():
    """(ref, variante, rang, nom, code, grammes pour la recette entière, poids de la boîte) pour chaque ingrédient qu'on sait peser."""
    zite = {r['origine']['ref']: r for r in json.load(open(RACINE + '/supabase/donnees/recettes-zite.json'))}
    out, ecarts_listes = [], 0
    for y in RECETTES:
        r = zite['zite:' + y['id']]
        listes = {'': r['ingredients'], **{v['id']: v['ingredients'] for v in r['variantes']}}
        origine = next((v for v in y['variants'] if v['id'] == 'original'), y['variants'][0])
        for v in y['variants']:
            cle = '' if v is origine else v['id']
            cible = listes.get(cle)
            if cible is None or len(cible) != len(v['ingredients']):
                ecarts_listes += 1
                continue
            for o, (i, e) in enumerate(zip(v['ingredients'], cible), 1):
                if i['amountUnit'] == 'selon goût': continue
                c, g = code_de(i), gr(i, y)
                if g is None: continue
                f = egoutte(i, c)
                # Conserve : le calcul prend le poids égoutté, l'affichage garde le poids de la boîte
                brut = r1(g / f * r['portions']) if f < 1 and e.get('unite') == 'g' else None
                out.append((r['origine']['ref'], cle, o, e['nom'], c, r1(g * r['portions']), brut))
    return out, ecarts_listes


def patch(e, code, g, brut=None):
    """Le même changement que le SQL, en Python : pour les JSON du dépôt et pour vérifier le SQL."""
    n = {k: x for k, x in e.items() if not (code and k == 'valeursInconnues') and not (k == 'quantite' and e.get('unite') == 'g')}
    if code: n.update(valeurs(code))
    n['quantiteG'] = g
    if brut is not None: n['quantite'] = brut
    return n


def ecarts():
    L = []
    for y in RECETTES:
        for v in y['variants']:
            t, manque = total(y, v)
            pub = v['macros']
            L.append({'recette': y['name'], 'version': v['id'], 'publie': round(pub['kcal']), 'calcule': round(t['kcal']), 'protPublie': round(pub['protein'], 1),
                      'protCalcule': round(t['p'], 1), 'ecart': (t['kcal'] - pub['kcal']) / max(pub['kcal'], 1), 'sansValeur': manque})
    return L


if __name__ == '__main__':
    L, perdus = lignes()
    print(len(L), 'ingrédients pesés,', sum(1 for l in L if l[4]), 'avec valeurs ;', perdus, 'listes non alignées', file=sys.stderr)
    json.dump(L, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lignes.json'), 'w'), ensure_ascii=False)
