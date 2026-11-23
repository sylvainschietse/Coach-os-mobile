-- Reprise de l'ancienne app Zite : table Ciqual 2025 et recettes sourcées avec leurs variantes.
-- Uniquement des ajouts de colonnes ; les données se chargent avec scripts/import-zite-nutrition.mjs --sql.

-- Aliments : code Ciqual et nutriments non mesurés (enregistrés à 0 mais connus comme inconnus, pas comme des zéros).
alter table public.aliments
  add column if not exists code_ciqual text,
  add column if not exists valeurs_inconnues text[] not null default '{}'
    check (valeurs_inconnues <@ array['kcal', 'proteines', 'glucides', 'lipides']);

-- Recettes : valeurs par portion publiées par la source, variantes (végé, végan, + protéines), origine et types de repas.
alter table public.recettes
  add column if not exists macros_portion jsonb check (macros_portion is null or jsonb_typeof(macros_portion) = 'object'),
  add column if not exists variantes jsonb not null default '[]' check (jsonb_typeof(variantes) = 'array'),
  add column if not exists origine jsonb check (origine is null or jsonb_typeof(origine) = 'object'),
  add column if not exists types text[] not null default '{}',
  add column if not exists regime_source text check (regime_source in ('omnivore', 'vegetarien', 'vegan')),
  add column if not exists ref_externe text check (length(ref_externe) <= 200);

create unique index if not exists recettes_ref_externe_unique on public.recettes (coach_id, ref_externe) where ref_externe is not null;

-- La base provisoire du premier jour laisse la place à Ciqual : archivée, pas supprimée (les repas déjà notés la gardent).
update public.aliments set archive = true where source = 'base' and coach_id is null and code_ciqual is null and archive = false;
