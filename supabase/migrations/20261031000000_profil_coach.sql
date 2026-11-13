-- Profil du coach : il modifie lui-même son prénom, son numéro WhatsApp et sa photo. Ses clients voient les trois.
-- La photo est une petite image JPEG en base64 (environ 400 px), comme les photos de suivi : pas de stockage à part.
alter table public.coachs add column photo text
  check (photo is null or (photo like 'data:image/jpeg;base64,%' and length(photo) <= 200000));
alter table public.coachs add constraint coachs_nom_non_vide check (length(trim(nom)) > 0) not valid;

grant update (nom, telephone, photo) on public.coachs to authenticated;

drop function public.mon_coach();
create function public.mon_coach() returns table (nom text, telephone text, photo text)
language sql stable security definer set search_path = public as $$
  select nom, telephone, photo from public.coachs where id = public.coach_de_mon_client()
$$;
revoke execute on function public.mon_coach() from public, anon;
grant execute on function public.mon_coach() to authenticated;
