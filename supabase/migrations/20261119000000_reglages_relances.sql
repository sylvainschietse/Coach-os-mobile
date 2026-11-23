-- « Mes relances » : le coach réécrit le texte des relances prêtes à l'emploi, en coupe certaines et crée les siennes
-- (déclencheur, public, message). Un seul jeu de réglages par coach, lu et écrit par lui seul. Les relances créées
-- restent des lignes de public.relances (modèle « libre », titre = nom de la relance, note = message prêt).
create table if not exists public.reglages_relances (
  coach_id uuid primary key default public.mon_coach_id() references public.coachs (id) on delete cascade,
  reglages jsonb not null default '{}'::jsonb check (jsonb_typeof(reglages) = 'object' and pg_column_size(reglages) < 60000),
  maj_le timestamptz not null default now()
);
alter table public.reglages_relances enable row level security;
drop policy if exists "coach : ses relances" on public.reglages_relances;
create policy "coach : ses relances" on public.reglages_relances for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
grant select, insert, update on public.reglages_relances to authenticated;
