-- Blocs : format (biset, superset…), descriptif, tempo et mode de contraction choisis par le coach. Ajouts seulement :
-- quatre colonnes facultatives, et enregistrer_seance les recopie. Le reste de la fonction est inchangé.

alter table public.blocs add column if not exists format text;
alter table public.blocs add column if not exists description text;
alter table public.blocs add column if not exists tempo text;
alter table public.blocs add column if not exists contraction text;

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
        repetitions, distance_m, charge_intensite, phase, progression, cycles)
      values ((l->>'id')::uuid, (b->>'id')::uuid, j, (l->>'exerciceId')::uuid, (l->>'series')::int,
        (l->>'repetitionsMin')::int, (l->>'repetitionsMax')::int, (l->>'chargeIndicative')::numeric,
        (l->>'dureeS')::int, (l->>'recuperationS')::int, (l->>'rir')::int, nullif(l->>'tempo', ''),
        nullif(l->>'consignes', ''), nullif(l->'minuteur', 'null'::jsonb),
        nullif(l->>'repetitions', ''), (l->>'distanceM')::numeric, nullif(l->>'chargeIntensite', ''),
        nullif(l->>'phase', ''), nullif(l->>'progression', ''), nullif(l->'cycles', 'null'::jsonb))
      on conflict (id) do update set
        bloc_id = excluded.bloc_id, ordre = excluded.ordre, exercice_id = excluded.exercice_id,
        series = excluded.series, repetitions_min = excluded.repetitions_min,
        repetitions_max = excluded.repetitions_max, charge_indicative = excluded.charge_indicative,
        duree_s = excluded.duree_s, recuperation_s = excluded.recuperation_s, rir = excluded.rir,
        tempo = excluded.tempo, consignes = excluded.consignes, minuteur = excluded.minuteur,
        repetitions = excluded.repetitions, distance_m = excluded.distance_m, charge_intensite = excluded.charge_intensite,
        phase = excluded.phase, progression = excluded.progression, cycles = excluded.cycles, retiree = false;
    end loop;
  end loop;
  return v_id;
end $function$;
