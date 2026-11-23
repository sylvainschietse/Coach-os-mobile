-- Numéro du coach : ses clients peuvent lui écrire sur WhatsApp depuis l'appli (ex. pour l'option nutrition).
alter table public.coachs add column telephone text;

-- Le client lit le prénom et le numéro de son coach, rien d'autre de la table coachs.
create function public.mon_coach() returns table (nom text, telephone text)
language sql stable security definer set search_path = public as $$
  select nom, telephone from public.coachs where id = public.coach_de_mon_client()
$$;
revoke execute on function public.mon_coach() from public, anon;
grant execute on function public.mon_coach() to authenticated;
