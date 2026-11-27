-- Séance en direct : pendant une séance en présentiel, le coach note lui-même ce que fait son client, exercice par
-- exercice (charge, répétitions, temps de repos). Il part d'une séance vierge ou d'une séance du programme en cours.
-- La séance arrive dans l'historique et les progrès du client comme une séance qu'il aurait notée lui-même.
-- Uniquement des ajouts :
-- · le temps de repos pris avant chaque série (repos_s), facultatif ;
-- · la fonction enregistrer_seance_en_direct, réservée au coach du client.
-- Une séance vierge faite pendant le cycle en cours compte dans ce cycle (suivi semaine par semaine, courbes), sans
-- toucher au calendrier des séances du programme.
-- Les exercices ajoutés en cours de route (ou tous, pour une séance vierge) sont rangés dans une séance « Séance en
-- direct » propre au client, archivée : elle garde l'historique lisible sans apparaître dans ses séances à faire.
-- Peut être collé deux fois sans rien casser.

-- 1. Le repos pris avant la série, en secondes.
alter table public.series_realisees add column if not exists repos_s int;
alter table public.series_realisees drop constraint if exists series_realisees_repos_valide;
alter table public.series_realisees add constraint series_realisees_repos_valide check (repos_s is null or repos_s between 0 and 3600);

-- 2. Enregistrement par le coach. L'id de la réalisation est créé sur le téléphone : un renvoi répond « doublon ».
create or replace function public.enregistrer_seance_en_direct(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_coach_id();
  v_client uuid := nullif(p->>'clientId', '')::uuid;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_direct uuid := nullif(p->>'seanceDirecteId', '')::uuid;
  v_bloc uuid := nullif(p->>'blocId', '')::uuid;
  v_fin timestamptz := coalesce(nullif(p->>'fin', '')::timestamptz, now());
  v_debut timestamptz;
  v_titre text := left(nullif(trim(p->>'titre'), ''), 160);
  s public.seances;
  c public.cycles;
  prog public.programmes;
  plan public.planifications;
  ex jsonb;
  serie jsonb;
  l public.lignes;
  e public.exercices;
  v_ligne uuid;
  v_prevu uuid;
  n_ex int := 0;
  n_series int := 0;
  i int;
  reps int[];
  charges numeric[];
  durees int[];
begin
  if moi is null then raise exception 'Réservé au coach'; end if;
  if v_id is null then raise exception 'Envoi sans identifiant'; end if;
  if not exists (select 1 from public.clients where id = v_client and coach_id = moi) then
    raise exception 'Client hors de ton dossier';
  end if;

  -- Renvoi après une coupure : rien n'est recréé.
  if exists (select 1 from public.realisations where id = v_id) then
    if not exists (select 1 from public.realisations where id = v_id and client_id = v_client and coach_id = moi) then
      raise exception 'Envoi déjà utilisé pour une autre séance';
    end if;
    return 'doublon';
  end if;

  if jsonb_typeof(coalesce(p->'exercices', '[]')) <> 'array' or jsonb_array_length(coalesce(p->'exercices', '[]')) > 60 then
    raise exception 'Liste d''exercices invalide';
  end if;
  select count(*) into n_series from jsonb_array_elements(coalesce(p->'exercices', '[]')) x, jsonb_array_elements(coalesce(x->'series', '[]'));
  if n_series = 0 and nullif(p->>'note', '') is null and coalesce(trim(p->>'commentaire'), '') = '' then
    raise exception 'Note au moins une série';
  end if;
  v_debut := least(coalesce(nullif(p->>'debut', '')::timestamptz, v_fin), v_fin);
  if v_fin > now() + interval '1 day' or v_fin - v_debut > interval '12 hours' then raise exception 'Dates de séance invalides'; end if;

  -- La séance du programme dont on est parti, s'il y en a une.
  if nullif(p->>'seanceId', '') is not null then
    select * into s from public.seances
    where id = (p->>'seanceId')::uuid and coach_id = moi and supprime_le is null and (client_id is null or client_id = v_client);
    if not found then raise exception 'Séance introuvable'; end if;
    if nullif(p->>'cycleId', '') is not null then
      select * into c from public.cycles
      where id = (p->>'cycleId')::uuid and client_id = v_client and statut = 'Actif' and programme_id is not distinct from s.programme_id;
    end if;
    if nullif(p->>'planificationId', '') is not null and c.id is not null then
      select * into plan from public.planifications
      where id = (p->>'planificationId')::uuid and client_id = v_client and cycle_id = c.id and seance_id = s.id and statut = 'Prévue';
    end if;
  end if;

  for ex in select * from jsonb_array_elements(coalesce(p->'exercices', '[]')) loop
    if jsonb_array_length(coalesce(ex->'series', '[]')) = 0 then continue; end if;
    if jsonb_array_length(ex->'series') > 50 then raise exception 'Trop de séries sur un exercice'; end if;
    select * into e from public.exercices where id = nullif(ex->>'exerciceId', '')::uuid and (coach_id is null or coach_id = moi);
    if not found then raise exception 'Exercice introuvable dans ton catalogue'; end if;
    v_ligne := nullif(ex->>'ligneId', '')::uuid;
    if v_ligne is null then raise exception 'Exercice sans identifiant'; end if;
    v_prevu := null;

    -- Exercice de la séance du programme : ses séries s'y rattachent (remplacé si le coach a changé d'exercice).
    select l2.* into l from public.lignes l2 join public.blocs b on b.id = l2.bloc_id where l2.id = v_ligne and b.seance_id = s.id;
    if found then
      if l.exercice_id <> e.id then v_prevu := l.exercice_id; end if;
    else
      if exists (select 1 from public.lignes where id = v_ligne) then raise exception 'Exercice hors de cette séance'; end if;
      -- Exercice ajouté : rangé dans la séance « en direct » du client, créée à la première occasion.
      if v_direct is null or v_bloc is null then raise exception 'Séance en direct sans identifiant'; end if;
      if not exists (select 1 from public.seances where id = v_direct) then
        insert into public.seances (id, coach_id, client_id, titre, archivee)
        values (v_direct, moi, v_client, coalesce(v_titre, s.titre, 'Séance en direct'), true);
        insert into public.blocs (id, seance_id, ordre, titre) values (v_bloc, v_direct, 1, 'Séance en direct');
      elsif not exists (select 1 from public.blocs b join public.seances s2 on s2.id = b.seance_id
                        where b.id = v_bloc and s2.id = v_direct and s2.coach_id = moi and s2.client_id = v_client) then
        raise exception 'Séance en direct hors de ce client';
      end if;
      n_ex := n_ex + 1;
      select array_agg((x->'valeurs'->>'repetitions')::numeric::int) filter (where x->'valeurs' ? 'repetitions'),
             array_agg((x->'valeurs'->>'charge')::numeric) filter (where x->'valeurs' ? 'charge'),
             array_agg((x->'valeurs'->>'duree')::numeric::int) filter (where x->'valeurs' ? 'duree')
        into reps, charges, durees
      from jsonb_array_elements(ex->'series') x;
      insert into public.lignes (id, bloc_id, ordre, exercice_id, series, repetitions_min, repetitions_max, repetitions, charge_indicative, duree_s)
      values (v_ligne, v_bloc, coalesce((select max(ordre) from public.lignes where bloc_id = v_bloc), 0) + 1, e.id,
        jsonb_array_length(ex->'series'),
        (select min(x) from unnest(reps) x), (select max(x) from unnest(reps) x),
        case when (select min(x) from unnest(reps) x) = (select max(x) from unnest(reps) x) then (select min(x) from unnest(reps) x)::text
             when reps is not null then (select min(x) from unnest(reps) x) || '–' || (select max(x) from unnest(reps) x) end,
        (select max(x) from unnest(charges) x), (select max(x) from unnest(durees) x));
    end if;
  end loop;

  -- Séance vierge : la réalisation pointe sur la séance en direct, et compte dans le cycle en cours s'il y en a un.
  if s.id is null then
    select * into s from public.seances where id = v_direct and coach_id = moi and client_id = v_client;
    if not found then raise exception 'Note au moins une série'; end if;
    if nullif(p->>'cycleId', '') is not null then
      select * into c from public.cycles where id = (p->>'cycleId')::uuid and client_id = v_client and statut = 'Actif';
    end if;
  end if;
  if c.id is not null then select * into prog from public.programmes where id = c.programme_id; end if;

  insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin, commentaire, note, cycle_id, programme_id,
    planification_id, seance_titre, programme_nom, cycle_nom)
  values (v_id, s.id, v_client, moi, v_debut, v_fin, left(nullif(trim(p->>'commentaire'), ''), 2000),
    case when (p->>'note') ~ '^\d+$' and (p->>'note')::int between 1 and 10 then (p->>'note')::int end,
    c.id, c.programme_id, plan.id, coalesce(v_titre, s.titre), prog.titre, c.nom);

  for ex in select * from jsonb_array_elements(coalesce(p->'exercices', '[]')) loop
    i := 0;
    for serie in select * from jsonb_array_elements(coalesce(ex->'series', '[]')) loop
      if jsonb_typeof(coalesce(serie->'valeurs', '{}')) <> 'object' then raise exception 'Série invalide'; end if;
      insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs, suggestion, exercice_nom, exercice_prevu_id, repos_s)
      select (serie->>'id')::uuid, v_id, l2.id, x.id, i, serie->'valeurs', '{}', x.nom,
        case when x.id <> l2.exercice_id then l2.exercice_id end,
        case when (serie->>'reposS') ~ '^\d+$' and (serie->>'reposS')::int <= 3600 then (serie->>'reposS')::int end
      from public.lignes l2, public.exercices x
      where l2.id = (ex->>'ligneId')::uuid and x.id = (ex->>'exerciceId')::uuid;
      i := i + 1;
    end loop;
  end loop;

  -- Calendrier (séance du programme seulement) : le créneau choisi, sinon celui prévu ce jour-là, sinon un créneau réalisé créé.
  if c.id is not null and s.id is distinct from v_direct then
    if plan.id is null then
      select * into plan from public.planifications
      where client_id = v_client and cycle_id = c.id and seance_id = s.id and statut = 'Prévue' and date = (v_fin at time zone 'Europe/Paris')::date
      order by cree_le limit 1;
    end if;
    if plan.id is not null then
      update public.planifications set statut = 'Réalisée', realisee_le = v_fin, realisation_id = v_id where id = plan.id;
      update public.realisations set planification_id = plan.id where id = v_id;
    else
      insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, statut, realisee_le, realisation_id, envoi_id)
      values (v_client, c.id, s.id, s.titre, (v_fin at time zone 'Europe/Paris')::date, 'Réalisée', v_fin, v_id, 'realisation-' || v_id);
    end if;
  end if;
  return 'enregistree';
end $$;

revoke execute on function public.enregistrer_seance_en_direct(jsonb) from public, anon;
grant execute on function public.enregistrer_seance_en_direct(jsonb) to authenticated;
