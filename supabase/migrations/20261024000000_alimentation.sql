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
