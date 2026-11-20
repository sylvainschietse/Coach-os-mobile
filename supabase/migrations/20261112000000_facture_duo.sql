-- Séance en duo (ou à plusieurs) : le tarif de base par personne est le tarif de base divisé par le nombre de
-- personnes (60 € à deux = 30 € chacun). La remise affichée se calcule sur ce prix-là.

-- Libellé d'une séance facturée au mois : « Séance du 10/12 en duo », « Séance du 10/12 à 3 ».
create or replace function public.libelle_seance(p_titre text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(coalesce(p_titre, ''), ' · [^·]*$', ''))
    || case
         when p_titre ~ '\(à 2\)$' then ' en duo'
         when p_titre ~ '\(à [0-9]+\)$' then ' à ' || (regexp_match(p_titre, '\(à ([0-9]+)\)$'))[1]
         else ''
       end
$$;

create or replace function public.lignes_tarif_base(p_coach uuid, l jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  base numeric;
  b numeric;
  x jsonb;
  sortie jsonb := '[]'::jsonb;
  pu numeric;
  q numeric;
  lib text;
  nb integer;
begin
  select facture_tarif_base into base from public.coachs where id = p_coach;
  if base is null or base <= 0 or l is null then return l; end if;
  for x in select * from jsonb_array_elements(l) loop
    pu := (x->>'prix_unitaire')::numeric;
    q := (x->>'quantite')::numeric;
    lib := coalesce(x->>'libelle', '');
    nb := case
            when lib ~* '^séances? avec ' or lib ~ ' en duo$' then 2
            when lib ~ '^Séance du .* à [0-9]+$' then (regexp_match(lib, ' à ([0-9]+)$'))[1]::int
            else 1
          end;
    b := round(base / greatest(nb, 1), 2);
    if lib ~* '^séance' and x->'prix_base' is null and q > 0 and pu > 0 and pu < b then
      x := x || jsonb_build_object('prix_base', b, 'remise_pct', round((b - pu) / b * 100, 1));
    end if;
    sortie := sortie || jsonb_build_array(x);
  end loop;
  return sortie;
end $$;

create or replace function public.facturer_mois(p_client uuid, p_mois text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
  k public.contacts;
  co public.coachs;
  debut date;
  v_id uuid;
  v_prefixe text;
  v_num integer;
  v_lignes jsonb;
  v_total numeric;
  v_tout_paye boolean;
  v_dernier date;
  v_moyen text;
  v_mois text;
begin
  if p_mois !~ '^\d{4}-\d{2}$' then raise exception 'Mois invalide.'; end if;
  debut := (p_mois || '-01')::date;
  select * into c from public.clients where id = p_client for update;
  if not found or (auth.uid() is not null and c.coach_id is distinct from public.mon_coach_id()) then
    raise exception 'Client introuvable.';
  end if;

  create temp table if not exists _seances_a_facturer (id uuid, date date, titre text, montant numeric, statut text, moyen text) on commit drop;
  delete from _seances_a_facturer;
  insert into _seances_a_facturer
    select p.id, p.date, p.titre, p.montant, p.statut, p.moyen from public.paiements p
    where p.coach_id = c.coach_id and p.reference like 'seance:%:' || c.id
      and p.date >= debut and p.date < (debut + interval '1 month')
      and p.montant is not null and p.statut in ('Payé', 'En attente')
      and not exists (select 1 from public.factures_paiements fp where fp.paiement_id = p.id);
  if not exists (select 1 from _seances_a_facturer) then return null; end if;

  select jsonb_agg(jsonb_build_object('libelle', public.libelle_seance(s.titre), 'quantite', 1,
           'prix_unitaire', s.montant, 'montant', s.montant) order by s.date),
         sum(s.montant), bool_and(s.statut = 'Payé'), max(s.date),
         case when count(distinct coalesce(s.moyen, '')) = 1 then max(s.moyen) end
    into v_lignes, v_total, v_tout_paye, v_dernier, v_moyen
    from _seances_a_facturer s;

  select * into k from public.contacts where client_id = c.id limit 1;
  select * into co from public.coachs where id = c.coach_id;
  v_prefixe := coalesce(c.facture_prefixe,
    nullif(upper(left(coalesce(nullif(c.prenom, ''), k.prenom, ''), 1) || left(coalesce(nullif(c.nom, ''), k.nom, ''), 1)), ''), 'F');
  v_num := c.facture_prochain;
  while exists (select 1 from public.factures where coach_id = c.coach_id and numero = v_prefixe || v_num) loop
    v_num := v_num + 1;
  end loop;
  update public.clients set facture_prochain = v_num + 1 where id = c.id;
  v_mois := (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[extract(month from debut)::int]
            || ' ' || extract(year from debut)::int;

  insert into public.factures (coach_id, client_id, numero, date, objet, emetteur, destinataire, lignes, total, moyen, paye_le)
  values (
    c.coach_id, c.id, v_prefixe || v_num, current_date, 'Séances de ' || v_mois,
    jsonb_build_object('nom', coalesce(nullif(co.facture_nom, ''), co.nom), 'adresse', co.facture_adresse,
      'telephone', co.facture_telephone, 'siret', co.facture_siret, 'mentions', co.facture_mentions),
    jsonb_build_object('nom', coalesce(nullif(c.facture_nom, ''), btrim(coalesce(nullif(c.prenom, ''), k.prenom, '') || ' ' || coalesce(nullif(c.nom, ''), k.nom, ''))),
      'adresse', coalesce(nullif(c.adresse, ''), k.adresse)),
    v_lignes, v_total,
    case when v_tout_paye then v_moyen end,
    case when v_tout_paye then v_dernier end)
  returning id into v_id;
  insert into public.factures_paiements (facture_id, paiement_id) select v_id, id from _seances_a_facturer;
  return v_id;
end $$;
revoke execute on function public.facturer_mois(uuid, text) from public;
grant execute on function public.facturer_mois(uuid, text) to authenticated;

-- Factures déjà émises : refaites pour appliquer le tarif duo.
update public.factures f set lignes = public.lignes_seances(p)
  from public.factures_paiements fp
  join public.paiements p on p.id = fp.paiement_id
  where fp.facture_id = f.id
    and p.reference like 'mois:%'
    and (select count(*) from public.factures_paiements x where x.facture_id = f.id) = 1
    and public.lignes_seances(p) is not null;

update public.factures f set lignes = (
    select jsonb_agg(jsonb_build_object('libelle', public.libelle_seance(p.titre), 'quantite', 1,
      'prix_unitaire', p.montant, 'montant', p.montant) order by p.date)
    from public.factures_paiements fp join public.paiements p on p.id = fp.paiement_id
    where fp.facture_id = f.id)
  where exists (select 1 from public.factures_paiements fp join public.paiements p on p.id = fp.paiement_id
                where fp.facture_id = f.id and p.reference like 'seance:%');
