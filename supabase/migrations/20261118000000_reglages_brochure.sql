-- « Ma brochure » : le coach règle sa brochure des prix (couleur, textes du haut, blocs d'offres,
-- couleur de chaque carte, parties affichées). Un seul jeu de réglages par coach, lu et écrit par lui seul.
create table if not exists public.brochures (
  coach_id uuid primary key default public.mon_coach_id() references public.coachs (id) on delete cascade,
  reglages jsonb not null default '{}'::jsonb check (jsonb_typeof(reglages) = 'object' and pg_column_size(reglages) < 20000),
  maj_le timestamptz not null default now()
);
alter table public.brochures enable row level security;
drop policy if exists "coach : sa brochure" on public.brochures;
create policy "coach : sa brochure" on public.brochures for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
grant select, insert, update on public.brochures to authenticated;
