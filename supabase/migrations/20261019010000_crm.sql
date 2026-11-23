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
