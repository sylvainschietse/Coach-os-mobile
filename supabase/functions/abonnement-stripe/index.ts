// Abonnement payé par Stripe, sans rien acheter dans l'appli.
// · demarrer (coach) : formule et remise de la fiche → abonnement Stripe.
//     Offert à 100 % : il démarre tout de suite, sans carte, et le client reçoit une facture à 0 € qui montre la remise.
//     Sinon : un lien de paiement Stripe que le coach envoie au client (message, e-mail, WhatsApp).
//     Abonnement déjà en cours : la nouvelle formule ou la nouvelle remise s'applique au prochain prélèvement.
// · resilier (coach) : arrêt à la fin du mois déjà payé.
// · portail (client) : page Stripe pour changer de carte, voir ses factures ou résilier.
// Secrets : STRIPE_SECRET_KEY (clé secrète Stripe), SITE_URL (page de retour après paiement, facultatif).

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

import { coupon, estFormule, FORMULES } from '../_shared/abonnements.ts';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

const SITE = Deno.env.get('SITE_URL') ?? 'https://sylvainschietse.github.io';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  const cle = Deno.env.get('STRIPE_SECRET_KEY');
  if (!cle) return repondre({ erreur: 'Stripe n’est pas encore branché : ajoute la clé STRIPE_SECRET_KEY dans les secrets Supabase.' }, 503);
  const stripe = new Stripe(cle);

  let corps: { action?: unknown; clientId?: unknown };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }

  // Qui demande : uniquement d'après son propre jeton.
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await utilisateur.auth.getUser();
  if (!moi.user) return repondre({ erreur: 'Reconnecte-toi puis réessaie.' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    if (corps.action === 'portail') {
      const { data: c } = await admin.from('clients').select('stripe_client').eq('user_id', moi.user.id).maybeSingle();
      if (!c?.stripe_client) return repondre({ erreur: 'Ton abonnement n’est pas payé par carte : vois avec ton coach.' }, 404);
      const session = await stripe.billingPortal.sessions.create({ customer: c.stripe_client, return_url: SITE, locale: 'fr' });
      return repondre({ lien: session.url });
    }

    if (typeof corps.clientId !== 'string') return repondre({ erreur: 'Client manquant.' }, 400);
    const { data: coach } = await admin.from('coachs').select('id').eq('user_id', moi.user.id).maybeSingle();
    if (!coach) return repondre({ erreur: 'Réservé au coach.' }, 403);
    const { data: c } = await admin
      .from('clients')
      .select('id, prenom, nom, email, formule, remise_type, remise_valeur, remise_motif, remise_jusqu_au, stripe_client, stripe_abonnement, statut_stripe')
      .eq('id', corps.clientId)
      .eq('coach_id', coach.id)
      .maybeSingle();
    if (!c) return repondre({ erreur: 'Ce client n’est pas dans ta liste.' }, 404);

    const enCours = c.stripe_abonnement && !['canceled', 'incomplete_expired'].includes(c.statut_stripe ?? '');

    if (corps.action === 'resilier') {
      if (!enCours) return repondre({ erreur: 'Aucun prélèvement en cours pour ce client.' }, 404);
      await stripe.subscriptions.update(c.stripe_abonnement, { cancel_at_period_end: true });
      return repondre({ ok: true });
    }
    if (corps.action !== 'demarrer') return repondre({ erreur: 'Action inconnue.' }, 400);

    if (!estFormule(c.formule)) return repondre({ erreur: 'Choisis d’abord une des 4 formules pour ce client.' }, 400);
    const f = FORMULES[c.formule];

    // Un prix Stripe par formule et par montant, retrouvé par sa clé : changer un tarif crée un nouveau prix, sans toucher aux anciens.
    const cleTarif = `coachgo_${c.formule}_${f.prix * 100}`;
    const existants = await stripe.prices.list({ lookup_keys: [cleTarif], active: true, limit: 1 });
    const prix =
      existants.data[0] ??
      (await stripe.prices.create({
        currency: 'eur',
        unit_amount: f.prix * 100,
        recurring: { interval: 'month' },
        lookup_key: cleTarif,
        product_data: { name: `CoachGo · ${f.nom}` },
      }));

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const r = coupon(c, aujourdhui);
    const remise = r ? await stripe.coupons.create({ ...r, metadata: { client_id: c.id } }) : undefined;
    const offert = r && 'percent_off' in r && r.percent_off >= 100;
    const metadata = { client_id: c.id, formule: c.formule };

    let clientStripe = c.stripe_client as string | null;
    if (!clientStripe) {
      const cree = await stripe.customers.create({
        email: c.email ?? undefined,
        name: [c.prenom, c.nom].filter(Boolean).join(' ') || undefined,
        preferred_locales: ['fr'],
        metadata: { client_id: c.id },
      });
      clientStripe = cree.id;
      await admin.from('clients').update({ stripe_client: clientStripe }).eq('id', c.id);
    }

    // Déjà abonné : nouvelle formule et nouvelle remise au prochain prélèvement, sans rattrapage au prorata.
    if (enCours) {
      const abo = await stripe.subscriptions.retrieve(c.stripe_abonnement);
      await stripe.subscriptions.update(c.stripe_abonnement, {
        items: [{ id: abo.items.data[0].id, price: prix.id }],
        discounts: remise ? [{ coupon: remise.id }] : '',
        proration_behavior: 'none',
        cancel_at_period_end: false,
        metadata,
      });
      await admin.from('clients').update({ paiement: 'stripe' }).eq('id', c.id);
      return repondre({ demarre: true });
    }

    // Offert : pas de carte à demander, l'abonnement démarre à 0 € avec la remise visible sur la facture.
    if (offert) {
      const abo = await stripe.subscriptions.create({
        customer: clientStripe,
        items: [{ price: prix.id }],
        discounts: [{ coupon: remise!.id }],
        metadata,
      });
      await admin.from('clients').update({ paiement: 'stripe', stripe_abonnement: abo.id, statut_stripe: abo.status }).eq('id', c.id);
      return repondre({ demarre: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: clientStripe,
      line_items: [{ price: prix.id, quantity: 1 }],
      discounts: remise ? [{ coupon: remise.id }] : undefined,
      subscription_data: { metadata },
      metadata,
      locale: 'fr',
      success_url: `${SITE}/?paiement=merci`,
      cancel_url: `${SITE}/?paiement=annule`,
    });
    await admin.from('clients').update({ paiement: 'stripe' }).eq('id', c.id);
    return repondre({ lien: session.url, demarre: false });
  } catch (e) {
    console.error(e);
    const message = e instanceof Stripe.errors.StripeError ? `Stripe a refusé : ${e.message}` : 'Stripe ne répond pas pour le moment. Réessaie.';
    return repondre({ erreur: message }, 502);
  }
});
