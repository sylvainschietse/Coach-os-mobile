-- Agenda, étape 2 : synchronisation avec le Google Agenda du coach (fonction Edge `agenda-google`).
--   · les rendez-vous de l'app sont copiés dans son agenda Google et suivent chaque changement ;
--   · ses événements perso (hors ceux de l'app) sont recopiés en « créneaux occupés » pour éviter les doublons ;
--   · une visio sans lien reçoit un lien Google Meet.
-- Le jeton Google n'est lisible que par la fonction Edge (clé service) : ni le coach ni ses clients n'y ont accès.

create table public.google_agenda (
  coach_id uuid primary key references public.coachs (id) on delete cascade,
  email text not null default '',
  refresh_token text not null,
  calendrier text not null default 'primary',
  connecte_le timestamptz not null default now(),
  synchro_le timestamptz,
  erreur text
);
alter table public.google_agenda enable row level security;
revoke all on public.google_agenda from anon, authenticated;

-- Demande de connexion en cours (protection du retour de Google), valable 15 minutes.
create table public.google_connexions (
  etat uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  retour text not null,
  cree_le timestamptz not null default now()
);
alter table public.google_connexions enable row level security;
revoke all on public.google_connexions from anon, authenticated;

-- Événements perso du Google Agenda du coach (60 jours à venir), affichés en gris et pris en compte pour les chevauchements.
create table public.google_occupations (
  coach_id uuid not null references public.coachs (id) on delete cascade,
  id text not null,
  debut timestamptz not null,
  fin timestamptz not null,
  titre text not null default '',
  journee boolean not null default false,
  primary key (coach_id, id)
);
create index google_occupations_debut on public.google_occupations (coach_id, debut);
alter table public.google_occupations enable row level security;
create policy "coach : ses créneaux Google" on public.google_occupations for select using (coach_id = public.mon_coach_id());
revoke all on public.google_occupations from anon, authenticated;
grant select on public.google_occupations to authenticated;

-- Événement Google du rendez-vous et date de la dernière copie.
alter table public.rendez_vous add column google_event_id text, add column google_synchro_le timestamptz;
create index rendez_vous_google_a_faire on public.rendez_vous (coach_id) where google_synchro_le is null;

-- maj_le ne bouge plus que si le contenu change (pas pour une date d'envoi de mail ou de synchro Google) :
-- la synchro sait ainsi quoi recopier, et le mail « nouvelle date » ne part pas à tort.
create or replace function public.rendez_vous_modifie() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.type, new.debut, new.fin, new.lieu, new.lien_visio, new.note, new.statut)
     is distinct from (old.type, old.debut, old.fin, old.lieu, old.lien_visio, old.note, old.statut) then
    new.maj_le := now();
  end if;
  if new.debut is distinct from old.debut or new.fin is distinct from old.fin then
    new.invitation_envoyee_le := null;
    new.relance_envoyee_le := null;
    new.rappel_envoye_le := null;
    new.rappel_court_envoye_le := null;
    if old.statut in ('confirme', 'refuse') then new.statut := 'propose'; end if;
  end if;
  return new;
end $$;

-- Personnes ajoutées ou retirées : le titre de l'événement Google change.
create function public.rendez_vous_participants_google() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.rendez_vous set google_synchro_le = null
  where id = coalesce(new.rendez_vous_id, old.rendez_vous_id) and google_synchro_le is not null;
  return null;
end $$;
revoke execute on function public.rendez_vous_participants_google() from public, anon, authenticated;
create trigger rendez_vous_participants_google after insert or delete on public.rendez_vous_participants
  for each row execute function public.rendez_vous_participants_google();

-- Rendez-vous supprimé : son événement Google est à retirer au prochain passage.
create table public.google_suppressions (
  coach_id uuid not null references public.coachs (id) on delete cascade,
  event_id text not null,
  cree_le timestamptz not null default now(),
  primary key (coach_id, event_id)
);
alter table public.google_suppressions enable row level security;
revoke all on public.google_suppressions from anon, authenticated;

create function public.rendez_vous_supprime_google() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.google_event_id is not null then
    insert into public.google_suppressions (coach_id, event_id) values (old.coach_id, old.google_event_id) on conflict do nothing;
  end if;
  return old;
end $$;
revoke execute on function public.rendez_vous_supprime_google() from public, anon, authenticated;
create trigger rendez_vous_supprime_google after delete on public.rendez_vous
  for each row execute function public.rendez_vous_supprime_google();

-- Coach : état de sa connexion Google (sans le jeton).
create function public.mon_google_agenda()
returns table (email text, connecte_le timestamptz, synchro_le timestamptz, erreur text)
language sql stable security definer set search_path = public as $$
  select email, connecte_le, synchro_le, erreur from public.google_agenda where coach_id = public.mon_coach_id()
$$;
revoke execute on function public.mon_google_agenda() from public, anon;
grant execute on function public.mon_google_agenda() to authenticated;
