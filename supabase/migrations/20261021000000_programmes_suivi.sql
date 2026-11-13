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
