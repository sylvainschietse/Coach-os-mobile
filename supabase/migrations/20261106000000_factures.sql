-- Factures du coach, à ses couleurs et avec sa numérotation par client (RT38, BT1, GT11…).
-- · À chaque prélèvement Stripe réussi, la ligne « Payé » de la Gestion reçoit sa facture, sans rien à faire.
-- · Pour un paiement encaissé à la main, le coach la crée d'un bouton.
-- Une facture émise ne change plus : l'émetteur, le client et les lignes y sont recopiés au moment de l'émission.

-- ---------- En-tête du coach ----------
alter table public.coachs
  add column facture_nom text,
  add column facture_adresse text,
  add column facture_telephone text,
  add column facture_siret text check (facture_siret is null or facture_siret ~ '^[0-9]{14}$'),
  add column facture_mentions text not null default
    'Dispensé d’immatriculation au registre du commerce et des sociétés (RCS) et au répertoire des métiers (RM)' || chr(10) ||
    'TVA non applicable, art. 293 B du CGI',
  add column facture_couleur text not null default '#D71920' check (facture_couleur ~ '^#[0-9A-Fa-f]{6}$'),
  -- Image en data URL, réduite par l'appli.
  add column facture_logo text check (facture_logo is null or length(facture_logo) <= 400000);

grant update (facture_nom, facture_adresse, facture_telephone, facture_siret, facture_mentions, facture_couleur, facture_logo)
  on public.coachs to authenticated;

-- ---------- Numérotation et destinataire, client par client ----------
alter table public.clients
  add column facture_prefixe text check (facture_prefixe is null or facture_prefixe ~ '^[A-Z0-9]{1,10}$'),
  add column facture_prochain integer not null default 1 check (facture_prochain between 1 and 999999),
  -- À qui est adressée la facture quand ce n'est pas le client lui-même (société, parent…).
  add column facture_nom text;

-- ---------- Factures ----------
create table public.factures (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coachs (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  paiement_id uuid unique references public.paiements (id) on delete set null,
  numero text not null,
  date date not null,
  objet text not null,
  -- { nom, adresse, telephone, siret, mentions }
  emetteur jsonb not null,
  -- { nom, adresse }
  destinataire jsonb not null,
  -- [{ libelle, quantite, prix_unitaire, montant }]
  lignes jsonb not null,
  total numeric(12, 2) not null check (total >= 0),
  moyen text,
  paye_le date,
  cree_le timestamptz not null default now(),
  unique (coach_id, numero)
);
create index factures_client on public.factures (client_id, date desc);

alter table public.factures enable row level security;
create policy "coach : ses factures" on public.factures for select using (coach_id = public.mon_coach_id());
create policy "client : ses factures" on public.factures for select using (client_id = public.mon_client_id());
grant select on public.factures to authenticated;
-- Aucune écriture directe : seule facturer_paiement() émet une facture.

-- Lignes déduites du paiement : « Prix 269 €, remise 269 € » (noté par le prélèvement Stripe) devient le prix et la remise.
create function public.lignes_facture(p public.paiements, motif text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  libelle text := btrim(regexp_replace(p.titre, ' · .*$', ''));
  m text[] := regexp_match(coalesce(p.notes, ''), 'Prix ([0-9]+(?:\.[0-9]+)?) €, remise ([0-9]+(?:\.[0-9]+)?) €');
  prix numeric := coalesce(m[1]::numeric, p.montant, 0);
  remise numeric := coalesce(m[2]::numeric, 0);
begin
  if libelle = '' then libelle := 'Coaching'; end if;
  return jsonb_build_array(jsonb_build_object('libelle', libelle, 'quantite', 1, 'prix_unitaire', prix, 'montant', prix))
    || case when remise > 0 then jsonb_build_array(jsonb_build_object(
         'libelle', 'Remise' || case when coalesce(btrim(motif), '') <> '' then ' · ' || btrim(motif) else '' end,
         'quantite', 1, 'prix_unitaire', -remise, 'montant', -remise)) else '[]'::jsonb end;
end $$;

-- Émet la facture d'un paiement « Payé » (une seule par paiement) et avance la numérotation du client.
-- Appelée par le déclencheur des prélèvements Stripe, ou par le coach pour un paiement encaissé à la main.
create function public.facturer_paiement(p_paiement uuid) returns uuid
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
    p.coach_id, c.id, p.id, v_numero, coalesce(p.date, current_date),
    btrim(regexp_replace(p.titre, ' · .*$', '')),
    jsonb_build_object('nom', coalesce(nullif(co.facture_nom, ''), co.nom), 'adresse', co.facture_adresse,
      'telephone', co.facture_telephone, 'siret', co.facture_siret, 'mentions', co.facture_mentions),
    jsonb_build_object('nom', coalesce(nullif(c.facture_nom, ''), btrim(coalesce(nullif(c.prenom, ''), k.prenom, '') || ' ' || coalesce(nullif(c.nom, ''), k.nom, ''))),
      'adresse', coalesce(nullif(c.adresse, ''), k.adresse)),
    public.lignes_facture(p, c.remise_motif),
    p.montant, p.moyen, coalesce(p.date, current_date))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.facturer_paiement(uuid) from public;
grant execute on function public.facturer_paiement(uuid) to authenticated;

-- Prélèvement Stripe réussi : facture émise d'office. Un souci de facture ne bloque jamais l'enregistrement du paiement.
create function public.facturer_prelevement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'Payé' and new.moyen = 'Stripe' and new.montant is not null
     and not exists (select 1 from public.factures where paiement_id = new.id) then
    begin
      perform public.facturer_paiement(new.id);
    exception when others then
      raise warning 'Facture non émise pour le paiement % : %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;

create trigger paiements_facturer_prelevement after insert or update of statut, montant on public.paiements
  for each row execute function public.facturer_prelevement();
