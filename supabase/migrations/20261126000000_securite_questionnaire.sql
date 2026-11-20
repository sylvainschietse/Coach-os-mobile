-- Sécurité, lot 3 : un questionnaire public sûr.
--
-- 1. Le questionnaire d'accueil est public. Rempli avec le téléphone d'un prospect qui n'avait pas encore d'e-mail,
--    il recopiait l'e-mail saisi sur sa fiche. Un inconnu pouvait ainsi y mettre le sien, puis, une fois le prospect
--    passé en client, créer un compte avec cet e-mail et voir ses données. Désormais l'e-mail d'une fiche existante
--    n'est jamais complété par le questionnaire : il arrive en alerte « à vérifier » pour le coach.
-- 2. Un nouveau compte n'est plus relié tout seul à une fiche client par son e-mail : l'accès d'un client se crée
--    depuis sa fiche (« Créer l'accès »), comme aujourd'hui. Un compte déjà relié le reste.
-- 3. Anti-spam : 20 réponses par heure et 100 par jour au plus pour un même coach.

create or replace function public.soumettre_questionnaire(lien text, reponses jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
  tel text := normaliser_telephone(reponses->>'telephone');
  mail text := lower(trim(reponses->>'email'));
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
    values (v_coach, coalesce(trim(reponses->>'prenom'), ''), coalesce(trim(reponses->>'nom'), ''), tel, mail,
            reponses->>'dateNaissance', reponses->>'source')
    returning * into c;
  else
    if mail is not null and c.email is not null and c.email <> mail then
      alertes := alertes || format('E-mail différent dans le questionnaire : %s (fiche : %s).', mail, c.email);
    end if;
    -- Sécurité : l'e-mail sert à se connecter. Celui du questionnaire n'est jamais recopié sur une fiche existante
    -- (n'importe qui peut remplir le formulaire avec le téléphone d'un prospect) : le coach le vérifie et l'ajoute.
    if mail is not null and c.email is null then
      alertes := alertes || format('E-mail donné dans le questionnaire : %s. Il n’a pas été ajouté à la fiche : vérifie-le avec la personne avant de l’ajouter.', mail);
    end if;
    if tel is not null and c.telephone is not null and c.telephone <> tel then
      alertes := alertes || format('Téléphone différent dans le questionnaire : %s (fiche : %s).', tel, c.telephone);
    end if;
    if c.statut = 'archive' then
      alertes := alertes || 'Ce contact était archivé : il a été réactivé par ses réponses.'::text;
    end if;
    update contacts set
      prenom = case when prenom = '' then coalesce(trim(reponses->>'prenom'), '') else prenom end,
      nom = case when nom = '' then coalesce(trim(reponses->>'nom'), '') else nom end,
      telephone = coalesce(telephone, tel),
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


create or replace function public.rattacher_mon_compte() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
begin
  -- Ne relie plus rien : renvoie seulement la fiche déjà reliée à ce compte (par le coach, depuis « Créer l'accès »).
  if auth.uid() is null or exists (select 1 from coachs where user_id = auth.uid()) then return null; end if;
  select id into v_client from clients where user_id = auth.uid();
  return v_client;
end $$;
revoke execute on function public.rattacher_mon_compte() from public, anon;
grant execute on function public.rattacher_mon_compte() to authenticated;
