-- Remise affichée sur le prix de la séance : chaque ligne de séances moins chère que le tarif de base montre
-- le tarif de base, le pourcentage de remise et le prix remisé (ex. 60 €, −16,7 %, 50 €), au lieu d'une ligne
-- « Remise tarif préférentiel » à part. Le pack suit la même règle : séances payées au prix remisé,
-- séance offerte à −100 %.

-- Pack : séances payées au prix du pack divisé par leur nombre, puis les séances offertes à 0 €.
create or replace function public.lignes_seances(p public.paiements) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  n text := btrim(coalesce(p.notes, ''));
  m text[];
  seg text;
  lignes jsonb := '[]'::jsonb;
  total numeric := 0;
  qte integer;
  pk public.packs_seances;
  tarif numeric;
  offertes integer;
  payees integer;
begin
  if p.montant is null then return null; end if;
  if p.reference like 'pack:%' then
    select * into pk from public.packs_seances where id::text = substr(p.reference, 6);
    if not found then return null; end if;
    select facture_tarif_base into tarif from public.coachs where id = pk.coach_id;
    offertes := coalesce((regexp_match(coalesce(p.titre, ''), '\+\s*([0-9]+)\s+offerte'))[1]::int, 0);
    payees := pk.seances_total - offertes;
    if payees <= 0 then return null; end if;
    lignes := jsonb_build_array(jsonb_build_object('libelle', 'Séances de coaching', 'quantite', payees,
      'prix_unitaire', round(p.montant / payees, 2), 'montant', p.montant));
    if offertes > 0 and tarif > 0 then
      lignes := lignes || jsonb_build_array(jsonb_build_object('libelle',
        case when offertes = 1 then 'Séance offerte' else offertes || ' séances offertes' end,
        'quantite', offertes, 'prix_unitaire', 0, 'montant', 0, 'prix_base', tarif, 'remise_pct', 100));
    end if;
    return lignes;
  end if;
  if n = '' then return null; end if;
  -- « 06/10, 08/10 · 50 € la séance »
  m := regexp_match(n, '^([0-9/, ]+) · ([0-9]+(?:[.,][0-9]+)?) € la séance$');
  if m is not null then
    qte := array_length(regexp_split_to_array(btrim(m[1]), '\s*,\s*'), 1);
    lignes := jsonb_build_array(jsonb_build_object('libelle', 'Séances du ' || btrim(m[1]), 'quantite', qte,
      'prix_unitaire', replace(m[2], ',', '.')::numeric, 'montant', qte * replace(m[2], ',', '.')::numeric));
    total := qte * replace(m[2], ',', '.')::numeric;
  else
    -- « Seul (40 €) : 02/10, 09/10 · Avec Romain (20 €) : 06/10 »
    foreach seg in array regexp_split_to_array(n, '\s+·\s+') loop
      m := regexp_match(btrim(seg), '^(.+?) \(([0-9]+(?:[.,][0-9]+)?) €\) : ([0-9/, ]+)$');
      if m is null then return null; end if;
      qte := array_length(regexp_split_to_array(btrim(m[3]), '\s*,\s*'), 1);
      lignes := lignes || jsonb_build_array(jsonb_build_object('libelle', 'Séances ' || lower(left(m[1], 1)) || substr(m[1], 2) || ' : ' || btrim(m[3]),
        'quantite', qte, 'prix_unitaire', replace(m[2], ',', '.')::numeric, 'montant', qte * replace(m[2], ',', '.')::numeric));
      total := total + qte * replace(m[2], ',', '.')::numeric;
    end loop;
  end if;
  if total <> p.montant then return null; end if;
  return lignes;
end $$;

-- Séance moins chère que le tarif de base : la ligne garde son prix (le prix remisé) et porte le tarif de base
-- et le pourcentage de remise. Sans effet sur une ligne déjà annotée.
create or replace function public.lignes_tarif_base(p_coach uuid, l jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  base numeric;
  x jsonb;
  sortie jsonb := '[]'::jsonb;
  pu numeric;
  q numeric;
begin
  select facture_tarif_base into base from public.coachs where id = p_coach;
  if base is null or base <= 0 or l is null then return l; end if;
  for x in select * from jsonb_array_elements(l) loop
    pu := (x->>'prix_unitaire')::numeric;
    q := (x->>'quantite')::numeric;
    if x->>'libelle' ~* '^séance' and x->'prix_base' is null and q > 0 and pu > 0 and pu < base then
      x := x || jsonb_build_object('prix_base', base, 'remise_pct', round((base - pu) / base * 100, 1));
    end if;
    sortie := sortie || jsonb_build_array(x);
  end loop;
  return sortie;
end $$;

-- Factures de séances et de packs déjà émises : refaites d'après leur ligne de paiement, avec la nouvelle présentation.
update public.factures f set lignes = public.lignes_seances(p)
  from public.factures_paiements fp
  join public.paiements p on p.id = fp.paiement_id
  where fp.facture_id = f.id
    and (p.reference like 'mois:%' or p.reference like 'pack:%')
    and (select count(*) from public.factures_paiements x where x.facture_id = f.id) = 1
    and public.lignes_seances(p) is not null;

-- Factures du mois (séances une par une) : la ligne « Remise tarif préférentiel » disparaît, chaque séance reprend son prix.
update public.factures f set lignes = (
    select jsonb_agg(jsonb_build_object('libelle', btrim(regexp_replace(p.titre, ' · [^·]*$', '')), 'quantite', 1,
      'prix_unitaire', p.montant, 'montant', p.montant) order by p.date)
    from public.factures_paiements fp join public.paiements p on p.id = fp.paiement_id
    where fp.facture_id = f.id)
  where f.lignes::text like '%Remise tarif préférentiel%'
    and exists (select 1 from public.factures_paiements fp join public.paiements p on p.id = fp.paiement_id
                where fp.facture_id = f.id and p.reference like 'seance:%');
