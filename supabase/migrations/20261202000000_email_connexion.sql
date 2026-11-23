-- Adresse de connexion distincte de l'adresse de contact (ex. un enfant dont les factures vont à un parent).
-- Le client se connecte avec « email_connexion » ; les factures, rendez-vous et messages continuent de partir à
-- l'e-mail de sa fiche (clients.email / contacts.email). Vide = il se connecte avec l'e-mail de sa fiche, comme avant.
-- Posée par le serveur (fonction acces-client, « Créer et envoyer son accès »).
-- Uniquement des ajouts ; peut être collé deux fois sans rien casser.

alter table public.clients add column if not exists email_connexion text;
alter table public.clients drop constraint if exists clients_email_connexion_valide;
alter table public.clients add constraint clients_email_connexion_valide
  check (email_connexion is null or (email_connexion = lower(trim(email_connexion)) and email_connexion ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));

-- Quand l'adresse de connexion change (lien de confirmation cliqué, ou accès renvoyé par le coach) :
-- avec une adresse de connexion à part, seule celle-ci suit ; l'e-mail de contact (celui du parent) ne bouge pas.
create or replace function public.email_confirme_suit_fiche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update clients set email_connexion = lower(new.email) where user_id = new.id and email_connexion is not null;
    update contacts set email = lower(new.email)
      where client_id in (select id from clients where user_id = new.id and email_connexion is null);
    update clients set email = lower(new.email) where user_id = new.id and email_connexion is null;
  end if;
  return new;
end $$;
revoke execute on function public.email_confirme_suit_fiche() from public, anon, authenticated;
