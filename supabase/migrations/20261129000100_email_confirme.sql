-- Ménage (plan d'amélioration, lot 8) : un client ne change plus son e-mail de connexion sans le confirmer.
--
-- Avant, « Mon compte » remplaçait tout de suite l'e-mail de connexion par n'importe quelle adresse tapée. Désormais
-- l'appli demande le changement à Supabase, qui envoie un lien de confirmation à la nouvelle adresse : l'e-mail ne change
-- qu'une fois ce lien ouvert. Ce déclencheur recopie alors le nouvel e-mail sur la fiche client et dans le carnet du
-- coach, pour que factures, comptes rendus et messages partent à la bonne adresse.
-- Une erreur ici ne bloque jamais la confirmation : elle est seulement notée dans les journaux de la base.

create or replace function public._suivre_email_compte()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c uuid;
begin
  if new.email is not null and new.email is distinct from old.email then
    begin
      update public.clients set email = lower(new.email) where user_id = new.id returning id into c;
      if c is not null then
        update public.contacts set email = lower(new.email) where client_id = c;
      end if;
    exception when others then
      raise warning 'suivre_email_compte (%): %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public._suivre_email_compte() from public, anon, authenticated;

drop trigger if exists suivre_email_compte on auth.users;
create trigger suivre_email_compte
  after update of email on auth.users
  for each row execute function public._suivre_email_compte();
