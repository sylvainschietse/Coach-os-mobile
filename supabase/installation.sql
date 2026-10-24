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
