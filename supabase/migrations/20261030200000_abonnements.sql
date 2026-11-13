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
