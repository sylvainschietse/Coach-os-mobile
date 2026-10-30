# Écrit le SQL (une seule requête, sans table temporaire : l'éditeur SQL de Supabase ne les garde pas d'une instruction à l'autre)
# et applique le même changement aux JSON du dépôt.  python3 sql.py <fichier.sql>
import json, sys
from construire import RACINE, lignes, patch, valeurs

L, _ = lignes()
q = lambda v: "'" + str(v).replace("'", "''") + "'"
codes = sorted({l[4] for l in L if l[4]})
alim = [f"  ({q(c)}, {q(json.dumps(valeurs(c), ensure_ascii=False, separators=(',', ':')))}::jsonb)" for c in codes]
lig = [f"  ({q(ref)},{q(var)},{o},{q(nom)},{q(c) if c else 'null'},{g},{'null' if b is None else b})" for ref, var, o, nom, c, g, b in L]

ELEMENTS = """select coalesce(jsonb_agg(case when p.ref is null then e else
        (e - case when p.val is not null then 'valeursInconnues' else '' end - case when e->>'unite' = 'g' then 'quantite' else '' end)
        || coalesce(p.val, '{{}}'::jsonb) || jsonb_build_object('quantiteG', p.g)
        || case when p.brut is not null then jsonb_build_object('quantite', p.brut) else '{{}}'::jsonb end end order by x.o), '[]'::jsonb)
      from jsonb_array_elements({liste}) with ordinality x(e, o)
      left join p on p.ref = r.ref_externe and p.var = {var} and p.o = x.o and p.nom = e->>'nom'"""

sql = f"""-- Recettes · chaque ingrédient relié à un aliment de la base (Ciqual) et pesé en grammes
-- {len(L)} ingrédients pesés dans les 200 recettes importées (ref_externe zite:…), dont {sum(1 for l in L if l[4])} avec leurs valeurs pour 100 g.
-- Ne touche un ingrédient que s'il est encore à sa place et sous son nom d'import : une recette retouchée dans l'éditeur garde ses changements.
-- Conserves : quantiteG est le poids égoutté (celui des valeurs Ciqual), la quantité affichée reste le poids de la boîte.
-- Les macros publiées par portion (macros_portion) ne changent pas. Le relancer ne change plus rien.

with alim (code, val) as (values
""" + ',\n'.join(alim) + """
), lig (ref, var, o, nom, code, g, brut) as (values
""" + ',\n'.join(lig) + """
), p as (select l.ref, l.var, l.o, l.nom, l.g, l.brut, a.val from lig l left join alim a on a.code = l.code)
update public.recettes r set
  ingredients = (""" + ELEMENTS.format(liste='r.ingredients', var="''") + """),
  variantes = case when jsonb_typeof(r.variantes) = 'array' then (
    select coalesce(jsonb_agg(case when jsonb_typeof(v->'ingredients') = 'array'
      then v || jsonb_build_object('ingredients', (""" + ELEMENTS.format(liste="v->'ingredients'", var="v->>'id'") + """)) else v end order by vo), '[]'::jsonb)
    from jsonb_array_elements(r.variantes) with ordinality y(v, vo)) else r.variantes end
where r.ref_externe like 'zite:%';

-- Contrôle (recette principale, sans les variantes) : attendu {AVEC} ingrédients reliés à un aliment ou une étiquette, {SANS} sans valeurs
select count(*) filter (where e ? 'kcal' and not e ? 'valeursInconnues') as avec_valeurs, count(*) filter (where e ? 'valeursInconnues') as sans_valeurs
from public.recettes r, jsonb_array_elements(r.ingredients) e where r.ref_externe like 'zite:%';
"""

# Les JSON du dépôt (données d'import et démo) reçoivent le même changement.
par = {(ref, var, o, nom): (c, g, b) for ref, var, o, nom, c, g, b in L}
def appliquer(r):
    ref = r['origine']['ref']
    def liste(lst, var):
        return [patch(e, *par[(ref, var, o, e['nom'])]) if (ref, var, o, e['nom']) in par else e for o, e in enumerate(lst, 1)]
    r['ingredients'] = liste(r['ingredients'], '')
    for v in r['variantes']: v['ingredients'] = liste(v['ingredients'], v['id'])
    return r
for f in ['/supabase/donnees/recettes-zite.json', '/src/data/recettes-demo.json']:
    R = json.load(open(RACINE + f))
    json.dump([appliquer(r) for r in R], open(RACINE + f, 'w'), ensure_ascii=False, separators=(',', ':'))

Z = json.load(open(RACINE + '/supabase/donnees/recettes-zite.json'))
avec = sum(1 for r in Z for e in r['ingredients'] if 'kcal' in e and not e.get('valeursInconnues'))
sans = sum(1 for r in Z for e in r['ingredients'] if e.get('valeursInconnues'))
sql = sql.replace('{AVEC}', str(avec)).replace('{SANS}', str(sans))
open(sys.argv[1], 'w').write(sql)
print(len(sql.encode()) // 1024, 'Ko ; contrôle', avec, sans)
