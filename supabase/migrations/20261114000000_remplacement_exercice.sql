-- Séance par bloc : le client peut remplacer un exercice (machine prise, matériel absent…). La série garde la ligne
-- prévue par le coach, mais porte l'exercice réellement fait ; l'exercice prévu reste noté pour le coach.
alter table public.series_realisees add column if not exists exercice_prevu_id uuid references public.exercices (id) on delete set null;

create or replace function public.enregistrer_realisation(r jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_client_id();
  v_id uuid := (r->>'id')::uuid;
  s public.seances;
  c public.cycles;
  prog public.programmes;
  plan public.planifications;
  jour date := (now() at time zone 'Europe/Paris')::date;
  v_fin timestamptz := coalesce(nullif(r->>'fin', '')::timestamptz, now());
  doublon boolean;
  serie jsonb;
begin
  if moi is null or moi <> (r->>'clientId')::uuid then raise exception 'Séance hors de votre dossier'; end if;
  select * into s from public.seances where id = (r->>'seanceId')::uuid and supprime_le is null;
  if not found then raise exception 'Séance introuvable ou retirée par votre coach'; end if;
  if nullif(r->>'cycleId', '') is not null then
    select * into c from public.cycles where id = (r->>'cycleId')::uuid and client_id = moi;
    if not found or c.statut <> 'Actif' or c.programme_id is null then raise exception 'Ce cycle n''est pas en cours'; end if;
    if jour < c.debut or jour > c.fin then raise exception 'Cette séance est en dehors des dates du cycle actif'; end if;
    if s.programme_id is distinct from c.programme_id then raise exception 'Séance hors du cycle en cours'; end if;
    select * into prog from public.programmes where id = c.programme_id;
  elsif s.client_id is distinct from moi then
    raise exception 'Séance hors de votre dossier';
  end if;
  if nullif(r->>'planificationId', '') is not null then
    select * into plan from public.planifications where id = (r->>'planificationId')::uuid;
    if not found or plan.client_id <> moi or plan.cycle_id is distinct from c.id or plan.seance_id <> s.id or plan.statut = 'Annulée' then
      raise exception 'Créneau hors de cette séance';
    end if;
    if plan.statut = 'Réalisée' and plan.realisation_id is distinct from v_id then raise exception 'Ce créneau est déjà réalisé'; end if;
  end if;

  select exists (select 1 from public.realisations where id = v_id) into doublon;
  if doublon then
    if not exists (select 1 from public.realisations where id = v_id and client_id = moi and seance_id = s.id) then
      raise exception 'Envoi déjà utilisé pour une autre séance';
    end if;
    select realisations.fin into v_fin from public.realisations where id = v_id;
  else
    if jsonb_array_length(coalesce(r->'series', '[]')) = 0 and nullif(r->>'note', '') is null and coalesce(trim(r->>'commentaire'), '') = '' then
      raise exception 'Renseignez au moins un résultat ou un ressenti';
    end if;
    insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin, commentaire, note, cycle_id, programme_id,
      planification_id, seance_titre, programme_nom, cycle_nom)
    values (v_id, s.id, moi, s.coach_id, coalesce(nullif(r->>'debut', '')::timestamptz, v_fin), v_fin, nullif(trim(r->>'commentaire'), ''),
      nullif(r->>'note', '')::int, c.id, c.programme_id, plan.id, s.titre, prog.titre, c.nom);
    for serie in select * from jsonb_array_elements(coalesce(r->'series', '[]')) loop
      if not exists (select 1 from public.lignes l join public.blocs b on b.id = l.bloc_id
                     where l.id = (serie->>'ligneId')::uuid and b.seance_id = s.id) then
        raise exception 'Exercice hors de cette séance';
      end if;
      -- Exercice remplacé par le client : pris seulement dans le catalogue commun ou celui de son coach.
      insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs, suggestion, exercice_nom, exercice_prevu_id)
      select (serie->>'id')::uuid, v_id, l.id, coalesce(alt.id, l.exercice_id), (serie->>'index')::int, coalesce(serie->'valeurs', '{}'),
        coalesce(serie->'suggestion', '{}'), coalesce(alt.nom, e.nom), case when alt.id is not null then l.exercice_id end
      from public.lignes l join public.exercices e on e.id = l.exercice_id
      left join public.exercices alt on alt.id = nullif(serie->>'exerciceId', '')::uuid and alt.id <> l.exercice_id
        and (alt.coach_id is null or alt.coach_id = s.coach_id)
      where l.id = (serie->>'ligneId')::uuid;
    end loop;
  end if;

  -- Calendrier (markCompleted) : le créneau choisi, sinon celui prévu ce jour-là, sinon un créneau réalisé créé.
  if c.id is not null and not exists (select 1 from public.planifications where realisation_id = v_id) then
    if plan.id is null then
      select * into plan from public.planifications
      where client_id = moi and cycle_id = c.id and seance_id = s.id and statut = 'Prévue' and date = (v_fin at time zone 'Europe/Paris')::date
      order by cree_le limit 1;
    end if;
    if plan.id is not null then
      update public.planifications set statut = 'Réalisée', realisee_le = v_fin, realisation_id = v_id where id = plan.id;
    else
      insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, statut, realisee_le, realisation_id, envoi_id)
      values (moi, c.id, s.id, s.titre, (v_fin at time zone 'Europe/Paris')::date, 'Réalisée', v_fin, v_id, 'realisation-' || v_id);
    end if;
  end if;
  return case when doublon then 'doublon' else 'enregistree' end;
end $$;
