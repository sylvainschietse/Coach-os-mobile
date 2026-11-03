-- Factures émises d'office pour toutes les lignes que l'appli prépare elle-même, pas seulement les prélèvements Stripe :
-- mois d'abonnement (y compris offerts, réglés à 0 €), packs de séances et achats d'offre, dès qu'ils passent à « Payé ».
-- Les paiements saisis à la main par le coach restent facturés d'un bouton (il peut encore corriger le montant).
-- L'objet de la facture nomme l'offre du client (« Abonnement 11/2026 · Hybride complet »).

create or replace function public.facture_automatique(p public.paiements) returns boolean
language sql immutable set search_path = public as $$
  select p.statut = 'Payé' and p.montant is not null
    and (p.moyen = 'Stripe' or p.reference like 'abonnement:%' or p.reference like 'pack:%' or p.reference like 'achat:%')
$$;

create or replace function public.facturer_prelevement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.facture_automatique(new) and not exists (select 1 from public.factures where paiement_id = new.id) then
    begin
      perform public.facturer_paiement(new.id);
    exception when others then
      raise warning 'Facture non émise pour le paiement % : %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists paiements_facturer_prelevement on public.paiements;
create trigger paiements_facturer_prelevement after insert or update of statut, montant, moyen on public.paiements
  for each row execute function public.facturer_prelevement();

-- Libellé : le titre du paiement sans le prénom, complété du nom de l'offre pour un mois d'abonnement.
drop function public.lignes_facture(public.paiements, text);
create function public.lignes_facture(p public.paiements, motif text, libelle text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  m text[] := regexp_match(coalesce(p.notes, ''), 'Prix ([0-9]+(?:\.[0-9]+)?) €, remise ([0-9]+(?:\.[0-9]+)?) €');
  prix numeric := coalesce(m[1]::numeric, p.montant, 0);
  remise numeric := coalesce(m[2]::numeric, 0);
begin
  if coalesce(libelle, '') = '' then libelle := 'Coaching'; end if;
  return jsonb_build_array(jsonb_build_object('libelle', libelle, 'quantite', 1, 'prix_unitaire', prix, 'montant', prix))
    || case when remise > 0 then jsonb_build_array(jsonb_build_object(
         'libelle', 'Remise' || case when coalesce(btrim(motif), '') <> '' then ' · ' || btrim(motif) else '' end,
         'quantite', 1, 'prix_unitaire', -remise, 'montant', -remise)) else '[]'::jsonb end;
end $$;

create or replace function public.facturer_paiement(p_paiement uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p public.paiements;
  c public.clients;
  k public.contacts;
  co public.coachs;
  v_id uuid;
  v_client uuid;
  v_prefixe text;
  v_num integer;
  v_numero text;
  v_objet text;
  v_offre text;
begin
  select * into p from public.paiements where id = p_paiement;
  if not found or (auth.uid() is not null and p.coach_id is distinct from public.mon_coach_id()) then
    raise exception 'Paiement introuvable.';
  end if;
  select id into v_id from public.factures where paiement_id = p.id;
  if found then return v_id; end if;
  if p.statut is distinct from 'Payé' or p.montant is null then
    raise exception 'Seul un paiement « Payé » avec un montant se facture.';
  end if;

  select * into k from public.contacts where id = p.contact_id;
  v_client := coalesce(k.client_id, (substring(p.reference from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))::uuid);
  -- Verrou : deux factures en même temps ne prennent pas le même numéro.
  select * into c from public.clients where id = v_client and coach_id = p.coach_id for update;
  if not found then raise exception 'Relie ce paiement à un client pour le facturer.'; end if;
  if k.id is null then select * into k from public.contacts where client_id = c.id limit 1; end if;
  select * into co from public.coachs where id = p.coach_id;

  v_objet := btrim(regexp_replace(p.titre, ' · .*$', ''));
  if p.reference like 'abonnement:%' then
    select o.nom into v_offre from public.offres o where o.id = c.offre_id;
    if v_offre is not null and position(v_offre in v_objet) = 0 then v_objet := v_objet || ' · ' || v_offre; end if;
  end if;

  v_prefixe := coalesce(c.facture_prefixe,
    nullif(upper(left(coalesce(nullif(c.prenom, ''), k.prenom, ''), 1) || left(coalesce(nullif(c.nom, ''), k.nom, ''), 1)), ''), 'F');
  v_num := c.facture_prochain;
  -- Numéro déjà pris (deux clients au même préfixe) : on passe au suivant.
  while exists (select 1 from public.factures where coach_id = p.coach_id and numero = v_prefixe || v_num) loop
    v_num := v_num + 1;
  end loop;
  v_numero := v_prefixe || v_num;
  update public.clients set facture_prochain = v_num + 1 where id = c.id;

  insert into public.factures (coach_id, client_id, paiement_id, numero, date, objet, emetteur, destinataire, lignes, total, moyen, paye_le)
  values (
    p.coach_id, c.id, p.id, v_numero, coalesce(p.date, current_date), v_objet,
    jsonb_build_object('nom', coalesce(nullif(co.facture_nom, ''), co.nom), 'adresse', co.facture_adresse,
      'telephone', co.facture_telephone, 'siret', co.facture_siret, 'mentions', co.facture_mentions),
    jsonb_build_object('nom', coalesce(nullif(c.facture_nom, ''), btrim(coalesce(nullif(c.prenom, ''), k.prenom, '') || ' ' || coalesce(nullif(c.nom, ''), k.nom, ''))),
      'adresse', coalesce(nullif(c.adresse, ''), k.adresse)),
    public.lignes_facture(p, c.remise_motif, v_objet),
    p.montant, p.moyen, coalesce(p.date, current_date))
  returning id into v_id;
  return v_id;
end $$;

-- Lignes déjà réglées avant cette règle : facturées maintenant, une fois.
do $$
declare r record;
begin
  for r in select p.id from public.paiements p
           where public.facture_automatique(p) and not exists (select 1 from public.factures f where f.paiement_id = p.id)
           order by p.date, p.cree_le
  loop
    begin
      perform public.facturer_paiement(r.id);
    exception when others then
      raise warning 'Facture non émise pour le paiement % : %', r.id, sqlerrm;
    end;
  end loop;
end $$;
