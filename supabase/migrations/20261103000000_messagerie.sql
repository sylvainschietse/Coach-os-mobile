-- Messagerie coach-client : un fil par client, avec texte, photos, vidéos et vocaux.
-- · Le coach affiche ses horaires de réponse (coachs.horaires_reponse), visibles en haut du fil côté client.
-- · Les vidéos que le client envoie (ici ou depuis sa séance) sont comptées par mois, face au nombre inclus
--   dans sa formule (clients.videos_mois) : au-delà, le coach facture la vidéo en plus.
-- · Pièces jointes dans le compartiment privé « messagerie », sous <client>/<message>.<ext>. Les vidéos sont
--   effacées 30 jours après l'envoi (l'appli du coach fait le ménage), le message reste avec « vidéo expirée ».
-- · appareils_push : jetons de notification des téléphones, pour prévenir le destinataire d'un nouveau message.

alter table public.coachs add column horaires_reponse text
  check (horaires_reponse is null or length(horaires_reponse) <= 200);
grant update (horaires_reponse) on public.coachs to authenticated;

-- Vidéos corrigées incluses chaque mois dans la formule du client (0 : aucune, chaque vidéo est facturée).
alter table public.clients add column videos_mois integer not null default 0 check (videos_mois between 0 and 30);

-- Le client lit les horaires de réponse de son coach (fonction à part : mon_coach() reste inchangée).
create function public.horaires_de_mon_coach() returns text
language sql stable security definer set search_path = public as $$
  select horaires_reponse from public.coachs where id = public.coach_de_mon_client()
$$;
revoke execute on function public.horaires_de_mon_coach() from public, anon;
grant execute on function public.horaires_de_mon_coach() to authenticated;

-- Le client lit sa propre limite de vidéos.
create function public.mes_videos_mois() returns integer
language sql stable security definer set search_path = public as $$
  select videos_mois from public.clients where id = public.mon_client_id()
$$;
revoke execute on function public.mes_videos_mois() from public, anon;
grant execute on function public.mes_videos_mois() to authenticated;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  auteur text not null check (auteur in ('coach', 'client')),
  texte text check (texte is null or length(texte) <= 2000),
  piece_chemin text unique,
  piece_type text check (piece_type is null or piece_type ~ '^(image|video|audio)/'),
  piece_taille integer check (piece_taille is null or (piece_taille > 0 and piece_taille <= 26214400)),
  piece_duree_s integer check (piece_duree_s is null or (piece_duree_s > 0 and piece_duree_s <= 305)),
  -- Vidéo effacée au bout de 30 jours : le type reste, pour le décompte du mois.
  piece_expiree boolean not null default false,
  cree_le timestamptz not null default now(),
  lu_le timestamptz,
  constraint message_non_vide check (length(trim(coalesce(texte, ''))) > 0 or piece_chemin is not null or piece_expiree),
  constraint piece_complete check (piece_chemin is null or (piece_type is not null and piece_taille is not null)),
  constraint piece_du_client check (piece_chemin is null or piece_chemin like client_id::text || '/%')
);
create index on public.messages (client_id, cree_le desc);
create index on public.messages (coach_id, cree_le desc);
create index on public.messages (coach_id, lu_le) where auteur = 'client' and lu_le is null;

alter table public.messages enable row level security;

create policy "client : son fil" on public.messages for select using (client_id = public.mon_client_id());
create policy "client : écrit à son coach" on public.messages for insert with check (
  auteur = 'client' and client_id = public.mon_client_id() and coach_id = public.coach_de_mon_client() and not piece_expiree
);
create policy "client : lit les messages du coach" on public.messages for update
  using (client_id = public.mon_client_id() and auteur = 'coach') with check (client_id = public.mon_client_id() and auteur = 'coach');
create policy "client : retire son message" on public.messages for delete using (client_id = public.mon_client_id() and auteur = 'client');

create policy "coach : fils de ses clients" on public.messages for select using (coach_id = public.mon_coach_id());
create policy "coach : écrit à son client" on public.messages for insert with check (
  auteur = 'coach' and coach_id = public.mon_coach_id() and not piece_expiree
  and exists (select 1 from public.clients c where c.id = client_id and c.coach_id = public.mon_coach_id())
);
create policy "coach : lit les messages du client" on public.messages for update
  using (coach_id = public.mon_coach_id() and auteur = 'client') with check (coach_id = public.mon_coach_id() and auteur = 'client');
create policy "coach : retire son message" on public.messages for delete using (coach_id = public.mon_coach_id() and auteur = 'coach');

revoke all on public.messages from public, anon, authenticated;
grant select, delete on public.messages to authenticated;
-- La date d'envoi et le « lu » ne se choisissent pas à l'envoi.
grant insert (id, coach_id, client_id, auteur, texte, piece_chemin, piece_type, piece_taille, piece_duree_s) on public.messages to authenticated;
-- Seul le « lu » change ensuite.
grant update (lu_le) on public.messages to authenticated;

-- Fils du coach : un par client actif, avec le dernier message et le nombre de messages non lus.
create function public.conversations_coach()
returns table (client_id uuid, prenom text, nom text, dernier_texte text, dernier_type text, dernier_auteur text, dernier_le timestamptz, non_lus integer)
language sql stable security invoker set search_path = public as $$
  select c.id, c.prenom, c.nom, d.texte, d.piece_type, d.auteur, d.cree_le,
    (select count(*)::int from messages m where m.client_id = c.id and m.auteur = 'client' and m.lu_le is null)
  from clients c
  left join lateral (
    select m.texte, m.piece_type, m.auteur, m.cree_le from messages m where m.client_id = c.id order by m.cree_le desc limit 1
  ) d on true
  where c.coach_id = public.mon_coach_id() and c.actif and c.user_id is not null
  order by d.cree_le desc nulls last, c.prenom
$$;
revoke execute on function public.conversations_coach() from public, anon;
grant execute on function public.conversations_coach() to authenticated;

-- Ménage du coach : ses vidéos de plus de 30 jours, dont l'appli vient d'effacer les fichiers.
create function public.marquer_videos_expirees(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update messages set piece_chemin = null, piece_expiree = true
  where id = any (p_ids) and coach_id = public.mon_coach_id() and piece_type like 'video/%' and cree_le < now() - interval '30 days'
$$;
revoke execute on function public.marquer_videos_expirees(uuid[]) from public, anon;
grant execute on function public.marquer_videos_expirees(uuid[]) to authenticated;

-- Pièces jointes : compartiment privé, 25 Mo au plus par fichier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messagerie', 'messagerie', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
        'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
        'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'])
on conflict (id) do nothing;

create policy "messagerie : le client dépose dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'messagerie' and (storage.foldername(name))[1] = public.mon_client_id()::text);
create policy "messagerie : le client lit son dossier" on storage.objects for select to authenticated
  using (bucket_id = 'messagerie' and (storage.foldername(name))[1] = public.mon_client_id()::text);
create policy "messagerie : le client efface ses fichiers" on storage.objects for delete to authenticated
  using (bucket_id = 'messagerie' and (storage.foldername(name))[1] = public.mon_client_id()::text);
create policy "messagerie : le coach dépose" on storage.objects for insert to authenticated
  with check (bucket_id = 'messagerie' and public.dossier_video_de_mon_client(name));
create policy "messagerie : le coach lit" on storage.objects for select to authenticated
  using (bucket_id = 'messagerie' and public.dossier_video_de_mon_client(name));
create policy "messagerie : le coach efface" on storage.objects for delete to authenticated
  using (bucket_id = 'messagerie' and public.dossier_video_de_mon_client(name));

-- Jetons de notification : un téléphone appartient au dernier compte qui s'y est connecté.
create table public.appareils_push (
  jeton text primary key check (length(jeton) between 10 and 300),
  user_id uuid not null references auth.users (id) on delete cascade,
  plateforme text check (plateforme in ('ios', 'android')),
  maj_le timestamptz not null default now()
);
create index on public.appareils_push (user_id);
alter table public.appareils_push enable row level security;
create policy "appareils : les miens" on public.appareils_push for select using (user_id = auth.uid());
revoke all on public.appareils_push from public, anon, authenticated;
grant select on public.appareils_push to authenticated;

create function public.enregistrer_appareil(p_jeton text, p_plateforme text) returns void
language sql security definer set search_path = public as $$
  insert into appareils_push (jeton, user_id, plateforme, maj_le) values (p_jeton, auth.uid(), p_plateforme, now())
  on conflict (jeton) do update set user_id = excluded.user_id, plateforme = excluded.plateforme, maj_le = now()
$$;
create function public.oublier_appareil(p_jeton text) returns void
language sql security definer set search_path = public as $$
  delete from appareils_push where jeton = p_jeton and user_id = auth.uid()
$$;
revoke execute on function public.enregistrer_appareil(text, text) from public, anon;
grant execute on function public.enregistrer_appareil(text, text) to authenticated;
revoke execute on function public.oublier_appareil(text) from public, anon;
grant execute on function public.oublier_appareil(text) to authenticated;
