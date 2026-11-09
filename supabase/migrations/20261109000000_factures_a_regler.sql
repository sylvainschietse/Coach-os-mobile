-- Facture « à régler » : le coach peut facturer une ligne « En attente » pour l'envoyer comme demande de paiement.
-- · La facture porte « À régler » tant que la ligne n'est pas payée ; quand elle passe à « Payé », la date et le moyen
--   de règlement y sont notés (le reste de la facture ne change pas).
-- · Les séances du mois notées « 06/10, 08/10 · 50 € la séance » (ou « Seul (40 €) : … · Avec Romain (20 €) : … »)
--   deviennent des lignes détaillées : quantité × prix de la séance.

-- Les séances du mois (référence « mois:AAAA-MM:<client> ») reçoivent leur facture d'office, même « En attente » :
-- le coach la retrouve dans la fiche du client et dans Paiements, prête à envoyer.
create or replace function public.facture_automatique(p public.paiements) returns boolean
language sql immutable set search_path = public as $$
  select p.montant is not null and (
    (p.statut = 'Payé' and (p.moyen = 'Stripe' or p.reference like 'abonnement:%' or p.reference like 'pack:%' or p.reference like 'achat:%'))
    or (p.statut in ('Payé', 'En attente') and p.reference like 'mois:%'))
$$;

-- Lignes détaillées des séances, ou null si les notes ne suivent pas ce format (ou ne retombent pas sur le montant).
create function public.lignes_seances(p public.paiements) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  n text := btrim(coalesce(p.notes, ''));
  m text[];
  seg text;
  lignes jsonb := '[]'::jsonb;
  total numeric := 0;
  qte integer;
begin
  if n = '' or p.montant is null then return null; end if;
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
  v_paye boolean;
begin
  select * into p from public.paiements where id = p_paiement;
  if not found or (auth.uid() is not null and p.coach_id is distinct from public.mon_coach_id()) then
    raise exception 'Paiement introuvable.';
  end if;
  select id into v_id from public.factures where paiement_id = p.id;
  if found then return v_id; end if;
  if p.statut not in ('Payé', 'En attente') or p.montant is null then
    raise exception 'Seul un paiement « Payé » ou « En attente », avec un montant, se facture.';
  end if;
  v_paye := p.statut = 'Payé';

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
    p.coach_id, c.id, p.id, v_numero,
    -- Facture à régler : datée du jour où elle est émise.
    case when v_paye then coalesce(p.date, current_date) else current_date end,
    v_objet,
    jsonb_build_object('nom', coalesce(nullif(co.facture_nom, ''), co.nom), 'adresse', co.facture_adresse,
      'telephone', co.facture_telephone, 'siret', co.facture_siret, 'mentions', co.facture_mentions),
    jsonb_build_object('nom', coalesce(nullif(c.facture_nom, ''), btrim(coalesce(nullif(c.prenom, ''), k.prenom, '') || ' ' || coalesce(nullif(c.nom, ''), k.nom, ''))),
      'adresse', coalesce(nullif(c.adresse, ''), k.adresse)),
    coalesce(public.lignes_seances(p), public.lignes_facture(p, c.remise_motif, v_objet)),
    p.montant,
    case when v_paye then p.moyen end,
    case when v_paye then coalesce(p.date, current_date) end)
  returning id into v_id;
  return v_id;
end $$;

-- Ligne payée : facture d'office si besoin, et une facture « à régler » déjà émise reçoit sa date et son moyen de règlement.
-- Tant qu'elle n'est pas réglée, une facture suit les corrections de sa ligne (montant, détail), sous le même numéro.
create or replace function public.facturer_prelevement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
begin
  if tg_op = 'UPDATE' and new.montant is not null
     and (new.montant, new.notes, new.titre) is distinct from (old.montant, old.notes, old.titre) then
    select cl.* into c from public.factures f join public.clients cl on cl.id = f.client_id
      where f.paiement_id = new.id and f.paye_le is null;
    if found then
      update public.factures set
        total = new.montant,
        objet = btrim(regexp_replace(new.titre, ' · .*$', '')),
        lignes = coalesce(public.lignes_seances(new), public.lignes_facture(new, c.remise_motif, btrim(regexp_replace(new.titre, ' · .*$', ''))))
        where paiement_id = new.id and paye_le is null;
    end if;
  end if;
  if new.statut = 'Payé' then
    update public.factures set paye_le = coalesce(new.date, current_date), moyen = new.moyen
      where paiement_id = new.id and paye_le is null;
  end if;
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
create trigger paiements_facturer_prelevement after insert or update of statut, montant, moyen, date, notes, titre on public.paiements
  for each row execute function public.facturer_prelevement();

-- Factures de séances du mois déjà émises sur une seule ligne (quantité 1) : détaillées séance par séance.
update public.factures f set lignes = public.lignes_seances(p)
  from public.paiements p
  where p.id = f.paiement_id and p.reference like 'mois:%' and public.lignes_seances(p) is not null
    and jsonb_array_length(f.lignes) = 1 and (f.lignes->0->>'quantite')::numeric = 1;

-- Séances du mois déjà notées : facturées maintenant, une fois.
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

-- ---------- Facture du mois : les séances une par une (référence « seance:<rdv>:<client> ») regroupées ----------
-- Une facture peut couvrir plusieurs lignes de paiement : chaque ligne n'appartient qu'à une facture.
create table public.factures_paiements (
  facture_id uuid not null references public.factures (id) on delete cascade,
  paiement_id uuid primary key references public.paiements (id) on delete cascade
);
create index factures_paiements_facture on public.factures_paiements (facture_id);
alter table public.factures_paiements enable row level security;
create policy "coach : ses factures" on public.factures_paiements for select
  using (exists (select 1 from public.factures f where f.id = facture_id and f.coach_id = public.mon_coach_id()));
grant select on public.factures_paiements to authenticated;

-- Factures déjà liées à une seule ligne : reprises dans la table.
insert into public.factures_paiements (facture_id, paiement_id)
  select id, paiement_id from public.factures where paiement_id is not null
  on conflict do nothing;

-- Toute facture émise d'une ligne y est aussi notée.
create function public.noter_facture_paiement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paiement_id is not null then
    insert into public.factures_paiements (facture_id, paiement_id) values (new.id, new.paiement_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger factures_noter_paiement after insert on public.factures
  for each row execute function public.noter_facture_paiement();

-- Facture d'un mois (AAAA-MM) pour un client : toutes ses séances du mois pas encore facturées, une ligne chacune.
-- Rien à facturer : renvoie null.
create function public.facturer_mois(p_client uuid, p_mois text) returns uuid
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

  select jsonb_agg(jsonb_build_object('libelle', btrim(regexp_replace(s.titre, ' · [^·]*$', '')), 'quantite', 1,
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

-- Le 1er de chaque mois : la facture du mois écoulé pour chaque client qui a des séances à facturer.
create function public._facturer_mois_ecoule() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  m text := to_char((now() at time zone 'Europe/Paris')::date - interval '1 month', 'YYYY-MM');
begin
  for r in select distinct cl.id from public.paiements p
           join public.clients cl on cl.id::text = split_part(p.reference, ':', 3)
           where p.reference like 'seance:%' and to_char(p.date, 'YYYY-MM') = m
  loop
    begin
      perform public.facturer_mois(r.id, m);
    exception when others then
      raise warning 'Facture du mois non émise pour le client % : %', r.id, sqlerrm;
    end;
  end loop;
end $$;
revoke execute on function public._facturer_mois_ecoule() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('factures-du-mois', '0 6 1 * *', 'select public._facturer_mois_ecoule()');
  end if;
end $$;

-- Une séance réglée : la facture du mois est notée payée quand toutes ses séances le sont.
create function public.regler_facture_du_mois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f uuid;
begin
  if new.statut = 'Payé' then
    select fp.facture_id into f from public.factures_paiements fp join public.factures fa on fa.id = fp.facture_id
      where fp.paiement_id = new.id and fa.paiement_id is null and fa.paye_le is null;
    if f is not null and not exists (
      select 1 from public.factures_paiements fp join public.paiements p on p.id = fp.paiement_id
      where fp.facture_id = f and p.statut is distinct from 'Payé'
    ) then
      update public.factures set paye_le = (select max(p.date) from public.factures_paiements fp join public.paiements p on p.id = fp.paiement_id where fp.facture_id = f),
        moyen = new.moyen
        where id = f;
    end if;
  end if;
  return new;
end $$;
create trigger paiements_regler_facture_du_mois after update of statut on public.paiements
  for each row execute function public.regler_facture_du_mois();
