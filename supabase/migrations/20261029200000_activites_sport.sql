-- Coach OS · activités sportives (courses, vélo, marche…) lues sur le téléphone du client dans Health Connect.
-- Le client les envoie depuis l'appli ; lui et son coach les voient. Une activité est reconnue par sa source et
-- son identifiant d'origine : la renvoyer la met à jour sans la dupliquer. Le client peut en retirer une.
-- Uniquement des ajouts : une table, ses règles d'accès et deux fonctions.

create table public.activites_sport (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  source text not null check (source in ('health_connect', 'fichier', 'strava', 'garmin', 'suunto', 'polar', 'manuel')),
  id_externe text not null check (length(id_externe) between 1 and 200),
  sport text not null check (sport in ('course', 'trail', 'velo', 'marche', 'randonnee', 'natation', 'autre')),
  titre text not null default '' check (length(titre) <= 200),
  debut timestamptz not null,
  duree_s int not null check (duree_s between 1 and 604800),
  distance_m int check (distance_m between 0 and 1000000),
  denivele_m int check (denivele_m between 0 and 20000),
  fc_moy int check (fc_moy between 25 and 250),
  fc_max int check (fc_max between 25 and 250),
  calories int check (calories between 0 and 50000),
  appareil text not null default '' check (length(appareil) <= 200),
  importee_le timestamptz not null default now(),
  -- Retirée par le client : cachée partout, et un nouvel envoi ne la fait pas revenir.
  retiree boolean not null default false,
  unique (client_id, source, id_externe)
);
create index on public.activites_sport (client_id, debut desc);
create index on public.activites_sport (coach_id, debut desc);

alter table public.activites_sport enable row level security;
create policy "client : ses activités" on public.activites_sport for select using (client_id = public.mon_client_id() and not retiree);
create policy "coach : les activités de ses clients" on public.activites_sport for select using (coach_id = public.mon_coach_id() and not retiree);
-- Lecture seule : tout passe par enregistrer_activites et retirer_activite.
revoke all on public.activites_sport from anon, authenticated;
grant select on public.activites_sport to authenticated;

/** Le client envoie un lot d'activités (au plus 200) ; renvoie le nombre de lignes ajoutées ou mises à jour. */
create function public.enregistrer_activites(lot jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_client_id();
  mon_coach uuid := public.coach_de_mon_client();
  a jsonb;
  n int := 0;
  k text;
  t timestamptz;
begin
  if moi is null then raise exception 'Activités hors de votre dossier'; end if;
  if jsonb_typeof(lot) <> 'array' or jsonb_array_length(lot) > 200 then raise exception 'Lot d’activités invalide'; end if;
  for a in select * from jsonb_array_elements(lot) loop
    if jsonb_typeof(a->'idExterne') <> 'string' or jsonb_typeof(a->'source') <> 'string' or jsonb_typeof(a->'sport') <> 'string'
      or jsonb_typeof(a->'debut') <> 'string' or jsonb_typeof(a->'dureeS') <> 'number' then
      raise exception 'Activité incomplète';
    end if;
    foreach k in array array['distanceM', 'deniveleM', 'fcMoy', 'fcMax', 'calories'] loop
      if a ? k and jsonb_typeof(a->k) not in ('number', 'null') then raise exception 'Activité invalide'; end if;
    end loop;
    begin
      t := (a->>'debut')::timestamptz;
    exception when others then
      raise exception 'Date de début invalide';
    end;
    if t > now() + interval '1 hour' then raise exception 'Date de début invalide'; end if;
    insert into public.activites_sport (coach_id, client_id, source, id_externe, sport, titre, debut, duree_s, distance_m, denivele_m, fc_moy, fc_max, calories, appareil)
    values (mon_coach, moi, a->>'source', a->>'idExterne', a->>'sport', coalesce(a->>'titre', ''), t, round((a->>'dureeS')::numeric),
      round((a->>'distanceM')::numeric), round((a->>'deniveleM')::numeric), round((a->>'fcMoy')::numeric), round((a->>'fcMax')::numeric),
      round((a->>'calories')::numeric), coalesce(a->>'appareil', ''))
    on conflict (client_id, source, id_externe) do update set sport = excluded.sport, titre = excluded.titre, debut = excluded.debut,
      duree_s = excluded.duree_s, distance_m = excluded.distance_m, denivele_m = excluded.denivele_m, fc_moy = excluded.fc_moy,
      fc_max = excluded.fc_max, calories = excluded.calories, appareil = excluded.appareil, importee_le = now()
    where not public.activites_sport.retiree;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

/** Le client retire une de ses activités (mauvaise séance, doublon…). */
create function public.retirer_activite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.activites_sport set retiree = true where id = p_id and client_id = public.mon_client_id();
  if not found then raise exception 'Activité introuvable'; end if;
end $$;

revoke all on function public.enregistrer_activites(jsonb) from public, anon;
revoke all on function public.retirer_activite(uuid) from public, anon;
grant execute on function public.enregistrer_activites(jsonb) to authenticated;
grant execute on function public.retirer_activite(uuid) to authenticated;
