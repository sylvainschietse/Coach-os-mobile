# Transforme recettes.py en recettes Coach OS : macros calculées avec la base Ciqual de l'app, régime déduit des ingrédients.
# python3 construire.py <fichier.sql> <coach_id>  → SQL d'insertion (en brouillon) ; sans argument, affiche le bilan.
import hashlib, json, re, sys, unicodedata, uuid
from recettes import R
from resoudre import RACINE, aliment

r1 = lambda x: (lambda y: int(y) if y == int(y) else y)(round(x * 10) / 10)
slug = lambda t: re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', t.lower().replace('œ', 'oe')).encode('ascii', 'ignore').decode()).strip('-')
CLES = ['kcal', 'proteines', 'glucides', 'lipides']


def uuid5(nom):
    """Le même calcul que scripts/import-zite-nutrition.mjs : un identifiant stable par recette."""
    h = bytearray(hashlib.sha1(bytes.fromhex('6ba7b8119dad11d180b400c04fd430c8') + nom.encode()).digest()[:16])
    h[6] = (h[6] & 0x0F) | 0x50
    h[8] = (h[8] & 0x3F) | 0x80
    return str(uuid.UUID(bytes=bytes(h)))


def ingredient(ligne):
    p = [x.strip() for x in ligne.split(';')]
    g, nom, req = float(p[0]), p[1], p[2]
    a = aliment(req)
    if a is None: raise ValueError(f'Aliment introuvable : {req}')
    i = {'nom': nom, 'quantiteG': r1(g), **({'alimentId': a['id']} if 'id' in a else {}), **{k: a[k] for k in CLES}, 'unite': 'g'}
    if re.match(r'(lait|bouillon|eau|vin|jus|coulis)\b', nom, re.I) and len(p) == 3:
        i.update(quantite=i['quantiteG'], unite='ml')
    if len(p) > 3:
        q, u = p[3].split(' ', 1)
        i.update(quantite=float(q) if '.' in q else int(q), unite=u)
    if a.get('contient'): i['contient'] = a['contient']
    return i


def regime(ingredients):
    c = {x for i in ingredients for x in i.get('contient', [])}
    if c & {'viande', 'poisson', 'fruits_de_mer'}: return 'omnivore'
    return 'vegetarien' if c & {'lait', 'oeuf', 'miel'} else 'vegan'


def recettes():
    out = []
    for r in R:
        ing = [ingredient(l) for l in r['ingredients']]
        tot = {k: sum(i[k] * i['quantiteG'] / 100 for i in ing) / r['portions'] for k in CLES}
        s = slug(r['titre'])
        out.append({'id': uuid5(f'coachos/recette/coach/{s}'), 'ref': f'coachos:{s}', 'titre': r['titre'], 'portions': r['portions'], 'tempsMin': r['minutes'],
                    'etapes': '\n'.join(f'{n}. {e}' for n, e in enumerate(r['etapes'], 1)), 'ingredients': ing,
                    'macrosPortion': {k: r1(v) for k, v in tot.items()}, 'regimeSource': regime(ing), 'types': r['types'], 'cuisine': r['cuisine'], 'methode': r['methode']})
    return out


if __name__ == '__main__':
    L = recettes()
    assert len({r['id'] for r in L}) == len(L), 'deux recettes ont le même titre'
    # La démo de l'app montre aussi ces recettes
    json.dump([{'id': r['id'], 'titre': r['titre'], 'portions': r['portions'], 'tempsMin': r['tempsMin'], 'etapes': r['etapes'], 'ingredients': r['ingredients'],
                'macrosPortion': r['macrosPortion'], 'regimeSource': r['regimeSource'], 'variantes': [], 'types': r['types'], 'statut': 'brouillon', 'regimesConfirmes': []}
               for r in L], open(RACINE + '/src/data/recettes-coach.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    if len(sys.argv) < 3:
        for r in L:
            m = r['macrosPortion']
            print(f"{r['titre'][:48]:48} {r['regimeSource'][:4]} {'/'.join(r['types']):16} {m['kcal']:>6} kcal  P {m['proteines']:>5}  G {m['glucides']:>5}  L {m['lipides']:>5}")
        sys.exit()
    fichier, coach = sys.argv[1], sys.argv[2]
    t = lambda v: 'null' if v is None else "'" + str(v).replace("'", "''") + "'"
    js = lambda v: t(json.dumps(v, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'
    lignes = [f"({t(r['id'])}, {t(coach)}, {t(r['titre'])}, {r['portions']}, {r['tempsMin']}, {t(r['etapes'])}, {js(r['ingredients'])}, 'brouillon', "
              f"{js(r['macrosPortion'])}, '[]'::jsonb, {t('{' + ','.join(r['types']) + '}')}, {t(r['regimeSource'])}, {t(r['ref'])})" for r in L]
    sql = f"""-- Recettes Coach OS : {len(L)} recettes écrites pour l'app (petits-déjeuners et collations riches en protéines, cuisine française, plats à préparer à l'avance)
-- Elles arrivent en brouillon dans la banque du coach : rien n'est visible des clients avant qu'il les approuve.
-- Macros calculées ingrédient par ingrédient avec la table Ciqual. Une recette déjà présente n'est pas touchée : le relancer ne change rien.

insert into public.recettes (id, coach_id, titre, portions, temps_min, etapes, ingredients, statut, macros_portion, variantes, types, regime_source, ref_externe) values
""" + ',\n'.join(lignes) + """
on conflict (id) do nothing;

-- Contrôle : attendu """ + str(len(L)) + """
select count(*) as recettes_coach_os from public.recettes where ref_externe like 'coachos:%';
"""
    open(fichier, 'w').write(sql)
    print(len(L), 'recettes,', len(sql.encode()) // 1024, 'Ko')
