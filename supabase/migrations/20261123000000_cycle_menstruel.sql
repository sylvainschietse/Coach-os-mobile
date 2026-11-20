-- Coach OS · assistant de cycle menstruel de la cliente : réglages, règles notées, notes du jour (symptômes).
-- Données de santé sensibles. Le suivi est éteint tant que la cliente ne l'a pas activé, et la coach ne voit que ce
-- que la cliente partage, rien par défaut. Le choix (activé, partage) est gardé dans la table des consentements :
-- chaque changement est une nouvelle ligne datée, qui prouve ce que la cliente a accepté et quand.
-- L'énergie du jour reste dans les suivis du quotidien (indicateur « energie »), déjà partagés avec la coach.
-- Uniquement des ajouts : deux colonnes, trois tables, leurs règles d'accès et quatre fonctions. Deux reprises :
-- la coach ne lit plus les colonnes du cycle dans les consentements, et enregistrer_consentement est reprise pour garder le choix du cycle quand la cliente revoit ses autres accords.

alter table public.consentements
  add column suivi_cycle boolean not null default false,
  add column partage_cycle text not null default 'rien' check (partage_cycle in ('rien', 'phase', 'tout'));

-- La coach lit les accords de ses clients, mais pas ces deux colonnes : avec « rien », elle ne sait même pas que la
-- cliente suit son cycle. La cliente lit son choix par mon_consentement.
revoke select on public.consentements from authenticated;
grant select (id, client_id, coach_id, user_id, version, donnees_sante, analyse_ia, accepte_le) on public.consentements to authenticated;

-- Partage du cycle d'une cliente, d'après son dernier choix. « rien » si le suivi est éteint ou jamais activé.
create function public.partage_cycle_de(p_client uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when suivi_cycle then partage_cycle else 'rien' end
       from consentements
      where client_id = p_client and (p_client = mon_client_id() or est_mon_client(p_client))
      order by accepte_le desc, id desc limit 1),
    'rien')
$$;

-- La cliente connectée active, coupe ou change le partage de son suivi. Ses autres accords sont recopiés tels quels.
create function public.enregistrer_choix_cycle(p_actif boolean, p_partage text) returns public.consentements
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := mon_client_id();
  d consentements;
  c consentements;
begin
  if v_client is null then raise exception 'Réservé aux clients connectés'; end if;
  if p_partage not in ('rien', 'phase', 'tout') then raise exception 'Partage inconnu'; end if;
  select * into d from consentements where client_id = v_client order by accepte_le desc, id desc limit 1;
  if d.id is null then raise exception 'Accepte d’abord la politique de confidentialité'; end if;
  insert into consentements (client_id, coach_id, user_id, version, donnees_sante, analyse_ia, suivi_cycle, partage_cycle)
  values (v_client, d.coach_id, auth.uid(), d.version, d.donnees_sante, d.analyse_ia, coalesce(p_actif, false),
          case when coalesce(p_actif, false) then p_partage else 'rien' end)
  returning * into c;
  return c;
end $$;

-- Reprise : revoir ses accords (analyse des photos, nouvelle politique) ne coupe plus le suivi du cycle.
create or replace function public.enregistrer_consentement(p_version text, p_analyse_ia boolean) returns public.consentements
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := mon_client_id();
  d consentements;
  c consentements;
begin
  if v_client is null then raise exception 'Réservé aux clients connectés'; end if;
  select * into d from consentements where client_id = v_client order by accepte_le desc, id desc limit 1;
  insert into consentements (client_id, coach_id, user_id, version, donnees_sante, analyse_ia, suivi_cycle, partage_cycle)
  select v_client, coach_id, auth.uid(), p_version, true, coalesce(p_analyse_ia, false),
         coalesce(d.suivi_cycle, false), coalesce(d.partage_cycle, 'rien')
  from clients where id = v_client
  returning * into c;
  return c;
end $$;

create table public.cycle_reglages (
  client_id uuid primary key references public.clients (id) on delete cascade,
  duree_cycle int not null default 28 check (duree_cycle between 15 and 60),
  duree_regles int not null default 5 check (duree_regles between 2 and 10),
  -- Contraception hormonale, pas de règles : énergie et symptômes seulement, sans prévision.
  sans_prevision boolean not null default false,
  modifie_le timestamptz not null default now()
);

create table public.cycle_regles (
  client_id uuid not null references public.clients (id) on delete cascade,
  debut date not null check (debut >= '2000-01-01'),
  fin date,
  primary key (client_id, debut),
  check (fin is null or (fin >= debut and fin <= debut + 15))
);

create table public.cycle_notes (
  client_id uuid not null references public.clients (id) on delete cascade,
  jour date not null,
  symptomes text[] not null default '{}' check (cardinality(symptomes) <= 12),
  note text check (length(note) <= 500),
  primary key (client_id, jour)
);

alter table public.cycle_reglages enable row level security;
alter table public.cycle_regles enable row level security;
alter table public.cycle_notes enable row level security;

-- La cliente : tout sur ses propres lignes (noter, corriger, tout effacer).
create policy "cliente : ses réglages de cycle" on public.cycle_reglages for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id());
create policy "cliente : ses règles" on public.cycle_regles for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id() and debut <= current_date + 1);
create policy "cliente : ses notes de cycle" on public.cycle_notes for all
  using (client_id = public.mon_client_id()) with check (client_id = public.mon_client_id() and jour <= current_date + 1);

-- La coach : lecture seule, et seulement si la cliente partage. « phase » passe par cycle_vue_coach (dernier début seul).
create policy "coach : réglages de cycle partagés" on public.cycle_reglages for select
  using (public.est_mon_client(client_id) and public.partage_cycle_de(client_id) in ('phase', 'tout'));
create policy "coach : règles partagées" on public.cycle_regles for select
  using (public.est_mon_client(client_id) and public.partage_cycle_de(client_id) = 'tout');
create policy "coach : notes de cycle partagées" on public.cycle_notes for select
  using (public.est_mon_client(client_id) and public.partage_cycle_de(client_id) = 'tout');

revoke all on public.cycle_reglages, public.cycle_regles, public.cycle_notes from anon, authenticated;
grant select, insert, update, delete on public.cycle_reglages, public.cycle_regles, public.cycle_notes to authenticated;

-- Ce que la coach voit d'une cliente : son partage, et pour « phase » le seul dernier début de règles.
create function public.cycle_vue_coach(p_client uuid) returns table (partage text, dernier_debut date, dernier_fin date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_partage text;
begin
  if not est_mon_client(p_client) then return; end if;
  v_partage := partage_cycle_de(p_client);
  if v_partage = 'rien' then return; end if;
  return query
    select v_partage, r.debut, r.fin from (select 1) x
    left join lateral (select debut, fin from cycle_regles where client_id = p_client order by debut desc limit 1) r on true;
end $$;

-- La cliente efface tout son suivi d'un geste et coupe le partage.
create function public.effacer_mon_cycle() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := mon_client_id();
begin
  if v_client is null then raise exception 'Réservé aux clients connectés'; end if;
  delete from cycle_notes where client_id = v_client;
  delete from cycle_regles where client_id = v_client;
  delete from cycle_reglages where client_id = v_client;
  perform enregistrer_choix_cycle(false, 'rien');
end $$;

revoke execute on function public.partage_cycle_de(uuid), public.enregistrer_choix_cycle(boolean, text),
  public.cycle_vue_coach(uuid), public.effacer_mon_cycle() from public, anon;
grant execute on function public.partage_cycle_de(uuid), public.enregistrer_choix_cycle(boolean, text),
  public.cycle_vue_coach(uuid), public.effacer_mon_cycle() to authenticated;
