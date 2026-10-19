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
  titre text not null
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
  consignes text
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
