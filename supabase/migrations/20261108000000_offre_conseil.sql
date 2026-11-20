-- « Mon conseil » : l'offre que le coach met en avant (badge sur la brochure et pour ses clients).
alter table public.offres add column if not exists conseil boolean not null default false;
grant insert (conseil), update (conseil) on public.offres to authenticated;

-- Sylvain conseillait déjà l'Hybride léger sur son tract.
update public.offres set conseil = true
where coach_id = 'db277d8d-1f4c-43b1-99d2-dcc69391308e' and nom ilike 'hybride l%ger' and active
  and not exists (select 1 from public.offres where coach_id = 'db277d8d-1f4c-43b1-99d2-dcc69391308e' and conseil);
