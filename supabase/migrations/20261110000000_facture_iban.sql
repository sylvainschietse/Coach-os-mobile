-- IBAN (et BIC) du coach, imprimés sur chacune de ses factures pour un règlement par virement.
-- Tarif de base d'une séance : toutes les séances y sont facturées, et un prix plus bas apparaît en remise.
alter table public.coachs
  add column facture_tarif_base numeric(8, 2) not null default 60 check (facture_tarif_base between 0 and 10000),
  add column facture_iban text check (facture_iban is null or facture_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  add column facture_bic text check (facture_bic is null or facture_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$');

grant update (facture_tarif_base, facture_iban, facture_bic) on public.coachs to authenticated;

-- Détail des lignes d'une facture : séances du mois (d'après les notes) et, désormais, packs de séances
-- (11 × 60 € au tarif habituel, séance offerte, remise pack = prix payé).
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
  normal numeric;
begin
  if p.montant is null then return null; end if;
  -- Pack de séances : prix habituel du client × séances, séances offertes, remise, puis le prix du pack.
  if p.reference like 'pack:%' then
    select * into pk from public.packs_seances where id::text = substr(p.reference, 6);
    if not found then return null; end if;
    select facture_tarif_base into tarif from public.coachs where id = pk.coach_id;
    offertes := coalesce((regexp_match(coalesce(p.titre, ''), '\+\s*([0-9]+)\s+offerte'))[1]::int, 0);
    if tarif is null or tarif <= 0 or pk.seances_total <= offertes then return null; end if;
    normal := pk.seances_total * tarif;
    if normal <= p.montant then return null; end if;
    lignes := jsonb_build_array(jsonb_build_object('libelle', 'Séances de coaching au tarif de base', 'quantite', pk.seances_total,
      'prix_unitaire', tarif, 'montant', normal));
    if offertes > 0 then
      lignes := lignes || jsonb_build_array(jsonb_build_object('libelle',
        case when offertes = 1 then 'Séance offerte' else offertes || ' séances offertes' end,
        'quantite', offertes, 'prix_unitaire', -tarif, 'montant', -offertes * tarif));
    end if;
    if normal - offertes * tarif > p.montant then
      lignes := lignes || jsonb_build_array(jsonb_build_object('libelle', 'Remise pack', 'quantite', 1,
        'prix_unitaire', p.montant - (normal - offertes * tarif), 'montant', p.montant - (normal - offertes * tarif)));
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

-- Séances au tarif de base : une séance facturée moins cher que le tarif de base du coach est remise au tarif de base,
-- et l'écart apparaît sur une ligne « Remise tarif préférentiel ». Sans effet si la facture est déjà au tarif de base.
create function public.lignes_tarif_base(p_coach uuid, l jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  base numeric;
  x jsonb;
  sortie jsonb := '[]'::jsonb;
  remise numeric := 0;
  pu numeric;
  q numeric;
begin
  select facture_tarif_base into base from public.coachs where id = p_coach;
  if base is null or base <= 0 or l is null then return l; end if;
  for x in select * from jsonb_array_elements(l) loop
    pu := (x->>'prix_unitaire')::numeric;
    q := (x->>'quantite')::numeric;
    if x->>'libelle' ~* '^séance' and q > 0 and pu > 0 and pu < base then
      remise := remise + (base - pu) * q;
      x := x || jsonb_build_object('prix_unitaire', base, 'montant', base * q);
    end if;
    sortie := sortie || jsonb_build_array(x);
  end loop;
  if remise > 0 then
    sortie := sortie || jsonb_build_array(jsonb_build_object('libelle', 'Remise tarif préférentiel', 'quantite', 1,
      'prix_unitaire', -remise, 'montant', -remise));
  end if;
  return sortie;
end $$;

create function public.factures_tarif_base() returns trigger
language plpgsql set search_path = public as $$
begin
  new.lignes := public.lignes_tarif_base(new.coach_id, new.lignes);
  return new;
end $$;
create trigger factures_tarif_base before insert or update of lignes on public.factures
  for each row execute function public.factures_tarif_base();

-- Factures de séances déjà émises : remises au tarif de base, avec la remise en ligne séparée.
update public.factures set lignes = lignes where lignes::text ~* '"libelle": "séance';

-- Factures de packs encore à régler : détaillées à leur tour.
update public.factures f set lignes = public.lignes_seances(p)
  from public.paiements p
  where p.id = f.paiement_id and p.reference like 'pack:%' and f.paye_le is null
    and public.lignes_seances(p) is not null and jsonb_array_length(f.lignes) = 1;
