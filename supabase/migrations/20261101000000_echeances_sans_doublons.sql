-- Mensualités préparées à l'ouverture de la Gestion (référence « abonnement:AAAA-MM:client ») :
-- · une seule ligne par client et par mois, même si l'écran se charge deux fois en même temps ;
-- · une ligne que le coach supprime ne revient plus au chargement suivant.

-- Doublons déjà créés : on garde la plus ancienne.
delete from public.paiements p
using public.paiements q
where p.reference like 'abonnement:%'
  and q.coach_id = p.coach_id
  and q.reference = p.reference
  and (q.cree_le, q.id) < (p.cree_le, p.id);

create unique index paiements_une_echeance on public.paiements (coach_id, reference) where reference like 'abonnement:%';

-- Mensualités écartées par le coach : la préparation du mois les saute.
create table public.echeances_ecartees (
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  reference text not null check (reference like 'abonnement:%'),
  ecartee_le timestamptz not null default now(),
  primary key (coach_id, reference)
);
alter table public.echeances_ecartees enable row level security;
create policy "coach : ses échéances écartées" on public.echeances_ecartees for select using (coach_id = public.mon_coach_id());
grant select on public.echeances_ecartees to authenticated;

create function public.ecarter_echeance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Rien à retenir quand c'est le coach lui-même qui est supprimé.
  insert into public.echeances_ecartees (coach_id, reference)
  select old.coach_id, old.reference where exists (select 1 from public.coachs where id = old.coach_id)
  on conflict do nothing;
  return old;
end
$$;
revoke execute on function public.ecarter_echeance() from public, anon, authenticated;

create trigger paiements_ecarter_echeance after delete on public.paiements
  for each row when (old.reference like 'abonnement:%') execute function public.ecarter_echeance();
