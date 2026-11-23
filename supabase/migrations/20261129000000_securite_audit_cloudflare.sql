-- Sécurité, lot 5 : corrections du deuxième audit (méthode Cloudflare, 22 novembre 2026).
--
-- 1. Changement d'e-mail d'un client : il passe désormais par le lien de confirmation de Supabase (voir
--    supabase/functions/mes-coordonnees). Une fois le nouvel e-mail confirmé, sa fiche client et la fiche contact du
--    coach suivent toutes seules.
-- 2. Tests du client (evaluations_client) : le client les lit, seul le coach les saisit, les modifie ou les supprime.
--    Avant, le client pouvait en supprimer.
-- 3. Questionnaire public : sur une fiche existante, le téléphone, le prénom et le nom ne sont plus complétés par les
--    réponses (n'importe qui peut remplir le formulaire avec l'e-mail d'un prospect). Ils arrivent en alerte « à vérifier ».
-- 4. Journal des erreurs du questionnaire : un visiteur ne peut plus le remplir pour cacher les vraies erreurs.
--    Au plus 30 erreurs par heure, et on garde les 200 plus récentes au lieu de refuser les nouvelles.
-- 5. Lien vidéo d'un exercice : seulement une adresse web (http ou https) pour les nouveaux exercices.


-- 1. L'e-mail confirmé suit sur la fiche client et sur la fiche contact.
create or replace function public.email_confirme_suit_fiche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update clients set email = lower(new.email) where user_id = new.id;
    update contacts set email = lower(new.email) where client_id in (select id from clients where user_id = new.id);
  end if;
  return new;
end $$;
revoke execute on function public.email_confirme_suit_fiche() from public, anon, authenticated;

drop trigger if exists email_confirme_suit_fiche on auth.users;
create trigger email_confirme_suit_fiche after update of email on auth.users
  for each row execute function public.email_confirme_suit_fiche();


-- 2. Tests du client : lecture seule pour le client.
drop policy if exists "client et coach : evaluations" on public.evaluations_client;
drop policy if exists "client : lit ses evaluations" on public.evaluations_client;
drop policy if exists "coach : evaluations de ses clients" on public.evaluations_client;
create policy "client : lit ses evaluations" on public.evaluations_client for select
  using (client_id = public.mon_client_id());
create policy "coach : evaluations de ses clients" on public.evaluations_client for all
  using (public.est_mon_client(client_id))
  with check (public.est_mon_client(client_id));


-- 3. Questionnaire public : rien de l'identité d'une fiche existante n'est complété par les réponses.
create or replace function public.soumettre_questionnaire(lien text, reponses jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
  tel text := normaliser_telephone(reponses->>'telephone');
  mail text := lower(trim(reponses->>'email'));
  prenom_saisi text := coalesce(trim(reponses->>'prenom'), '');
  nom_saisi text := coalesce(trim(reponses->>'nom'), '');
  par_tel contacts;
  par_mail contacts;
  c contacts;
  alertes text[] := '{}';
  aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  select id into v_coach from coachs where lien_questionnaire = lien;
  if v_coach is null then raise exception 'Questionnaire introuvable'; end if;
  -- Anti-spam : le formulaire est public. Au-delà de 20 réponses en une heure (ou 100 en un jour) pour un même coach,
  -- les suivantes sont refusées ; Tally les renverra plus tard, le formulaire de l'app affiche l'erreur.
  if (select count(*) from questionnaires where coach_id = v_coach and recu_le > now() - interval '1 hour') >= 20
     or (select count(*) from questionnaires where coach_id = v_coach and recu_le > now() - interval '1 day') >= 100 then
    raise exception 'Trop de réponses en peu de temps : réessaie un peu plus tard.';
  end if;
  if pg_column_size(reponses) > 20000 then raise exception 'Réponses trop longues'; end if;
  if mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then mail := null; end if;
  if tel is null and mail is null then raise exception 'Téléphone ou e-mail requis'; end if;

  select * into par_tel from contacts
    where coach_id = v_coach and tel is not null and telephone = tel
    order by statut = 'archive', cree_le limit 1;
  select * into par_mail from contacts
    where coach_id = v_coach and mail is not null and email = mail
    order by statut = 'archive', cree_le limit 1;
  if par_tel.id is not null then c := par_tel; elsif par_mail.id is not null then c := par_mail; end if;

  if par_tel.id is not null and par_mail.id is not null and par_tel.id <> par_mail.id then
    alertes := alertes || format('L’e-mail correspond aussi à la fiche de %s %s. À vérifier.', par_mail.prenom, par_mail.nom);
  end if;

  if c.id is null then
    insert into contacts (coach_id, prenom, nom, telephone, email, date_naissance, source)
    values (v_coach, prenom_saisi, nom_saisi, tel, mail, reponses->>'dateNaissance', reponses->>'source')
    returning * into c;
  else
    if mail is not null and c.email is not null and c.email <> mail then
      alertes := alertes || format('E-mail différent dans le questionnaire : %s (fiche : %s).', mail, c.email);
    end if;
    -- Sécurité : n'importe qui peut remplir le formulaire avec le téléphone ou l'e-mail d'un prospect. L'e-mail, le
    -- téléphone, le prénom et le nom d'une fiche existante ne sont donc jamais complétés : le coach les vérifie et les ajoute.
    if mail is not null and c.email is null then
      alertes := alertes || format('E-mail donné dans le questionnaire : %s. Il n’a pas été ajouté à la fiche : vérifie-le avec la personne avant de l’ajouter.', mail);
    end if;
    if tel is not null and c.telephone is not null and c.telephone <> tel then
      alertes := alertes || format('Téléphone différent dans le questionnaire : %s (fiche : %s).', tel, c.telephone);
    end if;
    if tel is not null and c.telephone is null then
      alertes := alertes || format('Téléphone donné dans le questionnaire : %s. Il n’a pas été ajouté à la fiche : vérifie-le avec la personne avant de l’ajouter.', tel);
    end if;
    if (prenom_saisi <> '' and lower(prenom_saisi) <> lower(c.prenom)) or (nom_saisi <> '' and lower(nom_saisi) <> lower(c.nom)) then
      alertes := alertes || format('Nom donné dans le questionnaire : %s %s (fiche : %s %s). À vérifier.', prenom_saisi, nom_saisi, c.prenom, c.nom);
    end if;
    if c.statut = 'archive' then
      alertes := alertes || 'Ce contact était archivé : il a été réactivé par ses réponses.'::text;
    end if;
    update contacts set
      date_naissance = coalesce(date_naissance, reponses->>'dateNaissance'),
      source = coalesce(source, reponses->>'source'),
      statut = case when statut = 'archive' then coalesce(statut_avant_archive, 'prospect') else statut end,
      statut_avant_archive = case when statut = 'archive' then null else statut_avant_archive end
    where id = c.id
    returning * into c;
  end if;

  insert into questionnaires (coach_id, contact_id, reponses, alertes) values (v_coach, c.id, reponses, alertes);
  update relances set faite_le = now(), auto = true
    where contact_id = c.id and modele = 'questionnaire' and faite_le is null;
  if c.statut = 'prospect' and not exists (
    select 1 from relances where contact_id = c.id and modele = 'booster' and faite_le is null
  ) then
    insert into relances (coach_id, contact_id, echeance, modele) values (v_coach, c.id, aujourdhui, 'booster');
  end if;
end $$;


-- 4. Journal des erreurs du questionnaire : limité par heure, et les plus anciennes laissent la place aux nouvelles.
create or replace function public.noter_erreur_questionnaire(p_lien text, p_envoi text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
begin
  select id into v_coach from coachs where lien_questionnaire = p_lien;
  if v_coach is null or p_envoi is null or length(p_envoi) > 200 then return; end if;
  if exists (select 1 from questionnaires where coach_id = v_coach and envoi_id = p_envoi) then return; end if;
  -- Ouverte aux visiteurs comme le formulaire : au plus 30 erreurs nouvelles par heure.
  if (select count(*) from journal_automatisations
      where coach_id = v_coach and flux = 'questionnaire' and maj_le > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into journal_automatisations (coach_id, flux, cle, etat, detail)
  values (v_coach, 'questionnaire', p_envoi, 'erreur', left(p_detail, 1000))
  on conflict (coach_id, flux, cle) do update
    set detail = excluded.detail, tentatives = journal_automatisations.tentatives + 1, maj_le = now();
  -- On garde les 200 erreurs les plus récentes : une vraie erreur reste toujours visible.
  delete from journal_automatisations
    where coach_id = v_coach and flux = 'questionnaire'
      and id not in (
        select id from journal_automatisations
        where coach_id = v_coach and flux = 'questionnaire'
        order by maj_le desc limit 200
      );
end $$;
revoke execute on function public.noter_erreur_questionnaire(text, text, text) from public;
grant execute on function public.noter_erreur_questionnaire(text, text, text) to anon, authenticated;


-- 5. Lien vidéo d'un exercice : une adresse web seulement. « not valid » : les exercices existants ne sont pas revus,
--    seuls les nouveaux et les modifiés sont vérifiés.
alter table public.exercices drop constraint if exists video_url_web;
alter table public.exercices add constraint video_url_web
  check (video_url is null or video_url ~* '^https?://') not valid;
