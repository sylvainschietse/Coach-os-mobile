-- Parcours des prospects et historique du dossier : changements d'étape (avec les étapes sautées) et notes du coach.
-- Ajout seulement : une nouvelle table, rien n'est modifié ni supprimé. Mêmes règles que src/domain/historique.ts.

create table public.journal_contacts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  quand timestamptz not null default now(),
  type text not null check (type in ('etape', 'note')),
  -- Statuts du CRM (STATUTS_CONTACT) : libres ici, l'appli ne propose que les siens.
  depuis text check (depuis is null or length(depuis) <= 40),
  vers text check (vers is null or length(vers) <= 40),
  sautees text[] not null default '{}' check (cardinality(sautees) <= 5),
  texte text check (texte is null or length(texte) <= 4000),
  -- Une étape a sa destination, une note a son texte.
  check ((type = 'etape' and vers is not null) or (type = 'note' and length(trim(coalesce(texte, ''))) > 0))
);
create index on public.journal_contacts (coach_id, contact_id, quand desc);

alter table public.journal_contacts enable row level security;

create policy "coach : son journal" on public.journal_contacts for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, null, null));

revoke all on public.journal_contacts from anon, authenticated;
grant select, insert, update, delete on public.journal_contacts to authenticated;
