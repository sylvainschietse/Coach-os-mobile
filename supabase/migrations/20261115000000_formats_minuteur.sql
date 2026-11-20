-- Minuteur du client : ses formats enregistrés (« Abdos du mardi », EMOM 12 × 1 min, gong, décompte 5 s…).
-- Un format appartient au client connecté : lui seul le voit, le renomme ou le supprime. Le coach n'y touche pas.
-- L'id vient du téléphone : renvoyer le même format le met à jour sans le dupliquer.
-- Uniquement un ajout : une table et ses règles d'accès.

create table if not exists public.formats_minuteur (
  id uuid primary key,
  client_id uuid not null default public.mon_client_id() references public.clients (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 60),
  -- { format, exercices, tours, travailS, reposS, reposEntreToursS, dureeS, minuteS, pasS, sommetS } : vérifié sur le téléphone.
  reglage jsonb not null check (jsonb_typeof(reglage) = 'object' and length(reglage::text) <= 2000),
  -- { sonnerie, preparationS, bipsTravail, bipsRepos, vibrer }
  son jsonb not null check (jsonb_typeof(son) = 'object' and length(son::text) <= 500),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index if not exists formats_minuteur_client on public.formats_minuteur (client_id, maj_le desc);

alter table public.formats_minuteur enable row level security;
drop policy if exists formats_minuteur_lire on public.formats_minuteur;
create policy formats_minuteur_lire on public.formats_minuteur for select to authenticated using (client_id = public.mon_client_id());
drop policy if exists formats_minuteur_ajouter on public.formats_minuteur;
create policy formats_minuteur_ajouter on public.formats_minuteur for insert to authenticated with check (client_id = public.mon_client_id());
drop policy if exists formats_minuteur_modifier on public.formats_minuteur;
create policy formats_minuteur_modifier on public.formats_minuteur for update to authenticated
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id());
drop policy if exists formats_minuteur_supprimer on public.formats_minuteur;
create policy formats_minuteur_supprimer on public.formats_minuteur for delete to authenticated using (client_id = public.mon_client_id());

-- Au plus 50 formats par client.
create or replace function public._formats_minuteur_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.formats_minuteur where client_id = new.client_id) >= 50 then
    raise exception 'Tu as déjà 50 formats enregistrés : supprimes-en un pour en ajouter un nouveau';
  end if;
  return new;
end $$;
drop trigger if exists formats_minuteur_limite on public.formats_minuteur;
create trigger formats_minuteur_limite before insert on public.formats_minuteur for each row execute function public._formats_minuteur_limite();

grant select, insert, update, delete on public.formats_minuteur to authenticated;
