import json, os, re, sys
from nettoyer import RACINE
c = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'carte.json')))
noms, fourch = c['noms'], c['fourchettes']
R = json.load(open(RACINE + '/supabase/donnees/recettes-zite.json'))
tous = {i['nom'] for r in R for l in [r['ingredients']] + [v['ingredients'] for v in r['variantes']] for i in l}
fac = {n for n in tous if re.search(r'facultatif|en option', n, re.I)}
cles = sorted(set(noms) | set(fourch) | fac)
q = lambda v: 'null' if v is None else "'" + v.replace("'", "''") + "'"
lignes = [f"  ({q(a)}, {q(noms.get(a, a))}, {'true' if a in fac else 'false'}, {q(fourch.get(a))})" for a in cles]
sql = f"""-- Recettes · noms d'ingrédients nettoyés ({len(cles)} noms corrigés sur {len(tous)})
-- Ne touche que les 200 recettes importées (ref_externe zite:…) et seulement les ingrédients dont le nom est encore celui de l'import :
-- un nom déjà retouché dans l'éditeur reste tel quel. Le relancer une deuxième fois ne change plus rien.
-- Aussi : « 1 à 2 c. à café » au lieu de « selon source » quand la recette d'origine donne une fourchette, tasses converties en ml,
-- et la recette « Pâtes tomate, courgette et crevettes » repasse en omnivore (des crevettes étaient classées végétariennes).

drop table if exists carte_noms;
create temporary table carte_noms (ancien text primary key, nouveau text not null, facultatif boolean not null, fourchette text);
insert into carte_noms values
""" + ',\n'.join(lignes) + ";\n"
sql += """
create or replace function pg_temp.nettoyer(liste jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(
    (case when c.ancien is null then e else
      e || jsonb_build_object('nom', c.nouveau)
        || case when c.facultatif then '{"facultatif": true}'::jsonb else '{}'::jsonb end
        || case when c.fourchette is not null and e->>'unite' = 'selon source' then jsonb_build_object('unite', c.fourchette) else '{}'::jsonb end
    end)
    || case when e->>'unite' = 'tasse (240 ml)' and e ? 'quantite'
         then jsonb_build_object('unite', 'ml', 'quantite', round((e->>'quantite')::numeric * 240)) else '{}'::jsonb end
    order by o), '[]'::jsonb)
  from jsonb_array_elements(liste) with ordinality x(e, o)
  left join carte_noms c on c.ancien = e->>'nom'
$$;

update public.recettes set
  ingredients = pg_temp.nettoyer(ingredients),
  variantes = case when jsonb_typeof(variantes) = 'array' then (
    select coalesce(jsonb_agg(case when jsonb_typeof(v->'ingredients') = 'array' then v || jsonb_build_object('ingredients', pg_temp.nettoyer(v->'ingredients')) else v end order by o), '[]'::jsonb)
    from jsonb_array_elements(variantes) with ordinality y(v, o)) else variantes end
where ref_externe like 'zite:%';

-- Crevettes dans une recette notée végétarienne
update public.recettes set
  regime_source = 'omnivore',
  ingredients = (select jsonb_agg(case when e->>'nom' ilike 'crevette%' then e || '{"contient": ["fruits_de_mer"]}'::jsonb else e end order by o)
                 from jsonb_array_elements(ingredients) with ordinality x(e, o))
where ref_externe like 'zite:%' and titre = 'Pâtes tomate, courgette et crevettes' and regime_source = 'vegetarien';

drop table carte_noms;

-- Contrôle : 0 nom d'import restant, et le nombre de noms distincts après nettoyage
select
  (select count(*) from public.recettes r, jsonb_array_elements(r.ingredients) e where r.ref_externe like 'zite:%' and e->>'nom' ~ '^(Peut |Les .* peuvent|Emballer |Chérie$|/|\\(6 onces\\))') as noms_douteux_restants,
  (select count(*) from public.recettes r, jsonb_array_elements(r.ingredients) e where r.ref_externe like 'zite:%' and e->>'unite' in ('tasse (240 ml)')) as tasses_restantes;
"""
open(sys.argv[1] if len(sys.argv) > 1 else 'noms-ingredients.sql', 'w').write(sql)
print(len(cles), len(sql.encode()) // 1024, 'Ko')
