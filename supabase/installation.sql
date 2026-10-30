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


-- ===== 20261020030000_taches.sql =====
-- Tâches libres sur une fiche (ex. Airtable « Tâches ») : une relance sans message, le texte à faire est dans la note.
alter table public.relances drop constraint relances_modele_check;
alter table public.relances add constraint relances_modele_check
  check (modele in ('questionnaire', 'booster', 'rappel_booster', 'suivi_booster', 'libre', 'tache'));


-- ===== 20261021000000_programmes_suivi.sql =====
-- Coach OS · programmes et séances créés par le coach, catalogue d'exercices,
-- mensurations, records (PR) et nutrition.

-- ===== Catalogue d'exercices (importé d'Airtable, où il reste la référence) =====
alter table public.exercices
  add column ref_externe text,
  add column nom_en text,
  add column alias text,
  add column famille text,
  add column pattern text,
  add column muscles text[] not null default '{}',
  add column muscles_secondaires text[] not null default '{}',
  add column materiel text[] not null default '{}',
  add column modalite text,
  add column niveau text,
  add column position text,
  add column lateralite text,
  add column actif boolean not null default true;
create unique index exercices_ref_externe on public.exercices (coach_id, ref_externe) where ref_externe is not null;
create index exercices_coach_famille on public.exercices (coach_id, famille);

-- ===== Programmes =====
-- Un modèle (client_id vide) garde ses séances en JSON, invisibles des clients.
-- Attribué à un client, il devient de vraies séances rattachées au programme.
create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  objectif text,
  duree_semaines int check (duree_semaines between 1 and 104),
  seances_par_semaine int check (seances_par_semaine between 1 and 14),
  niveau text,
  notes text,
  modele_seances jsonb not null default '[]',
  archive boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.programmes (coach_id);
create index on public.programmes (client_id);

alter table public.programmes enable row level security;
create policy "coach : ses programmes" on public.programmes for all
  using (coach_id = public.mon_coach_id())
  with check (
    coach_id = public.mon_coach_id()
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.coach_id = public.mon_coach_id()))
  );
create policy "client : ses programmes" on public.programmes for select
  using (client_id = public.mon_client_id());

alter table public.seances
  add column programme_id uuid references public.programmes (id) on delete set null,
  add column ordre int,
  add column archivee boolean not null default false;
create index on public.seances (programme_id);

-- Une ligne ou un bloc enlevé de la séance est marqué retiré : l'historique du client reste intact.
alter table public.blocs add column retire boolean not null default false;
alter table public.lignes add column retiree boolean not null default false;

-- Enregistre une séance complète (en-tête, blocs, lignes) en une fois, avec les droits de l'appelant.
-- Les identifiants viennent de l'app : une ligne gardée garde son id, l'historique reste rattaché.
create function public.enregistrer_seance(s jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
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

  insert into public.seances (id, coach_id, client_id, programme_id, titre, date_prevue, consignes, ordre)
  values (
    v_id, public.mon_coach_id(), (s->>'clientId')::uuid, nullif(s->>'programmeId', '')::uuid,
    s->>'titre', nullif(s->>'datePrevue', '')::date, nullif(s->>'consignes', ''), nullif(s->>'ordre', '')::int)
  on conflict (id) do update set
    titre = excluded.titre, date_prevue = excluded.date_prevue, consignes = excluded.consignes, ordre = excluded.ordre;

  -- Ce qui est enlevé est retiré, jamais effacé : une ligne déjà réalisée garde son historique.
  update public.lignes set retiree = true
  where bloc_id in (select id from public.blocs where seance_id = v_id) and not (id = any (v_lignes));
  update public.blocs set retire = true where seance_id = v_id and not (id = any (v_blocs));

  for b in select * from jsonb_array_elements(coalesce(s->'blocs', '[]')) loop
    i := i + 1;
    insert into public.blocs (id, seance_id, ordre, titre, minuteur)
    values ((b->>'id')::uuid, v_id, i, coalesce(nullif(b->>'titre', ''), 'Bloc ' || i), nullif(b->'minuteur', 'null'::jsonb))
    on conflict (id) do update set ordre = excluded.ordre, titre = excluded.titre, minuteur = excluded.minuteur, retire = false
    where blocs.seance_id = v_id;
    j := 0;
    for l in select * from jsonb_array_elements(coalesce(b->'lignes', '[]')) loop
      j := j + 1;
      insert into public.lignes (id, bloc_id, ordre, exercice_id, series, repetitions_min, repetitions_max,
        charge_indicative, duree_s, recuperation_s, rir, tempo, consignes, minuteur)
      values ((l->>'id')::uuid, (b->>'id')::uuid, j, (l->>'exerciceId')::uuid, (l->>'series')::int,
        (l->>'repetitionsMin')::int, (l->>'repetitionsMax')::int, (l->>'chargeIndicative')::numeric,
        (l->>'dureeS')::int, (l->>'recuperationS')::int, (l->>'rir')::int, nullif(l->>'tempo', ''),
        nullif(l->>'consignes', ''), nullif(l->'minuteur', 'null'::jsonb))
      on conflict (id) do update set
        bloc_id = excluded.bloc_id, ordre = excluded.ordre, exercice_id = excluded.exercice_id,
        series = excluded.series, repetitions_min = excluded.repetitions_min,
        repetitions_max = excluded.repetitions_max, charge_indicative = excluded.charge_indicative,
        duree_s = excluded.duree_s, recuperation_s = excluded.recuperation_s, rir = excluded.rir,
        tempo = excluded.tempo, consignes = excluded.consignes, minuteur = excluded.minuteur, retiree = false;
    end loop;
  end loop;
  return v_id;
end $$;

-- ===== Suivi du client : mensurations, records, nutrition =====
-- Le client saisit les siennes, le coach voit (et peut corriger) celles de ses clients.
create function public.est_mon_client(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients where id = c and coach_id = public.mon_coach_id())
$$;

create table public.mensurations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  date date not null default current_date,
  poids_kg numeric check (poids_kg between 20 and 400),
  masse_grasse_pct numeric check (masse_grasse_pct between 2 and 75),
  tour_taille_cm numeric check (tour_taille_cm between 30 and 250),
  tour_hanches_cm numeric check (tour_hanches_cm between 30 and 250),
  tour_poitrine_cm numeric check (tour_poitrine_cm between 30 and 250),
  tour_bras_cm numeric check (tour_bras_cm between 10 and 100),
  tour_cuisse_cm numeric check (tour_cuisse_cm between 20 and 150),
  note text,
  created_at timestamptz not null default now(),
  constraint mensuration_non_vide check (num_nonnulls(poids_kg, masse_grasse_pct, tour_taille_cm, tour_hanches_cm,
    tour_poitrine_cm, tour_bras_cm, tour_cuisse_cm) > 0)
);
create index on public.mensurations (client_id, date desc);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  exercice_id uuid references public.exercices (id) on delete set null,
  libelle text not null check (length(trim(libelle)) > 0),
  valeur numeric not null check (valeur > 0),
  unite text not null check (unite in ('kg', 'reps', 's', 'm', 'cal')),
  -- Pour une charge : à combien de répétitions (1 = 1RM)
  repetitions int check (repetitions > 0),
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index on public.records (client_id, date desc);

create table public.plans_nutrition (
  client_id uuid primary key references public.clients (id) on delete cascade,
  calories int check (calories between 800 and 8000),
  proteines_g int check (proteines_g between 0 and 600),
  glucides_g int check (glucides_g between 0 and 1200),
  lipides_g int check (lipides_g between 0 and 400),
  eau_l numeric check (eau_l between 0 and 10),
  conseils text,
  updated_at timestamptz not null default now()
);

create table public.journal_nutrition (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  date date not null default current_date,
  -- Ressenti du client sur le respect du plan, de 1 (pas du tout) à 5 (parfaitement)
  respect int check (respect between 1 and 5),
  eau_l numeric check (eau_l between 0 and 15),
  repas text,
  ressenti text,
  created_at timestamptz not null default now(),
  unique (client_id, date),
  constraint journal_non_vide check (num_nonnulls(respect, eau_l, nullif(trim(repas), ''), nullif(trim(ressenti), '')) > 0)
);

alter table public.mensurations enable row level security;
alter table public.records enable row level security;
alter table public.plans_nutrition enable row level security;
alter table public.journal_nutrition enable row level security;

create policy "client et coach : mensurations" on public.mensurations for all
  using (client_id = public.mon_client_id() or public.est_mon_client(client_id))
  with check (client_id = public.mon_client_id() or public.est_mon_client(client_id));
create policy "client et coach : records" on public.records for all
  using (client_id = public.mon_client_id() or public.est_mon_client(client_id))
  with check (client_id = public.mon_client_id() or public.est_mon_client(client_id));
create policy "client et coach : journal nutrition" on public.journal_nutrition for all
  using (client_id = public.mon_client_id() or public.est_mon_client(client_id))
  with check (client_id = public.mon_client_id() or public.est_mon_client(client_id));
create policy "coach : plans nutrition" on public.plans_nutrition for all
  using (public.est_mon_client(client_id)) with check (public.est_mon_client(client_id));
create policy "client : son plan nutrition" on public.plans_nutrition for select
  using (client_id = public.mon_client_id());

grant select, insert, update, delete on public.programmes, public.mensurations, public.records,
  public.plans_nutrition, public.journal_nutrition to authenticated;
grant execute on function public.enregistrer_seance(jsonb), public.est_mon_client(uuid) to authenticated;


-- ===== 20261024000000_alimentation.sql =====
-- Alimentation : profil du client (besoins calculés dans l'app), base d'aliments et codes-barres,
-- recettes (banque du coach et recettes personnelles), journal des repas.
-- Migration additive : rien n'est supprimé.

create table public.profils_nutrition (
  client_id uuid primary key references public.clients (id) on delete cascade,
  sexe text check (sexe in ('femme', 'homme')),
  naissance date check (naissance >= '1920-01-01'),
  taille_cm numeric check (taille_cm between 100 and 250),
  poids_kg numeric check (poids_kg between 25 and 350),
  activite text check (activite in ('sedentaire', 'leger', 'modere', 'actif', 'tres_actif')),
  objectif text check (objectif in ('perte', 'maintien', 'prise')),
  regimes text[] not null default '{}'
    check (regimes <@ array['vegetarien', 'vegan', 'pescetarien', 'sans_gluten', 'sans_lactose', 'low_carb', 'high_protein']),
  exclusions text check (length(exclusions) <= 1000),
  updated_at timestamptz not null default now()
);

-- coach_id vide : base commune. client_id rempli : aliment personnel de ce client.
create table public.aliments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coachs (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  source text not null check (source in ('base', 'off', 'coach', 'client')),
  nom text not null check (length(trim(nom)) between 1 and 200),
  marque text check (length(marque) <= 200),
  code_barres text check (code_barres ~ '^[0-9]{8,14}$'),
  categorie text,
  kcal numeric not null check (kcal between 0 and 900),
  proteines numeric not null check (proteines between 0 and 100),
  glucides numeric not null check (glucides between 0 and 100),
  lipides numeric not null check (lipides between 0 and 100),
  fibres numeric check (fibres between 0 and 100),
  portion_g numeric check (portion_g > 0 and portion_g < 5000),
  portion_libelle text,
  contient text[] not null default '{}'
    check (contient <@ array['viande', 'poisson', 'fruits_de_mer', 'oeuf', 'lait', 'gluten', 'miel']),
  archive boolean not null default false,
  created_at timestamptz not null default now(),
  check (client_id is null or coach_id is not null)
);
create index aliments_coach on public.aliments (coach_id);
create index aliments_code on public.aliments (code_barres) where code_barres is not null;
-- Un code-barres partagé n'existe qu'une fois par coach (et une fois dans la base commune).
create unique index aliments_code_unique on public.aliments (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'::uuid), code_barres)
  where code_barres is not null and client_id is null;

create table public.recettes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  -- Vide : recette de la banque du coach. Rempli : recette personnelle du client.
  client_id uuid references public.clients (id) on delete cascade,
  titre text not null check (length(trim(titre)) between 1 and 200),
  description text,
  portions int not null default 1 check (portions between 1 and 50),
  temps_min int check (temps_min between 0 and 1440),
  etapes text,
  ingredients jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array'),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'approuvee')),
  regimes_confirmes text[] not null default '{}',
  archive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recettes_coach on public.recettes (coach_id);
create index recettes_client on public.recettes (client_id) where client_id is not null;

create table public.repas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  date date not null,
  moment text not null check (moment in ('petit_dejeuner', 'dejeuner', 'collation', 'diner')),
  libelle text not null check (length(trim(libelle)) between 1 and 300),
  quantite_g numeric check (quantite_g > 0 and quantite_g <= 5000),
  portions numeric check (portions > 0 and portions <= 20),
  kcal numeric not null check (kcal between 0 and 10000),
  proteines numeric not null check (proteines between 0 and 1000),
  glucides numeric not null check (glucides between 0 and 1000),
  lipides numeric not null check (lipides between 0 and 1000),
  aliment_id uuid references public.aliments (id) on delete set null,
  recette_id uuid references public.recettes (id) on delete set null,
  source text not null check (source in ('saisie', 'scan', 'photo', 'recette')),
  created_at timestamptz not null default now()
);
create index repas_client_date on public.repas (client_id, date);

alter table public.profils_nutrition enable row level security;
alter table public.aliments enable row level security;
alter table public.recettes enable row level security;
alter table public.repas enable row level security;

create policy "client : son profil nutrition" on public.profils_nutrition for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id());
create policy "coach : profils nutrition" on public.profils_nutrition for all
  using (public.est_mon_client(client_id)) with check (public.est_mon_client(client_id));

create policy "lecture des aliments" on public.aliments for select using (
  coach_id is null
  or coach_id = public.mon_coach_id()
  or (coach_id = public.coach_de_mon_client() and (client_id is null or client_id = public.mon_client_id()))
);
create policy "coach : ses aliments" on public.aliments for insert
  with check (coach_id = public.mon_coach_id() and source in ('coach', 'off'));
create policy "coach : modifier ses aliments" on public.aliments for update
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
-- Le client ajoute ses aliments personnels, et les produits scannés pour tous les clients de son coach.
create policy "client : ajouter un aliment" on public.aliments for insert with check (
  coach_id = public.coach_de_mon_client()
  and (
    (client_id = public.mon_client_id() and source = 'client')
    or (client_id is null and source = 'off' and code_barres is not null)
  )
);
create policy "client : modifier ses aliments" on public.aliments for update
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client());

create policy "coach : recettes" on public.recettes for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "client : lire les recettes" on public.recettes for select using (
  coach_id = public.coach_de_mon_client()
  and ((client_id is null and statut = 'approuvee') or client_id = public.mon_client_id())
);
create policy "client : ajouter ses recettes" on public.recettes for insert
  with check (client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client() and statut = 'brouillon');
create policy "client : modifier ses recettes" on public.recettes for update
  using (client_id = public.mon_client_id())
  with check (client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client() and statut = 'brouillon');

create policy "client : ses repas" on public.repas for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id());
create policy "coach : repas de ses clients" on public.repas for select using (public.est_mon_client(client_id));

grant select, insert, update, delete on public.profils_nutrition, public.repas to authenticated;
grant select, insert, update on public.aliments, public.recettes to authenticated;


-- ===== 20261024100000_alimentation_zite.sql =====
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


-- ===== 20261024200000_plans_repas.sql =====
-- Plan alimentaire de la semaine (repris de plansAlimentaires / mealPlan.ts de l'app d'origine).
-- Une ligne par client et par semaine (un lundi), 7 jours de repas en JSON.
-- Le coach crée et modifie ; le client lit son plan. `version` refuse l'écrasement d'une modification concurrente.
create table if not exists public.plans_repas (
  client_id uuid not null references public.clients (id) on delete cascade,
  semaine date not null check (extract(isodow from semaine) = 1),
  jours jsonb not null check (jsonb_typeof(jours) = 'array' and jsonb_array_length(jours) = 7),
  version timestamptz not null default now(),
  auteur text not null default 'coach' check (auteur in ('coach', 'client')),
  primary key (client_id, semaine)
);

alter table public.plans_repas enable row level security;

create policy "coach : plans de repas" on public.plans_repas for all
  using (public.est_mon_client(client_id)) with check (public.est_mon_client(client_id) and auteur = 'coach');
create policy "client : lire son plan de repas" on public.plans_repas for select
  using (client_id = public.mon_client_id());
grant select, insert, update on public.plans_repas to authenticated;


-- ===== 20261024300000_crm_champs_origine.sql =====
-- Lot 2 : champs de la configuration d'origine (Champs-CRM.json) pour la fiche Contact et l'éditeur Booster.
-- Ajouts seulement : les colonnes existantes et leurs données restent telles quelles.

-- Statut affiché choisi par le coach ; null = il suit l'étape du parcours (colonne statut).
alter table public.contacts add column if not exists statut_crm text
  check (statut_crm in ('Nouveau Prospect', 'Booster planifié', 'Booster réalisé', 'En réflexion', 'Client actif',
                        'Coaching terminé', 'A relancer', 'Perdu'));
alter table public.contacts add column if not exists objectif_principal text;
alter table public.contacts add column if not exists prochaine_action text;
alter table public.contacts add column if not exists offre_vendue text;

alter table public.boosters add column if not exists nom text;
-- Statuts ouverts choisis par le coach ; Terminée / Annulée découlent de statut (fait / annule).
alter table public.boosters add column if not exists statut_crm text
  check (statut_crm in ('À préparer', 'Questionnaire reçu', 'En cours', 'Terminée', 'Annulée'));
alter table public.boosters add column if not exists resume_ia text;
alter table public.boosters add column if not exists points_attention text;
alter table public.boosters add column if not exists offre_recommandee text;
alter table public.boosters add column if not exists resultat_commercial text;
alter table public.boosters add column if not exists date_relance date;
-- Réservées au coach : le compte rendu envoyé au client ne les reprend pas.
alter table public.boosters add column if not exists notes_internes text;


-- ===== 20261024400000_documents.sql =====
-- Lot 2 : Documents (C07) et « Mes documents » du client (U11).
-- Un document = une ligne versionnée ; son fichier est dans le compartiment privé « documents »,
-- sous <coach>/<document>/v<version>-<nom>. Le client ne lit que les documents partagés de son propre dossier,
-- sans les commentaires internes, et seulement par lien signé de courte durée.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  booster_id uuid references public.boosters (id) on delete set null,
  nom text not null check (length(trim(nom)) > 0),
  type text not null default 'Autre'
    check (type in ('Plan d''action', 'Contrat', 'Facture', 'Bilan', 'Avant / Après', 'Photo', 'Autre')),
  date date not null default (now() at time zone 'Europe/Paris')::date,
  version integer not null default 1 check (version >= 1),
  -- Fichier de la version courante ; les versions précédentes restent dans le compartiment.
  chemin text,
  nom_fichier text,
  type_fichier text,
  taille integer check (taille is null or taille >= 0),
  partage_client boolean not null default false,
  -- Vrai seulement quand l'envoi est confirmé : ouvrir une messagerie ne suffit pas.
  envoye boolean not null default false,
  commentaires text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index on public.documents (coach_id, date desc);
create index on public.documents (contact_id);
-- Un compte rendu par Booster : les nouvelles générations en sont des versions.
create unique index documents_compte_rendu on public.documents (booster_id) where booster_id is not null and type = 'Plan d''action';

alter table public.documents enable row level security;
create policy "coach : ses documents" on public.documents for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
grant select, insert, update, delete on public.documents to authenticated;

-- Dossiers (contacts) rattachés au client connecté ; le client n'a aucun droit direct sur contacts.
create function public.documents_partages_avec_moi()
returns table (id uuid, nom text, type text, date date, version integer, chemin text, nom_fichier text, type_fichier text, taille integer)
language sql stable security definer set search_path = public as $$
  select d.id, d.nom, d.type, d.date, d.version, d.chemin, d.nom_fichier, d.type_fichier, d.taille
  from documents d
  join contacts c on c.id = d.contact_id
  where d.partage_client and d.chemin is not null
    and public.mon_client_id() is not null and c.client_id = public.mon_client_id()
  order by d.date desc, d.modifie_le desc
$$;
revoke execute on function public.documents_partages_avec_moi() from public, anon;
grant execute on function public.documents_partages_avec_moi() to authenticated;

-- Utilisée par la règle du compartiment : ce fichier est-il la version partagée d'un document du client ?
create function public.fichier_partage_avec_moi(p_chemin text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents d join contacts c on c.id = d.contact_id
    where d.chemin = p_chemin and d.partage_client
      and public.mon_client_id() is not null and c.client_id = public.mon_client_id()
  )
$$;
revoke execute on function public.fichier_partage_avec_moi(text) from public, anon;
grant execute on function public.fichier_partage_avec_moi(text) to authenticated;


-- ===== 20261024400100_documents_stockage.sql =====
-- Fichiers des documents : compartiment privé, rien n'est public. Le coach dépose et lit dans son dossier ;
-- le client ne lit que les fichiers des documents partagés avec lui (lien signé de courte durée).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "documents : le coach dépose dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "documents : le coach lit son dossier" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "documents : le client lit ce qui lui est partagé" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.fichier_partage_avec_moi(name));


-- ===== 20261024400200_documents_un_par_booster.sql =====
-- Le compte rendu d'origine (createBoosterReport) est de type « Bilan » : l'unicité vaut pour tout document lié à un Booster.
create unique index documents_un_par_booster on public.documents (booster_id) where booster_id is not null;


-- ===== 20261024500000_entrainement.sql =====
-- Coach OS · lot 3 : entraînement complet repris de l'app Zite.
-- Programmes et séances modèles en vraies lignes (comme dans Airtable), suivis et cycles clients,
-- calendrier du client et réalisations rattachées à leur cycle avec des libellés figés.
-- Tout est ajouté : seules la règle « coach : ses séances », celle d'insertion des réalisations et
-- la fonction enregistrer_seance sont remplacées pour accepter une séance de modèle (sans client).

-- ===== Programmes : les champs d'Airtable =====
alter table public.programmes
  add column ref_externe text,
  add column statut text not null default 'Brouillon',
  add column environnement text,
  add column materiel text,
  add column contraintes text,
  add column consignes text,
  add column duree_cible_min int check (duree_cible_min between 1 and 600),
  add column priorites text[] not null default '{}',
  add column version text,
  add column modele_origine_id uuid references public.programmes (id) on delete set null,
  add column cycle_applique int check (cycle_applique between 1 and 4),
  -- « Séance seule · … » : conteneur d'une séance créée hors programme (version coachos-single d'origine).
  add column seance_seule boolean not null default false,
  -- Corbeille : masqué de la bibliothèque, restaurable. Rien n'est effacé.
  add column supprime_le timestamptz;
create unique index programmes_ref_externe on public.programmes (coach_id, ref_externe) where ref_externe is not null;

-- ===== Séances : une séance de modèle n'a pas de client =====
alter table public.seances alter column client_id drop not null;
alter table public.seances
  add column dominante text,
  add column duree_prevue_min int check (duree_prevue_min between 1 and 600),
  add column objectif text,
  add column ref_externe text,
  add column supprime_le timestamptz;
create unique index seances_ref_externe on public.seances (coach_id, ref_externe) where ref_externe is not null;

-- ===== Lignes : prescription complète d'Airtable =====
alter table public.lignes
  -- Texte tel que prescrit (« 12–15 », « 6–8 par côté ») ; repetitions_min/max restent pour la saisie.
  add column repetitions text,
  add column distance_m numeric check (distance_m > 0),
  -- « Charge à ajuster au RIR cible », « 70 % 1RM », ou l'objectif cardio « 20 cal », « 2:05 / 500 m »…
  add column charge_intensite text,
  add column phase text check (phase in ('Échauffement', 'Principal', 'Finisher', 'Retour au calme')),
  add column progression text,
  -- Les quatre variantes du modèle (ancien marqueur COACHOS_CYCLES), jamais montrées telles quelles.
  add column cycles jsonb check (cycles is null or (jsonb_typeof(cycles) = 'array' and jsonb_array_length(cycles) = 4)),
  add column ref_externe text;
alter table public.lignes drop constraint lignes_series_check;
alter table public.lignes add constraint lignes_series_check check (series between 0 and 50);

drop policy "coach : ses séances" on public.seances;
create policy "coach : ses séances" on public.seances for all
  using (coach_id = public.mon_coach_id())
  with check (
    coach_id = public.mon_coach_id()
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.coach_id = public.mon_coach_id()))
    and (programme_id is null or exists (select 1 from public.programmes p where p.id = programme_id and p.coach_id = public.mon_coach_id()))
  );

-- ===== Suivi d'un client et ses cycles (Suivis.tsx, saveSuivi, saveCycle, activerCycle) =====
create table public.suivis (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null unique references public.clients (id) on delete cascade,
  debut date not null,
  duree_mois int not null check (duree_mois between 1 and 24),
  cree_le timestamptz not null default now()
);

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  suivi_id uuid not null references public.suivis (id) on delete cascade,
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  ordre int not null,
  nom text not null check (length(trim(nom)) between 1 and 120),
  objectif text check (length(objectif) <= 2000),
  debut date not null,
  fin date not null,
  statut text not null default 'Brouillon' check (statut in ('Brouillon', 'Prêt', 'Actif', 'Terminé')),
  programme_id uuid references public.programmes (id) on delete set null,
  mode text check (mode in ('Modèle', 'Copie personnalisée')),
  cree_le timestamptz not null default now(),
  constraint cycle_dates check (fin >= debut)
);
create index on public.cycles (suivi_id, ordre);
create index on public.cycles (client_id);
-- Un seul cycle actif par suivi : deux activations simultanées ne peuvent pas passer toutes les deux.
create unique index cycles_un_actif on public.cycles (suivi_id) where statut = 'Actif';

-- Règles d'origine tenues par la base : l'activation ne passe que par activer_cycle, un cycle actif garde
-- un programme, le programme d'un cycle terminé est figé.
create function public.controler_cycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.statut = 'Actif' and (tg_op = 'INSERT' or old.statut <> 'Actif')
     and coalesce(current_setting('coachos.activation', true), '') <> 'oui' then
    raise exception 'Utilisez « Activer » pour rendre un cycle actif';
  end if;
  if new.statut = 'Actif' and new.programme_id is null then
    raise exception 'Un cycle actif doit garder un programme';
  end if;
  if tg_op = 'UPDATE' and old.statut = 'Terminé' and new.programme_id is distinct from old.programme_id then
    raise exception 'Cycle terminé : programme figé';
  end if;
  return new;
end $$;
create trigger controler_cycle before insert or update on public.cycles for each row execute function public.controler_cycle();

alter table public.suivis enable row level security;
alter table public.cycles enable row level security;
create policy "coach : suivis de ses clients" on public.suivis for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.est_mon_client(client_id));
create policy "client : son suivi" on public.suivis for select using (client_id = public.mon_client_id());
create policy "coach : cycles de ses clients" on public.cycles for all
  using (coach_id = public.mon_coach_id())
  with check (
    coach_id = public.mon_coach_id() and public.est_mon_client(client_id)
    and exists (select 1 from public.suivis s where s.id = suivi_id and s.client_id = cycles.client_id)
    and (programme_id is null or exists (select 1 from public.programmes p where p.id = programme_id and p.coach_id = public.mon_coach_id()))
  );
-- Brouillons et cycles « Prêt » ne sont jamais montrés au client (getClientEspace d'origine).
create policy "client : ses cycles visibles" on public.cycles for select
  using (client_id = public.mon_client_id() and statut in ('Actif', 'Terminé'));

-- Le programme du cycle actif, lié tel quel (modèle) ou en copie : le client le lit, sans rien d'autre.
create function public.mes_programmes_visibles() returns setof uuid
language sql stable security definer set search_path = public as $$
  select programme_id from public.cycles where client_id = public.mon_client_id() and statut = 'Actif' and programme_id is not null
$$;
revoke execute on function public.mes_programmes_visibles() from public, anon;
grant execute on function public.mes_programmes_visibles() to authenticated;

create policy "client : programme de son cycle actif" on public.programmes for select
  using (id in (select public.mes_programmes_visibles()));
create policy "client : séances de son cycle actif" on public.seances for select
  using (supprime_le is null and programme_id in (select public.mes_programmes_visibles()));

-- Activation contrôlée (activerCycle.ts) : Prêt, programme lié, aujourd'hui (Paris) dans les dates ;
-- l'ancien cycle actif passe Terminé. L'index unique empêche deux actifs.
create function public.activer_cycle(c uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v public.cycles;
  jour date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into v from public.cycles where id = c for update;
  if not found then raise exception 'Cycle introuvable'; end if;
  if v.statut = 'Actif' then return; end if;
  if v.statut <> 'Prêt' then
    raise exception 'Activation refusée : le cycle est « % ». Passez-le d''abord en « Prêt ».', v.statut;
  end if;
  if jour < v.debut or jour > v.fin then
    raise exception 'Activation refusée : aujourd''hui (%, Paris) est hors du cycle (% → %). Replanifiez les dates ou attendez le début.',
      to_char(jour, 'DD/MM/YYYY'), to_char(v.debut, 'DD/MM/YYYY'), to_char(v.fin, 'DD/MM/YYYY');
  end if;
  if v.programme_id is null then raise exception 'Activation refusée : aucun programme lié.'; end if;
  perform set_config('coachos.activation', 'oui', true);
  update public.cycles set statut = 'Terminé' where suivi_id = v.suivi_id and statut = 'Actif' and id <> c;
  update public.cycles set statut = 'Actif' where id = c;
  perform set_config('coachos.activation', '', true);
end $$;

-- Monte ou descend un cycle dans son suivi (moveCycle.ts) : les ordres sont renumérotés 1..n.
create function public.deplacer_cycle(c uuid, sens int) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_suivi uuid;
  ids uuid[];
  i int;
  j int;
  t uuid;
begin
  select suivi_id into v_suivi from public.cycles where id = c;
  if v_suivi is null then raise exception 'Cycle introuvable'; end if;
  select array_agg(id order by ordre, cree_le) into ids from public.cycles where suivi_id = v_suivi;
  i := array_position(ids, c);
  j := i + sign(sens)::int;
  if j < 1 or j > array_length(ids, 1) then return; end if;
  t := ids[i]; ids[i] := ids[j]; ids[j] := t;
  update public.cycles set ordre = array_position(ids, id) where suivi_id = v_suivi;
end $$;

-- ===== Calendrier du client (MyCalendar, saveMySchedule, calendar.ts) =====
create table public.planifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  seance_id uuid not null references public.seances (id) on delete cascade,
  seance_titre text not null,
  date date not null,
  heure text check (heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  statut text not null default 'Prévue' check (statut in ('Prévue', 'Réalisée', 'Annulée')),
  realisee_le timestamptz,
  realisation_id uuid,
  -- Identifiant d'envoi venu de l'app : un double appui ne crée pas deux créneaux.
  envoi_id text not null unique check (length(envoi_id) between 8 and 64),
  cree_le timestamptz not null default now()
);
create index on public.planifications (client_id, cycle_id, date);

alter table public.planifications enable row level security;
-- Écriture uniquement par les fonctions ci-dessous, qui vérifient le dossier, le cycle et les dates.
create policy "client : son calendrier" on public.planifications for select using (client_id = public.mon_client_id());
create policy "coach : calendrier de ses clients" on public.planifications for select using (public.est_mon_client(client_id));

-- Contrôle commun : le cycle est celui du client connecté. Renvoie le cycle.
create function public.mon_cycle(c uuid) returns public.cycles
language plpgsql stable security definer set search_path = public as $$
declare v public.cycles;
begin
  select * into v from public.cycles where id = c and client_id = public.mon_client_id();
  if not found then raise exception 'Cycle hors de votre dossier'; end if;
  return v;
end $$;
revoke execute on function public.mon_cycle(uuid) from public, anon;

-- Planifie ou déplace un créneau (saveMySchedule action « save »).
create function public.planifier_seance(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.cycles := public.mon_cycle((p->>'cycleId')::uuid);
  ancien public.planifications;
  s public.seances;
  jour date := (now() at time zone 'Europe/Paris')::date;
  d date := nullif(p->>'date', '')::date;
  h text := nullif(p->>'heure', '');
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if exists (select 1 from public.planifications where envoi_id = p->>'envoiId' and client_id = v.client_id) then
    return (select id from public.planifications where envoi_id = p->>'envoiId');
  end if;
  if v_id is not null then
    select * into ancien from public.planifications where id = v_id and client_id = v.client_id and cycle_id = v.id;
    if not found then raise exception 'Créneau hors de votre dossier'; end if;
    if ancien.statut = 'Réalisée' then raise exception 'Une séance réalisée reste conservée dans votre historique'; end if;
  end if;
  if v.statut <> 'Actif' or v.programme_id is null then raise exception 'Le coach doit activer ce cycle avant de planifier'; end if;
  if d is null or d < jour or d < v.debut or d > v.fin or coalesce(p->>'envoiId', '') = '' then
    raise exception 'Choisissez une date à venir dans les dates du cycle actif';
  end if;
  if h is not null and h !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Heure invalide'; end if;
  select * into s from public.seances where id = (p->>'seanceId')::uuid and supprime_le is null;
  if not found or s.programme_id is distinct from v.programme_id then raise exception 'Séance hors de votre programme actif'; end if;
  if exists (select 1 from public.planifications where client_id = v.client_id and cycle_id = v.id and statut = 'Prévue'
             and seance_id = s.id and date = d and id is distinct from v_id) then
    raise exception 'Cette séance est déjà prévue ce jour-là';
  end if;
  if v_id is not null then
    update public.planifications set seance_id = s.id, seance_titre = s.titre, date = d, heure = h, envoi_id = p->>'envoiId' where id = v_id;
    return v_id;
  end if;
  insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, heure, envoi_id)
  values (v.client_id, v.id, s.id, s.titre, d, h, p->>'envoiId') returning id into v_id;
  return v_id;
end $$;

-- Annule un créneau prévu ; une séance réalisée ne peut pas l'être.
create function public.annuler_creneau(c uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ancien public.planifications;
begin
  select * into ancien from public.planifications where id = c and client_id = public.mon_client_id();
  if not found then raise exception 'Créneau introuvable'; end if;
  if ancien.statut = 'Réalisée' then raise exception 'Une séance réalisée reste conservée dans votre historique'; end if;
  update public.planifications set statut = 'Annulée' where id = c;
end $$;

-- ===== Réalisations rattachées au cycle, avec libellés figés (logSeance.ts) =====
alter table public.realisations
  add column cycle_id uuid references public.cycles (id) on delete set null,
  add column programme_id uuid references public.programmes (id) on delete set null,
  add column planification_id uuid references public.planifications (id) on delete set null,
  -- Ressenti (effort perçu) de 1 à 10, facultatif.
  add column note int check (note between 1 and 10),
  add column seance_titre text,
  add column programme_nom text,
  add column cycle_nom text;
-- Le nom de l'exercice au moment de la séance : l'historique reste lisible si le catalogue change.
alter table public.series_realisees add column exercice_nom text;

drop policy "client : enregistre ses réalisations" on public.realisations;
create policy "client : enregistre ses réalisations" on public.realisations for insert
  with check (
    client_id = public.mon_client_id()
    and coach_id = public.coach_de_mon_client()
    and exists (select 1 from public.seances s where s.id = seance_id
                and (s.client_id = public.mon_client_id() or s.programme_id in (select public.mes_programmes_visibles())))
  );

-- Enregistre une séance réalisée en une fois. Idempotent : le même id renvoyé ne crée rien de plus,
-- mais le créneau du calendrier est quand même marqué réalisé.
create function public.enregistrer_realisation(r jsonb) returns text
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
      insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs, suggestion, exercice_nom)
      select (serie->>'id')::uuid, v_id, l.id, l.exercice_id, (serie->>'index')::int, coalesce(serie->'valeurs', '{}'),
        coalesce(serie->'suggestion', '{}'), e.nom
      from public.lignes l join public.exercices e on e.id = l.exercice_id where l.id = (serie->>'ligneId')::uuid;
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

-- ===== Séances : enregistrer_seance accepte une séance de modèle et la prescription complète =====
create or replace function public.enregistrer_seance(s jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
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
    insert into public.blocs (id, seance_id, ordre, titre, minuteur)
    values ((b->>'id')::uuid, v_id, i, coalesce(nullif(b->>'titre', ''), 'Bloc ' || i), nullif(b->'minuteur', 'null'::jsonb))
    on conflict (id) do update set ordre = excluded.ordre, titre = excluded.titre, minuteur = excluded.minuteur, retire = false
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
end $$;

-- Programme complet en une transaction : en-tête puis séances (copie d'un modèle, duplication).
-- Si une séance échoue, rien n'est gardé (pas de copie à moitié faite).
create function public.enregistrer_programme(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p->>'id')::uuid;
  x jsonb;
begin
  insert into public.programmes (id, coach_id, client_id, titre, objectif, duree_semaines, seances_par_semaine, niveau,
    statut, environnement, materiel, contraintes, consignes, duree_cible_min, priorites, version, modele_origine_id,
    cycle_applique, seance_seule)
  values (v_id, public.mon_coach_id(), nullif(p->>'clientId', '')::uuid, trim(p->>'titre'), nullif(p->>'objectif', ''),
    nullif(p->>'dureeSemaines', '')::int, nullif(p->>'seancesParSemaine', '')::int, nullif(p->>'niveau', ''),
    coalesce(nullif(p->>'statut', ''), 'Brouillon'), nullif(p->>'environnement', ''), nullif(p->>'materiel', ''),
    nullif(p->>'contraintes', ''), nullif(p->>'consignes', ''), nullif(p->>'dureeCibleMin', '')::int,
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'priorites', '[]'))), '{}'), nullif(p->>'version', ''),
    nullif(p->>'modeleOrigineId', '')::uuid, nullif(p->>'cycleApplique', '')::int, coalesce((p->>'seanceSeule')::boolean, false))
  on conflict (id) do update set
    titre = excluded.titre, objectif = excluded.objectif, duree_semaines = excluded.duree_semaines,
    seances_par_semaine = excluded.seances_par_semaine, niveau = excluded.niveau, materiel = excluded.materiel,
    consignes = excluded.consignes
  where programmes.coach_id = public.mon_coach_id();
  for x in select * from jsonb_array_elements(coalesce(p->'seances', '[]')) loop
    perform public.enregistrer_seance(x || jsonb_build_object('programmeId', v_id, 'clientId', p->>'clientId'));
  end loop;
  return v_id;
end $$;

-- Corbeille (manageDeletion.ts) : on valide toute la sélection avant d'écrire. Un programme lié à un cycle
-- ou dont une séance a des résultats est protégé.
create function public.mettre_a_la_corbeille(items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb;
  v_prog uuid;
  nom text;
begin
  for it in select * from jsonb_array_elements(items) loop
    if it->>'kind' = 'programme' then
      select id, titre into v_prog, nom from public.programmes where id = (it->>'id')::uuid;
    else
      select s.programme_id, s.titre into v_prog, nom from public.seances s where s.id = (it->>'id')::uuid;
    end if;
    if nom is null then raise exception 'Élément introuvable'; end if;
    if exists (select 1 from public.cycles where programme_id = v_prog)
       or exists (select 1 from public.realisations r join public.seances s on s.id = r.seance_id where s.programme_id = v_prog)
       or exists (select 1 from public.programmes where id = v_prog and client_id is not null) then
      raise exception '% : Ce programme est lié à un dossier client ou à des résultats. Il ne peut pas être supprimé.', nom;
    end if;
  end loop;
  update public.programmes set supprime_le = now()
  where id in (select (x->>'id')::uuid from jsonb_array_elements(items) x where x->>'kind' = 'programme') and supprime_le is null;
  update public.seances set supprime_le = now()
  where id in (select (x->>'id')::uuid from jsonb_array_elements(items) x where x->>'kind' = 'seance') and supprime_le is null;
end $$;

grant select, insert, update, delete on public.suivis, public.cycles to authenticated;
grant select on public.planifications to authenticated;
revoke execute on function public.activer_cycle(uuid), public.deplacer_cycle(uuid, int), public.planifier_seance(jsonb),
  public.annuler_creneau(uuid), public.enregistrer_realisation(jsonb), public.enregistrer_programme(jsonb),
  public.mettre_a_la_corbeille(jsonb) from public, anon;
grant execute on function public.activer_cycle(uuid), public.deplacer_cycle(uuid, int), public.planifier_seance(jsonb),
  public.annuler_creneau(uuid), public.enregistrer_realisation(jsonb), public.enregistrer_programme(jsonb),
  public.mettre_a_la_corbeille(jsonb) to authenticated;


-- ===== 20261024600000_suivi_hebdo.sql =====
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


-- ===== 20261024700000_nutrition_origine.sql =====
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


-- ===== 20261025000000_gestion_crm.sql =====
-- Lot 6 · Coachings, Tâches, Paiements et Bilans du CRM d'origine (Champs-CRM.json, reports.ts).
-- Ajouts seulement : nouvelles tables, colonnes facultatives sur relances et documents. Rien n'est supprimé.
-- Mêmes règles que src/domain/gestion.ts ; le coach ne voit et n'écrit que ses propres lignes.

create table public.coachings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  booster_id uuid references public.boosters (id) on delete set null,
  nom text not null check (length(trim(nom)) > 0),
  date_debut date,
  date_fin_prevue date check (date_fin_prevue is null or date_debut is null or date_fin_prevue >= date_debut),
  statut text check (statut in ('À démarrer', 'Actif', 'En pause', 'Terminé', 'Abandonné')),
  -- L'offre choisie n'est pas un paiement.
  formule text check (formule in ('Essentiel', 'Premium')),
  objectif text,
  commentaires text,
  cree_le timestamptz not null default now()
);
create index on public.coachings (coach_id, contact_id);
-- Un coaching par Booster d'origine (createCoachingFromBooster sans doublon).
create unique index coachings_booster on public.coachings (booster_id) where booster_id is not null;

create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  contact_id uuid references public.contacts (id) on delete set null,
  coaching_id uuid references public.coachings (id) on delete set null,
  date date,
  -- null = non renseigné, jamais 0 par défaut.
  montant numeric(12, 2) check (montant is null or (montant >= 0 and montant <= 1000000)),
  devise text not null default 'EUR' check (devise = 'EUR'),
  -- « Stripe » est un moyen déclaré : aucun encaissement n'est fait par l'app.
  moyen text check (moyen in ('Stripe', 'Carte bancaire', 'Espèces', 'Virement', 'Chèque')),
  statut text check (statut in ('En attente', 'Payé', 'Remboursé', 'Annulé')),
  reference text,
  notes text,
  cree_le timestamptz not null default now()
);
create index on public.paiements (coach_id, date desc);

create table public.bilans_coach (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  coaching_id uuid references public.coachings (id) on delete set null,
  date date not null,
  poids numeric(5, 1) check (poids is null or poids between 0 and 500),
  taille numeric(5, 1) check (taille is null or taille between 0 and 500),
  tour_taille numeric(5, 1) check (tour_taille is null or tour_taille between 0 and 500),
  tour_hanches numeric(5, 1) check (tour_hanches is null or tour_hanches between 0 and 500),
  -- { "Force": 7, "Sommeil": null, … } : null = Non évalué, distinct d'une note.
  piliers jsonb not null default '{}' check (jsonb_typeof(piliers) = 'object'),
  synthese text not null default '',
  priorites text[] not null default '{}' check (cardinality(priorites) <= 3),
  -- PDF du bilan dans Documents (type Bilan).
  document_id uuid references public.documents (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index on public.bilans_coach (coach_id, contact_id, date desc);

-- Notes de 1 à 10 seulement, et uniquement les dix piliers de reports.ts.
create function public.piliers_valides(p jsonb) returns boolean
language sql immutable as $$
  select coalesce(bool_and(
    k in ('Activité physique', 'Force', 'Endurance', 'Mobilité', 'Posture', 'Sommeil', 'Stress', 'Alimentation', 'Récupération', 'Régularité')
    and (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)))
  ), true)
  from jsonb_each(p) as e(k, v)
$$;
alter table public.bilans_coach add constraint bilans_coach_piliers check (public.piliers_valides(piliers));

-- Une relance est une tâche : champs de la table Tâches d'origine.
alter table public.relances
  add column if not exists titre text,
  add column if not exists booster_id uuid references public.boosters (id) on delete set null,
  add column if not exists coaching_id uuid references public.coachings (id) on delete set null,
  add column if not exists responsable text,
  add column if not exists priorite text check (priorite in ('Haute', 'Moyenne', 'Basse')),
  add column if not exists statut_tache text check (statut_tache in ('À faire', 'En cours', 'Terminée', 'Annulée'));

-- Lien Coaching d'un document (C07).
alter table public.documents add column if not exists coaching_id uuid references public.coachings (id) on delete set null;

-- Les liens restent dans le dossier du coach : un coach ne peut pas rattacher la ligne d'un autre.
create function public.liens_du_coach(p_contact uuid, p_booster uuid, p_coaching uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_contact is null or exists (select 1 from contacts where id = p_contact and coach_id = mon_coach_id()))
     and (p_booster is null or exists (select 1 from boosters where id = p_booster and coach_id = mon_coach_id()))
     and (p_coaching is null or exists (select 1 from coachings where id = p_coaching and coach_id = mon_coach_id()))
$$;
revoke execute on function public.liens_du_coach(uuid, uuid, uuid) from public, anon;
grant execute on function public.liens_du_coach(uuid, uuid, uuid) to authenticated;

alter table public.coachings enable row level security;
alter table public.paiements enable row level security;
alter table public.bilans_coach enable row level security;

create policy "coach : ses coachings" on public.coachings for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, booster_id, null));
create policy "coach : ses paiements" on public.paiements for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, null, coaching_id));
create policy "coach : ses bilans" on public.bilans_coach for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, null, coaching_id)
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.coach_id = public.mon_coach_id())));

revoke all on public.coachings, public.paiements, public.bilans_coach from anon, authenticated;
grant select, insert, update, delete on public.coachings, public.paiements, public.bilans_coach to authenticated;

-- Nouvelles colonnes de lien sur des tables existantes : contrôle ajouté sans toucher aux règles en place.
create policy "coach : liens des tâches" on public.relances as restrictive for insert
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
create policy "coach : liens des tâches (modification)" on public.relances as restrictive for update
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
create policy "coach : coaching d'un document" on public.documents as restrictive for insert
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
create policy "coach : coaching d'un document (modification)" on public.documents as restrictive for update
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));


-- ===== 20261025010000_automatisations.sql =====
-- Lot 6 · Flux externes : questionnaire Tally reçu sans Make, envoi des comptes rendus par le scénario Make,
-- et journal des états observables (C08). Ajouts seulement.
-- Règles : une réponse rejouée ne crée rien de plus ; un accusé de réception Make n'est pas un e-mail envoyé ;
-- un e-mail confirmé n'est jamais renvoyé automatiquement.

alter table public.questionnaires
  add column if not exists envoi_id text,
  add column if not exists source text not null default 'app' check (source in ('app', 'tally'));
create unique index if not exists questionnaires_envoi on public.questionnaires (coach_id, envoi_id) where envoi_id is not null;

create table public.journal_automatisations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  flux text not null check (flux in ('questionnaire', 'compte_rendu')),
  -- Clé de reprise : identifiant de la réponse Tally, ou document:version pour un compte rendu.
  cle text not null check (length(cle) between 1 and 200),
  etat text not null check (etat in ('erreur', 'en_cours', 'transmis', 'envoye', 'echec', 'bloque')),
  contact_id uuid references public.contacts (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  version integer,
  detail text check (detail is null or length(detail) <= 1000),
  tentatives integer not null default 1,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (coach_id, flux, cle)
);
create index on public.journal_automatisations (coach_id, maj_le desc);
alter table public.journal_automatisations enable row level security;
create policy "coach : son journal" on public.journal_automatisations for select using (coach_id = public.mon_coach_id());
revoke all on public.journal_automatisations from anon, authenticated;
grant select on public.journal_automatisations to authenticated;

-- Réponse reçue d'un service externe (webhook Tally), rejouable : la même réponse ne crée ni contact ni questionnaire de plus.
create function public.recevoir_questionnaire_externe(p_lien text, p_envoi text, p_reponses jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
begin
  if p_envoi is null or p_envoi !~ '^tally:[A-Za-z0-9_-]{1,80}$' then raise exception 'Identifiant de réponse invalide'; end if;
  select id into v_coach from coachs where lien_questionnaire = p_lien;
  if v_coach is null then raise exception 'Questionnaire introuvable'; end if;
  perform pg_advisory_xact_lock(hashtext(v_coach::text || p_envoi));
  if exists (select 1 from questionnaires where coach_id = v_coach and envoi_id = p_envoi) then return 'deja_recu'; end if;
  perform soumettre_questionnaire(p_lien, p_reponses || jsonb_build_object('_envoi', p_envoi));
  update questionnaires set envoi_id = p_envoi, source = 'tally'
    where coach_id = v_coach and envoi_id is null and reponses->>'_envoi' = p_envoi;
  -- Une erreur notée plus tôt pour cette réponse est réglée par la reprise.
  delete from journal_automatisations where coach_id = v_coach and flux = 'questionnaire' and cle = p_envoi;
  return 'recu';
end $$;
revoke execute on function public.recevoir_questionnaire_externe(text, text, jsonb) from public;
grant execute on function public.recevoir_questionnaire_externe(text, text, jsonb) to anon, authenticated;

-- Réponse reçue mais non traitée (signature, format, téléphone et e-mail absents…) : visible du coach comme « en erreur ».
create function public.noter_erreur_questionnaire(p_lien text, p_envoi text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
begin
  select id into v_coach from coachs where lien_questionnaire = p_lien;
  if v_coach is null or p_envoi is null or length(p_envoi) > 200 then return; end if;
  if exists (select 1 from questionnaires where coach_id = v_coach and envoi_id = p_envoi) then return; end if;
  -- Ouverte aux visiteurs comme le formulaire : on borne le nombre d'erreurs ouvertes pour qu'elle ne remplisse pas le journal.
  if (select count(*) from journal_automatisations where coach_id = v_coach and flux = 'questionnaire') >= 200 then return; end if;
  insert into journal_automatisations (coach_id, flux, cle, etat, detail)
  values (v_coach, 'questionnaire', p_envoi, 'erreur', left(p_detail, 1000))
  on conflict (coach_id, flux, cle) do update
    set detail = excluded.detail, tentatives = journal_automatisations.tentatives + 1, maj_le = now();
end $$;
revoke execute on function public.noter_erreur_questionnaire(text, text, text) from public;
grant execute on function public.noter_erreur_questionnaire(text, text, text) to anon, authenticated;

-- Compte rendu, avant d'appeler Make : réserve la tentative pour cette version, ou dit pourquoi on ne renvoie pas.
-- Comme l'original : une tentative existante bloque tout nouvel envoi. Seule une tentative en échec ou bloquée
-- peut être relancée, et seulement à la demande du coach (p_relancer) après vérification dans Make.
-- Renvoie 'ok' quand l'envoi peut partir, sinon l'état qui l'en empêche.
create function public.reserver_envoi_compte_rendu(p_document uuid, p_version integer, p_relancer boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  d documents;
  v_cle text := p_document::text || ':' || p_version;
  v_etat text;
begin
  select * into d from documents where id = p_document and coach_id = mon_coach_id();
  if d.id is null then raise exception 'Document introuvable'; end if;
  if d.envoye then return 'envoye'; end if;
  if d.chemin is null then raise exception 'Générez le PDF avant l’envoi'; end if;
  if d.version <> p_version then raise exception 'Ce n’est plus la version courante du document'; end if;
  perform pg_advisory_xact_lock(hashtext(v_cle));
  select etat into v_etat from journal_automatisations where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
  if v_etat is null then
    insert into journal_automatisations (coach_id, flux, cle, etat, contact_id, document_id, version, detail)
    values (d.coach_id, 'compte_rendu', v_cle, 'en_cours', d.contact_id, d.id, p_version, 'Transmission à Make');
    return 'ok';
  end if;
  -- Une transmission restée « en cours » plus de 15 minutes a été interrompue (fonction arrêtée) : relançable comme un échec.
  if p_relancer and (v_etat in ('echec', 'bloque') or (v_etat = 'en_cours' and exists (
    select 1 from journal_automatisations where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle and maj_le < now() - interval '15 minutes'
  ))) then
    update journal_automatisations set etat = 'en_cours', detail = 'Nouvelle transmission demandée par le coach',
      tentatives = tentatives + 1, maj_le = now()
    where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
    return 'ok';
  end if;
  return v_etat;
end $$;
revoke execute on function public.reserver_envoi_compte_rendu(uuid, integer, boolean) from public, anon;
grant execute on function public.reserver_envoi_compte_rendu(uuid, integer, boolean) to authenticated;

-- Résultat de la transmission, noté par la fonction Edge au nom du coach.
-- « envoye » seulement si Make confirme l'e-mail (sent=true, même document, identifiant du message) ;
-- alors seulement Documents.Envoyé est coché et le plan d'action du Booster marqué envoyé.
create function public.noter_envoi_compte_rendu(p_document uuid, p_version integer, p_etat text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d documents;
  v_cle text := p_document::text || ':' || p_version;
begin
  if p_etat not in ('transmis', 'envoye', 'echec', 'bloque') then raise exception 'État inconnu'; end if;
  select * into d from documents where id = p_document and coach_id = mon_coach_id();
  if d.id is null then raise exception 'Document introuvable'; end if;
  update journal_automatisations
    set etat = case when etat = 'envoye' then 'envoye' else p_etat end, detail = left(p_detail, 1000), maj_le = now()
    where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
  if not found then raise exception 'Aucune transmission réservée pour cette version'; end if;
  if p_etat = 'envoye' and d.version = p_version then
    update documents set envoye = true, modifie_le = now() where id = d.id;
    if d.booster_id is not null then
      update boosters set plan_envoye_le = coalesce(plan_envoye_le, now()) where id = d.booster_id;
    end if;
  end if;
end $$;
revoke execute on function public.noter_envoi_compte_rendu(uuid, integer, text, text) from public, anon;
grant execute on function public.noter_envoi_compte_rendu(uuid, integer, text, text) to authenticated;


-- ===== 20261025020000_reference_records.sql =====
-- Lot 6 · Performances : la référence des charges calculées (% du 1RM) est choisie par le client, comme à l'origine
-- (« Utiliser comme référence »). Une seule par exercice ; elle ne s'applique jamais à un autre mouvement. Ajouts seulement.

alter table public.records add column if not exists reference boolean not null default false;
create unique index if not exists records_reference on public.records (client_id, exercice_id) where reference;

-- Choisit la référence d'un exercice en une fois (l'ancienne cesse de l'être), pour le client ou son coach.
create function public.definir_reference_record(p_record uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r records;
begin
  select * into r from records where id = p_record and (client_id = mon_client_id() or est_mon_client(client_id));
  if r.id is null then raise exception 'Record introuvable'; end if;
  if r.exercice_id is null or r.unite <> 'kg' then raise exception 'Seule une charge rattachée à un exercice de la liste peut servir de référence.'; end if;
  update records set reference = false where client_id = r.client_id and exercice_id = r.exercice_id and reference and id <> r.id;
  update records set reference = true where id = r.id;
end $$;
revoke execute on function public.definir_reference_record(uuid) from public, anon;
grant execute on function public.definir_reference_record(uuid) to authenticated;


-- ===== 20261029000000_blocs_details.sql =====
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


-- ===== 20261029100000_suivis_quotidiens.sql =====
-- Coach OS · suivis du quotidien (objectifs secondaires) : pas, eau, cigarettes, sommeil, fruits et légumes,
-- alcool, sucre, énergie, stress, dernier écran, activité hors séance.
-- Un relevé par client, jour et indicateur ; un réglage (actif, cible) par client et indicateur.
-- La liste des indicateurs et leurs bornes vivent dans l'app (domain/quotidien.ts) : en ajouter un ne demande pas de migration.
-- Uniquement des ajouts : deux tables et leurs règles d'accès.

create table public.suivis_quotidiens (
  client_id uuid not null references public.clients (id) on delete cascade,
  jour date not null,
  indicateur text not null check (indicateur ~ '^[a-z_]{2,40}$'),
  valeur numeric not null check (valeur between 0 and 100000),
  -- « telephone » : lu sur le téléphone ou la montre (Health Connect), pas saisi à la main.
  source text not null default 'saisie' check (source in ('saisie', 'telephone')),
  modifie_le timestamptz not null default now(),
  primary key (client_id, indicateur, jour)
);
create index on public.suivis_quotidiens (client_id, jour desc);

alter table public.suivis_quotidiens enable row level security;
create policy "client : ses suivis du quotidien" on public.suivis_quotidiens for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id() and jour <= current_date + 1);
create policy "coach : suivis du quotidien de ses clients" on public.suivis_quotidiens for select using (public.est_mon_client(client_id));
revoke all on public.suivis_quotidiens from anon, authenticated;
grant select, insert, update, delete on public.suivis_quotidiens to authenticated;

create table public.reglages_quotidiens (
  client_id uuid not null references public.clients (id) on delete cascade,
  indicateur text not null check (indicateur ~ '^[a-z_]{2,40}$'),
  actif boolean not null default true,
  -- Vide : la cible par défaut de l'app.
  cible numeric check (cible between 0 and 100000),
  modifie_par text not null default 'client' check (modifie_par in ('client', 'coach')),
  modifie_le timestamptz not null default now(),
  primary key (client_id, indicateur)
);

alter table public.reglages_quotidiens enable row level security;
create policy "client : ses réglages du quotidien" on public.reglages_quotidiens for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id());
-- Le coach choisit les suivis et fixe les cibles avec son client.
create policy "coach : réglages du quotidien de ses clients" on public.reglages_quotidiens for all
  using (public.est_mon_client(client_id)) with check (public.est_mon_client(client_id));
revoke all on public.reglages_quotidiens from anon, authenticated;
grant select, insert, update, delete on public.reglages_quotidiens to authenticated;


-- ===== 20261029200000_activites_sport.sql =====
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


-- ===== 20261030000000_consentements.sql =====
-- Coach OS · RGPD : consentement du client à ses données de santé et à l'analyse de ses photos de repas par une IA.
-- Chaque accord (ou changement d'avis) est une nouvelle ligne datée, jamais modifiée ni effacée par l'app : l'historique
-- prouve ce que le client a accepté, quand, et pour quelle version de la politique de confidentialité.
-- Uniquement des ajouts : une table, ses règles d'accès et deux fonctions.

create table public.consentements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  coach_id uuid not null references public.coachs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- Version de la politique de confidentialité affichée au moment de l'accord (domain/consentement.ts).
  version text not null check (length(version) between 1 and 40),
  -- Mesures, photos de progression, nutrition, bilans, séances et activités lues dans Health Connect.
  donnees_sante boolean not null,
  -- Photo de repas envoyée à un service d'IA (Claude, Anthropic) pour estimer les aliments. Facultatif.
  analyse_ia boolean not null,
  accepte_le timestamptz not null default clock_timestamp()
);
create index on public.consentements (client_id, accepte_le desc);

alter table public.consentements enable row level security;

create policy "client : ses consentements" on public.consentements for select
  using (client_id = public.mon_client_id());
create policy "coach : consentements de ses clients" on public.consentements for select
  using (coach_id = public.mon_coach_id());

-- Lecture seule pour tous : l'écriture passe par enregistrer_consentement.
revoke all on public.consentements from public, anon, authenticated;
grant select on public.consentements to authenticated;

-- Le dernier choix du client connecté (null s'il n'a encore rien accepté).
create function public.mon_consentement() returns public.consentements
language sql stable security definer set search_path = public as $$
  select * from consentements where client_id = mon_client_id() order by accepte_le desc, id desc limit 1
$$;

-- Le client connecté enregistre son choix. Sans accord sur les données de santé, rien n'est enregistré :
-- l'app ne peut pas fonctionner sans elles, le client se déconnecte.
create function public.enregistrer_consentement(p_version text, p_analyse_ia boolean) returns public.consentements
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := mon_client_id();
  c consentements;
begin
  if v_client is null then raise exception 'Réservé aux clients connectés'; end if;
  insert into consentements (client_id, coach_id, user_id, version, donnees_sante, analyse_ia)
  select v_client, coach_id, auth.uid(), p_version, true, coalesce(p_analyse_ia, false) from clients where id = v_client
  returning * into c;
  return c;
end $$;

revoke execute on function public.mon_consentement(), public.enregistrer_consentement(text, boolean) from public, anon;
grant execute on function public.mon_consentement(), public.enregistrer_consentement(text, boolean) to authenticated;


-- ===== 20261030000000_quotidien_saisie_coach.sql =====
-- Coach OS · suivis du quotidien : le coach peut aussi noter une journée pour son client
-- (pendant une séance, ou quand le client lui donne ses chiffres). Ajout de règles d'accès seulement.

create policy "coach : noter le quotidien de ses clients" on public.suivis_quotidiens for insert
  with check (public.est_mon_client(client_id) and jour <= current_date + 1);
create policy "coach : corriger le quotidien de ses clients" on public.suivis_quotidiens for update
  using (public.est_mon_client(client_id)) with check (public.est_mon_client(client_id) and jour <= current_date + 1);
create policy "coach : effacer le quotidien de ses clients" on public.suivis_quotidiens for delete
  using (public.est_mon_client(client_id));


-- ===== 20261030200000_abonnements.sql =====
-- Abonnements : le coach encaisse en dehors de l'appli (aucun achat dans l'appli), l'appli ouvre ou ferme l'accès.
-- · acces_appli : abonnement appli (59 €/mois) — programmes, séances, suivi, documents et nutrition limitée aux macros.
-- · option_nutrition : option nutrition (+40 €/mois) — recettes, plan de repas automatique, photo d'assiette.
-- · packs_seances : séances avec le coach (60 € l'unité ou pack de 10 + 1 offerte), décomptées par le coach.
-- Un client « séances seulement » a une fiche sans accès appli : le coach l'enregistre, le client ne se connecte pas.

alter table public.clients add column acces_appli boolean not null default true;
alter table public.clients add column option_nutrition boolean not null default false;
-- Les dossiers déjà créés gardent tout ce qu'ils voyaient jusqu'ici.
update public.clients set option_nutrition = true;

-- Accès coupé : toutes les règles « client » s'appuient sur ces deux fonctions, le client ne lit plus rien.
create or replace function public.mon_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.clients where user_id = auth.uid() and actif and acces_appli
$$;

create or replace function public.coach_de_mon_client() returns uuid
language sql stable security definer set search_path = public as $$
  select coach_id from public.clients where user_id = auth.uid() and actif and acces_appli
$$;

create function public.mon_option_nutrition() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select option_nutrition from public.clients where id = public.mon_client_id()), false)
$$;

-- Prénom du client connecté dont l’accès appli est coupé, pour lui afficher « Contacte ton coach ».
create function public.mon_acces_suspendu() returns text
language sql stable security definer set search_path = public as $$
  select prenom from public.clients where user_id = auth.uid() and actif and not acces_appli
$$;

revoke execute on function public.mon_option_nutrition() from public, anon;
grant execute on function public.mon_option_nutrition() to authenticated;
revoke execute on function public.mon_acces_suspendu() from public, anon;
grant execute on function public.mon_acces_suspendu() to authenticated;

-- Recettes (banque du coach et recettes perso) : réservées à l'option nutrition.
drop policy "client : lire les recettes" on public.recettes;
create policy "client : lire les recettes" on public.recettes for select using (
  public.mon_option_nutrition()
  and coach_id = public.coach_de_mon_client()
  and ((client_id is null and statut = 'approuvee') or client_id = public.mon_client_id())
);
drop policy "client : ajouter ses recettes" on public.recettes;
create policy "client : ajouter ses recettes" on public.recettes for insert
  with check (public.mon_option_nutrition() and client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client() and statut = 'brouillon');
drop policy "client : modifier ses recettes" on public.recettes;
create policy "client : modifier ses recettes" on public.recettes for update
  using (public.mon_option_nutrition() and client_id = public.mon_client_id())
  with check (client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client() and statut = 'brouillon');

create table public.packs_seances (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- 1 pour une séance à l'unité, 11 pour un pack de 10 + 1 offerte.
  seances_total int not null check (seances_total between 1 and 100),
  seances_faites int not null default 0,
  prix numeric(8, 2) check (prix >= 0),
  achete_le date not null default current_date,
  cree_le timestamptz not null default now(),
  check (seances_faites between 0 and seances_total)
);
create index packs_seances_client on public.packs_seances (client_id);

alter table public.packs_seances enable row level security;
create policy "coach : packs de ses clients" on public.packs_seances for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.est_mon_client(client_id));
create policy "client : ses packs" on public.packs_seances for select
  using (client_id = public.mon_client_id());

grant select, insert, update, delete on public.packs_seances to authenticated;
