-- Lot 2 : Documents (C07) et « Mes documents » du client (U11).
-- Un document = une ligne versionnée ; son fichier est dans le compartiment privé « documents »,
-- sous <coach>/<document>/v<version>-<nom>. Le client ne lit que les documents partagés de son propre dossier,
-- sans les commentaires internes, et seulement par lien signé de courte durée.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  booster_id uuid references public.boosters (id) on delete set null,
  nom text not null check (length(trim(nom)) > 0),
  type text not null default 'Autre'
    check (type in ('Plan d''action', 'Contrat', 'Facture', 'Bilan', 'Avant / Après', 'Photo', 'Autre')),
  date date not null default (now() at time zone 'Europe/Paris')::date,
  version integer not null default 1 check (version >= 1),
  -- Fichier de la version courante ; les versions précédentes restent dans le compartiment.
  chemin text,
  nom_fichier text,
  type_fichier text,
  taille integer check (taille is null or taille >= 0),
  partage_client boolean not null default false,
  -- Vrai seulement quand l'envoi est confirmé : ouvrir une messagerie ne suffit pas.
  envoye boolean not null default false,
  commentaires text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index on public.documents (coach_id, date desc);
create index on public.documents (contact_id);
-- Un compte rendu par Booster : les nouvelles générations en sont des versions.
create unique index documents_compte_rendu on public.documents (booster_id) where booster_id is not null and type = 'Plan d''action';

alter table public.documents enable row level security;
create policy "coach : ses documents" on public.documents for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
grant select, insert, update, delete on public.documents to authenticated;

-- Dossiers (contacts) rattachés au client connecté ; le client n'a aucun droit direct sur contacts.
create function public.documents_partages_avec_moi()
returns table (id uuid, nom text, type text, date date, version integer, chemin text, nom_fichier text, type_fichier text, taille integer)
language sql stable security definer set search_path = public as $$
  select d.id, d.nom, d.type, d.date, d.version, d.chemin, d.nom_fichier, d.type_fichier, d.taille
  from documents d
  join contacts c on c.id = d.contact_id
  where d.partage_client and d.chemin is not null
    and public.mon_client_id() is not null and c.client_id = public.mon_client_id()
  order by d.date desc, d.modifie_le desc
$$;
revoke execute on function public.documents_partages_avec_moi() from public, anon;
grant execute on function public.documents_partages_avec_moi() to authenticated;

-- Utilisée par la règle du compartiment : ce fichier est-il la version partagée d'un document du client ?
create function public.fichier_partage_avec_moi(p_chemin text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents d join contacts c on c.id = d.contact_id
    where d.chemin = p_chemin and d.partage_client
      and public.mon_client_id() is not null and c.client_id = public.mon_client_id()
  )
$$;
revoke execute on function public.fichier_partage_avec_moi(text) from public, anon;
grant execute on function public.fichier_partage_avec_moi(text) to authenticated;
