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
