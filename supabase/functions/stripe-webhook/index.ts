// Reçoit les événements Stripe et tient la fiche du client à jour, sans que le coach ait à cocher quoi que ce soit.
// · abonnement actif ou en relance de paiement → accès ouvert avec les droits de sa formule ;
//   impayé, résilié ou expiré → accès coupé (tout son suivi est gardé, comme une pause).
// · prélèvement réussi → ligne « Payé » dans la Gestion du coach (remise notée), et séances du mois créditées (Hybride).
// URL à renseigner dans Stripe (Développeurs › Webhooks) : <projet>/functions/v1/stripe-webhook
// Secrets : STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET (« whsec_… », affiché par Stripe à la création du webhook).
// Déployée sans vérification de jeton Supabase (Stripe n'en a pas) : c'est la signature Stripe qui fait foi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

import { estFormule, FORMULES, statutOuvreAcces } from '../_shared/abonnements.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const jour = (secondes: number) => new Date(secondes * 1000).toISOString().slice(0, 10);

type Fiche = { id: string; coach_id: string; prenom: string; formule: string | null; stripe_abonnement: string | null };

async function ficheDe(abonnementId: string, clientId?: string): Promise<Fiche | null> {
  const champs = 'id, coach_id, prenom, formule, stripe_abonnement';
  const { data } = await admin.from('clients').select(champs).eq('stripe_abonnement', abonnementId).maybeSingle();
  if (data || !clientId) return data;
  const { data: parId } = await admin.from('clients').select(champs).eq('id', clientId).maybeSingle();
  return parId;
}

async function appliquerAbonnement(abo: Stripe.Subscription) {
  const fiche = await ficheDe(abo.id, abo.metadata?.client_id);
  if (!fiche) return;
  // Un ancien abonnement remplacé par un nouveau ne touche plus à la fiche.
  if (fiche.stripe_abonnement && fiche.stripe_abonnement !== abo.id && abo.status !== 'active') return;
  const ouvert = statutOuvreAcces(abo.status);
  // Selon la version de l'API Stripe, la fin de période est sur l'abonnement ou sur sa ligne.
  const fin =
    (abo.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    (abo as unknown as { current_period_end?: number }).current_period_end;
  const champs: Record<string, unknown> = {
    paiement: 'stripe',
    stripe_abonnement: abo.id,
    stripe_client: typeof abo.customer === 'string' ? abo.customer : abo.customer.id,
    statut_stripe: abo.status,
    prochaine_echeance: ouvert && !abo.cancel_at_period_end && fin ? jour(fin) : null,
    acces_appli: ouvert,
  };
  // Accès rouvert : les droits suivent la formule.
  if (ouvert && estFormule(fiche.formule)) {
    champs.option_nutrition = FORMULES[fiche.formule].optionNutrition;
    champs.videos_mois = FORMULES[fiche.formule].videosMois;
  }
  await admin.from('clients').update(champs).eq('id', fiche.id);
}

async function enregistrerPaiement(facture: Stripe.Invoice) {
  // Selon la version de l'API Stripe, l'abonnement est sur la facture ou dans parent.subscription_details.
  const f0 = facture as unknown as { subscription?: string | { id: string } | null; parent?: { subscription_details?: { subscription?: string | { id: string } } } };
  const abonnementId = f0.subscription ?? f0.parent?.subscription_details?.subscription;
  if (!abonnementId) return;
  const fiche = await ficheDe(typeof abonnementId === 'string' ? abonnementId : abonnementId.id);
  if (!fiche) return;
  const debut = facture.lines.data[0]?.period?.start ?? facture.created;
  const mois = jour(debut).slice(0, 7);
  const prix = (facture.subtotal ?? 0) / 100;
  const paye = (facture.amount_paid ?? 0) / 100;
  const remise = Math.max(0, prix - (facture.total ?? 0) / 100);
  const { data: contact } = await admin.from('contacts').select('id').eq('client_id', fiche.id).limit(1).maybeSingle();
  const reference = `abonnement:${mois}:${fiche.id}`;
  const ligne = {
    coach_id: fiche.coach_id,
    titre: `Abonnement ${mois.split('-').reverse().join('/')} · ${fiche.prenom}${paye === 0 && prix > 0 ? ' · offert' : ''}`,
    contact_id: contact?.id ?? null,
    date: jour(facture.created),
    montant: paye,
    moyen: 'Stripe',
    statut: 'Payé',
    notes: remise > 0 ? `Prix ${prix} €, remise ${remise} €` : null,
    reference,
  };
  // La ligne du mois existe peut-être déjà (préparée à la main avant le passage à Stripe) : on la complète.
  const { data: existante } = await admin.from('paiements').select('id').eq('coach_id', fiche.coach_id).eq('reference', reference).maybeSingle();
  if (existante) await admin.from('paiements').update(ligne).eq('id', existante.id);
  else await admin.from('paiements').insert(ligne);

  // Séances incluses (Hybride) : créditées une fois par mois payé.
  const f = estFormule(fiche.formule) ? FORMULES[fiche.formule] : undefined;
  if (f?.seancesMois)
    await admin
      .from('packs_seances')
      .insert({ coach_id: fiche.coach_id, client_id: fiche.id, seances_total: f.seancesMois, prix: 0, achete_le: jour(debut), reference: `formule:${mois}` });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('STRIPE_WEBHOOK_SECRET manquant', { status: 503 });
  const corps = await req.text();
  let evt: Stripe.Event;
  try {
    evt = await stripe.webhooks.constructEventAsync(corps, req.headers.get('stripe-signature') ?? '', secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return new Response('Signature invalide', { status: 400 });
  }

  // Déjà reçu : Stripe renvoie parfois le même événement.
  const { error: doublon } = await admin.from('stripe_evenements').insert({ id: evt.id, type: evt.type });
  if (doublon) return new Response('déjà traité');

  try {
    switch (evt.type) {
      case 'checkout.session.completed': {
        const s = evt.data.object;
        if (s.subscription) await appliquerAbonnement(await stripe.subscriptions.retrieve(typeof s.subscription === 'string' ? s.subscription : s.subscription.id));
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await appliquerAbonnement(evt.data.object);
        break;
      case 'invoice.paid':
        await enregistrerPaiement(evt.data.object);
        break;
    }
  } catch (e) {
    console.error(e);
    // Stripe réessaiera : on oublie l'événement pour pouvoir le retraiter.
    await admin.from('stripe_evenements').delete().eq('id', evt.id);
    return new Response('erreur', { status: 500 });
  }
  return new Response('ok');
});
