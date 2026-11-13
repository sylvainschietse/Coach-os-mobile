-- Connexion d'un client avec Google, Microsoft, Apple ou son propre e-mail et mot de passe.
-- À sa première connexion, son compte est relié à sa fiche client si l'e-mail est vérifié
-- (par le fournisseur, ou par l'e-mail de confirmation) et correspond à un seul client actif sans compte.
-- Sans vérification, n'importe qui pourrait taper l'e-mail d'un client et voir ses données.
create function public.rattacher_mon_compte() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u auth.users;
  v_client uuid;
  candidats uuid[];
begin
  select * into u from auth.users where id = auth.uid();
  if u.id is null or u.email is null or u.email_confirmed_at is null then return null; end if;
  if exists (select 1 from coachs where user_id = u.id) then return null; end if;
  select id into v_client from clients where user_id = u.id;
  if v_client is not null then return v_client; end if;

  select array_agg(id) into candidats from clients
    where user_id is null and actif and lower(trim(email)) = lower(u.email);
  -- Même e-mail chez deux coachs : on ne devine pas, le coach crée l'accès depuis la fiche.
  if coalesce(cardinality(candidats), 0) <> 1 then return null; end if;
  update clients set user_id = u.id where id = candidats[1];
  return candidats[1];
end $$;

revoke execute on function public.rattacher_mon_compte() from public, anon;
grant execute on function public.rattacher_mon_compte() to authenticated;
