-- Coach OS : installation complète de la base, à coller en une fois dans Supabase > SQL Editor > Run.
-- Fichier généré par scripts/installation-sql.mjs à partir de supabase/migrations : ne pas modifier à la main.

-- ===== 20261019000000_prototype.sql =====
-- Coach OS · schéma du prototype
-- Plusieurs coachs dès le départ : chaque donnée est rattachée à un coach,
-- un coach ne voit que ses clients, un client ne voit que ses propres données.

create table public.coachs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  -- Lien de connexion par identifiant, pas par e-mail : l'e-mail peut changer.
  user_id uuid unique references auth.users (id) on delete set null,
  prenom text not null,
  nom text not null default '',
  telephone text,
  email text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.clients (coach_id);

create table public.exercices (
  id uuid primary key default gen_random_uuid(),
  -- null = catalogue commun à tous les coachs
  coach_id uuid references public.coachs (id) on delete cascade,
  nom text not null,
  mesures text[] not null,
  video_url text,
  constraint mesures_connues check (
    mesures <@ array['charge', 'repetitions', 'duree', 'distance', 'calories', 'watts', 'allure500']
    and cardinality(mesures) > 0
  )
);

create table public.seances (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  titre text not null,
  date_prevue date,
  consignes text,
  created_at timestamptz not null default now()
);
create index on public.seances (client_id);

create table public.blocs (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references public.seances (id) on delete cascade,
  ordre int not null,
  titre text not null,
  -- Chrono du circuit : {exercices, travailS, reposS, tours, reposEntreToursS}
  minuteur jsonb
);

create table public.lignes (
  id uuid primary key default gen_random_uuid(),
  bloc_id uuid not null references public.blocs (id) on delete cascade,
  ordre int not null,
  exercice_id uuid not null references public.exercices (id),
  series int not null check (series > 0),
  repetitions_min int,
  repetitions_max int,
  charge_indicative numeric,
  duree_s int,
  recuperation_s int,
  rir int,
  tempo text,
  consignes text,
  -- Chrono propre à l'exercice (fractionné, tabata…), même format que pour un bloc
  minuteur jsonb
);

-- Ce que le client a réellement fait. L'id est créé sur le téléphone :
-- un renvoi après coupure réseau ne crée pas de doublon.
create table public.realisations (
  id uuid primary key,
  seance_id uuid not null references public.seances (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  coach_id uuid not null references public.coachs (id) on delete cascade,
  debut timestamptz not null,
  fin timestamptz not null,
  commentaire text,
  created_at timestamptz not null default now()
);
create index on public.realisations (client_id, fin desc);

create table public.series_realisees (
  id uuid primary key,
  realisation_id uuid not null references public.realisations (id) on delete cascade,
  ligne_id uuid not null references public.lignes (id),
  exercice_id uuid not null references public.exercices (id),
  index int not null,
  valeurs jsonb not null,
  -- La suggestion affichée au client, gardée à part pour comparaison : jamais une performance.
  suggestion jsonb not null default '{}'
);
create index on public.series_realisees (realisation_id);

-- Qui suis-je ? (security definer pour éviter les boucles entre règles d'accès)
create function public.mon_coach_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.coachs where user_id = auth.uid()
$$;

create function public.mon_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.clients where user_id = auth.uid() and actif
$$;

create function public.coach_de_mon_client() returns uuid
language sql stable security definer set search_path = public as $$
  select coach_id from public.clients where user_id = auth.uid() and actif
$$;

alter table public.coachs enable row level security;
alter table public.clients enable row level security;
alter table public.exercices enable row level security;
alter table public.seances enable row level security;
alter table public.blocs enable row level security;
alter table public.lignes enable row level security;
alter table public.realisations enable row level security;
alter table public.series_realisees enable row level security;

create policy "coach : sa fiche" on public.coachs for select
  using (id = public.mon_coach_id() or id = public.coach_de_mon_client());

create policy "coach : ses clients" on public.clients for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "client : sa fiche" on public.clients for select
  using (id = public.mon_client_id());

create policy "exercices visibles" on public.exercices for select
  using (coach_id is null or coach_id = public.mon_coach_id() or coach_id = public.coach_de_mon_client());
create policy "coach : ses exercices" on public.exercices for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());

create policy "coach : ses séances" on public.seances for all
  using (coach_id = public.mon_coach_id())
  with check (
    coach_id = public.mon_coach_id()
    and exists (select 1 from public.clients c where c.id = client_id and c.coach_id = public.mon_coach_id())
  );
create policy "client : ses séances" on public.seances for select
  using (client_id = public.mon_client_id());

create policy "blocs de séances visibles" on public.blocs for select
  using (exists (select 1 from public.seances s where s.id = seance_id));
create policy "coach : blocs de ses séances" on public.blocs for all
  using (exists (select 1 from public.seances s where s.id = seance_id and s.coach_id = public.mon_coach_id()))
  with check (exists (select 1 from public.seances s where s.id = seance_id and s.coach_id = public.mon_coach_id()));

create policy "lignes de blocs visibles" on public.lignes for select
  using (exists (select 1 from public.blocs b where b.id = bloc_id));
create policy "coach : lignes de ses séances" on public.lignes for all
  using (exists (
    select 1 from public.blocs b join public.seances s on s.id = b.seance_id
    where b.id = bloc_id and s.coach_id = public.mon_coach_id()))
  with check (exists (
    select 1 from public.blocs b join public.seances s on s.id = b.seance_id
    where b.id = bloc_id and s.coach_id = public.mon_coach_id()));

create policy "client : ses réalisations" on public.realisations for select
  using (client_id = public.mon_client_id());
create policy "client : enregistre ses réalisations" on public.realisations for insert
  with check (
    client_id = public.mon_client_id()
    and coach_id = public.coach_de_mon_client()
    and exists (select 1 from public.seances s where s.id = seance_id and s.client_id = public.mon_client_id())
  );
create policy "coach : réalisations de ses clients" on public.realisations for select
  using (coach_id = public.mon_coach_id());

create policy "séries visibles" on public.series_realisees for select
  using (exists (select 1 from public.realisations r where r.id = realisation_id));
create policy "client : enregistre ses séries" on public.series_realisees for insert
  with check (exists (
    select 1 from public.realisations r where r.id = realisation_id and r.client_id = public.mon_client_id()));

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.clients, public.exercices, public.seances, public.blocs, public.lignes
  to authenticated;
grant insert on public.realisations, public.series_realisees to authenticated;
grant execute on function public.mon_coach_id(), public.mon_client_id(), public.coach_de_mon_client()
  to authenticated;


-- ===== 20261019010000_crm.sql =====
-- Coach OS · accueil des clients (CRM)
-- Remplace le parcours Tally → Make → Airtable : contacts, questionnaire d'accueil,
-- séance Booster et relances. Même règles que src/domain/crm.ts.

-- Adresse publique du questionnaire de chaque coach : /questionnaire/<lien>
alter table public.coachs add column lien_questionnaire text unique
  check (lien_questionnaire ~ '^[a-z0-9-]{3,40}$');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  prenom text not null default '',
  nom text not null default '',
  -- Numéro normalisé au format international sans « + » (336…), clé de rapprochement.
  telephone text check (telephone ~ '^\d{9,15}$'),
  email text,
  date_naissance text,
  statut text not null default 'prospect'
    check (statut in ('prospect', 'booster_prevu', 'booster_fait', 'client', 'archive')),
  statut_avant_archive text,
  source text,
  notes text,
  client_id uuid references public.clients (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index on public.contacts (coach_id, cree_le desc);
-- Un numéro = une personne active par coach. Les fiches archivées gardent leur numéro.
create unique index contacts_telephone_actif on public.contacts (coach_id, telephone)
  where telephone is not null and statut <> 'archive';

create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  recu_le timestamptz not null default now(),
  reponses jsonb not null,
  -- Ce que le rapprochement n'a pas pu trancher, à vérifier par le coach.
  alertes text[] not null default '{}'
);

create table public.boosters (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  date timestamptz not null,
  statut text not null default 'prevu' check (statut in ('prevu', 'fait', 'annule')),
  tests text,
  compte_rendu text,
  priorites text[] not null default '{}',
  paye boolean not null default false
);

create table public.relances (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  echeance date not null,
  modele text not null check (modele in ('questionnaire', 'booster', 'rappel_booster', 'suivi_booster', 'libre')),
  note text,
  faite_le timestamptz,
  auto boolean not null default false
);
create index on public.relances (coach_id, echeance) where faite_le is null;

alter table public.contacts enable row level security;
alter table public.questionnaires enable row level security;
alter table public.boosters enable row level security;
alter table public.relances enable row level security;

create policy "coach : ses contacts" on public.contacts for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "coach : ses questionnaires" on public.questionnaires for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "coach : ses boosters" on public.boosters for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "coach : ses relances" on public.relances for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());

grant select, insert, update, delete on public.contacts, public.questionnaires, public.boosters, public.relances
  to authenticated;
grant update (lien_questionnaire) on public.coachs to authenticated;
create policy "coach : modifie sa fiche" on public.coachs for update
  using (id = public.mon_coach_id()) with check (id = public.mon_coach_id());

-- 06 12 34 56 78, +33 6…, 0033 6… → 33612345678 ; null si ce n'est pas un numéro.
create function public.normaliser_telephone(brut text) returns text
language plpgsql immutable as $$
declare
  t text := regexp_replace(coalesce(brut, ''), '[^0-9+]', '', 'g');
begin
  if t like '+%' then t := substr(t, 2);
  elsif t like '00%' then t := substr(t, 3);
  elsif t like '0%' and length(t) = 10 then t := '33' || substr(t, 2);
  end if;
  t := regexp_replace(t, '[^0-9]', '', 'g');
  if t like '330%' then t := '33' || substr(t, 4); end if;
  return case when length(t) between 9 and 15 then t end;
end $$;

-- Réception du questionnaire d'accueil, ouverte sans compte (rôle anon).
-- security definer : le prospect n'a aucun droit de lecture, la fonction fait le rapprochement
-- (téléphone puis e-mail, jamais le nom), complète sans écraser et note les différences.
create function public.soumettre_questionnaire(lien text, reponses jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
  tel text := normaliser_telephone(reponses->>'telephone');
  mail text := lower(trim(reponses->>'email'));
  par_tel contacts;
  par_mail contacts;
  c contacts;
  alertes text[] := '{}';
  aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  select id into v_coach from coachs where lien_questionnaire = lien;
  if v_coach is null then raise exception 'Questionnaire introuvable'; end if;
  if pg_column_size(reponses) > 20000 then raise exception 'Réponses trop longues'; end if;
  if mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then mail := null; end if;
  if tel is null and mail is null then raise exception 'Téléphone ou e-mail requis'; end if;

  select * into par_tel from contacts
    where coach_id = v_coach and tel is not null and telephone = tel
    order by statut = 'archive', cree_le limit 1;
  select * into par_mail from contacts
    where coach_id = v_coach and mail is not null and email = mail
    order by statut = 'archive', cree_le limit 1;
  if par_tel.id is not null then c := par_tel; elsif par_mail.id is not null then c := par_mail; end if;

  if par_tel.id is not null and par_mail.id is not null and par_tel.id <> par_mail.id then
    alertes := alertes || format('L’e-mail correspond aussi à la fiche de %s %s. À vérifier.', par_mail.prenom, par_mail.nom);
  end if;

  if c.id is null then
    insert into contacts (coach_id, prenom, nom, telephone, email, date_naissance, source)
    values (v_coach, coalesce(trim(reponses->>'prenom'), ''), coalesce(trim(reponses->>'nom'), ''), tel, mail,
            reponses->>'dateNaissance', reponses->>'source')
    returning * into c;
  else
    if mail is not null and c.email is not null and c.email <> mail then
      alertes := alertes || format('E-mail différent dans le questionnaire : %s (fiche : %s).', mail, c.email);
    end if;
    if tel is not null and c.telephone is not null and c.telephone <> tel then
      alertes := alertes || format('Téléphone différent dans le questionnaire : %s (fiche : %s).', tel, c.telephone);
    end if;
    if c.statut = 'archive' then
      alertes := alertes || 'Ce contact était archivé : il a été réactivé par ses réponses.'::text;
    end if;
    update contacts set
      prenom = case when prenom = '' then coalesce(trim(reponses->>'prenom'), '') else prenom end,
      nom = case when nom = '' then coalesce(trim(reponses->>'nom'), '') else nom end,
      telephone = coalesce(telephone, tel),
      email = coalesce(email, mail),
      date_naissance = coalesce(date_naissance, reponses->>'dateNaissance'),
      source = coalesce(source, reponses->>'source'),
      statut = case when statut = 'archive' then coalesce(statut_avant_archive, 'prospect') else statut end,
      statut_avant_archive = case when statut = 'archive' then null else statut_avant_archive end
    where id = c.id
    returning * into c;
  end if;

  insert into questionnaires (coach_id, contact_id, reponses, alertes) values (v_coach, c.id, reponses, alertes);
  update relances set faite_le = now(), auto = true
    where contact_id = c.id and modele = 'questionnaire' and faite_le is null;
  if c.statut = 'prospect' and not exists (
    select 1 from relances where contact_id = c.id and modele = 'booster' and faite_le is null
  ) then
    insert into relances (coach_id, contact_id, echeance, modele) values (v_coach, c.id, aujourdhui, 'booster');
  end if;
end $$;

revoke execute on function public.soumettre_questionnaire(text, jsonb) from public;
grant execute on function public.soumettre_questionnaire(text, jsonb) to anon, authenticated;


-- ===== 20261019020000_booster_evaluation.sql =====
-- Évaluation physique et entretien de la séance Booster (champs repris d'Airtable).
-- evaluation : { tests: { poussee|tirage|jambes|cardio|mobilite|posture: { resultat, observations[], rpe } },
--                douleur, douleurPrecision, notes }
-- entretien : { pourquoiMaintenant, dejaEssaye, freins, attentesCoach, projection, observationsCoach }
-- La synthèse texte reste dans boosters.tests ; compte_rendu porte le mot du coach du compte rendu.
alter table public.boosters
  add column evaluation jsonb,
  add column entretien jsonb,
  add column plan_envoye_le timestamptz;


-- ===== 20261019030000_booster_redaction.sql =====
-- Textes développés du compte rendu (regard du coach, explication des tests, semaine, suite).
alter table public.boosters add column redaction jsonb;


-- ===== 20261020000000_creer_coach.sql =====
-- Ouvre l'espace d'un coach pour un compte déjà créé dans Authentication > Users.
-- À lancer depuis l'éditeur SQL de Supabase (rôle postgres) : select public.creer_coach('e-mail', 'Prénom', 'lien');
-- Le lien donne l'adresse publique du questionnaire d'accueil : /questionnaire/<lien>.
create function public.creer_coach(email_compte text, nom text, lien text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_coach uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(email_compte));
  if v_user is null then
    raise exception 'Aucun compte avec l''e-mail % : crée-le d''abord dans Authentication > Users.', email_compte;
  end if;
  insert into coachs (user_id, nom, lien_questionnaire) values (v_user, trim(nom), lower(trim(lien)))
  on conflict (user_id) do update set nom = excluded.nom, lien_questionnaire = excluded.lien_questionnaire
  returning id into v_coach;
  return v_coach;
end $$;

-- Réservée à l'administrateur du projet : ni les visiteurs ni les comptes connectés ne peuvent l'appeler.
revoke execute on function public.creer_coach(text, text, text) from public, anon, authenticated;


-- ===== 20261020010000_durcissement.sql =====
-- Recommandations de sécurité de Supabase : les fonctions « qui suis-je » ne servent qu'aux comptes connectés,
-- et normaliser_telephone a un search_path fixe. soumettre_questionnaire reste ouverte aux visiteurs (voulu).
revoke execute on function public.mon_coach_id(), public.mon_client_id(), public.coach_de_mon_client() from public, anon;
alter function public.normaliser_telephone(text) set search_path = public;


-- ===== 20261020020000_rattacher_compte.sql =====
-- Connexion d'un client avec Google, Microsoft, Apple ou son propre e-mail et mot de passe.
-- À sa première connexion, son compte est relié à sa fiche client si l'e-mail est vérifié
-- (par le fournisseur, ou par l'e-mail de confirmation) et correspond à un seul client actif sans compte.
-- Sans vérification, n'importe qui pourrait taper l'e-mail d'un client et voir ses données.
create function public.rattacher_mon_compte() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u auth.users;
  v_client uuid;
  candidats uuid[];
begin
  select * into u from auth.users where id = auth.uid();
  if u.id is null or u.email is null or u.email_confirmed_at is null then return null; end if;
  if exists (select 1 from coachs where user_id = u.id) then return null; end if;
  select id into v_client from clients where user_id = u.id;
  if v_client is not null then return v_client; end if;

  select array_agg(id) into candidats from clients
    where user_id is null and actif and lower(trim(email)) = lower(u.email);
  -- Même e-mail chez deux coachs : on ne devine pas, le coach crée l'accès depuis la fiche.
  if coalesce(cardinality(candidats), 0) <> 1 then return null; end if;
  update clients set user_id = u.id where id = candidats[1];
  return candidats[1];
end $$;

revoke execute on function public.rattacher_mon_compte() from public, anon;
grant execute on function public.rattacher_mon_compte() to authenticated;
