-- Coach OS · lot 3 : entraînement complet repris de l'app Zite.
-- Programmes et séances modèles en vraies lignes (comme dans Airtable), suivis et cycles clients,
-- calendrier du client et réalisations rattachées à leur cycle avec des libellés figés.
-- Tout est ajouté : seules la règle « coach : ses séances », celle d'insertion des réalisations et
-- la fonction enregistrer_seance sont remplacées pour accepter une séance de modèle (sans client).

-- ===== Programmes : les champs d'Airtable =====
alter table public.programmes
  add column ref_externe text,
  add column statut text not null default 'Brouillon',
  add column environnement text,
  add column materiel text,
  add column contraintes text,
  add column consignes text,
  add column duree_cible_min int check (duree_cible_min between 1 and 600),
  add column priorites text[] not null default '{}',
  add column version text,
  add column modele_origine_id uuid references public.programmes (id) on delete set null,
  add column cycle_applique int check (cycle_applique between 1 and 4),
  -- « Séance seule · … » : conteneur d'une séance créée hors programme (version coachos-single d'origine).
  add column seance_seule boolean not null default false,
  -- Corbeille : masqué de la bibliothèque, restaurable. Rien n'est effacé.
  add column supprime_le timestamptz;
create unique index programmes_ref_externe on public.programmes (coach_id, ref_externe) where ref_externe is not null;

-- ===== Séances : une séance de modèle n'a pas de client =====
alter table public.seances alter column client_id drop not null;
alter table public.seances
  add column dominante text,
  add column duree_prevue_min int check (duree_prevue_min between 1 and 600),
  add column objectif text,
  add column ref_externe text,
  add column supprime_le timestamptz;
create unique index seances_ref_externe on public.seances (coach_id, ref_externe) where ref_externe is not null;

-- ===== Lignes : prescription complète d'Airtable =====
alter table public.lignes
  -- Texte tel que prescrit (« 12–15 », « 6–8 par côté ») ; repetitions_min/max restent pour la saisie.
  add column repetitions text,
  add column distance_m numeric check (distance_m > 0),
  -- « Charge à ajuster au RIR cible », « 70 % 1RM », ou l'objectif cardio « 20 cal », « 2:05 / 500 m »…
  add column charge_intensite text,
  add column phase text check (phase in ('Échauffement', 'Principal', 'Finisher', 'Retour au calme')),
  add column progression text,
  -- Les quatre variantes du modèle (ancien marqueur COACHOS_CYCLES), jamais montrées telles quelles.
  add column cycles jsonb check (cycles is null or (jsonb_typeof(cycles) = 'array' and jsonb_array_length(cycles) = 4)),
  add column ref_externe text;
alter table public.lignes drop constraint lignes_series_check;
alter table public.lignes add constraint lignes_series_check check (series between 0 and 50);

drop policy "coach : ses séances" on public.seances;
create policy "coach : ses séances" on public.seances for all
  using (coach_id = public.mon_coach_id())
  with check (
    coach_id = public.mon_coach_id()
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.coach_id = public.mon_coach_id()))
    and (programme_id is null or exists (select 1 from public.programmes p where p.id = programme_id and p.coach_id = public.mon_coach_id()))
  );

-- ===== Suivi d'un client et ses cycles (Suivis.tsx, saveSuivi, saveCycle, activerCycle) =====
create table public.suivis (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null unique references public.clients (id) on delete cascade,
  debut date not null,
  duree_mois int not null check (duree_mois between 1 and 24),
  cree_le timestamptz not null default now()
);

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  suivi_id uuid not null references public.suivis (id) on delete cascade,
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  ordre int not null,
  nom text not null check (length(trim(nom)) between 1 and 120),
  objectif text check (length(objectif) <= 2000),
  debut date not null,
  fin date not null,
  statut text not null default 'Brouillon' check (statut in ('Brouillon', 'Prêt', 'Actif', 'Terminé')),
  programme_id uuid references public.programmes (id) on delete set null,
  mode text check (mode in ('Modèle', 'Copie personnalisée')),
  cree_le timestamptz not null default now(),
  constraint cycle_dates check (fin >= debut)
);
create index on public.cycles (suivi_id, ordre);
create index on public.cycles (client_id);
-- Un seul cycle actif par suivi : deux activations simultanées ne peuvent pas passer toutes les deux.
create unique index cycles_un_actif on public.cycles (suivi_id) where statut = 'Actif';

-- Règles d'origine tenues par la base : l'activation ne passe que par activer_cycle, un cycle actif garde
-- un programme, le programme d'un cycle terminé est figé.
create function public.controler_cycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.statut = 'Actif' and (tg_op = 'INSERT' or old.statut <> 'Actif')
     and coalesce(current_setting('coachos.activation', true), '') <> 'oui' then
    raise exception 'Utilisez « Activer » pour rendre un cycle actif';
  end if;
  if new.statut = 'Actif' and new.programme_id is null then
    raise exception 'Un cycle actif doit garder un programme';
  end if;
  if tg_op = 'UPDATE' and old.statut = 'Terminé' and new.programme_id is distinct from old.programme_id then
    raise exception 'Cycle terminé : programme figé';
  end if;
  return new;
end $$;
create trigger controler_cycle before insert or update on public.cycles for each row execute function public.controler_cycle();

alter table public.suivis enable row level security;
alter table public.cycles enable row level security;
create policy "coach : suivis de ses clients" on public.suivis for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.est_mon_client(client_id));
create policy "client : son suivi" on public.suivis for select using (client_id = public.mon_client_id());
create policy "coach : cycles de ses clients" on public.cycles for all
  using (coach_id = public.mon_coach_id())
  with check (
    coach_id = public.mon_coach_id() and public.est_mon_client(client_id)
    and exists (select 1 from public.suivis s where s.id = suivi_id and s.client_id = cycles.client_id)
    and (programme_id is null or exists (select 1 from public.programmes p where p.id = programme_id and p.coach_id = public.mon_coach_id()))
  );
-- Brouillons et cycles « Prêt » ne sont jamais montrés au client (getClientEspace d'origine).
create policy "client : ses cycles visibles" on public.cycles for select
  using (client_id = public.mon_client_id() and statut in ('Actif', 'Terminé'));

-- Le programme du cycle actif, lié tel quel (modèle) ou en copie : le client le lit, sans rien d'autre.
create function public.mes_programmes_visibles() returns setof uuid
language sql stable security definer set search_path = public as $$
  select programme_id from public.cycles where client_id = public.mon_client_id() and statut = 'Actif' and programme_id is not null
$$;
revoke execute on function public.mes_programmes_visibles() from public, anon;
grant execute on function public.mes_programmes_visibles() to authenticated;

create policy "client : programme de son cycle actif" on public.programmes for select
  using (id in (select public.mes_programmes_visibles()));
create policy "client : séances de son cycle actif" on public.seances for select
  using (supprime_le is null and programme_id in (select public.mes_programmes_visibles()));

-- Activation contrôlée (activerCycle.ts) : Prêt, programme lié, aujourd'hui (Paris) dans les dates ;
-- l'ancien cycle actif passe Terminé. L'index unique empêche deux actifs.
create function public.activer_cycle(c uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v public.cycles;
  jour date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into v from public.cycles where id = c for update;
  if not found then raise exception 'Cycle introuvable'; end if;
  if v.statut = 'Actif' then return; end if;
  if v.statut <> 'Prêt' then
    raise exception 'Activation refusée : le cycle est « % ». Passez-le d''abord en « Prêt ».', v.statut;
  end if;
  if jour < v.debut or jour > v.fin then
    raise exception 'Activation refusée : aujourd''hui (%, Paris) est hors du cycle (% → %). Replanifiez les dates ou attendez le début.',
      to_char(jour, 'DD/MM/YYYY'), to_char(v.debut, 'DD/MM/YYYY'), to_char(v.fin, 'DD/MM/YYYY');
  end if;
  if v.programme_id is null then raise exception 'Activation refusée : aucun programme lié.'; end if;
  perform set_config('coachos.activation', 'oui', true);
  update public.cycles set statut = 'Terminé' where suivi_id = v.suivi_id and statut = 'Actif' and id <> c;
  update public.cycles set statut = 'Actif' where id = c;
  perform set_config('coachos.activation', '', true);
end $$;

-- Monte ou descend un cycle dans son suivi (moveCycle.ts) : les ordres sont renumérotés 1..n.
create function public.deplacer_cycle(c uuid, sens int) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_suivi uuid;
  ids uuid[];
  i int;
  j int;
  t uuid;
begin
  select suivi_id into v_suivi from public.cycles where id = c;
  if v_suivi is null then raise exception 'Cycle introuvable'; end if;
  select array_agg(id order by ordre, cree_le) into ids from public.cycles where suivi_id = v_suivi;
  i := array_position(ids, c);
  j := i + sign(sens)::int;
  if j < 1 or j > array_length(ids, 1) then return; end if;
  t := ids[i]; ids[i] := ids[j]; ids[j] := t;
  update public.cycles set ordre = array_position(ids, id) where suivi_id = v_suivi;
end $$;

-- ===== Calendrier du client (MyCalendar, saveMySchedule, calendar.ts) =====
create table public.planifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  seance_id uuid not null references public.seances (id) on delete cascade,
  seance_titre text not null,
  date date not null,
  heure text check (heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  statut text not null default 'Prévue' check (statut in ('Prévue', 'Réalisée', 'Annulée')),
  realisee_le timestamptz,
  realisation_id uuid,
  -- Identifiant d'envoi venu de l'app : un double appui ne crée pas deux créneaux.
  envoi_id text not null unique check (length(envoi_id) between 8 and 64),
  cree_le timestamptz not null default now()
);
create index on public.planifications (client_id, cycle_id, date);

alter table public.planifications enable row level security;
-- Écriture uniquement par les fonctions ci-dessous, qui vérifient le dossier, le cycle et les dates.
create policy "client : son calendrier" on public.planifications for select using (client_id = public.mon_client_id());
create policy "coach : calendrier de ses clients" on public.planifications for select using (public.est_mon_client(client_id));

-- Contrôle commun : le cycle est celui du client connecté. Renvoie le cycle.
create function public.mon_cycle(c uuid) returns public.cycles
language plpgsql stable security definer set search_path = public as $$
declare v public.cycles;
begin
  select * into v from public.cycles where id = c and client_id = public.mon_client_id();
  if not found then raise exception 'Cycle hors de votre dossier'; end if;
  return v;
end $$;
revoke execute on function public.mon_cycle(uuid) from public, anon;

-- Planifie ou déplace un créneau (saveMySchedule action « save »).
create function public.planifier_seance(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.cycles := public.mon_cycle((p->>'cycleId')::uuid);
  ancien public.planifications;
  s public.seances;
  jour date := (now() at time zone 'Europe/Paris')::date;
  d date := nullif(p->>'date', '')::date;
  h text := nullif(p->>'heure', '');
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if exists (select 1 from public.planifications where envoi_id = p->>'envoiId' and client_id = v.client_id) then
    return (select id from public.planifications where envoi_id = p->>'envoiId');
  end if;
  if v_id is not null then
    select * into ancien from public.planifications where id = v_id and client_id = v.client_id and cycle_id = v.id;
    if not found then raise exception 'Créneau hors de votre dossier'; end if;
    if ancien.statut = 'Réalisée' then raise exception 'Une séance réalisée reste conservée dans votre historique'; end if;
  end if;
  if v.statut <> 'Actif' or v.programme_id is null then raise exception 'Le coach doit activer ce cycle avant de planifier'; end if;
  if d is null or d < jour or d < v.debut or d > v.fin or coalesce(p->>'envoiId', '') = '' then
    raise exception 'Choisissez une date à venir dans les dates du cycle actif';
  end if;
  if h is not null and h !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Heure invalide'; end if;
  select * into s from public.seances where id = (p->>'seanceId')::uuid and supprime_le is null;
  if not found or s.programme_id is distinct from v.programme_id then raise exception 'Séance hors de votre programme actif'; end if;
  if exists (select 1 from public.planifications where client_id = v.client_id and cycle_id = v.id and statut = 'Prévue'
             and seance_id = s.id and date = d and id is distinct from v_id) then
    raise exception 'Cette séance est déjà prévue ce jour-là';
  end if;
  if v_id is not null then
    update public.planifications set seance_id = s.id, seance_titre = s.titre, date = d, heure = h, envoi_id = p->>'envoiId' where id = v_id;
    return v_id;
  end if;
  insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, heure, envoi_id)
  values (v.client_id, v.id, s.id, s.titre, d, h, p->>'envoiId') returning id into v_id;
  return v_id;
end $$;

-- Annule un créneau prévu ; une séance réalisée ne peut pas l'être.
create function public.annuler_creneau(c uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ancien public.planifications;
begin
  select * into ancien from public.planifications where id = c and client_id = public.mon_client_id();
  if not found then raise exception 'Créneau introuvable'; end if;
  if ancien.statut = 'Réalisée' then raise exception 'Une séance réalisée reste conservée dans votre historique'; end if;
  update public.planifications set statut = 'Annulée' where id = c;
end $$;

-- ===== Réalisations rattachées au cycle, avec libellés figés (logSeance.ts) =====
alter table public.realisations
  add column cycle_id uuid references public.cycles (id) on delete set null,
  add column programme_id uuid references public.programmes (id) on delete set null,
  add column planification_id uuid references public.planifications (id) on delete set null,
  -- Ressenti (effort perçu) de 1 à 10, facultatif.
  add column note int check (note between 1 and 10),
  add column seance_titre text,
  add column programme_nom text,
  add column cycle_nom text;
-- Le nom de l'exercice au moment de la séance : l'historique reste lisible si le catalogue change.
alter table public.series_realisees add column exercice_nom text;

drop policy "client : enregistre ses réalisations" on public.realisations;
create policy "client : enregistre ses réalisations" on public.realisations for insert
  with check (
    client_id = public.mon_client_id()
    and coach_id = public.coach_de_mon_client()
    and exists (select 1 from public.seances s where s.id = seance_id
                and (s.client_id = public.mon_client_id() or s.programme_id in (select public.mes_programmes_visibles())))
  );

-- Enregistre une séance réalisée en une fois. Idempotent : le même id renvoyé ne crée rien de plus,
-- mais le créneau du calendrier est quand même marqué réalisé.
create function public.enregistrer_realisation(r jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.mon_client_id();
  v_id uuid := (r->>'id')::uuid;
  s public.seances;
  c public.cycles;
  prog public.programmes;
  plan public.planifications;
  jour date := (now() at time zone 'Europe/Paris')::date;
  v_fin timestamptz := coalesce(nullif(r->>'fin', '')::timestamptz, now());
  doublon boolean;
  serie jsonb;
begin
  if moi is null or moi <> (r->>'clientId')::uuid then raise exception 'Séance hors de votre dossier'; end if;
  select * into s from public.seances where id = (r->>'seanceId')::uuid and supprime_le is null;
  if not found then raise exception 'Séance introuvable ou retirée par votre coach'; end if;
  if nullif(r->>'cycleId', '') is not null then
    select * into c from public.cycles where id = (r->>'cycleId')::uuid and client_id = moi;
    if not found or c.statut <> 'Actif' or c.programme_id is null then raise exception 'Ce cycle n''est pas en cours'; end if;
    if jour < c.debut or jour > c.fin then raise exception 'Cette séance est en dehors des dates du cycle actif'; end if;
    if s.programme_id is distinct from c.programme_id then raise exception 'Séance hors du cycle en cours'; end if;
    select * into prog from public.programmes where id = c.programme_id;
  elsif s.client_id is distinct from moi then
    raise exception 'Séance hors de votre dossier';
  end if;
  if nullif(r->>'planificationId', '') is not null then
    select * into plan from public.planifications where id = (r->>'planificationId')::uuid;
    if not found or plan.client_id <> moi or plan.cycle_id is distinct from c.id or plan.seance_id <> s.id or plan.statut = 'Annulée' then
      raise exception 'Créneau hors de cette séance';
    end if;
    if plan.statut = 'Réalisée' and plan.realisation_id is distinct from v_id then raise exception 'Ce créneau est déjà réalisé'; end if;
  end if;

  select exists (select 1 from public.realisations where id = v_id) into doublon;
  if doublon then
    if not exists (select 1 from public.realisations where id = v_id and client_id = moi and seance_id = s.id) then
      raise exception 'Envoi déjà utilisé pour une autre séance';
    end if;
    select realisations.fin into v_fin from public.realisations where id = v_id;
  else
    if jsonb_array_length(coalesce(r->'series', '[]')) = 0 and nullif(r->>'note', '') is null and coalesce(trim(r->>'commentaire'), '') = '' then
      raise exception 'Renseignez au moins un résultat ou un ressenti';
    end if;
    insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin, commentaire, note, cycle_id, programme_id,
      planification_id, seance_titre, programme_nom, cycle_nom)
    values (v_id, s.id, moi, s.coach_id, coalesce(nullif(r->>'debut', '')::timestamptz, v_fin), v_fin, nullif(trim(r->>'commentaire'), ''),
      nullif(r->>'note', '')::int, c.id, c.programme_id, plan.id, s.titre, prog.titre, c.nom);
    for serie in select * from jsonb_array_elements(coalesce(r->'series', '[]')) loop
      if not exists (select 1 from public.lignes l join public.blocs b on b.id = l.bloc_id
                     where l.id = (serie->>'ligneId')::uuid and b.seance_id = s.id) then
        raise exception 'Exercice hors de cette séance';
      end if;
      insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs, suggestion, exercice_nom)
      select (serie->>'id')::uuid, v_id, l.id, l.exercice_id, (serie->>'index')::int, coalesce(serie->'valeurs', '{}'),
        coalesce(serie->'suggestion', '{}'), e.nom
      from public.lignes l join public.exercices e on e.id = l.exercice_id where l.id = (serie->>'ligneId')::uuid;
    end loop;
  end if;

  -- Calendrier (markCompleted) : le créneau choisi, sinon celui prévu ce jour-là, sinon un créneau réalisé créé.
  if c.id is not null and not exists (select 1 from public.planifications where realisation_id = v_id) then
    if plan.id is null then
      select * into plan from public.planifications
      where client_id = moi and cycle_id = c.id and seance_id = s.id and statut = 'Prévue' and date = (v_fin at time zone 'Europe/Paris')::date
      order by cree_le limit 1;
    end if;
    if plan.id is not null then
      update public.planifications set statut = 'Réalisée', realisee_le = v_fin, realisation_id = v_id where id = plan.id;
    else
      insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, statut, realisee_le, realisation_id, envoi_id)
      values (moi, c.id, s.id, s.titre, (v_fin at time zone 'Europe/Paris')::date, 'Réalisée', v_fin, v_id, 'realisation-' || v_id);
    end if;
  end if;
  return case when doublon then 'doublon' else 'enregistree' end;
end $$;

-- ===== Séances : enregistrer_seance accepte une séance de modèle et la prescription complète =====
create or replace function public.enregistrer_seance(s jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (s->>'id')::uuid;
  v_blocs uuid[];
  v_lignes uuid[];
  b jsonb;
  l jsonb;
  i int := 0;
  j int;
begin
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_blocs from jsonb_array_elements(coalesce(s->'blocs', '[]')) x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_lignes
  from jsonb_array_elements(coalesce(s->'blocs', '[]')) bl, jsonb_array_elements(coalesce(bl->'lignes', '[]')) x;

  insert into public.seances (id, coach_id, client_id, programme_id, titre, date_prevue, consignes, ordre, dominante, duree_prevue_min, objectif)
  values (
    v_id, public.mon_coach_id(), nullif(s->>'clientId', '')::uuid, nullif(s->>'programmeId', '')::uuid,
    s->>'titre', nullif(s->>'datePrevue', '')::date, nullif(s->>'consignes', ''), nullif(s->>'ordre', '')::int,
    nullif(s->>'dominante', ''), nullif(s->>'dureeMin', '')::int, nullif(s->>'objectif', ''))
  on conflict (id) do update set
    titre = excluded.titre, date_prevue = excluded.date_prevue, consignes = excluded.consignes, ordre = excluded.ordre,
    programme_id = excluded.programme_id, dominante = excluded.dominante, duree_prevue_min = excluded.duree_prevue_min,
    objectif = excluded.objectif;

  -- Ce qui est enlevé est retiré, jamais effacé : une ligne déjà réalisée garde son historique.
  update public.lignes set retiree = true
  where bloc_id in (select id from public.blocs where seance_id = v_id) and not (id = any (v_lignes));
  update public.blocs set retire = true where seance_id = v_id and not (id = any (v_blocs));

  for b in select * from jsonb_array_elements(coalesce(s->'blocs', '[]')) loop
    i := i + 1;
    insert into public.blocs (id, seance_id, ordre, titre, minuteur)
    values ((b->>'id')::uuid, v_id, i, coalesce(nullif(b->>'titre', ''), 'Bloc ' || i), nullif(b->'minuteur', 'null'::jsonb))
    on conflict (id) do update set ordre = excluded.ordre, titre = excluded.titre, minuteur = excluded.minuteur, retire = false
    where blocs.seance_id = v_id;
    j := 0;
    for l in select * from jsonb_array_elements(coalesce(b->'lignes', '[]')) loop
      j := j + 1;
      insert into public.lignes (id, bloc_id, ordre, exercice_id, series, repetitions_min, repetitions_max,
        charge_indicative, duree_s, recuperation_s, rir, tempo, consignes, minuteur,
        repetitions, distance_m, charge_intensite, phase, progression, cycles)
      values ((l->>'id')::uuid, (b->>'id')::uuid, j, (l->>'exerciceId')::uuid, (l->>'series')::int,
        (l->>'repetitionsMin')::int, (l->>'repetitionsMax')::int, (l->>'chargeIndicative')::numeric,
        (l->>'dureeS')::int, (l->>'recuperationS')::int, (l->>'rir')::int, nullif(l->>'tempo', ''),
        nullif(l->>'consignes', ''), nullif(l->'minuteur', 'null'::jsonb),
        nullif(l->>'repetitions', ''), (l->>'distanceM')::numeric, nullif(l->>'chargeIntensite', ''),
        nullif(l->>'phase', ''), nullif(l->>'progression', ''), nullif(l->'cycles', 'null'::jsonb))
      on conflict (id) do update set
        bloc_id = excluded.bloc_id, ordre = excluded.ordre, exercice_id = excluded.exercice_id,
        series = excluded.series, repetitions_min = excluded.repetitions_min,
        repetitions_max = excluded.repetitions_max, charge_indicative = excluded.charge_indicative,
        duree_s = excluded.duree_s, recuperation_s = excluded.recuperation_s, rir = excluded.rir,
        tempo = excluded.tempo, consignes = excluded.consignes, minuteur = excluded.minuteur,
        repetitions = excluded.repetitions, distance_m = excluded.distance_m, charge_intensite = excluded.charge_intensite,
        phase = excluded.phase, progression = excluded.progression, cycles = excluded.cycles, retiree = false;
    end loop;
  end loop;
  return v_id;
end $$;

-- Programme complet en une transaction : en-tête puis séances (copie d'un modèle, duplication).
-- Si une séance échoue, rien n'est gardé (pas de copie à moitié faite).
create function public.enregistrer_programme(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p->>'id')::uuid;
  x jsonb;
begin
  insert into public.programmes (id, coach_id, client_id, titre, objectif, duree_semaines, seances_par_semaine, niveau,
    statut, environnement, materiel, contraintes, consignes, duree_cible_min, priorites, version, modele_origine_id,
    cycle_applique, seance_seule)
  values (v_id, public.mon_coach_id(), nullif(p->>'clientId', '')::uuid, trim(p->>'titre'), nullif(p->>'objectif', ''),
    nullif(p->>'dureeSemaines', '')::int, nullif(p->>'seancesParSemaine', '')::int, nullif(p->>'niveau', ''),
    coalesce(nullif(p->>'statut', ''), 'Brouillon'), nullif(p->>'environnement', ''), nullif(p->>'materiel', ''),
    nullif(p->>'contraintes', ''), nullif(p->>'consignes', ''), nullif(p->>'dureeCibleMin', '')::int,
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'priorites', '[]'))), '{}'), nullif(p->>'version', ''),
    nullif(p->>'modeleOrigineId', '')::uuid, nullif(p->>'cycleApplique', '')::int, coalesce((p->>'seanceSeule')::boolean, false))
  on conflict (id) do update set
    titre = excluded.titre, objectif = excluded.objectif, duree_semaines = excluded.duree_semaines,
    seances_par_semaine = excluded.seances_par_semaine, niveau = excluded.niveau, materiel = excluded.materiel,
    consignes = excluded.consignes
  where programmes.coach_id = public.mon_coach_id();
  for x in select * from jsonb_array_elements(coalesce(p->'seances', '[]')) loop
    perform public.enregistrer_seance(x || jsonb_build_object('programmeId', v_id, 'clientId', p->>'clientId'));
  end loop;
  return v_id;
end $$;

-- Corbeille (manageDeletion.ts) : on valide toute la sélection avant d'écrire. Un programme lié à un cycle
-- ou dont une séance a des résultats est protégé.
create function public.mettre_a_la_corbeille(items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb;
  v_prog uuid;
  nom text;
begin
  for it in select * from jsonb_array_elements(items) loop
    if it->>'kind' = 'programme' then
      select id, titre into v_prog, nom from public.programmes where id = (it->>'id')::uuid;
    else
      select s.programme_id, s.titre into v_prog, nom from public.seances s where s.id = (it->>'id')::uuid;
    end if;
    if nom is null then raise exception 'Élément introuvable'; end if;
    if exists (select 1 from public.cycles where programme_id = v_prog)
       or exists (select 1 from public.realisations r join public.seances s on s.id = r.seance_id where s.programme_id = v_prog)
       or exists (select 1 from public.programmes where id = v_prog and client_id is not null) then
      raise exception '% : Ce programme est lié à un dossier client ou à des résultats. Il ne peut pas être supprimé.', nom;
    end if;
  end loop;
  update public.programmes set supprime_le = now()
  where id in (select (x->>'id')::uuid from jsonb_array_elements(items) x where x->>'kind' = 'programme') and supprime_le is null;
  update public.seances set supprime_le = now()
  where id in (select (x->>'id')::uuid from jsonb_array_elements(items) x where x->>'kind' = 'seance') and supprime_le is null;
end $$;

grant select, insert, update, delete on public.suivis, public.cycles to authenticated;
grant select on public.planifications to authenticated;
revoke execute on function public.activer_cycle(uuid), public.deplacer_cycle(uuid, int), public.planifier_seance(jsonb),
  public.annuler_creneau(uuid), public.enregistrer_realisation(jsonb), public.enregistrer_programme(jsonb),
  public.mettre_a_la_corbeille(jsonb) from public, anon;
grant execute on function public.activer_cycle(uuid), public.deplacer_cycle(uuid, int), public.planifier_seance(jsonb),
  public.annuler_creneau(uuid), public.enregistrer_realisation(jsonb), public.enregistrer_programme(jsonb),
  public.mettre_a_la_corbeille(jsonb) to authenticated;
