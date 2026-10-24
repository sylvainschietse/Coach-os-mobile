-- Coach OS · lot 4 : suivi de la semaine repris de l'app Zite.
-- Bilans hebdomadaires avec synthèse automatique (saveMyWeekly, buildAutoWeekly) et retour du coach (replyWeekly),
-- objectifs personnels du client (saveMyGoal) et photos de progression privées ou partagées (savePhoto).
-- Uniquement des ajouts : trois tables, leurs règles d'accès et quatre fonctions.

-- ===== Bilans hebdomadaires =====
create table public.bilans_hebdo (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Lundi de la semaine concernée.
  semaine date not null check (extract(isodow from semaine) = 1),
  reponses jsonb not null,
  envoye_le timestamptz not null default now(),
  -- Dernier envoi du téléphone : renvoyé deux fois, il ne crée ni ne modifie rien.
  envoi_id text not null check (length(envoi_id) between 8 and 80),
  retour_coach text not null default '' check (length(retour_coach) <= 12000),
  priorite text not null default '' check (length(priorite) <= 1000),
  repondu_le timestamptz,
  source_retour text check (source_retour in ('Automatique', 'Coach')),
  a_revoir boolean not null default false,
  unique (client_id, semaine)
);
create index on public.bilans_hebdo (coach_id, semaine desc);
create index on public.bilans_hebdo (client_id, envoi_id);

alter table public.bilans_hebdo enable row level security;
create policy "client : ses bilans" on public.bilans_hebdo for select using (client_id = public.mon_client_id());
create policy "coach : les bilans de ses clients" on public.bilans_hebdo for select using (coach_id = public.mon_coach_id());
-- Lecture seule : tout passe par enregistrer_bilan et repondre_bilan (les droits par défaut de Supabase donnent tout).
revoke all on public.bilans_hebdo from anon, authenticated;
grant select on public.bilans_hebdo to authenticated;

/** buildAutoWeekly d'origine, mot pour mot (le même texte est produit par domain/suivi-hebdo.ts). */
create function public.synthese_bilan(a jsonb, prec jsonb, prec_semaine date, cible int)
returns table (retour text, priorite text, a_revoir boolean)
language plpgsql immutable set search_path = public as $$
declare
  nettoyer constant text := '^\s+|\s+$';
  douleurs text := regexp_replace(coalesce(a->>'douleurs', ''), nettoyer, '', 'g');
  victoire text := regexp_replace(coalesce(a->>'victoire', ''), nettoyer, '', 'g');
  difficultes text := regexp_replace(coalesce(a->>'difficultes', ''), nettoyer, '', 'g');
  energie int := (a->>'energie')::int;
  sommeil int := (a->>'sommeil')::int;
  stress int := (a->>'stress')::int;
  motivation int := (a->>'motivation')::int;
  seances int := (a->>'seances')::int;
  douleur boolean;
  bas boolean := energie <= 3 or sommeil <= 3;
  stresse boolean := stress >= 8;
  demotive boolean := motivation <= 3;
  p text[];
begin
  douleur := douleurs <> '' and douleurs !~* '^(?:non|aucun(?:e)?(?: douleur(?:s)?| gêne(?:s)?)?|pas de (?:douleur(?:s)?|gêne(?:s)?)|ras|rien|0)[.! ]*$';
  p := array[
    'Tu as déclaré ' || seances || ' séance' || case when seances > 1 then 's' else '' end || ' cette semaine'
      || case when cible is null then '.' else ' pour un objectif de ' || cible || ' séance' || case when cible > 1 then 's' else '' end || ' dans ton programme.' end,
    'Énergie : ' || energie || '/10 · sommeil : ' || sommeil || '/10 · stress : ' || stress || '/10 · motivation : ' || motivation || '/10.'
  ];
  if prec is not null then
    p := p || ('Par rapport au bilan du ' || to_char(prec_semaine, 'DD/MM/YYYY') || ' : énergie ' || public.ecart_bilan(energie - (prec->>'energie')::int)
      || ', sommeil ' || public.ecart_bilan(sommeil - (prec->>'sommeil')::int) || ', motivation ' || public.ecart_bilan(motivation - (prec->>'motivation')::int) || '.');
  end if;
  if victoire <> '' then p := p || ('Réussite que tu as signalée : ' || victoire); end if;
  if difficultes <> '' then p := p || ('Difficulté que tu as signalée : ' || difficultes); end if;
  if douleur then p := p || 'Une douleur ou une gêne a été signalée : ton coach doit regarder ce point.'::text; end if;
  retour := array_to_string(p, E'\n\n');
  priorite := case
    when douleur then 'Décrire à ton coach la gêne, le mouvement concerné et le moment où elle apparaît, pour faire le point avant de faire évoluer les charges.'
    when bas then 'Faire le point avec ton coach sur ton énergie et ton sommeil, puis convenir avec lui d’un rythme réaliste pour la semaine suivante.'
    when stresse then 'Identifier la principale contrainte de la semaine et en parler à ton coach pour organiser les séances prévues autour de celle-ci.'
    when seances = 0 or (cible is not null and seances < cible) then
      case when cible is not null
        then 'Bloquer dans ton agenda les ' || cible || ' créneaux prévus par ton programme pour la semaine suivante, puis signaler au coach les éventuelles contraintes.'
        else 'Choisir avec ton coach les créneaux des séances prévues au programme pour la semaine suivante.' end
    when demotive then 'Identifier avec ton coach un objectif simple et motivant pour la semaine suivante, en tenant compte de la difficulté que tu as signalée.'
    when sommeil <= 5 then 'Choisir un horaire de coucher régulier cette semaine et noter ta qualité de sommeil dans le prochain bilan.'
    when difficultes <> '' then 'Choisir avec ton coach une solution concrète à la difficulté signalée, tout en gardant les séances prévues au programme.'
    when cible is not null then 'Planifier les ' || cible || ' séances de la semaine suivante selon ton programme, et noter une réussite à partager au prochain bilan.'
    else 'Planifier les séances de la semaine suivante selon ton programme, et noter une réussite à partager au prochain bilan.'
  end;
  a_revoir := douleur or bas or stresse;
  return next;
end $$;

create function public.ecart_bilan(n int) returns text language sql immutable as $$
  select case when n = 0 then 'stable' else case when n > 0 then '+' else '' end || n || ' point' || case when abs(n) > 1 then 's' else '' end end
$$;

/** saveMyWeekly : contrôles, synthèse automatique publiée tout de suite, modifiable tant que le coach n'a pas répondu. */
create function public.enregistrer_bilan(b jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_client_id();
  mon_coach uuid := public.coach_de_mon_client();
  s date;
  jour date := (now() at time zone 'Europe/Paris')::date;
  r jsonb := b->'reponses';
  ancien public.bilans_hebdo;
  prec public.bilans_hebdo;
  cible int;
  syn record;
  k text;
begin
  if moi is null then raise exception 'Bilan hors de votre dossier'; end if;
  begin
    s := (b->>'semaine')::date;
  exception when others then
    raise exception 'Semaine invalide ou future';
  end;
  if s is null or b->>'semaine' <> to_char(s, 'YYYY-MM-DD') or extract(isodow from s) <> 1 or s > jour - (extract(isodow from jour)::int - 1) then
    raise exception 'Semaine invalide ou future';
  end if;
  if length(coalesce(b->>'envoiId', '')) not between 8 and 80 then raise exception 'Envoi invalide'; end if;
  foreach k in array array['energie', 'sommeil', 'stress', 'motivation'] loop
    if jsonb_typeof(r->k) <> 'number' or (r->>k)::numeric not between 1 and 10 or (r->>k)::numeric <> trunc((r->>k)::numeric) then
      raise exception 'Complétez les quatre scores et le nombre de séances réalisées.';
    end if;
  end loop;
  if jsonb_typeof(r->'seances') <> 'number' or (r->>'seances')::numeric not between 0 and 30 or (r->>'seances')::numeric <> trunc((r->>'seances')::numeric) then
    raise exception 'Complétez les quatre scores et le nombre de séances réalisées.';
  end if;
  if jsonb_typeof(r->'difficultes') <> 'string' or jsonb_typeof(r->'douleurs') <> 'string' or jsonb_typeof(r->'victoire') <> 'string'
    or length(r->>'difficultes') > 2000 or length(r->>'douleurs') > 1500 or length(r->>'victoire') > 1000 then
    raise exception 'Réponse trop longue.';
  end if;
  if exists (select 1 from public.bilans_hebdo where client_id = moi and envoi_id = b->>'envoiId') then return 'doublon'; end if;
  select * into ancien from public.bilans_hebdo where client_id = moi and semaine = s;
  if found and ancien.repondu_le is not null and ancien.source_retour = 'Coach' then
    raise exception 'Votre coach a déjà répondu à ce bilan. Il reste conservé dans votre historique.';
  end if;
  select * into prec from public.bilans_hebdo where client_id = moi and semaine < s order by semaine desc limit 1;
  select p.seances_par_semaine into cible
  from public.cycles c join public.programmes p on p.id = c.programme_id
  where c.client_id = moi and c.statut in ('Actif', 'Terminé') and c.debut <= s + 6 and c.fin >= s
  order by c.debut desc limit 1;
  r := jsonb_build_object('energie', (r->>'energie')::int, 'sommeil', (r->>'sommeil')::int, 'stress', (r->>'stress')::int, 'motivation', (r->>'motivation')::int,
    'seances', (r->>'seances')::int, 'difficultes', r->>'difficultes', 'douleurs', r->>'douleurs', 'victoire', r->>'victoire');
  select * into syn from public.synthese_bilan(r, prec.reponses, prec.semaine, cible);
  insert into public.bilans_hebdo (coach_id, client_id, semaine, reponses, envoye_le, envoi_id, retour_coach, priorite, repondu_le, source_retour, a_revoir)
  values (mon_coach, moi, s, r, now(), b->>'envoiId', syn.retour, syn.priorite, now(), 'Automatique', syn.a_revoir)
  on conflict (client_id, semaine) do update set reponses = excluded.reponses, envoye_le = excluded.envoye_le, envoi_id = excluded.envoi_id,
    retour_coach = excluded.retour_coach, priorite = excluded.priorite, repondu_le = excluded.repondu_le, source_retour = excluded.source_retour,
    a_revoir = excluded.a_revoir;
  return 'enregistre';
end $$;

/** replyWeekly : le coach publie son retour ; refusé si le client a modifié son bilan entre-temps. */
create function public.repondre_bilan(p_id uuid, p_message text, p_priorite text, p_envoye_le timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bilans_hebdo;
begin
  select * into b from public.bilans_hebdo where id = p_id and coach_id = public.mon_coach_id();
  if not found then raise exception 'Bilan introuvable'; end if;
  if b.envoye_le <> p_envoye_le then raise exception 'Le client a modifié son bilan. Actualisez avant de répondre.'; end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 4000 or length(btrim(coalesce(p_priorite, ''))) not between 1 and 1000 then
    raise exception 'Renseignez le message et la priorité';
  end if;
  update public.bilans_hebdo set retour_coach = btrim(p_message), priorite = btrim(p_priorite), source_retour = 'Coach', a_revoir = false, repondu_le = now()
  where id = b.id;
end $$;

-- ===== Objectifs du client =====
create table public.objectifs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  titre text not null check (length(titre) between 3 and 120),
  unite text not null check (unite in ('kg', 'répétitions', 'minutes', 'km', 'séances', 'cm')),
  depart numeric not null check (depart between 0 and 1000000),
  cible numeric not null check (cible between 0 and 1000000),
  echeance date,
  -- [{date, valeur, envoiId}] : la première valeur est le point de départ.
  historique jsonb not null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  atteint_le timestamptz,
  archive boolean not null default false,
  dernier_envoi text not null,
  constraint objectif_cible check (cible <> depart)
);
create index on public.objectifs (client_id);

alter table public.objectifs enable row level security;
create policy "client : ses objectifs" on public.objectifs for select using (client_id = public.mon_client_id());
create policy "coach : les objectifs de ses clients" on public.objectifs for select using (coach_id = public.mon_coach_id());
revoke all on public.objectifs from anon, authenticated;
grant select on public.objectifs to authenticated;

/** saveMyGoal : créer, noter une valeur, archiver ou réactiver ; un envoi répété ne change rien. */
create function public.enregistrer_objectif(o jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_client_id();
  envoi text := o->>'envoiId';
  action text := o->>'action';
  g public.objectifs;
  v jsonb := o->'objectif';
  val numeric;
  jour date := (now() at time zone 'Europe/Paris')::date;
  nouvel uuid;
begin
  if moi is null then raise exception 'Objectif hors de votre dossier'; end if;
  if length(coalesce(envoi, '')) not between 8 and 80 then raise exception 'Envoi invalide'; end if;
  if action = 'creer' then
    select id into nouvel from public.objectifs where client_id = moi and (dernier_envoi = envoi or historique->0->>'envoiId' = envoi);
    if found then return nouvel; end if;
    if length(btrim(coalesce(v->>'titre', ''))) not between 3 and 120 then raise exception 'Nommez votre objectif (3 à 120 caractères)'; end if;
    if jsonb_typeof(v->'depart') <> 'number' or jsonb_typeof(v->'cible') <> 'number'
      or (v->>'depart')::numeric not between 0 and 1000000 or (v->>'cible')::numeric not between 0 and 1000000 then
      raise exception 'Renseignez le départ et la cible';
    end if;
    if (v->>'depart')::numeric = (v->>'cible')::numeric then raise exception 'La cible doit être différente du point de départ'; end if;
    if coalesce(v->>'echeance', '') <> '' and ((v->>'echeance')::date < jour or (v->>'echeance')::date > '2100-12-31') then raise exception 'Échéance invalide'; end if;
    insert into public.objectifs (coach_id, client_id, titre, unite, depart, cible, echeance, historique, dernier_envoi)
    values (public.coach_de_mon_client(), moi, btrim(v->>'titre'), v->>'unite', (v->>'depart')::numeric, (v->>'cible')::numeric,
      nullif(v->>'echeance', '')::date, jsonb_build_array(jsonb_build_object('date', now(), 'valeur', (v->>'depart')::numeric, 'envoiId', envoi)), envoi)
    returning id into nouvel;
    return nouvel;
  end if;
  select * into g from public.objectifs where id = (o->>'id')::uuid and client_id = moi for update;
  if not found then raise exception 'Objectif hors de votre dossier'; end if;
  if g.dernier_envoi = envoi or g.historique @> jsonb_build_array(jsonb_build_object('envoiId', envoi)) then return g.id; end if;
  if nullif(o->>'version', '') is null or g.modifie_le <> (o->>'version')::timestamptz then raise exception 'Cet objectif a changé. Actualisez avant de réessayer.'; end if;
  if action = 'progresser' then
    if g.archive then raise exception 'Cet objectif est archivé'; end if;
    if jsonb_typeof(o->'valeur') <> 'number' or (o->>'valeur')::numeric not between 0 and 1000000 then raise exception 'Valeur actuelle invalide'; end if;
    if jsonb_array_length(g.historique) >= 500 then raise exception 'Historique complet : créez un nouvel objectif'; end if;
    val := (o->>'valeur')::numeric;
    update public.objectifs set
      historique = historique || jsonb_build_array(jsonb_build_object('date', now(), 'valeur', val, 'envoiId', envoi)),
      atteint_le = case when (cible > depart and val >= cible) or (cible < depart and val <= cible) then coalesce(atteint_le, now()) end,
      modifie_le = now(), dernier_envoi = envoi
    where id = g.id;
  elsif action in ('archiver', 'restaurer') then
    update public.objectifs set archive = action = 'archiver', modifie_le = now(), dernier_envoi = envoi where id = g.id;
  else
    raise exception 'Action inconnue';
  end if;
  return g.id;
end $$;

-- ===== Photos de progression =====
-- Image JPEG réduite (350 000 caractères au plus) gardée dans la ligne : la règle d'accès de la ligne protège aussi l'image.
create table public.photos_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.coach_de_mon_client() references public.coachs (id) on delete cascade,
  client_id uuid not null default public.mon_client_id() references public.clients (id) on delete cascade,
  date_photo date not null,
  vue text not null check (vue in ('Face', 'Profil', 'Dos')),
  partage boolean not null default false,
  image text not null check (length(image) <= 350000 and image ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/=]+$'),
  envoi_id text not null check (length(envoi_id) between 8 and 80),
  cree_le timestamptz not null default now(),
  unique (client_id, envoi_id)
);
create index on public.photos_clients (client_id, date_photo desc);

alter table public.photos_clients enable row level security;
create policy "client : ses photos" on public.photos_clients for select using (client_id = public.mon_client_id());
create policy "client : ajouter ses photos" on public.photos_clients for insert
  with check (client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client() and date_photo <= (now() at time zone 'Europe/Paris')::date);
create policy "client : partager ses photos" on public.photos_clients for update
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id());
create policy "client : supprimer ses photos" on public.photos_clients for delete using (client_id = public.mon_client_id());
-- Le coach ne voit que ce que le client partage, au moment où il le demande.
create policy "coach : photos partagées" on public.photos_clients for select using (coach_id = public.mon_coach_id() and partage);
-- Les droits par défaut de Supabase donnent tout : on repart de rien pour cette table.
revoke all on public.photos_clients from anon, authenticated;
grant select, insert, delete on public.photos_clients to authenticated;
-- Seul le partage se modifie : ni la date, ni la vue, ni l'image.
grant update (partage) on public.photos_clients to authenticated;

revoke execute on function public.enregistrer_bilan(jsonb), public.repondre_bilan(uuid, text, text, timestamptz), public.enregistrer_objectif(jsonb),
  public.synthese_bilan(jsonb, jsonb, date, int), public.ecart_bilan(int) from public, anon;
grant execute on function public.enregistrer_bilan(jsonb), public.repondre_bilan(uuid, text, text, timestamptz), public.enregistrer_objectif(jsonb)
  to authenticated;
grant execute on function public.synthese_bilan(jsonb, jsonb, date, int), public.ecart_bilan(int) to authenticated;
