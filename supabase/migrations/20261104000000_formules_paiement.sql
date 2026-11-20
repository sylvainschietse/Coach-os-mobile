-- Formules du site, remise exceptionnelle et paiement par Stripe.
-- · formule : Appli (59 €), Appli + nutrition (99 €), Hybride léger (149 €), Hybride complet (269 €) ; null = réglage sur mesure.
--   La formule règle les droits déjà en place (acces_appli, option_nutrition, videos_mois) : rien ne change pour les règles d'accès.
-- · remise_* : remise accordée par le coach, en % (100 % = offert) ou en euros par mois, avec un motif affiché au client.
-- · paiement : 'manuel' (le coach encaisse et coche « Payé ») ou 'stripe' (prélèvement mensuel, tenu à jour par Stripe).
-- Rien n'est payé dans l'appli : le lien de paiement Stripe part par message, e-mail ou WhatsApp.

alter table public.clients
  add column formule text check (formule in ('appli', 'appli_nutrition', 'hybride_leger', 'hybride_complet')),
  add column remise_type text check (remise_type in ('pourcent', 'montant')),
  add column remise_valeur numeric(8, 2) check (remise_valeur is null or remise_valeur > 0),
  add column remise_motif text check (remise_motif is null or length(remise_motif) <= 80),
  add column remise_jusqu_au date,
  add column paiement text not null default 'manuel' check (paiement in ('manuel', 'stripe')),
  add column statut_stripe text check (
    statut_stripe in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  add column stripe_client text,
  add column stripe_abonnement text,
  add column prochaine_echeance date,
  add constraint clients_remise_complete check ((remise_type is null) = (remise_valeur is null)),
  add constraint clients_remise_max check (remise_type is distinct from 'pourcent' or remise_valeur <= 100);

create unique index clients_stripe_abonnement on public.clients (stripe_abonnement) where stripe_abonnement is not null;

-- Les identifiants Stripe ne s'écrivent que côté serveur (fonctions stripe-webhook et abonnement-stripe) :
-- le coach règle la formule et la remise, jamais l'état du prélèvement.
create function public.proteger_champs_stripe() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
    new.statut_stripe is distinct from old.statut_stripe
    or new.stripe_client is distinct from old.stripe_client
    or new.stripe_abonnement is distinct from old.stripe_abonnement
    or new.prochaine_echeance is distinct from old.prochaine_echeance
  ) then
    raise exception 'L’état du prélèvement est tenu par Stripe.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger clients_proteger_champs_stripe before update on public.clients
  for each row execute function public.proteger_champs_stripe();

-- Séances incluses dans la formule (Hybride) : un pack crédité par mois, jamais deux fois le même mois.
alter table public.packs_seances add column reference text;
create unique index packs_seances_une_par_mois on public.packs_seances (client_id, reference) where reference is not null;

-- Événements Stripe déjà traités : Stripe peut renvoyer le même deux fois.
create table public.stripe_evenements (
  id text primary key,
  type text not null,
  recu_le timestamptz not null default now()
);
alter table public.stripe_evenements enable row level security;
revoke all on public.stripe_evenements from anon, authenticated;
