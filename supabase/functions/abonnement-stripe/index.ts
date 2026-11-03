// Paiements des clients, encaissés directement par leur coach (Stripe Connect, comptes Express).
// L'argent arrive sur le compte Stripe du coach : produits, prix, clients et abonnements sont créés sur son compte.
//
// Coach (connecté) :
// · compte    : état de son compte Stripe (prêt à encaisser ou non).
// · connecter : ouvre son compte Stripe en quelques minutes (page Stripe), ou reprend l'inscription.
// · tableau   : son tableau de bord Stripe (virements, factures, remboursements).
// · publier   : met une offre en vente sur son compte (produit + prix). Un nouveau prix crée un nouveau tarif Stripe ;
//               les clients déjà abonnés gardent l'ancien.
// · demarrer  : passe un client au paiement Stripe avec son offre et sa remise. Offert à 100 % : démarre sans carte.
//               Sinon : un lien de paiement à lui envoyer. Déjà abonné : la nouvelle offre s'applique au prochain prélèvement.
// · resilier  : arrêt à la fin de la période déjà payée.
// Client (connecté) :
// · portail   : page Stripe pour changer de carte, voir ses factures ou résilier.
// · payer     : page de paiement d'une offre de son coach.
// Sans compte (lien partageable de l'offre) :
// · voir      : l'offre et le prénom du coach, pour la page publique.
// · payer     : page de paiement ; à la fin, le webhook crée la fiche du nouveau client chez le coach.
//
// Secrets : STRIPE_SECRET_KEY (clé de la plateforme CoachGo), SITE_URL (adresse web de l'appli, pour les retours),
// STRIPE_COACH_DIRECT (facultatif) : identifiant du coach propriétaire du compte Stripe de la plateforme. Ce coach encaisse
// directement sur ce compte, sans compte connecté, et ses abonnements déjà créés en direct continuent de fonctionner.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

import { coupon, droitsOffre, type LigneOffre, tarifStripe } from '../_shared/abonnements.ts';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

const SITE = (Deno.env.get('SITE_URL') ?? 'https://sylvainschietse.github.io/Coach-os-mobile').replace(/\/+$/, '');
const COACH_DIRECT = Deno.env.get('STRIPE_COACH_DIRECT') ?? '';
/** Compte où créer les objets Stripe : celui du coach (Connect), ou la plateforme elle-même pour le coach en direct. */
type Compte = { stripeAccount: string } | undefined;
const CHAMPS_OFFRE =
  'id, coach_id, nom, accroche, prix, periodicite, acces_appli, nutrition, messagerie, videos_mois, seances, essai_jours, active, stripe_produit, stripe_prix, stripe_prix_cle';

class Refus extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  const cle = Deno.env.get('STRIPE_SECRET_KEY');
  if (!cle) return repondre({ erreur: 'Le paiement en ligne n’est pas encore branché : la clé Stripe manque dans les secrets Supabase.' }, 503);
  const stripe = new Stripe(cle);

  let corps: { action?: unknown; clientId?: unknown; offreId?: unknown };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const action = corps.action;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Qui demande : uniquement d'après son propre jeton (absent sur la page publique d'une offre).
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await utilisateur.auth.getUser();
  const userId = moi.user?.id;

  async function lireOffre(id: unknown) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Refus('Offre introuvable.', 404);
    const { data } = await admin.from('offres').select(CHAMPS_OFFRE).eq('id', id).maybeSingle();
    if (!data) throw new Refus('Offre introuvable.', 404);
    return data as LigneOffre & { messagerie: boolean };
  }
  async function lireCoach(id: string) {
    const { data } = await admin.from('coachs').select('id, nom, user_id, stripe_compte, stripe_pret').eq('id', id).single();
    return data as { id: string; nom: string; user_id: string; stripe_compte: string | null; stripe_pret: boolean };
  }
  /** Compte Stripe du coach, prêt à encaisser : sinon on le dit clairement. */
  function compteDe(coach: { id: string; stripe_compte: string | null; stripe_pret: boolean }, pourLeCoach: boolean): Compte {
    if (coach.id === COACH_DIRECT) return undefined;
    if (!coach.stripe_compte || !coach.stripe_pret)
      throw new Refus(
        pourLeCoach ? 'Ouvre d’abord ton compte Stripe dans « Mes offres » pour être payé.' : 'Ton coach n’a pas encore activé le paiement en ligne.',
        409,
      );
    return { stripeAccount: coach.stripe_compte };
  }

  /** Met l'offre en vente sur le compte du coach : produit à jour, et un prix Stripe par montant et par rythme. */
  async function publier(o: LigneOffre, compte: Compte) {
    const t = tarifStripe(o);
    const description = o.accroche?.trim() || undefined;
    let produit = o.stripe_produit;
    if (produit) await stripe.products.update(produit, { name: o.nom, ...(description ? { description } : {}), active: true }, compte);
    else {
      const p = await stripe.products.create({ name: o.nom, description, metadata: { offre_id: o.id } }, compte);
      produit = p.id;
    }
    let prix = o.stripe_prix;
    if (!prix || o.stripe_prix_cle !== t.cle) {
      const nouveau = await stripe.prices.create(
        { product: produit, currency: 'eur', unit_amount: t.centimes, recurring: t.recurring, metadata: { offre_id: o.id } },
        compte,
      );
      await stripe.products.update(produit, { default_price: nouveau.id }, compte);
      // L'ancien tarif n'est plus proposé, mais les abonnés qui le paient le gardent.
      if (prix) await stripe.prices.update(prix, { active: false }, compte).catch(() => undefined);
      prix = nouveau.id;
    }
    await admin.from('offres').update({ stripe_produit: produit, stripe_prix: prix, stripe_prix_cle: t.cle }).eq('id', o.id);
    return prix;
  }

  /** Page de paiement Stripe d'une offre, sur le compte du coach. */
  async function pageDePaiement(o: LigneOffre, compte: Compte, client?: { id: string; stripe_client: string | null; email: string | null }) {
    const prix = await publier(o, compte);
    const metadata: Record<string, string> = { offre_id: o.id, coach_id: o.coach_id, ...(client ? { client_id: client.id } : {}) };
    const retour = `${SITE}/offre/${o.id}`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: o.periodicite === 'unique' ? 'payment' : 'subscription',
        line_items: [{ price: prix, quantity: 1 }],
        customer: client?.stripe_client ?? undefined,
        customer_email: client && !client.stripe_client ? (client.email ?? undefined) : undefined,
        ...(o.periodicite === 'unique'
          ? { payment_intent_data: { metadata }, invoice_creation: { enabled: true, invoice_data: { metadata } }, customer_creation: client?.stripe_client ? undefined : 'always' }
          : { subscription_data: { metadata, ...(o.essai_jours > 0 ? { trial_period_days: o.essai_jours } : {}) } }),
        metadata,
        locale: 'fr',
        billing_address_collection: 'auto',
        success_url: `${retour}?paiement=merci`,
        cancel_url: `${retour}?paiement=annule`,
      },
      compte,
    );
    return session.url;
  }

  try {
    // ——— Page publique d'une offre (lien partageable), avec ou sans compte ———
    if (action === 'voir') {
      const o = await lireOffre(corps.offreId);
      if (!o.active) throw new Refus('Cette offre n’est plus proposée.', 410);
      const coach = await lireCoach(o.coach_id);
      const { data: photo } = await admin.from('coachs').select('photo').eq('id', coach.id).single();
      return repondre({
        offre: {
          id: o.id,
          nom: o.nom,
          accroche: o.accroche,
          prix: Number(o.prix),
          periodicite: o.periodicite,
          accesAppli: o.acces_appli,
          nutrition: o.nutrition,
          messagerie: o.messagerie,
          videosMois: o.videos_mois,
          seances: o.seances,
          essaiJours: o.essai_jours,
        },
        coach: { nom: coach.nom, photo: photo?.photo ?? null },
        paiement: coach.id === COACH_DIRECT || (!!coach.stripe_compte && coach.stripe_pret),
      });
    }

    if (action === 'payer') {
      const o = await lireOffre(corps.offreId);
      if (!o.active) throw new Refus('Cette offre n’est plus proposée.', 410);
      const coach = await lireCoach(o.coach_id);
      const compte = compteDe(coach, false);
      // Un client connecté paie pour sa propre fiche, s'il est bien suivi par ce coach.
      let client: { id: string; stripe_client: string | null; email: string | null; stripe_abonnement: string | null; statut_stripe: string | null } | undefined;
      if (userId) {
        const { data } = await admin.from('clients').select('id, coach_id, stripe_client, email, stripe_abonnement, statut_stripe').eq('user_id', userId).maybeSingle();
        if (data && data.coach_id === o.coach_id) client = data;
      }
      if (client && o.periodicite !== 'unique' && client.stripe_abonnement && ['active', 'trialing', 'past_due'].includes(client.statut_stripe ?? ''))
        throw new Refus('Tu as déjà un abonnement en cours : demande à ton coach de changer d’offre.', 409);
      return repondre({ lien: await pageDePaiement(o, compte, client) });
    }

    // ——— Client connecté ———
    if (!userId) return repondre({ erreur: 'Reconnecte-toi puis réessaie.' }, 401);

    if (action === 'portail') {
      const { data: c } = await admin.from('clients').select('stripe_client, coach_id').eq('user_id', userId).maybeSingle();
      if (!c?.stripe_client) throw new Refus('Ton abonnement n’est pas payé par carte : vois avec ton coach.', 404);
      const compte = compteDe(await lireCoach(c.coach_id), false);
      const ouvrir = () => stripe.billingPortal.sessions.create({ customer: c.stripe_client, return_url: SITE, locale: 'fr' }, compte);
      let session;
      try {
        session = await ouvrir();
      } catch (e) {
        // Premier passage sur ce compte : le portail n'a pas encore de réglages, on les crée.
        if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
        await stripe.billingPortal.configurations.create(
          {
            business_profile: { headline: 'Ton abonnement coaching' },
            features: {
              invoice_history: { enabled: true },
              payment_method_update: { enabled: true },
              customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
              subscription_cancel: { enabled: true, mode: 'at_period_end' },
            },
          },
          compte,
        );
        session = await ouvrir();
      }
      return repondre({ lien: session.url });
    }

    // ——— Coach connecté ———
    const { data: moiCoach } = await admin.from('coachs').select('id').eq('user_id', userId).maybeSingle();
    if (!moiCoach) throw new Refus('Réservé au coach.', 403);
    const coach = await lireCoach(moiCoach.id);

    if (action === 'compte' || action === 'connecter' || action === 'tableau') {
      // Coach en direct sur le compte de la plateforme : rien à ouvrir, son tableau de bord est celui de Stripe.
      if (coach.id === COACH_DIRECT) {
        if (action === 'compte') return repondre({ compte: true, pret: true });
        return repondre({ lien: 'https://dashboard.stripe.com' });
      }
      let compteId = coach.stripe_compte;
      if (!compteId) {
        if (action !== 'connecter') return repondre({ compte: false, pret: false });
        const email = moi.user?.email ?? undefined;
        const cree = await stripe.accounts.create({
          type: 'express',
          country: 'FR',
          email,
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          business_profile: { product_description: 'Coaching sportif', mcc: '7997' },
          metadata: { coach_id: coach.id },
        });
        compteId = cree.id;
        await admin.from('coachs').update({ stripe_compte: compteId }).eq('id', coach.id);
      }
      const compte = await stripe.accounts.retrieve(compteId);
      const pret = !!compte.charges_enabled && !!compte.details_submitted;
      if (pret !== coach.stripe_pret) await admin.from('coachs').update({ stripe_pret: pret }).eq('id', coach.id);
      if (action === 'compte') return repondre({ compte: true, pret, enAttente: !pret && !!compte.details_submitted });
      if (action === 'tableau') {
        if (!compte.details_submitted) throw new Refus('Termine d’abord l’ouverture de ton compte Stripe.', 409);
        return repondre({ lien: (await stripe.accounts.createLoginLink(compteId)).url });
      }
      const lien = await stripe.accountLinks.create({
        account: compteId,
        type: 'account_onboarding',
        refresh_url: `${SITE}/?stripe=reprendre`,
        return_url: `${SITE}/?stripe=retour`,
      });
      return repondre({ lien: lien.url });
    }

    if (action === 'publier') {
      const o = await lireOffre(corps.offreId);
      if (o.coach_id !== coach.id) throw new Refus('Cette offre n’est pas à toi.', 403);
      await publier(o, compteDe(coach, true));
      return repondre({ ok: true });
    }

    if (typeof corps.clientId !== 'string') throw new Refus('Client manquant.');
    const { data: c } = await admin
      .from('clients')
      .select('id, prenom, nom, email, offre_id, remise_type, remise_valeur, remise_motif, remise_jusqu_au, stripe_client, stripe_abonnement, statut_stripe')
      .eq('id', corps.clientId)
      .eq('coach_id', coach.id)
      .maybeSingle();
    if (!c) throw new Refus('Ce client n’est pas dans ta liste.', 404);
    const compte = compteDe(coach, true);
    const enCours = c.stripe_abonnement && !['canceled', 'incomplete_expired'].includes(c.statut_stripe ?? '');

    if (action === 'resilier') {
      if (!enCours) throw new Refus('Aucun prélèvement en cours pour ce client.', 404);
      await stripe.subscriptions.update(c.stripe_abonnement, { cancel_at_period_end: true }, compte);
      return repondre({ ok: true });
    }
    if (action !== 'demarrer') throw new Refus('Action inconnue.');

    if (!c.offre_id) throw new Refus('Choisis d’abord une de tes offres pour ce client.');
    const o = await lireOffre(c.offre_id);

    // Pack payé en une fois : un simple lien de paiement, les séances sont créditées au paiement.
    if (o.periodicite === 'unique') {
      const lien = await pageDePaiement(o, compte, c);
      return repondre({ lien, demarre: false });
    }

    const prix = await publier(o, compte);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const r = coupon(c, aujourdhui);
    const remise = r ? await stripe.coupons.create({ ...r, metadata: { client_id: c.id } }, compte) : undefined;
    const offert = r && 'percent_off' in r && r.percent_off >= 100;
    const metadata = { client_id: c.id, offre_id: o.id, coach_id: coach.id };

    let clientStripe = c.stripe_client as string | null;
    if (!clientStripe) {
      const cree = await stripe.customers.create(
        { email: c.email ?? undefined, name: [c.prenom, c.nom].filter(Boolean).join(' ') || undefined, preferred_locales: ['fr'], metadata: { client_id: c.id } },
        compte,
      );
      clientStripe = cree.id;
      await admin.from('clients').update({ stripe_client: clientStripe }).eq('id', c.id);
    }

    // Montant facturé après remise : s'il est supérieur à 0, il faut une carte enregistrée.
    const aPayer = !r ? Number(o.prix) : 'percent_off' in r ? Number(o.prix) * (1 - r.percent_off / 100) : Math.max(0, Number(o.prix) - r.amount_off / 100);

    // Déjà abonné : nouvelle offre et nouvelle remise au prochain prélèvement, sans rattrapage au prorata.
    if (enCours) {
      const abo = await stripe.subscriptions.retrieve(c.stripe_abonnement, compte);
      // Abonnement offert créé sans carte : s'il devient payant, la prochaine facture échouerait.
      // On fait alors passer le client par une page de paiement (nouvel abonnement), et l'ancien s'arrête à la fin de sa période.
      if (aPayer > 0 && !abo.default_payment_method) {
        const cs = await stripe.customers.retrieve(clientStripe, compte);
        const carte = !('deleted' in cs && cs.deleted) && (cs as Stripe.Customer).invoice_settings?.default_payment_method;
        if (!carte) {
          const session = await stripe.checkout.sessions.create(
            {
              mode: 'subscription',
              customer: clientStripe,
              line_items: [{ price: prix, quantity: 1 }],
              discounts: remise ? [{ coupon: remise.id }] : undefined,
              subscription_data: { metadata },
              metadata,
              locale: 'fr',
              success_url: `${SITE}/offre/${o.id}?paiement=merci`,
              cancel_url: `${SITE}/offre/${o.id}?paiement=annule`,
            },
            compte,
          );
          await stripe.subscriptions.update(c.stripe_abonnement, { cancel_at_period_end: true }, compte);
          return repondre({ lien: session.url, demarre: false });
        }
      }
      await stripe.subscriptions.update(
        c.stripe_abonnement,
        {
          items: [{ id: abo.items.data[0].id, price: prix }],
          discounts: remise ? [{ coupon: remise.id }] : '',
          proration_behavior: 'none',
          cancel_at_period_end: false,
          metadata,
        },
        compte,
      );
      await admin.from('clients').update({ paiement: 'stripe', offre_prix: Number(o.prix), ...droitsOffre(o) }).eq('id', c.id);
      return repondre({ demarre: true });
    }

    // Offert pour toujours : pas de carte à demander, l'abonnement démarre à 0 € avec la remise visible sur la facture.
    // Offert jusqu'à une date : la page de paiement enregistre la carte (0 € aujourd'hui) pour les mois payants qui suivront.
    if (offert && r.duration === 'forever') {
      const abo = await stripe.subscriptions.create({ customer: clientStripe, items: [{ price: prix }], discounts: [{ coupon: remise!.id }], metadata }, compte);
      await admin.from('clients').update({ paiement: 'stripe', stripe_abonnement: abo.id, statut_stripe: abo.status, offre_prix: Number(o.prix) }).eq('id', c.id);
      return repondre({ demarre: true });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: clientStripe,
        line_items: [{ price: prix, quantity: 1 }],
        discounts: remise ? [{ coupon: remise.id }] : undefined,
        subscription_data: { metadata, ...(o.essai_jours > 0 ? { trial_period_days: o.essai_jours } : {}) },
        metadata,
        locale: 'fr',
        success_url: `${SITE}/offre/${o.id}?paiement=merci`,
        cancel_url: `${SITE}/offre/${o.id}?paiement=annule`,
      },
      compte,
    );
    await admin.from('clients').update({ paiement: 'stripe' }).eq('id', c.id);
    return repondre({ lien: session.url, demarre: false });
  } catch (e) {
    if (e instanceof Refus) return repondre({ erreur: e.message }, e.status);
    console.error(e);
    const message = e instanceof Stripe.errors.StripeError ? `Stripe a refusé : ${e.message}` : 'Stripe ne répond pas pour le moment. Réessaie.';
    return repondre({ erreur: message }, 502);
  }
});
