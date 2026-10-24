-- Ouvre l'espace d'un coach pour un compte déjà créé dans Authentication > Users.
-- À lancer depuis l'éditeur SQL de Supabase (rôle postgres) : select public.creer_coach('e-mail', 'Prénom', 'lien');
-- Le lien donne l'adresse publique du questionnaire d'accueil : /questionnaire/<lien>.
create function public.creer_coach(email_compte text, nom text, lien text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_coach uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(email_compte));
  if v_user is null then
    raise exception 'Aucun compte avec l''e-mail % : crée-le d''abord dans Authentication > Users.', email_compte;
  end if;
  insert into coachs (user_id, nom, lien_questionnaire) values (v_user, trim(nom), lower(trim(lien)))
  on conflict (user_id) do update set nom = excluded.nom, lien_questionnaire = excluded.lien_questionnaire
  returning id into v_coach;
  return v_coach;
end $$;

-- Réservée à l'administrateur du projet : ni les visiteurs ni les comptes connectés ne peuvent l'appeler.
revoke execute on function public.creer_coach(text, text, text) from public, anon, authenticated;
