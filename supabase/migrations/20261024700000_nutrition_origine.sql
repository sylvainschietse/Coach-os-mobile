-- Lot 5 · Nutrition reprise de l'app d'origine : profilsNutrition, plansAlimentaires et alimentationPersonnelle.
-- Les données personnelles repartent de zéro (décision de Sylvain) : nouvelles tables, rien n'est supprimé ni recopié.
-- Les catalogues (200 recettes, Ciqual) restent embarqués dans l'app ; la base garde les choix du client.
-- Chaque écriture passe par une fonction qui vérifie la version lue (modification concurrente refusée)
-- et l'identifiant d'envoi (un double envoi ne crée rien de plus).

create function public.acces_nutrition(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(c = public.mon_client_id(), false) or public.est_mon_client(c)
$$;

create function public.version_nutrition() returns text
language sql stable as $$
  select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- ===== Profil alimentaire (api/nutritionProfile) =====
create table public.profils_alimentaires (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- Préférences du formulaire Mon profil (lib/nutrition.ts) ; vide tant que le client n'a rien enregistré.
  preferences jsonb check (preferences is null or jsonb_typeof(preferences) = 'object'),
  -- Objectifs fixés par le coach ; vide : calcul automatique.
  objectifs jsonb check (objectifs is null or jsonb_typeof(objectifs) = 'object'),
  version text not null,
  envoi_id text not null check (length(envoi_id) between 8 and 64),
  maj_le timestamptz not null default now()
);

-- Le poids saisi dans Mon profil rejoint Mesures, une seule fois par envoi.
alter table public.mensurations add column if not exists envoi_id text check (envoi_id is null or length(envoi_id) between 8 and 80);

create function public.enregistrer_profil_alimentaire(p_client uuid, p_action text, p_preferences jsonb, p_objectif jsonb, p_version text, p_envoi text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ligne public.profils_alimentaires;
  prefs jsonb;
  ancien jsonb;
  jour date := (now() at time zone 'Europe/Paris')::date;
  poids_actuel numeric;
  poids numeric;
  total numeric;
begin
  if p_action not in ('preferences', 'coach', 'auto') then raise exception 'Action inconnue'; end if;
  if p_action in ('coach', 'auto') and not public.est_mon_client(p_client) then raise exception 'Réservé au coach du client'; end if;
  if not public.acces_nutrition(p_client) then raise exception 'Profil hors de votre dossier'; end if;
  if length(coalesce(p_envoi, '')) not between 8 and 64 then raise exception 'Identifiant de saisie manquant'; end if;
  select * into ligne from public.profils_alimentaires where client_id = p_client for update;
  if found and ligne.envoi_id = p_envoi then return; end if;
  if coalesce(ligne.version, '') <> coalesce(p_version, '') then raise exception 'Le profil a changé. Actualisez avant de réessayer.'; end if;

  if p_action = 'preferences' then
    if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then raise exception 'Profil alimentaire incomplet'; end if;
    prefs := p_preferences;
    -- Âge déclaré : on garde la date de saisie tant qu'il ne change pas (pas de date de naissance dans le dossier).
    ancien := coalesce(ligne.preferences, '{}'::jsonb);
    if jsonb_typeof(prefs->'age') = 'number' then
      prefs := prefs || jsonb_build_object('ageSaisiLe',
        case when ancien->'age' = prefs->'age' and coalesce(ancien->>'ageSaisiLe', '') <> '' then ancien->>'ageSaisiLe' else to_char(jour, 'YYYY-MM-DD') end);
    else
      prefs := prefs || '{"ageSaisiLe": ""}'::jsonb;
    end if;
    -- syncNutritionMeasures : une mesure datée du jour seulement si le poids diffère de la dernière mesure.
    if jsonb_typeof(prefs->'poids') = 'number' then
      poids := (prefs->>'poids')::numeric;
      select m.poids_kg into poids_actuel from public.mensurations m
      where m.client_id = p_client and m.poids_kg is not null and m.date <= jour order by m.date desc, m.created_at desc limit 1;
      if poids is distinct from poids_actuel and poids between 20 and 400
        and not exists (select 1 from public.mensurations where client_id = p_client and envoi_id = 'nutrition:' || p_envoi) then
        insert into public.mensurations (client_id, date, poids_kg, envoi_id) values (p_client, jour, poids, 'nutrition:' || p_envoi);
      end if;
    end if;
    insert into public.profils_alimentaires (client_id, preferences, objectifs, version, envoi_id)
    values (p_client, prefs, null, public.version_nutrition(), p_envoi)
    on conflict (client_id) do update set preferences = excluded.preferences, version = excluded.version, envoi_id = excluded.envoi_id, maj_le = now();
    return;
  end if;

  if ligne.preferences is null then raise exception 'Le client doit d’abord enregistrer son profil alimentaire.'; end if;
  if p_action = 'coach' then
    if p_objectif is null or jsonb_typeof(p_objectif->'calories') <> 'number' or (p_objectif->>'calories')::numeric not between 1 and 10000
      or (p_objectif->>'calories')::numeric <> trunc((p_objectif->>'calories')::numeric) then
      raise exception 'Objectifs incomplets';
    end if;
    total := coalesce((p_objectif->>'proteinesPct')::numeric, -1000) + coalesce((p_objectif->>'lipidesPct')::numeric, -1000)
      + coalesce((p_objectif->>'glucidesPct')::numeric, -1000);
    if abs(total - 100) >= 0.01 then raise exception 'La répartition doit totaliser 100 %%'; end if;
    if length(coalesce(p_objectif->>'note', '')) > 1500 then raise exception 'Note trop longue'; end if;
  end if;
  update public.profils_alimentaires
  set objectifs = case when p_action = 'auto' then null else p_objectif end, version = public.version_nutrition(), envoi_id = p_envoi, maj_le = now()
  where client_id = p_client;
end $$;

-- ===== Planning de la semaine choisi par le client (api/mealPlan) =====
create table public.plans_alimentaires (
  client_id uuid not null references public.clients (id) on delete cascade,
  semaine date not null check (extract(isodow from semaine) = 1),
  -- 7 jours de repas {recipeId, variantId, portions, slot?, swaps?} (lib/recipes.ts).
  plan jsonb not null check (jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) = 7),
  version text not null,
  envoi_id text not null check (length(envoi_id) between 8 and 64),
  maj_le timestamptz not null default now(),
  primary key (client_id, semaine)
);

create function public.enregistrer_plan_alimentaire(p_client uuid, p_semaine date, p_plan jsonb, p_version text, p_envoi text)
returns text language plpgsql security definer set search_path = public as $$
declare
  ligne public.plans_alimentaires;
  jour jsonb;
  repas jsonb;
  v text;
begin
  if not public.acces_nutrition(p_client) then raise exception 'Planning hors de votre dossier'; end if;
  if p_semaine is null or extract(isodow from p_semaine) <> 1 then raise exception 'Choisissez un lundi'; end if;
  if length(coalesce(p_envoi, '')) not between 8 and 64 then raise exception 'Planning incomplet'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) <> 7 then raise exception 'Planning incomplet'; end if;
  for jour in select * from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(jour) <> 'array' or jsonb_array_length(jour) > 12 then raise exception 'Maximum de 12 éléments par jour.'; end if;
    for repas in select * from jsonb_array_elements(jour) loop
      if jsonb_typeof(repas->'recipeId') <> 'string' or jsonb_typeof(repas->'variantId') <> 'string' or jsonb_typeof(repas->'portions') <> 'number'
        or (repas->>'portions')::numeric not between 0.125 and 4 then
        raise exception 'Recette ou variante inconnue';
      end if;
    end loop;
  end loop;
  select * into ligne from public.plans_alimentaires where client_id = p_client and semaine = p_semaine for update;
  if found and ligne.envoi_id = p_envoi then return ligne.version; end if;
  if coalesce(ligne.version, '') <> coalesce(p_version, '') then raise exception 'Le planning a été modifié. Actualisez avant de réessayer.'; end if;
  v := public.version_nutrition();
  insert into public.plans_alimentaires (client_id, semaine, plan, version, envoi_id) values (p_client, p_semaine, p_plan, v, p_envoi)
  on conflict (client_id, semaine) do update set plan = excluded.plan, version = excluded.version, envoi_id = excluded.envoi_id, maj_le = now();
  return v;
end $$;

-- ===== Journal et recettes personnelles (api/personalFood) =====
create table public.alimentation_personnelle (
  client_id uuid not null references public.clients (id) on delete cascade,
  type text not null check (type in ('recipes', 'diary')),
  -- 'library' pour les recettes, le jour (AAAA-MM-JJ) pour le journal.
  cle text not null check ((type = 'recipes' and cle = 'library') or (type = 'diary' and cle ~ '^\d{4}-\d{2}-\d{2}$')),
  donnees jsonb not null check (jsonb_typeof(donnees) = 'array'),
  version int not null check (version >= 1),
  envoi_id text not null check (length(envoi_id) between 8 and 64),
  maj_le timestamptz not null default now(),
  primary key (client_id, type, cle)
);

create function public.enregistrer_alimentation_personnelle(p_client uuid, p_type text, p_date date, p_donnees jsonb, p_version int, p_envoi text)
returns int language plpgsql security definer set search_path = public as $$
declare
  ligne public.alimentation_personnelle;
  k text;
begin
  if not public.acces_nutrition(p_client) then raise exception 'Dossier alimentaire hors de votre dossier'; end if;
  if p_type not in ('recipes', 'diary') then raise exception 'Type inconnu'; end if;
  if p_type = 'diary' and p_date is null then raise exception 'Date manquante'; end if;
  if length(coalesce(p_envoi, '')) not between 8 and 64 then raise exception 'Enregistrement incomplet'; end if;
  if p_donnees is null or jsonb_typeof(p_donnees) <> 'array' then raise exception 'Données manquantes'; end if;
  if jsonb_array_length(p_donnees) > (case when p_type = 'recipes' then 200 else 100 end) then raise exception 'Trop d’éléments'; end if;
  k := case when p_type = 'recipes' then 'library' else to_char(p_date, 'YYYY-MM-DD') end;
  select * into ligne from public.alimentation_personnelle where client_id = p_client and type = p_type and cle = k for update;
  if found and ligne.envoi_id = p_envoi then return ligne.version; end if;
  if coalesce(ligne.version, 0) <> coalesce(p_version, 0) then raise exception 'Ces données ont changé. Actualisez avant de réessayer.'; end if;
  insert into public.alimentation_personnelle (client_id, type, cle, donnees, version, envoi_id) values (p_client, p_type, k, p_donnees, coalesce(ligne.version, 0) + 1, p_envoi)
  on conflict (client_id, type, cle) do update set donnees = excluded.donnees, version = excluded.version, envoi_id = excluded.envoi_id, maj_le = now();
  return coalesce(ligne.version, 0) + 1;
end $$;

alter table public.profils_alimentaires enable row level security;
alter table public.plans_alimentaires enable row level security;
alter table public.alimentation_personnelle enable row level security;

create policy "lecture : profil alimentaire" on public.profils_alimentaires for select using (public.acces_nutrition(client_id));
create policy "lecture : planning alimentaire" on public.plans_alimentaires for select using (public.acces_nutrition(client_id));
create policy "lecture : alimentation personnelle" on public.alimentation_personnelle for select using (public.acces_nutrition(client_id));

revoke all on public.profils_alimentaires, public.plans_alimentaires, public.alimentation_personnelle from anon, authenticated;
grant select on public.profils_alimentaires, public.plans_alimentaires, public.alimentation_personnelle to authenticated;

revoke execute on function public.acces_nutrition(uuid), public.version_nutrition(),
  public.enregistrer_profil_alimentaire(uuid, text, jsonb, jsonb, text, text),
  public.enregistrer_plan_alimentaire(uuid, date, jsonb, text, text),
  public.enregistrer_alimentation_personnelle(uuid, text, date, jsonb, int, text) from public, anon;
grant execute on function public.acces_nutrition(uuid), public.version_nutrition(),
  public.enregistrer_profil_alimentaire(uuid, text, jsonb, jsonb, text, text),
  public.enregistrer_plan_alimentaire(uuid, date, jsonb, text, text),
  public.enregistrer_alimentation_personnelle(uuid, text, date, jsonb, int, text) to authenticated;
