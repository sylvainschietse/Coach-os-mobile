-- Lot 6 · Coachings, Tâches, Paiements et Bilans du CRM d'origine (Champs-CRM.json, reports.ts).
-- Ajouts seulement : nouvelles tables, colonnes facultatives sur relances et documents. Rien n'est supprimé.
-- Mêmes règles que src/domain/gestion.ts ; le coach ne voit et n'écrit que ses propres lignes.

create table public.coachings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  booster_id uuid references public.boosters (id) on delete set null,
  nom text not null check (length(trim(nom)) > 0),
  date_debut date,
  date_fin_prevue date check (date_fin_prevue is null or date_debut is null or date_fin_prevue >= date_debut),
  statut text check (statut in ('À démarrer', 'Actif', 'En pause', 'Terminé', 'Abandonné')),
  -- L'offre choisie n'est pas un paiement.
  formule text check (formule in ('Essentiel', 'Premium')),
  objectif text,
  commentaires text,
  cree_le timestamptz not null default now()
);
create index on public.coachings (coach_id, contact_id);
-- Un coaching par Booster d'origine (createCoachingFromBooster sans doublon).
create unique index coachings_booster on public.coachings (booster_id) where booster_id is not null;

create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  contact_id uuid references public.contacts (id) on delete set null,
  coaching_id uuid references public.coachings (id) on delete set null,
  date date,
  -- null = non renseigné, jamais 0 par défaut.
  montant numeric(12, 2) check (montant is null or (montant >= 0 and montant <= 1000000)),
  devise text not null default 'EUR' check (devise = 'EUR'),
  -- « Stripe » est un moyen déclaré : aucun encaissement n'est fait par l'app.
  moyen text check (moyen in ('Stripe', 'Carte bancaire', 'Espèces', 'Virement', 'Chèque')),
  statut text check (statut in ('En attente', 'Payé', 'Remboursé', 'Annulé')),
  reference text,
  notes text,
  cree_le timestamptz not null default now()
);
create index on public.paiements (coach_id, date desc);

create table public.bilans_coach (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  coaching_id uuid references public.coachings (id) on delete set null,
  date date not null,
  poids numeric(5, 1) check (poids is null or poids between 0 and 500),
  taille numeric(5, 1) check (taille is null or taille between 0 and 500),
  tour_taille numeric(5, 1) check (tour_taille is null or tour_taille between 0 and 500),
  tour_hanches numeric(5, 1) check (tour_hanches is null or tour_hanches between 0 and 500),
  -- { "Force": 7, "Sommeil": null, … } : null = Non évalué, distinct d'une note.
  piliers jsonb not null default '{}' check (jsonb_typeof(piliers) = 'object'),
  synthese text not null default '',
  priorites text[] not null default '{}' check (cardinality(priorites) <= 3),
  -- PDF du bilan dans Documents (type Bilan).
  document_id uuid references public.documents (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index on public.bilans_coach (coach_id, contact_id, date desc);

-- Notes de 1 à 10 seulement, et uniquement les dix piliers de reports.ts.
create function public.piliers_valides(p jsonb) returns boolean
language sql immutable as $$
  select coalesce(bool_and(
    k in ('Activité physique', 'Force', 'Endurance', 'Mobilité', 'Posture', 'Sommeil', 'Stress', 'Alimentation', 'Récupération', 'Régularité')
    and (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)))
  ), true)
  from jsonb_each(p) as e(k, v)
$$;
alter table public.bilans_coach add constraint bilans_coach_piliers check (public.piliers_valides(piliers));

-- Une relance est une tâche : champs de la table Tâches d'origine.
alter table public.relances
  add column if not exists titre text,
  add column if not exists booster_id uuid references public.boosters (id) on delete set null,
  add column if not exists coaching_id uuid references public.coachings (id) on delete set null,
  add column if not exists responsable text,
  add column if not exists priorite text check (priorite in ('Haute', 'Moyenne', 'Basse')),
  add column if not exists statut_tache text check (statut_tache in ('À faire', 'En cours', 'Terminée', 'Annulée'));

-- Lien Coaching d'un document (C07).
alter table public.documents add column if not exists coaching_id uuid references public.coachings (id) on delete set null;

-- Les liens restent dans le dossier du coach : un coach ne peut pas rattacher la ligne d'un autre.
create function public.liens_du_coach(p_contact uuid, p_booster uuid, p_coaching uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_contact is null or exists (select 1 from contacts where id = p_contact and coach_id = mon_coach_id()))
     and (p_booster is null or exists (select 1 from boosters where id = p_booster and coach_id = mon_coach_id()))
     and (p_coaching is null or exists (select 1 from coachings where id = p_coaching and coach_id = mon_coach_id()))
$$;
revoke execute on function public.liens_du_coach(uuid, uuid, uuid) from public, anon;
grant execute on function public.liens_du_coach(uuid, uuid, uuid) to authenticated;

alter table public.coachings enable row level security;
alter table public.paiements enable row level security;
alter table public.bilans_coach enable row level security;

create policy "coach : ses coachings" on public.coachings for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, booster_id, null));
create policy "coach : ses paiements" on public.paiements for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, null, coaching_id));
create policy "coach : ses bilans" on public.bilans_coach for all
  using (coach_id = public.mon_coach_id())
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, null, coaching_id)
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.coach_id = public.mon_coach_id())));

revoke all on public.coachings, public.paiements, public.bilans_coach from anon, authenticated;
grant select, insert, update, delete on public.coachings, public.paiements, public.bilans_coach to authenticated;

-- Nouvelles colonnes de lien sur des tables existantes : contrôle ajouté sans toucher aux règles en place.
create policy "coach : liens des tâches" on public.relances as restrictive for insert
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
create policy "coach : liens des tâches (modification)" on public.relances as restrictive for update
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
create policy "coach : coaching d'un document" on public.documents as restrictive for insert
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
create policy "coach : coaching d'un document (modification)" on public.documents as restrictive for update
  with check (public.liens_du_coach(contact_id, booster_id, coaching_id));
