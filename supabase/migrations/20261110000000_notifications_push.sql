-- Notifications sur le téléphone du coach et du client, envoyées par le serveur (service de notifications d'Expo).
--
-- Chaque événement (séance acceptée, message, entraînement fait, nouveau programme…) écrit une ligne dans
-- « notifications » grâce à un déclencheur ; la base appelle aussitôt la fonction Edge « envoyer-notification »
-- (pg_net, appel asynchrone parti après validation) qui la porte aux téléphones de la personne.
-- · Rien n'est envoyé à celui qui a fait l'action lui-même (le coach qui saisit une séance pour son client, etc.).
-- · Chacun coupe les alertes qu'il ne veut pas (« notifications_coupees »), depuis ses réglages dans l'appli.
-- · Une notification ne bloque jamais l'action qui la déclenche : toute erreur est ignorée.
-- · Les messages et les réponses au questionnaire passent désormais par ici (fini l'appel depuis l'appli).

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

-- ---------- Ce qui a été envoyé (et l'historique, pour une future cloche dans l'appli) ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  genre text not null check (length(genre) between 1 and 40),
  titre text not null check (length(titre) between 1 and 200),
  corps text not null default '' check (length(corps) <= 400),
  -- Écran ouvert quand on touche la notification (adresse dans l'appli).
  url text check (url is null or url like '/%'),
  cree_le timestamptz not null default now(),
  envoyee_le timestamptz
);
create index on public.notifications (user_id, cree_le desc);
alter table public.notifications enable row level security;
create policy "notifications : les miennes" on public.notifications for select using (user_id = auth.uid());
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

-- ---------- Alertes coupées, personne par personne ----------
create table public.notifications_coupees (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  genre text not null check (length(genre) between 1 and 40),
  primary key (user_id, genre)
);
alter table public.notifications_coupees enable row level security;
create policy "alertes coupées : les miennes" on public.notifications_coupees for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications_coupees from public, anon, authenticated;
grant select, insert, delete on public.notifications_coupees to authenticated;

-- ---------- Le cœur : prévenir quelqu'un ----------
create function public.notifier(p_user uuid, p_genre text, p_titre text, p_corps text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid;
begin
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;
  if exists (select 1 from public.notifications_coupees where user_id = p_user and genre = p_genre) then return; end if;
  insert into public.notifications (user_id, genre, titre, corps, url)
  values (p_user, p_genre, left(p_titre, 200), left(coalesce(p_corps, ''), 400), p_url)
  returning id into v;
  -- Pas de téléphone inscrit : la ligne reste dans l'historique, rien à envoyer.
  if not exists (select 1 from public.appareils_push where user_id = p_user) then return; end if;
  begin
    perform net.http_post(
      url := 'https://rxkclcytevhtbpcdozdv.supabase.co/functions/v1/envoyer-notification',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('id', v)
    );
  exception when others then
    null; -- base sans pg_net (tests) ou appel refusé : tant pis pour cette notification.
  end;
end $$;
revoke execute on function public.notifier(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- Petites aides ----------
create function public._nom_client(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(prenom || ' ' || coalesce(nom, '')), ''), 'Un client') from public.clients where id = p
$$;
create function public._prenom_client(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(prenom), ''), 'Ton client') from public.clients where id = p
$$;
create function public._user_coach(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.coachs where id = p
$$;
create function public._user_client(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.clients where id = p
$$;
-- Fiche du client dans l'espace coach.
create function public._lien_fiche(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select '/coach?onglet=crm&rubrique=Contacts&contact=' || id from public.contacts where client_id = p order by cree_le desc limit 1),
    '/coach?onglet=suivis'
  )
$$;
-- « mardi 12/11 à 18h00 », heure de Paris.
create function public._quand(t timestamptz) returns text
language sql stable set search_path = public as $$
  select (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from t at time zone 'Europe/Paris')::int + 1]
    || ' ' || to_char(t at time zone 'Europe/Paris', 'DD/MM "à" HH24"h"MI')
$$;
create function public._type_rdv(t text) returns text
language sql immutable as $$
  select case t when 'visio' then 'Visio' when 'appel' then 'Appel' else 'Séance' end
$$;
-- Mêmes mots que src/domain/messagerie.ts (apercu).
create function public._apercu_message(t text, ty text) returns text
language sql immutable as $$
  select case
    when nullif(trim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), '') is not null then
      case when length(trim(regexp_replace(t, '\s+', ' ', 'g'))) > 140 then left(trim(regexp_replace(t, '\s+', ' ', 'g')), 139) || '…'
           else trim(regexp_replace(t, '\s+', ' ', 'g')) end
    when ty like 'image/%' then '📷 Photo'
    when ty like 'video/%' then '🎥 Vidéo'
    when ty like 'audio/%' then '🎤 Message vocal'
    else 'Nouveau message'
  end
$$;
revoke execute on function public._nom_client(uuid), public._prenom_client(uuid), public._user_coach(uuid), public._user_client(uuid),
  public._lien_fiche(uuid) from public, anon, authenticated;

-- Prénoms des personnes d'un rendez-vous (« Inès et Paul »).
create function public._prenoms_rdv(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(c.prenom, ' et ' order by c.prenom), 'Ton client')
  from public.rendez_vous_participants o join public.clients c on c.id = o.client_id where o.rendez_vous_id = p
$$;
revoke execute on function public._prenoms_rdv(uuid) from public, anon, authenticated;

-- Prévient chaque personne d'un rendez-vous.
create function public._notifier_participants(p uuid, p_genre text, p_titre text, p_corps text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u uuid;
begin
  for u in select c.user_id from public.rendez_vous_participants o join public.clients c on c.id = o.client_id
           where o.rendez_vous_id = p and c.user_id is not null loop
    perform public.notifier(u, p_genre, p_titre, p_corps, '/client');
  end loop;
end $$;
revoke execute on function public._notifier_participants(uuid, text, text, text) from public, anon, authenticated;

-- =====================================================================================================
-- Messages : le destinataire est prévenu (remplace l'appel de l'appli à « notifier-message »).
-- =====================================================================================================
create function public._notif_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.auteur = 'client' then
    perform public.notifier(public._user_coach(new.coach_id), 'message', public._nom_client(new.client_id),
      public._apercu_message(new.texte, new.piece_type), '/coach/messages/' || new.client_id);
  else
    perform public.notifier(public._user_client(new.client_id), 'message', (select nom from public.coachs where id = new.coach_id),
      public._apercu_message(new.texte, new.piece_type), '/client/messages');
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_message after insert on public.messages for each row execute function public._notif_message();

-- =====================================================================================================
-- Questionnaire : nouveau prospect (remplace l'appel à « notifier-questionnaire », que notifie_le rend inerte).
-- =====================================================================================================
create or replace function public._prevenir_coach_questionnaire() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
  r jsonb := coalesce(new.reponses, '{}'::jsonb);
  nom text;
  objectif text;
begin
  new.notifie_le := now();
  select prenom, nom into c from public.contacts where id = new.contact_id;
  nom := coalesce(nullif(trim(coalesce(c.prenom, r ->> 'prenom', '') || ' ' || coalesce(c.nom, r ->> 'nom', '')), ''), 'Un prospect');
  objectif := case when r ->> 'objectif' = 'Autre' then r ->> 'objectifAutre' else r ->> 'objectif' end;
  perform public.notifier(public._user_coach(new.coach_id), 'questionnaire', 'Nouveau prospect : questionnaire rempli',
    concat_ws(' · ', nom, nullif(objectif, ''), case when coalesce(array_length(new.alertes, 1), 0) > 0 then '⚠️ à vérifier' end),
    '/coach?onglet=crm&rubrique=Contacts&contact=' || new.contact_id);
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public._prevenir_coach_questionnaire() from public, anon, authenticated;
drop trigger if exists prevenir_coach_questionnaire on public.questionnaires;
create trigger prevenir_coach_questionnaire before insert on public.questionnaires
  for each row execute function public._prevenir_coach_questionnaire();

-- =====================================================================================================
-- Agenda
-- =====================================================================================================
-- Coach : séance acceptée, refusée ou annulée par le client. Client : séance annulée par le coach, déplacée, rappel.
create function public._notif_rendez_vous() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  coach uuid := public._user_coach(new.coach_id);
  quoi text := public._type_rdv(new.type);
  quand text := public._quand(new.debut);
  avec text := (select nom from public.coachs where id = new.coach_id);
begin
  if new.statut is distinct from old.statut then
    if new.statut = 'confirme' and old.statut = 'propose' then
      perform public.notifier(coach, 'rdv_accepte', quoi || ' acceptée', public._prenoms_rdv(new.id) || ' · ' || quand, '/coach?onglet=agenda');
    elsif new.statut = 'refuse' then
      perform public.notifier(coach, 'rdv_refuse', quoi || ' refusée', public._prenoms_rdv(new.id) || ' · ' || quand, '/coach?onglet=agenda');
    elsif new.statut in ('annule', 'annule_tard') and old.statut not in ('annule', 'annule_tard') then
      if new.annule_par = 'client' then
        perform public.notifier(coach, 'rdv_refuse', quoi || ' annulée', public._prenoms_rdv(new.id) || ' · ' || quand, '/coach?onglet=agenda');
      else
        perform public._notifier_participants(new.id, 'rdv_change', quoi || ' annulée', 'Ta séance du ' || quand || ' avec ' || avec || ' est annulée.');
      end if;
    end if;
  end if;
  -- Nouvelle date (le rendez-vous repart « à confirmer »).
  if new.debut is distinct from old.debut and new.statut not in ('annule', 'annule_tard', 'refuse', 'realise', 'absent') then
    perform public._notifier_participants(new.id, 'rdv_change', quoi || ' déplacée',
      'Nouvelle date : ' || quand || '. Confirme-la dans l’appli.');
  end if;
  -- Rappel : quand le mail de rappel part (la veille par défaut), le téléphone sonne aussi.
  if new.rappel_envoye_le is not null and old.rappel_envoye_le is null and new.statut in ('propose', 'confirme') and new.debut > now() then
    perform public._notifier_participants(new.id, 'rdv_rappel', 'Rappel : ' || lower(quoi) || ' avec ' || avec,
      initcap(left(quand, 1)) || substr(quand, 2) || case when new.lieu <> '' then ' · ' || new.lieu else '' end);
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_rendez_vous after update on public.rendez_vous for each row execute function public._notif_rendez_vous();

-- Client : nouvelle séance proposée, à accepter. Une série (« tous les mardis ») ne prévient qu'une fois.
create function public._notif_rdv_propose() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.rendez_vous;
  u uuid := public._user_client(new.client_id);
begin
  select * into r from public.rendez_vous where id = new.rendez_vous_id;
  if r.id is null or r.statut <> 'propose' or r.debut < now() or u is null then return null; end if;
  if r.serie_id is not null then
    if exists (select 1 from public.notifications where user_id = u and genre = 'rdv_propose' and cree_le > now() - interval '5 minutes') then
      return null;
    end if;
    perform public.notifier(u, 'rdv_propose', 'Nouvelles séances à accepter',
      'À partir du ' || public._quand(r.debut) || ' avec ' || (select nom from public.coachs where id = r.coach_id) || '.', '/client');
  else
    perform public.notifier(u, 'rdv_propose', public._type_rdv(r.type) || ' à accepter',
      initcap(left(public._quand(r.debut), 1)) || substr(public._quand(r.debut), 2) || ' avec ' || (select nom from public.coachs where id = r.coach_id) || '.', '/client');
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_rdv_propose after insert on public.rendez_vous_participants for each row execute function public._notif_rdv_propose();

-- Fin de pack : quand l'alerte part par mail, le client et le coach sont prévenus.
create function public._notif_fin_pack() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reste int := new.seances_total - new.seances_faites;
  txt text := case when reste <= 0 then 'Pack terminé' when reste = 1 then 'Plus qu’une séance dans le pack' else 'Plus que ' || reste || ' séances dans le pack' end;
  u uuid;
begin
  if new.alerte_fin_envoyee_le is null or old.alerte_fin_envoyee_le is not null then return null; end if;
  perform public.notifier(public._user_coach(new.coach_id), 'pack_fin', 'Pack bientôt fini', public._nom_client(new.client_id) || ' · ' || lower(left(txt, 1)) || substr(txt, 2) || '.',
    public._lien_fiche(new.client_id));
  for u in select c.user_id from public.clients c where c.id = new.client_id or c.id in (select client_id from public.packs_partages where pack_id = new.id) loop
    perform public.notifier(u, 'pack_fin', txt, 'Pense à le renouveler avec ton coach pour continuer sur ta lancée.', '/client?onglet=moi');
  end loop;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_fin_pack after update of alerte_fin_envoyee_le on public.packs_seances for each row execute function public._notif_fin_pack();

-- =====================================================================================================
-- Entraînement et programmes
-- =====================================================================================================
-- Coach : un client a fait son entraînement.
create function public._notif_realisation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre text := (select titre from public.seances where id = new.seance_id);
  minutes int := greatest(1, round(extract(epoch from (new.fin - new.debut)) / 60)::int);
begin
  perform public.notifier(public._user_coach(new.coach_id), 'seance_faite', public._prenom_client(new.client_id) || ' a fait sa séance',
    concat_ws(' · ', titre, minutes || ' min', nullif(left(trim(coalesce(new.commentaire, '')), 120), '')), public._lien_fiche(new.client_id));
  return null;
exception when others then
  return null;
end $$;
create trigger notif_realisation after insert on public.realisations for each row execute function public._notif_realisation();

-- Client : nouveau programme attribué, ou nouveau cycle qui démarre.
create function public._notif_programme() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is null then return null; end if;
  perform public.notifier(public._user_client(new.client_id), 'programme', 'Nouveau programme', new.titre || ' · ton coach vient de te l’envoyer.', '/client?onglet=programme');
  return null;
exception when others then
  return null;
end $$;
create trigger notif_programme after insert on public.programmes for each row execute function public._notif_programme();

create function public._notif_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'Actif' and old.statut is distinct from 'Actif' then
    perform public.notifier(public._user_client(new.client_id), 'programme', 'Nouveau programme', new.nom || ' commence aujourd’hui.', '/client?onglet=programme');
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_cycle after update of statut on public.cycles for each row execute function public._notif_cycle();

-- Vidéos de mouvement : à corriger (coach), corrigée (client).
create function public._notif_video() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notifier(public._user_coach(new.coach_id), 'video', 'Vidéo à corriger', public._prenom_client(new.client_id) || ' · ' || new.exercice_nom,
      public._lien_fiche(new.client_id));
  elsif new.reponse_le is not null and old.reponse_le is null then
    perform public.notifier(public._user_client(new.client_id), 'video_corrigee', 'Ton coach a corrigé ta vidéo', new.exercice_nom, '/client?onglet=programme');
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_video after insert or update of reponse_le on public.videos_mouvement for each row execute function public._notif_video();

-- Bilan de la semaine : rempli (coach), réponse du coach (client).
create function public._notif_bilan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notifier(public._user_coach(new.coach_id), 'bilan_semaine', 'Bilan de la semaine rempli', public._nom_client(new.client_id) || ' attend ton retour.',
      '/coach?onglet=hebdo');
  elsif new.source_retour = 'Coach' and new.repondu_le is not null and new.repondu_le is distinct from old.repondu_le then
    perform public.notifier(public._user_client(new.client_id), 'bilan_retour', 'Ton coach a répondu à ton bilan',
      coalesce(nullif(left(trim(new.priorite), 140), ''), 'Ouvre ton suivi pour lire son retour.'), '/client?onglet=suivi');
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger notif_bilan after insert or update of repondu_le on public.bilans_hebdo for each row execute function public._notif_bilan();

-- =====================================================================================================
-- Paiements et factures
-- =====================================================================================================
-- Client : sa facture est prête.
create function public._notif_facture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is null then return null; end if;
  perform public.notifier(public._user_client(new.client_id), 'facture', 'Ta facture est disponible',
    new.objet || ' · ' || replace(to_char(new.total, 'FM9999990.00'), '.', ',') || ' €', '/client?onglet=moi');
  return null;
exception when others then
  return null;
end $$;
create trigger notif_facture after insert on public.factures for each row execute function public._notif_facture();

-- Coach : appelée par les fonctions Stripe (paiement reçu, changement d'offre), avec la clé service.
create function public.notifier_coach(p_coach uuid, p_genre text, p_titre text, p_corps text, p_url text) returns void
language sql security definer set search_path = public as $$
  select public.notifier(public._user_coach(p_coach), p_genre, p_titre, p_corps, p_url)
$$;
revoke execute on function public.notifier_coach(uuid, text, text, text, text) from public, anon, authenticated;

-- =====================================================================================================
-- Client inactif : chaque matin, le coach est prévenu des clients sans séance, rendez-vous, activité ni bilan
-- depuis le nombre de jours réglé dans l'agenda (21 par défaut). Une seule fois : le jour où le seuil est atteint.
-- =====================================================================================================
create function public._prevenir_inactifs() returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
  jour date := (now() at time zone 'Europe/Paris')::date;
begin
  for c in
    select cl.id, cl.coach_id, coalesce(ra.inactivite_jours, 21) as seuil,
      greatest(
        cl.created_at,
        (select max(fin) from public.realisations where client_id = cl.id),
        (select max(r.debut) from public.rendez_vous r join public.rendez_vous_participants o on o.rendez_vous_id = r.id
          where o.client_id = cl.id and r.statut in ('confirme', 'realise') and r.debut <= now()),
        (select max(debut) from public.activites_sport where client_id = cl.id and not retiree),
        (select max(envoye_le) from public.bilans_hebdo where client_id = cl.id)
      ) as derniere
    from public.clients cl
    left join public.reglages_agenda ra on ra.coach_id = cl.coach_id
    where cl.actif
  loop
    if (c.derniere at time zone 'Europe/Paris')::date + c.seuil = jour then
      perform public.notifier(public._user_coach(c.coach_id), 'inactif', public._prenom_client(c.id) || ' décroche',
        'Plus rien depuis ' || c.seuil || ' jours. Un petit message pour le relancer ?', '/coach/messages/' || c.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public._prevenir_inactifs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notifications-inactifs', '0 8 * * *', 'select public._prevenir_inactifs()');
  end if;
end $$;
