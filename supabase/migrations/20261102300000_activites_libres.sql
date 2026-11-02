-- Coach OS · activités libres : le client déclare ce qu'il a fait en dehors de son programme (un cours de RPM,
-- une séance de musculation à lui…). Elles vivent dans activites_sport avec la source « manuel », à côté des
-- séances de la montre, avec une dépense estimée (calories) calculée sur le téléphone. Le client peut les
-- corriger ou les retirer ; il ne touche jamais au programme du coach.
-- Uniquement des ajouts : de nouveaux types d'activité, trois colonnes et une fonction.

alter table public.activites_sport drop constraint if exists activites_sport_sport_check;
alter table public.activites_sport add constraint activites_sport_sport_check
  check (sport in ('course', 'trail', 'velo', 'marche', 'randonnee', 'natation', 'musculation', 'cours', 'yoga', 'aquatique',
    'raquette', 'sport_co', 'combat', 'danse', 'glisse', 'autre'));

alter table public.activites_sport
  -- Effort ressenti, de 1 (très facile) à 10 (maximal).
  add column if not exists ressenti int check (ressenti between 1 and 10),
  add column if not exists note text not null default '' check (length(note) <= 2000),
  -- Séance de musculation : [{ exerciceId?, nom, mesures?, series: [{ repetitions?, charge?, duree?, distance? }] }].
  add column if not exists exercices jsonb not null default '[]'
    check (jsonb_typeof(exercices) = 'array' and jsonb_array_length(exercices) <= 40);

/**
 * Le client ajoute ou corrige une de ses activités libres. L'id vient du téléphone : renvoyer la même activité
 * la met à jour sans la dupliquer. Renvoie l'id.
 */
create or replace function public.enregistrer_activite_libre(a jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_client_id();
  mon_coach uuid := public.coach_de_mon_client();
  v_id uuid;
  t timestamptz;
  v_duree numeric;
  v_ressenti int;
  e jsonb;
  s jsonb;
  k text;
  v_exercices jsonb := coalesce(a->'exercices', '[]');
begin
  if moi is null then raise exception 'Activité hors de votre dossier'; end if;
  begin
    v_id := (a->>'id')::uuid;
    t := (a->>'debut')::timestamptz;
  exception when others then
    raise exception 'Activité invalide';
  end;
  if v_id is null or t is null then raise exception 'Activité incomplète'; end if;
  if t > now() + interval '1 hour' then raise exception 'Une activité ne peut pas être dans le futur'; end if;
  if t < now() - interval '1 year' then raise exception 'Date trop ancienne'; end if;
  if jsonb_typeof(a->'sport') <> 'string' then raise exception 'Type d’activité manquant'; end if;
  if jsonb_typeof(a->'dureeS') <> 'number' then raise exception 'Durée manquante'; end if;
  v_duree := (a->>'dureeS')::numeric;
  if v_duree < 60 or v_duree > 86400 then raise exception 'Durée invalide'; end if;
  if a ? 'ressenti' and jsonb_typeof(a->'ressenti') not in ('number', 'null') then raise exception 'Ressenti invalide'; end if;
  v_ressenti := round((a->>'ressenti')::numeric);
  if a ? 'calories' and jsonb_typeof(a->'calories') not in ('number', 'null') then raise exception 'Calories invalides'; end if;
  if a ? 'distanceM' and jsonb_typeof(a->'distanceM') not in ('number', 'null') then raise exception 'Distance invalide'; end if;
  if length(coalesce(a->>'note', '')) > 2000 then raise exception 'Note trop longue'; end if;

  -- Exercices : un tableau d'au plus 40 exercices de 20 séries, valeurs chiffrées seulement.
  if jsonb_typeof(v_exercices) <> 'array' or jsonb_array_length(v_exercices) > 40 then raise exception 'Exercices invalides'; end if;
  for e in select * from jsonb_array_elements(v_exercices) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'nom') <> 'string' or length(e->>'nom') not between 1 and 200
      or jsonb_typeof(e->'series') <> 'array' or jsonb_array_length(e->'series') > 20 then
      raise exception 'Exercice invalide';
    end if;
    if e ? 'exerciceId' and jsonb_typeof(e->'exerciceId') <> 'null' then
      begin
        perform (e->>'exerciceId')::uuid;
      exception when others then
        raise exception 'Exercice invalide';
      end;
    end if;
    for s in select * from jsonb_array_elements(e->'series') loop
      if jsonb_typeof(s) <> 'object' then raise exception 'Série invalide'; end if;
      for k in select jsonb_object_keys(s) loop
        if k not in ('repetitions', 'charge', 'duree', 'distance') or jsonb_typeof(s->k) not in ('number', 'null') then
          raise exception 'Série invalide';
        end if;
        if (s->>k)::numeric < 0 or (s->>k)::numeric > 100000 then raise exception 'Série invalide'; end if;
      end loop;
    end loop;
  end loop;

  -- Une activité existante ne peut être modifiée que par son client, et seulement si c'est une saisie libre.
  if exists (select 1 from public.activites_sport where id = v_id and (client_id <> moi or source <> 'manuel')) then
    raise exception 'Activité introuvable';
  end if;

  insert into public.activites_sport (id, coach_id, client_id, source, id_externe, sport, titre, debut, duree_s, distance_m, calories, ressenti, note, exercices)
  values (v_id, mon_coach, moi, 'manuel', v_id::text, a->>'sport', left(coalesce(trim(a->>'titre'), ''), 200), t, round(v_duree),
    round((a->>'distanceM')::numeric), round((a->>'calories')::numeric), v_ressenti, coalesce(trim(a->>'note'), ''), v_exercices)
  on conflict (id) do update set sport = excluded.sport, titre = excluded.titre, debut = excluded.debut, duree_s = excluded.duree_s,
    distance_m = excluded.distance_m, calories = excluded.calories, ressenti = excluded.ressenti, note = excluded.note, exercices = excluded.exercices, importee_le = now()
  where public.activites_sport.client_id = moi and public.activites_sport.source = 'manuel' and not public.activites_sport.retiree;
  if not found then raise exception 'Activité introuvable'; end if;
  return v_id;
end $$;

revoke all on function public.enregistrer_activite_libre(jsonb) from public, anon;
grant execute on function public.enregistrer_activite_libre(jsonb) to authenticated;
