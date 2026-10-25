-- Lot 6 · Flux externes : questionnaire Tally reçu sans Make, envoi des comptes rendus par le scénario Make,
-- et journal des états observables (C08). Ajouts seulement.
-- Règles : une réponse rejouée ne crée rien de plus ; un accusé de réception Make n'est pas un e-mail envoyé ;
-- un e-mail confirmé n'est jamais renvoyé automatiquement.

alter table public.questionnaires
  add column if not exists envoi_id text,
  add column if not exists source text not null default 'app' check (source in ('app', 'tally'));
create unique index if not exists questionnaires_envoi on public.questionnaires (coach_id, envoi_id) where envoi_id is not null;

create table public.journal_automatisations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  flux text not null check (flux in ('questionnaire', 'compte_rendu')),
  -- Clé de reprise : identifiant de la réponse Tally, ou document:version pour un compte rendu.
  cle text not null check (length(cle) between 1 and 200),
  etat text not null check (etat in ('erreur', 'en_cours', 'transmis', 'envoye', 'echec', 'bloque')),
  contact_id uuid references public.contacts (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  version integer,
  detail text check (detail is null or length(detail) <= 1000),
  tentatives integer not null default 1,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (coach_id, flux, cle)
);
create index on public.journal_automatisations (coach_id, maj_le desc);
alter table public.journal_automatisations enable row level security;
create policy "coach : son journal" on public.journal_automatisations for select using (coach_id = public.mon_coach_id());
revoke all on public.journal_automatisations from anon, authenticated;
grant select on public.journal_automatisations to authenticated;

-- Réponse reçue d'un service externe (webhook Tally), rejouable : la même réponse ne crée ni contact ni questionnaire de plus.
create function public.recevoir_questionnaire_externe(p_lien text, p_envoi text, p_reponses jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
begin
  if p_envoi is null or p_envoi !~ '^tally:[A-Za-z0-9_-]{1,80}$' then raise exception 'Identifiant de réponse invalide'; end if;
  select id into v_coach from coachs where lien_questionnaire = p_lien;
  if v_coach is null then raise exception 'Questionnaire introuvable'; end if;
  perform pg_advisory_xact_lock(hashtext(v_coach::text || p_envoi));
  if exists (select 1 from questionnaires where coach_id = v_coach and envoi_id = p_envoi) then return 'deja_recu'; end if;
  perform soumettre_questionnaire(p_lien, p_reponses || jsonb_build_object('_envoi', p_envoi));
  update questionnaires set envoi_id = p_envoi, source = 'tally'
    where coach_id = v_coach and envoi_id is null and reponses->>'_envoi' = p_envoi;
  -- Une erreur notée plus tôt pour cette réponse est réglée par la reprise.
  delete from journal_automatisations where coach_id = v_coach and flux = 'questionnaire' and cle = p_envoi;
  return 'recu';
end $$;
revoke execute on function public.recevoir_questionnaire_externe(text, text, jsonb) from public;
grant execute on function public.recevoir_questionnaire_externe(text, text, jsonb) to anon, authenticated;

-- Réponse reçue mais non traitée (signature, format, téléphone et e-mail absents…) : visible du coach comme « en erreur ».
create function public.noter_erreur_questionnaire(p_lien text, p_envoi text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid;
begin
  select id into v_coach from coachs where lien_questionnaire = p_lien;
  if v_coach is null or p_envoi is null or length(p_envoi) > 200 then return; end if;
  if exists (select 1 from questionnaires where coach_id = v_coach and envoi_id = p_envoi) then return; end if;
  -- Ouverte aux visiteurs comme le formulaire : on borne le nombre d'erreurs ouvertes pour qu'elle ne remplisse pas le journal.
  if (select count(*) from journal_automatisations where coach_id = v_coach and flux = 'questionnaire') >= 200 then return; end if;
  insert into journal_automatisations (coach_id, flux, cle, etat, detail)
  values (v_coach, 'questionnaire', p_envoi, 'erreur', left(p_detail, 1000))
  on conflict (coach_id, flux, cle) do update
    set detail = excluded.detail, tentatives = journal_automatisations.tentatives + 1, maj_le = now();
end $$;
revoke execute on function public.noter_erreur_questionnaire(text, text, text) from public;
grant execute on function public.noter_erreur_questionnaire(text, text, text) to anon, authenticated;

-- Compte rendu, avant d'appeler Make : réserve la tentative pour cette version, ou dit pourquoi on ne renvoie pas.
-- Comme l'original : une tentative existante bloque tout nouvel envoi. Seule une tentative en échec ou bloquée
-- peut être relancée, et seulement à la demande du coach (p_relancer) après vérification dans Make.
-- Renvoie 'ok' quand l'envoi peut partir, sinon l'état qui l'en empêche.
create function public.reserver_envoi_compte_rendu(p_document uuid, p_version integer, p_relancer boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  d documents;
  v_cle text := p_document::text || ':' || p_version;
  v_etat text;
begin
  select * into d from documents where id = p_document and coach_id = mon_coach_id();
  if d.id is null then raise exception 'Document introuvable'; end if;
  if d.envoye then return 'envoye'; end if;
  if d.chemin is null then raise exception 'Générez le PDF avant l’envoi'; end if;
  if d.version <> p_version then raise exception 'Ce n’est plus la version courante du document'; end if;
  perform pg_advisory_xact_lock(hashtext(v_cle));
  select etat into v_etat from journal_automatisations where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
  if v_etat is null then
    insert into journal_automatisations (coach_id, flux, cle, etat, contact_id, document_id, version, detail)
    values (d.coach_id, 'compte_rendu', v_cle, 'en_cours', d.contact_id, d.id, p_version, 'Transmission à Make');
    return 'ok';
  end if;
  if v_etat in ('echec', 'bloque') and p_relancer then
    update journal_automatisations set etat = 'en_cours', detail = 'Nouvelle transmission demandée par le coach',
      tentatives = tentatives + 1, maj_le = now()
    where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
    return 'ok';
  end if;
  return v_etat;
end $$;
revoke execute on function public.reserver_envoi_compte_rendu(uuid, integer, boolean) from public, anon;
grant execute on function public.reserver_envoi_compte_rendu(uuid, integer, boolean) to authenticated;

-- Résultat de la transmission, noté par la fonction Edge au nom du coach.
-- « envoye » seulement si Make confirme l'e-mail (sent=true, même document, identifiant du message) ;
-- alors seulement Documents.Envoyé est coché et le plan d'action du Booster marqué envoyé.
create function public.noter_envoi_compte_rendu(p_document uuid, p_version integer, p_etat text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d documents;
  v_cle text := p_document::text || ':' || p_version;
begin
  if p_etat not in ('transmis', 'envoye', 'echec', 'bloque') then raise exception 'État inconnu'; end if;
  select * into d from documents where id = p_document and coach_id = mon_coach_id();
  if d.id is null then raise exception 'Document introuvable'; end if;
  update journal_automatisations
    set etat = case when etat = 'envoye' then 'envoye' else p_etat end, detail = left(p_detail, 1000), maj_le = now()
    where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
  if not found then raise exception 'Aucune transmission réservée pour cette version'; end if;
  if p_etat = 'envoye' and d.version = p_version then
    update documents set envoye = true, modifie_le = now() where id = d.id;
    if d.booster_id is not null then
      update boosters set plan_envoye_le = coalesce(plan_envoye_le, now()) where id = d.booster_id;
    end if;
  end if;
end $$;
revoke execute on function public.noter_envoi_compte_rendu(uuid, integer, text, text) from public, anon;
grant execute on function public.noter_envoi_compte_rendu(uuid, integer, text, text) to authenticated;
