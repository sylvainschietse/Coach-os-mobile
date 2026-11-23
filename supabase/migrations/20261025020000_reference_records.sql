-- Lot 6 · Performances : la référence des charges calculées (% du 1RM) est choisie par le client, comme à l'origine
-- (« Utiliser comme référence »). Une seule par exercice ; elle ne s'applique jamais à un autre mouvement. Ajouts seulement.

alter table public.records add column if not exists reference boolean not null default false;
create unique index if not exists records_reference on public.records (client_id, exercice_id) where reference;

-- Choisit la référence d'un exercice en une fois (l'ancienne cesse de l'être), pour le client ou son coach.
create function public.definir_reference_record(p_record uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r records;
begin
  select * into r from records where id = p_record and (client_id = mon_client_id() or est_mon_client(client_id));
  if r.id is null then raise exception 'Record introuvable'; end if;
  if r.exercice_id is null or r.unite <> 'kg' then raise exception 'Seule une charge rattachée à un exercice de la liste peut servir de référence.'; end if;
  update records set reference = false where client_id = r.client_id and exercice_id = r.exercice_id and reference and id <> r.id;
  update records set reference = true where id = r.id;
end $$;
revoke execute on function public.definir_reference_record(uuid) from public, anon;
grant execute on function public.definir_reference_record(uuid) to authenticated;
