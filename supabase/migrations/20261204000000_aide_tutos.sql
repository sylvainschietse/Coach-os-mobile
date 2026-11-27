-- Rubrique « Aide » du client : les tutos vidéo. Les vidéos et leurs images sont dans le compartiment public « tutos »
-- (des vidéos d'explication sans aucune donnée client), lues à la demande : l'appli installée ne les embarque pas.
-- La liste est une table : ajouter ou remplacer un tuto se fait ici, sans nouvelle version de l'appli.
-- Uniquement des ajouts ; peut être collé deux fois sans rien casser.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutos', 'tutos', true, 52428800, array['video/mp4', 'image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create table if not exists public.tutos (
  id text primary key,
  ordre int not null default 0,
  titre text not null,
  explication text not null default '',
  duree_secondes int not null default 0,
  -- Chemins dans le compartiment « tutos ».
  video text not null,
  image text,
  -- « tous », « nutrition » (option nutrition) ou « cycle » (clientes concernées) : une simple étiquette.
  pour text not null default 'tous' check (pour in ('tous', 'nutrition', 'cycle')),
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

alter table public.tutos enable row level security;
drop policy if exists "tutos : lecture par les comptes connectés" on public.tutos;
create policy "tutos : lecture par les comptes connectés" on public.tutos for select to authenticated using (actif);
revoke all on public.tutos from anon;
grant select on public.tutos to authenticated;

insert into public.tutos (id, ordre, titre, explication, duree_secondes, video, image, pour) values
  ('installer', 1, 'Installer l’appli et te connecter', 'Ton accès reçu par message, le mot de passe provisoire, puis le tien.', 43, '1-installer-et-se-connecter.mp4', '1-installer-et-se-connecter.jpg', 'tous'),
  ('seance', 2, 'Faire ta séance et noter tes charges', 'Le mode guidé bloc par bloc, le minuteur de repos et « Remplacer ».', 44, '2-faire-sa-seance.mp4', '2-faire-sa-seance.jpg', 'tous'),
  ('sans-telephone', 3, 'T’entraîner sans téléphone', 'Range ton téléphone, puis raconte ta séance à voix haute à la fin.', 45, '3-sans-telephone-et-dictee.mp4', '3-sans-telephone-et-dictee.jpg', 'tous'),
  ('nutrition', 4, 'Tes besoins en nutrition', 'Tes calories et tes macros du jour, le guide, et noter un repas.', 40, '4-nutrition-besoins-et-guide.mp4', '4-nutrition-besoins-et-guide.jpg', 'tous'),
  ('recette', 5, 'Dicter une recette', 'Raconte-la : l’appli remplit les ingrédients et calcule les macros.', 41, '5-dicter-une-recette.mp4', '5-dicter-une-recette.jpg', 'nutrition'),
  ('progres', 6, 'Ta semaine, tes badges, tes progrès', 'Ta série, Ma semaine, tes records et Ma journée.', 46, '6-semaine-badges-et-progres.mp4', '6-semaine-badges-et-progres.jpg', 'tous'),
  ('cycle', 7, 'Le suivi du cycle', 'Activer Mon cycle et choisir ce que ta coach voit.', 52, '7-suivi-du-cycle.mp4', '7-suivi-du-cycle.jpg', 'cycle'),
  ('documents', 8, 'Tes documents et newsletters', 'Comptes rendus, bilans, newsletters et factures.', 28, '8-documents-et-newsletters.mp4', '8-documents-et-newsletters.jpg', 'tous')
on conflict (id) do nothing;
