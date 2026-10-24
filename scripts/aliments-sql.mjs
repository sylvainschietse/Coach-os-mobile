// Base d'aliments de départ (src/data/aliments-base.json) en SQL, pour la base commune de Supabase.
// Usage : node scripts/aliments-sql.mjs > supabase/donnees/aliments-base.sql
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const aliments = JSON.parse(readFileSync(join(import.meta.dirname, '../src/data/aliments-base.json'), 'utf8'));
const t = (v) => (v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === undefined || v === null ? 'null' : String(v));
const lignes = aliments.map(
  (a) =>
    `(${t(a.id)}, 'base', ${t(a.nom)}, ${t(a.categorie)}, ${n(a.kcal)}, ${n(a.proteines)}, ${n(a.glucides)}, ${n(a.lipides)}, ${n(a.fibres)}, ${n(a.portionG)}, ${t(a.portionLibelle)}, ${t(`{${a.contient.join(',')}}`)})`,
);
console.log(`-- Base d'aliments de départ : valeurs moyennes indicatives (ordres de grandeur Ciqual), à remplacer par la table officielle.
insert into public.aliments (id, source, nom, categorie, kcal, proteines, glucides, lipides, fibres, portion_g, portion_libelle, contient) values
${lignes.join(',\n')}
on conflict (id) do nothing;`);
