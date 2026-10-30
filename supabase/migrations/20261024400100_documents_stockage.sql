-- Fichiers des documents : compartiment privé, rien n'est public. Le coach dépose et lit dans son dossier ;
-- le client ne lit que les fichiers des documents partagés avec lui (lien signé de courte durée).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "documents : le coach dépose dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "documents : le coach lit son dossier" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "documents : le client lit ce qui lui est partagé" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.fichier_partage_avec_moi(name));
