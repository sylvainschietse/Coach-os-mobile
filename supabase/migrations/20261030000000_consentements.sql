-- Coach OS · RGPD : consentement du client à ses données de santé et à l'analyse de ses photos de repas par une IA.
-- Chaque accord (ou changement d'avis) est une nouvelle ligne datée, jamais modifiée ni effacée par l'app : l'historique
-- prouve ce que le client a accepté, quand, et pour quelle version de la politique de confidentialité.
-- Uniquement des ajouts : une table, ses règles d'accès et deux fonctions.

create table public.consentements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  coach_id uuid not null references public.coachs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- Version de la politique de confidentialité affichée au moment de l'accord (domain/consentement.ts).
  version text not null check (length(version) between 1 and 40),
  -- Mesures, photos de progression, nutrition, bilans, séances et activités lues dans Health Connect.
  donnees_sante boolean not null,
  -- Photo de repas envoyée à un service d'IA (Claude, Anthropic) pour estimer les aliments. Facultatif.
  analyse_ia boolean not null,
  accepte_le timestamptz not null default clock_timestamp()
);
create index on public.consentements (client_id, accepte_le desc);

alter table public.consentements enable row level security;

create policy "client : ses consentements" on public.consentements for select
  using (client_id = public.mon_client_id());
create policy "coach : consentements de ses clients" on public.consentements for select
  using (coach_id = public.mon_coach_id());

-- Lecture seule pour tous : l'écriture passe par enregistrer_consentement.
revoke all on public.consentements from public, anon, authenticated;
grant select on public.consentements to authenticated;

-- Le dernier choix du client connecté (null s'il n'a encore rien accepté).
create function public.mon_consentement() returns public.consentements
language sql stable security definer set search_path = public as $$
  select * from consentements where client_id = mon_client_id() order by accepte_le desc, id desc limit 1
$$;

-- Le client connecté enregistre son choix. Sans accord sur les données de santé, rien n'est enregistré :
-- l'app ne peut pas fonctionner sans elles, le client se déconnecte.
create function public.enregistrer_consentement(p_version text, p_analyse_ia boolean) returns public.consentements
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := mon_client_id();
  c consentements;
begin
  if v_client is null then raise exception 'Réservé aux clients connectés'; end if;
  insert into consentements (client_id, coach_id, user_id, version, donnees_sante, analyse_ia)
  select v_client, coach_id, auth.uid(), p_version, true, coalesce(p_analyse_ia, false) from clients where id = v_client
  returning * into c;
  return c;
end $$;

revoke execute on function public.mon_consentement(), public.enregistrer_consentement(text, boolean) from public, anon;
grant execute on function public.mon_consentement(), public.enregistrer_consentement(text, boolean) to authenticated;
