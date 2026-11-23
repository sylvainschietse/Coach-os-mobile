-- Élastiques : le coach choisit, pour un exercice d'une séance, la couleur de l'élastique et s'il aide (traction,
-- dips, pistol…) ou s'il freine (rowing, pull-apart, squat avec élastique…). Le client la voit pendant sa séance.
-- Uniquement des ajouts :
-- · une colonne facultative « elastique » sur les lignes de séance, recopiée par enregistrer_seance ;
-- · les réglages du coach (force de chaque couleur, couleurs qu'il a) dans une petite table à lui seul ;
-- · sept exercices avec élastique qui manquaient au catalogue.
-- Peut être collé deux fois sans rien casser.

-- 1. La couleur choisie sur chaque exercice d'une séance : { couleur, nom, hex, force, sens }.
alter table public.lignes add column if not exists elastique jsonb;
alter table public.lignes drop constraint if exists lignes_elastique_valide;
alter table public.lignes add constraint lignes_elastique_valide
  check (elastique is null or (jsonb_typeof(elastique) = 'object' and pg_column_size(elastique) < 1000));

-- 2. enregistrer_seance recopie l'élastique. Le reste de la fonction est identique à la version en place.
CREATE OR REPLACE FUNCTION public.enregistrer_seance(s jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := (s->>'id')::uuid;
  v_blocs uuid[];
  v_lignes uuid[];
  b jsonb;
  l jsonb;
  i int := 0;
  j int;
begin
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_blocs from jsonb_array_elements(coalesce(s->'blocs', '[]')) x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_lignes
  from jsonb_array_elements(coalesce(s->'blocs', '[]')) bl, jsonb_array_elements(coalesce(bl->'lignes', '[]')) x;

  insert into public.seances (id, coach_id, client_id, programme_id, titre, date_prevue, consignes, ordre, dominante, duree_prevue_min, objectif)
  values (
    v_id, public.mon_coach_id(), nullif(s->>'clientId', '')::uuid, nullif(s->>'programmeId', '')::uuid,
    s->>'titre', nullif(s->>'datePrevue', '')::date, nullif(s->>'consignes', ''), nullif(s->>'ordre', '')::int,
    nullif(s->>'dominante', ''), nullif(s->>'dureeMin', '')::int, nullif(s->>'objectif', ''))
  on conflict (id) do update set
    titre = excluded.titre, date_prevue = excluded.date_prevue, consignes = excluded.consignes, ordre = excluded.ordre,
    programme_id = excluded.programme_id, dominante = excluded.dominante, duree_prevue_min = excluded.duree_prevue_min,
    objectif = excluded.objectif;

  -- Ce qui est enlevé est retiré, jamais effacé : une ligne déjà réalisée garde son historique.
  update public.lignes set retiree = true
  where bloc_id in (select id from public.blocs where seance_id = v_id) and not (id = any (v_lignes));
  update public.blocs set retire = true where seance_id = v_id and not (id = any (v_blocs));

  for b in select * from jsonb_array_elements(coalesce(s->'blocs', '[]')) loop
    i := i + 1;
    insert into public.blocs (id, seance_id, ordre, titre, minuteur, format, description, tempo, contraction)
    values ((b->>'id')::uuid, v_id, i, coalesce(nullif(b->>'titre', ''), 'Bloc ' || i), nullif(b->'minuteur', 'null'::jsonb),
      nullif(b->>'format', ''), nullif(b->>'description', ''), nullif(b->>'tempo', ''), nullif(b->>'contraction', ''))
    on conflict (id) do update set ordre = excluded.ordre, titre = excluded.titre, minuteur = excluded.minuteur,
      format = excluded.format, description = excluded.description, tempo = excluded.tempo, contraction = excluded.contraction,
      retire = false
    where blocs.seance_id = v_id;
    j := 0;
    for l in select * from jsonb_array_elements(coalesce(b->'lignes', '[]')) loop
      j := j + 1;
      insert into public.lignes (id, bloc_id, ordre, exercice_id, series, repetitions_min, repetitions_max,
        charge_indicative, duree_s, recuperation_s, rir, tempo, consignes, minuteur,
        repetitions, distance_m, charge_intensite, phase, progression, cycles, elastique)
      values ((l->>'id')::uuid, (b->>'id')::uuid, j, (l->>'exerciceId')::uuid, (l->>'series')::int,
        (l->>'repetitionsMin')::int, (l->>'repetitionsMax')::int, (l->>'chargeIndicative')::numeric,
        (l->>'dureeS')::int, (l->>'recuperationS')::int, (l->>'rir')::int, nullif(l->>'tempo', ''),
        nullif(l->>'consignes', ''), nullif(l->'minuteur', 'null'::jsonb),
        nullif(l->>'repetitions', ''), (l->>'distanceM')::numeric, nullif(l->>'chargeIntensite', ''),
        nullif(l->>'phase', ''), nullif(l->>'progression', ''), nullif(l->'cycles', 'null'::jsonb),
        case when jsonb_typeof(l->'elastique') = 'object' then l->'elastique' end)
      on conflict (id) do update set
        bloc_id = excluded.bloc_id, ordre = excluded.ordre, exercice_id = excluded.exercice_id,
        series = excluded.series, repetitions_min = excluded.repetitions_min,
        repetitions_max = excluded.repetitions_max, charge_indicative = excluded.charge_indicative,
        duree_s = excluded.duree_s, recuperation_s = excluded.recuperation_s, rir = excluded.rir,
        tempo = excluded.tempo, consignes = excluded.consignes, minuteur = excluded.minuteur,
        repetitions = excluded.repetitions, distance_m = excluded.distance_m, charge_intensite = excluded.charge_intensite,
        phase = excluded.phase, progression = excluded.progression, cycles = excluded.cycles,
        elastique = excluded.elastique, retiree = false;
    end loop;
  end loop;
  return v_id;
end $function$;

-- 3. Mes élastiques : la force de chaque couleur et les couleurs que le coach a. Lu et écrit par lui seul.
create table if not exists public.reglages_elastiques (
  coach_id uuid primary key default public.mon_coach_id() references public.coachs (id) on delete cascade,
  reglages jsonb not null default '{}'::jsonb check (jsonb_typeof(reglages) = 'object' and pg_column_size(reglages) < 10000),
  maj_le timestamptz not null default now()
);
alter table public.reglages_elastiques enable row level security;
drop policy if exists "coach : ses élastiques" on public.reglages_elastiques;
create policy "coach : ses élastiques" on public.reglages_elastiques for all to authenticated
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
revoke all on public.reglages_elastiques from anon;
grant select, insert, update on public.reglages_elastiques to authenticated;

-- 4. Exercices avec élastique ajoutés au catalogue importé, au même propriétaire (rien si le catalogue n'est pas là).
with proprietaire as (
  select coach_id from public.exercices where ref_externe = 'EXO-0392' limit 1
), nouveaux (ref, nom, famille, pattern, muscles, materiel, niveau, position, lateralite, mesures) as (values
  ('EXO-0751', 'Squat — élastique', 'Squat et presse', 'Squat', array['Quadriceps', 'Fessiers'], array['Élastique'], 'Débutant', 'Debout', 'Bilatéral', array['charge', 'repetitions']),
  ('EXO-0752', 'Hip thrust — élastique', 'Hanche', 'Extension ou abduction/adduction de hanche', array['Grand fessier'], array['Élastique'], 'Débutant', 'Au sol', 'Bilatéral', array['charge', 'repetitions']),
  ('EXO-0753', 'Soulevé de terre — élastique', 'Charnière de hanche', 'Charnière de hanche', array['Ischio-jambiers', 'Grand fessier'], array['Élastique'], 'Débutant', 'Debout', 'Bilatéral', array['charge', 'repetitions']),
  ('EXO-0754', 'Dips assistés — élastique', 'Développés et pompes', 'Poussée verticale', array['Pectoraux', 'Triceps'], array['Barres parallèles', 'Élastique'], 'Débutant', 'Suspendu', 'Bilatéral', array['repetitions']),
  ('EXO-0755', 'Squat pistol assisté — élastique', 'Fentes et appuis unilatéraux', 'Squat', array['Quadriceps', 'Fessiers'], array['Élastique'], 'Intermédiaire', 'Debout', 'Unilatéral', array['repetitions']),
  ('EXO-0756', 'Nordic curl assisté — élastique', 'Isolation des jambes', 'Flexion du genou', array['Ischio-jambiers'], array['Élastique'], 'Intermédiaire', 'À genoux', 'Bilatéral', array['repetitions']),
  ('EXO-0757', 'Muscle-up assisté — élastique', 'Mouvements fonctionnels', 'Tirage vertical', array['Grand dorsal', 'Triceps'], array['Barre de traction', 'Élastique'], 'Avancé', 'Suspendu', 'Bilatéral', array['repetitions'])
)
insert into public.exercices (coach_id, ref_externe, nom, famille, pattern, muscles, materiel, modalite, niveau, position, lateralite, mesures, actif)
select p.coach_id, n.ref, n.nom, n.famille, n.pattern, n.muscles, n.materiel, 'Musculation', n.niveau, n.position, n.lateralite, n.mesures, true
from nouveaux n join proprietaire p on true
where not exists (select 1 from public.exercices e where e.ref_externe = n.ref or e.nom = n.nom);
