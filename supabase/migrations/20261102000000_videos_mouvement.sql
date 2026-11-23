-- Vidéos de mouvement : depuis sa séance, le client envoie une courte vidéo (60 s au plus, compressée) d'un exercice ;
-- le coach la regarde à côté des charges, répétitions et ressenti, puis répond par écrit et/ou par un vocal.
-- Les fichiers sont dans le compartiment privé « videos-mouvement », sous <client>/<video>.<ext>
-- (et <client>/<video>-reponse.<ext> pour le vocal du coach). Tout est effacé 30 jours après l'envoi :
-- la ligne disparaît aussitôt pour le client (règle ci-dessous), et l'appli du coach efface les fichiers expirés.

create table public.videos_mouvement (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.coach_de_mon_client() references public.coachs (id) on delete cascade,
  client_id uuid not null default public.mon_client_id() references public.clients (id) on delete cascade,
  -- Identifiant de la réalisation en cours de saisie : la séance peut être enregistrée après l'envoi de la vidéo,
  -- ou jamais. Pas de clé étrangère pour cette raison.
  realisation_id uuid,
  seance_id uuid references public.seances (id) on delete set null,
  ligne_id uuid,
  exercice_id uuid,
  exercice_nom text not null check (length(trim(exercice_nom)) > 0),
  seance_titre text,
  chemin text not null unique,
  type_fichier text not null check (type_fichier like 'video/%'),
  taille integer not null check (taille > 0 and taille <= 26214400),
  duree_s integer check (duree_s is null or (duree_s > 0 and duree_s <= 65)),
  commentaire text check (commentaire is null or length(commentaire) <= 500),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '30 days',
  vue_le timestamptz,
  reponse_texte text check (reponse_texte is null or length(reponse_texte) <= 2000),
  reponse_audio text,
  reponse_audio_type text,
  reponse_audio_duree_s integer check (reponse_audio_duree_s is null or (reponse_audio_duree_s > 0 and reponse_audio_duree_s <= 300)),
  reponse_le timestamptz,
  constraint conservation_30_jours check (expire_le <= cree_le + interval '30 days'),
  constraint chemin_du_client check (chemin like client_id::text || '/%'),
  constraint vocal_du_client check (reponse_audio is null or reponse_audio like client_id::text || '/%')
);
create index on public.videos_mouvement (coach_id, client_id, cree_le desc);
create index on public.videos_mouvement (client_id, cree_le desc);
create index on public.videos_mouvement (expire_le);

alter table public.videos_mouvement enable row level security;

create policy "client : ses vidéos encore conservées" on public.videos_mouvement for select
  using (client_id = public.mon_client_id() and expire_le > now());
-- Le client dépose pour son coach, sans réponse ni « vue » préremplies.
create policy "client : envoie une vidéo" on public.videos_mouvement for insert
  with check (
    client_id = public.mon_client_id()
    and coach_id = public.coach_de_mon_client()
    and vue_le is null and reponse_texte is null and reponse_audio is null and reponse_le is null
  );
create policy "client : retire sa vidéo" on public.videos_mouvement for delete
  using (client_id = public.mon_client_id());

-- Le coach voit aussi les lignes expirées, pour en effacer les fichiers.
create policy "coach : vidéos de ses clients" on public.videos_mouvement for select
  using (coach_id = public.mon_coach_id());
create policy "coach : répond" on public.videos_mouvement for update
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "coach : efface" on public.videos_mouvement for delete
  using (coach_id = public.mon_coach_id());

revoke all on public.videos_mouvement from public, anon, authenticated;
grant select, insert, delete on public.videos_mouvement to authenticated;
-- Le coach ne modifie que la réponse et le « vu » : ni le fichier, ni le client, ni la date d'effacement.
grant update (vue_le, reponse_texte, reponse_audio, reponse_audio_type, reponse_audio_duree_s, reponse_le)
  on public.videos_mouvement to authenticated;

-- Fichiers : compartiment privé, 25 Mo au plus par fichier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos-mouvement', 'videos-mouvement', false, 26214400,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
        'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'])
on conflict (id) do nothing;

-- Le dossier <client> appartient-il à un client du coach connecté ?
create function public.dossier_video_de_mon_client(p_nom text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where c.id::text = (storage.foldername(p_nom))[1] and c.coach_id = public.mon_coach_id()
  )
$$;
revoke execute on function public.dossier_video_de_mon_client(text) from public, anon;
grant execute on function public.dossier_video_de_mon_client(text) to authenticated;

create policy "videos-mouvement : le client dépose dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos-mouvement' and (storage.foldername(name))[1] = public.mon_client_id()::text);
create policy "videos-mouvement : le client lit son dossier" on storage.objects for select to authenticated
  using (bucket_id = 'videos-mouvement' and (storage.foldername(name))[1] = public.mon_client_id()::text);
create policy "videos-mouvement : le client efface ses fichiers" on storage.objects for delete to authenticated
  using (bucket_id = 'videos-mouvement' and (storage.foldername(name))[1] = public.mon_client_id()::text);

create policy "videos-mouvement : le coach dépose ses vocaux" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos-mouvement' and public.dossier_video_de_mon_client(name));
create policy "videos-mouvement : le coach lit" on storage.objects for select to authenticated
  using (bucket_id = 'videos-mouvement' and public.dossier_video_de_mon_client(name));
create policy "videos-mouvement : le coach efface" on storage.objects for delete to authenticated
  using (bucket_id = 'videos-mouvement' and public.dossier_video_de_mon_client(name));
