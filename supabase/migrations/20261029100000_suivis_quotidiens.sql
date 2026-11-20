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
