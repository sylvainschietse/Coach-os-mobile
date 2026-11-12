-- Virement signalé par le client, confirmé par le coach :
-- · le client touche « J'ai payé par virement » sous une facture à régler : le coach est prévenu ;
-- · le coach vérifie son compte puis « Confirmer le paiement » : les lignes passent à « Payé » (par virement),
--   la facture est notée réglée et le client est prévenu que son paiement est confirmé.

alter table public.factures add column virement_signale_le timestamptz;

-- Client : « J'ai payé par virement » sur une de ses factures à régler.
create function public.signaler_virement(p_facture uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.factures;
  v_nom text;
begin
  select * into f from public.factures where id = p_facture for update;
  if not found or f.client_id is null or f.client_id is distinct from public.mon_client_id() then
    raise exception 'Facture introuvable.';
  end if;
  if f.paye_le is not null or f.total = 0 then raise exception 'Cette facture est déjà réglée.'; end if;
  update public.factures set virement_signale_le = now() where id = f.id;
  select coalesce(nullif(btrim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')), ''), 'Ton client') into v_nom
    from public.clients c where c.id = f.client_id;
  perform public.notifier(public._user_coach(f.coach_id), 'virement_signale', 'Virement signalé',
    v_nom || ' dit avoir payé la facture ' || f.numero || ' (' || replace(to_char(f.total, 'FM9999990.00'), '.', ',')
      || ' €) par virement. Vérifie ton compte puis confirme le paiement.',
    '/coach?onglet=crm&rubrique=Paiements');
end $$;
revoke execute on function public.signaler_virement(uuid) from public;
grant execute on function public.signaler_virement(uuid) to authenticated;

-- Coach : confirme le paiement d'une facture. Ses lignes passent à « Payé » (moyen Virement si le client l'a signalé
-- et qu'aucun moyen n'était noté) ; les déclencheurs existants notent alors la facture réglée.
create function public.confirmer_paiement_facture(p_facture uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.factures;
  v_moyen text;
begin
  select * into f from public.factures where id = p_facture for update;
  if not found or f.coach_id is distinct from public.mon_coach_id() then raise exception 'Facture introuvable.'; end if;
  if f.paye_le is not null then return; end if;
  v_moyen := case when f.virement_signale_le is not null then 'Virement' end;
  update public.paiements p set statut = 'Payé', moyen = coalesce(p.moyen, v_moyen)
    where p.id in (select fp.paiement_id from public.factures_paiements fp where fp.facture_id = f.id)
      and p.statut is distinct from 'Payé';
  -- Facture sans ligne de paiement (ou lignes déjà payées) : notée réglée directement.
  update public.factures set paye_le = current_date, moyen = coalesce(moyen, v_moyen)
    where id = f.id and paye_le is null;
end $$;
revoke execute on function public.confirmer_paiement_facture(uuid) from public;
grant execute on function public.confirmer_paiement_facture(uuid) to authenticated;

-- Client : prévenu dès qu'une facture à régler passe à réglée, quel que soit le chemin (fiche, bouton, Stripe).
create function public._notif_paiement_confirme() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is null or new.total = 0 or old.paye_le is not null or new.paye_le is null then return null; end if;
  perform public.notifier(public._user_client(new.client_id), 'paiement_confirme', 'Paiement confirmé',
    'Ton coach a bien reçu ton paiement de ' || replace(to_char(new.total, 'FM9999990.00'), '.', ',')
      || ' € (facture ' || new.numero || '). Merci !',
    '/client?onglet=moi');
  return null;
exception when others then
  return null;
end $$;
create trigger notif_paiement_confirme after update of paye_le on public.factures
  for each row execute function public._notif_paiement_confirme();
