-- Questionnaire guidé : le matériel d'un club, déjà corrigé par un client, est proposé aux clients suivants du même
-- club (même coach, même salle, même nom de club). Seuls le matériel et les marques sont renvoyés : ni le nom, ni
-- le reste du profil de l'autre client. Uniquement des ajouts ; peut être collé deux fois sans rien casser.

create or replace function public.cle_club(p text) returns text
language sql immutable set search_path = public as $$
  select trim(regexp_replace(lower(translate(coalesce(p, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.materiel_du_club(p_salle text, p_club text, p_client uuid default null)
returns table (materiel jsonb, marques jsonb)
language sql stable security definer set search_path = public as $$
  select coalesce(pa.preferences->'materiel', '[]'::jsonb), coalesce(pa.preferences->'marques', '[]'::jsonb)
  from profils_alimentaires pa
  join clients c on c.id = pa.client_id
  where c.coach_id = coalesce(mon_coach_id(), coach_de_mon_client())
    and length(cle_club(p_club)) > 0
    and pa.preferences->>'salle' = p_salle
    and cle_club(pa.preferences->>'club') = cle_club(p_club)
    and pa.client_id is distinct from coalesce(mon_client_id(), p_client)
    and jsonb_typeof(pa.preferences->'materiel') = 'array'
  order by pa.maj_le desc
  limit 1
$$;

revoke execute on function public.materiel_du_club(text, text, uuid) from public, anon;
grant execute on function public.materiel_du_club(text, text, uuid) to authenticated;
