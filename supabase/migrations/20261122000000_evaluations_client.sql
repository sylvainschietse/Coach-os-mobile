-- Tests faits à un client hors Booster (onglet Tests de sa fiche) : tests golf chiffrés et angles mesurés en
-- vidéo, datés pour suivre l'évolution. Nouveau tableau seulement : rien d'existant n'est modifié.
-- donnees : { golf: { actif, mesures: { <test>: { <champ>: "42" } } } | null,
--             mesures: { mobilite?: [{ libelle, angle }], posture?: [{ libelle, angle }] } }
create table if not exists public.evaluations_client (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  date date not null default current_date,
  donnees jsonb not null default '{}' check (jsonb_typeof(donnees) = 'object'),
  notes text,
  cree_le timestamptz not null default now()
);
create index if not exists evaluations_client_client_date on public.evaluations_client (client_id, date desc);

alter table public.evaluations_client enable row level security;

drop policy if exists "client et coach : evaluations" on public.evaluations_client;
-- Le coach saisit ; le client peut lire ses propres tests.
create policy "client et coach : evaluations" on public.evaluations_client for all
  using (client_id = public.mon_client_id() or public.est_mon_client(client_id))
  with check (public.est_mon_client(client_id));

grant select, insert, update, delete on public.evaluations_client to authenticated;
