// Reçoit les événements Stripe des comptes des coachs (Stripe Connect) et tient les fiches à jour, sans que le coach coche quoi que ce soit.
// · compte du coach validé ou bloqué par Stripe → « Mes offres » sait s'il peut encaisser.
// · abonnement actif, en essai ou en relance de paiement → accès ouvert avec les droits de son offre ;
//   impayé, résilié ou expiré → accès coupé (tout son suivi est gardé, comme une pause).
// · paiement par le lien partageable d'une offre, sans fiche → la fiche du nouveau client est créée chez le coach.
// · paiement par une page Stripe terminé → le coach est prévenu sur son téléphone (notification).
// · paiement réussi → ligne « Payé » dans la Gestion du coach (remise notée), et séances créditées (offre avec séances ou pack).
// Webhook à créer dans Stripe (Développeurs › Webhooks), « Événements sur les comptes connectés » :
//   <projet>/functions/v1/stripe-webhook
// Secrets : STRIPE_SECRET_KEY, et STRIPE_CONNECT_WEBHOOK_SECRET (« whsec_… » de ce webhook).
// STRIPE_WEBHOOK_SECRET reste accepté pour un webhook sur le compte de la plateforme.
// Déployée sans vérification de jeton Supabase (Stripe n'en a pas) : c'est la signature Stripe qui fait foi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

import { droitsOffre, type LigneOffre, statutOuvreAcces } from '../_shared/abonnements.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const jour = (secondes: number) => new Date(secondes * 1000).toISOString().slice(0, 10);

type Fiche = { id: string; coach_id: string; prenom: string; offre_id: string | null; stripe_abonnement: string | null };
type Compte = { stripeAccount: string } | undefined;
const CHAMPS_FICHE = 'id, coach_id, prenom, offre_id, stripe_abonnement';

async function ficheDe(abonnementId: string | undefined, clientId?: string): Promise<Fiche | null> {
  if (abonnementId) {
    const { data } = await admin.from('clients').select(CHAMPS_FICHE).eq('stripe_abonnement', abonnementId).maybeSingle();
    if (data) return data;
  }
  if (!clientId) return null;
  const { data } = await admin.from('clients').select(CHAMPS_FICHE).eq('id', clientId).maybeSingle();
  return data;
}

async function lireOffre(id: string | null | undefined) {
  if (!id) return undefined;
  const { data } = await admin.from('offres').select('id, coach_id, nom, prix, periodicite, acces_appli, nutrition, videos_mois, seances').eq('id', id).maybeSingle();
  return (data as (Pick<LigneOffre, 'id' | 'coach_id' | 'nom' | 'prix' | 'periodicite' | 'acces_appli' | 'nutrition' | 'videos_mois' | 'seances'>) | null) ?? undefined;
}

/** Le coach à qui appartient ce compte Stripe ; un événement d'un autre compte est ignoré. */
async function coachDuCompte(compte: Compte) {
  if (!compte) return undefined;
  const { data } = await admin.from('coachs').select('id').eq('stripe_compte', compte.stripeAccount).maybeSingle();
  return data?.id as string | undefined;
}

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

/** Prévient le coach sur son téléphone. Sans appareil enregistré ou si l'envoi échoue, rien ne bloque le reste. */
async function prevenirCoach(coachId: string, titre: string, corps: string, url: string) {
  try {
    const { data: coach } = await admin.from('coachs').select('user_id').eq('id', coachId).single();
    if (!coach?.user_id) return;
    const { data: appareils } = await admin.from('appareils_push').select('jeton').eq('user_id', coach.user_id);
    if (!appareils?.length) return;
    await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(appareils.map((a) => ({ to: a.jeton, title: titre, body: corps, data: { url, genre: 'paiement' }, sound: 'default', channelId: 'messages', priority: 'high' }))),
    });
  } catch (e) {
    console.error('notification coach', e);
  }
}

/** Paiement par le lien partageable, sans fiche : on retrouve la personne par son e-mail chez ce coach, sinon on crée sa fiche. */
async function ficheNouveauClient(coachId: string, offreId: string, details: Stripe.Checkout.Session.CustomerDetails | null, clientStripe: string | null) {
  const email = details?.email?.trim().toLowerCase() || null;
  if (email) {
    const { data } = await admin.from('clients').select(CHAMPS_FICHE).eq('coach_id', coachId).ilike('email', email).limit(1).maybeSingle();
    if (data) {
      await admin.from('clients').update({ offre_id: offreId, ...(clientStripe ? { stripe_client: clientStripe } : {}) }).eq('id', data.id);
      return { ...data, offre_id: offreId } as Fiche;
    }
  }
  const [prenom, ...reste] = (details?.name?.trim() || email?.split('@')[0] || 'Nouveau client').split(/\s+/);
  const nom = reste.join(' ');
  const { data: cree, error } = await admin
    .from('clients')
    .insert({ coach_id: coachId, prenom, nom, email, telephone: details?.phone ?? null, offre_id: offreId, stripe_client: clientStripe, paiement: 'stripe' })
    .select(CHAMPS_FICHE)
    .single();
  if (error) throw error;
  // Le coach le retrouve dans ses contacts, prêt à recevoir son accès à l'appli.
  await admin.from('contacts').insert({ coach_id: coachId, prenom, nom, email, statut: 'client', source: 'Paiement en ligne', client_id: cree.id });
  return cree as Fiche;
}

async function appliquerAbonnement(abo: Stripe.Subscription, compte: Compte) {
  const fiche = await ficheDe(abo.id, abo.metadata?.client_id);
  if (!fiche) return;
  const coachId = await coachDuCompte(compte);
  if (compte && fiche.coach_id !== coachId) return;
  // Un ancien abonnement remplacé par un nouveau ne touche plus à la fiche.
  if (fiche.stripe_abonnement && fiche.stripe_abonnement !== abo.id && abo.status !== 'active' && abo.status !== 'trialing') return;
  const ouvert = statutOuvreAcces(abo.status);
  // Selon la version de l'API Stripe, la fin de période est sur l'abonnement ou sur sa ligne.
  const ligne = abo.items.data[0];
  const fin = (ligne as unknown as { current_period_end?: number } | undefined)?.current_period_end ?? (abo as unknown as { current_period_end?: number }).current_period_end;
  const offre = await lireOffre(abo.metadata?.offre_id ?? fiche.offre_id);
  const champs: Record<string, unknown> = {
    paiement: 'stripe',
    stripe_abonnement: abo.id,
    stripe_client: typeof abo.customer === 'string' ? abo.customer : abo.customer.id,
    statut_stripe: abo.status,
    prochaine_echeance: ouvert && !abo.cancel_at_period_end && fin ? jour(fin) : null,
  };
  // Le prix réellement payé reste celui du tarif Stripe de l'abonnement : un changement de prix de l'offre ne le touche pas.
  if (ligne?.price?.unit_amount != null) champs.offre_prix = ligne.price.unit_amount / 100;
  if (offre && offre.coach_id === fiche.coach_id) {
    champs.offre_id = offre.id;
    // Accès ouvert : les droits suivent l'offre. Accès coupé : plus d'appli.
    Object.assign(champs, ouvert ? droitsOffre(offre) : { acces_appli: false });
  } else champs.acces_appli = ouvert;
  await admin.from('clients').update(champs).eq('id', fiche.id);
}

/** Séances de l'offre créditées une fois par période payée (ou une fois pour un pack). */
async function crediterSeances(fiche: Fiche, offre: Awaited<ReturnType<typeof lireOffre>>, debut: number, reference: string) {
  if (!offre?.seances) return;
  // Déjà crédité pour cette référence : la base refuse le doublon.
  await admin
    .from('packs_seances')
    .insert({ coach_id: fiche.coach_id, client_id: fiche.id, seances_total: offre.seances, prix: offre.periodicite === 'unique' ? Number(offre.prix) : 0, achete_le: jour(debut), reference });
}

/** Ligne « Payé » dans la Gestion du coach ; complète celle du mois si elle avait été préparée à la main. */
async function lignePaiement(fiche: Fiche, reference: string, titre: string, date: number, paye: number, prix: number) {
  const remise = Math.max(0, Math.round((prix - paye) * 100) / 100);
  const { data: contact } = await admin.from('contacts').select('id').eq('client_id', fiche.id).limit(1).maybeSingle();
  const ligne = {
    coach_id: fiche.coach_id,
    titre: `${titre} · ${fiche.prenom}${paye === 0 && prix > 0 ? ' · offert' : ''}`,
    contact_id: contact?.id ?? null,
    date: jour(date),
    montant: paye,
    moyen: 'Stripe',
    statut: 'Payé',
    notes: remise > 0 ? `Prix ${prix} €, remise ${remise} €` : null,
    reference,
  };
  const { data: existante } = await admin.from('paiements').select('id').eq('coach_id', fiche.coach_id).eq('reference', reference).maybeSingle();
  if (existante) await admin.from('paiements').update(ligne).eq('id', existante.id);
  else await admin.from('paiements').insert(ligne);
}

async function enregistrerFacture(facture: Stripe.Invoice, compte: Compte) {
  // Selon la version de l'API Stripe, l'abonnement est sur la facture ou dans parent.subscription_details.
  type Details = { subscription?: string | { id: string }; metadata?: Record<string, string> };
  const f0 = facture as unknown as { subscription?: string | { id: string } | null; subscription_details?: Details; parent?: { subscription_details?: Details } };
  const abonnementId = f0.subscription ?? f0.parent?.subscription_details?.subscription;
  if (!abonnementId) return;
  const meta = (f0.subscription_details ?? f0.parent?.subscription_details)?.metadata;
  // La facture peut arriver avant que la fiche connaisse son abonnement : on la retrouve alors par l'identifiant du client.
  const fiche = await ficheDe(typeof abonnementId === 'string' ? abonnementId : abonnementId.id, meta?.client_id);
  if (!fiche) return;
  if (compte && fiche.coach_id !== (await coachDuCompte(compte))) return;
  const debut = facture.lines.data[0]?.period?.start ?? facture.created;
  const mois = jour(debut).slice(0, 7);
  const prix = (facture.subtotal ?? 0) / 100;
  // Facture à 0 € d'un essai gratuit : rien à noter.
  if (prix === 0) return;
  await lignePaiement(fiche, `abonnement:${mois}:${fiche.id}`, `Abonnement ${mois.split('-').reverse().join('/')}`, facture.created, (facture.amount_paid ?? 0) / 100, prix);
  await crediterSeances(fiche, await lireOffre(meta?.offre_id ?? fiche.offre_id), debut, `offre:${mois}`);
}

async function paiementTermine(s: Stripe.Checkout.Session, compte: Compte) {
  const coachId = await coachDuCompte(compte);
  if (compte && !coachId) return;
  const offre = await lireOffre(s.metadata?.offre_id);
  const clientStripe = typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null);
  let fiche = await ficheDe(undefined, s.metadata?.client_id);
  if (fiche && coachId && fiche.coach_id !== coachId) return;
  const nouveau = !fiche;
  if (!fiche && offre && (!coachId || offre.coach_id === coachId)) fiche = await ficheNouveauClient(offre.coach_id, offre.id, s.customer_details, clientStripe);
  if (!fiche) return;
  // Une seule fois, quand l'argent est là (un paiement différé arrive en deux événements).
  if (offre && s.payment_status !== 'unpaid') {
    const { data: contact } = await admin.from('contacts').select('id').eq('client_id', fiche.id).limit(1).maybeSingle();
    await prevenirCoach(
      fiche.coach_id,
      nouveau ? 'Nouveau client payé en ligne' : 'Paiement reçu',
      nouveau ? `${fiche.prenom} a pris « ${offre.nom} ». Crée son accès à l’appli depuis sa fiche.` : `${fiche.prenom} a payé « ${offre.nom} ».`,
      contact ? `/coach?onglet=crm&rubrique=Contacts&contact=${contact.id}` : '/coach?onglet=crm&rubrique=Contacts',
    );
  }

  if (s.mode === 'subscription' && s.subscription) {
    // L'abonnement sait désormais à quelle fiche il appartient (utile pour un nouveau client créé ci-dessus).
    const id = typeof s.subscription === 'string' ? s.subscription : s.subscription.id;
    let abo = await stripe.subscriptions.retrieve(id, compte);
    if (abo.metadata?.client_id !== fiche.id) abo = await stripe.subscriptions.update(id, { metadata: { ...abo.metadata, client_id: fiche.id } }, compte);
    await appliquerAbonnement(abo, compte);
    // La première facture a pu arriver avant que la fiche existe : on la note maintenant (sans doublon possible).
    const facture = abo.latest_invoice ? await stripe.invoices.retrieve(typeof abo.latest_invoice === 'string' ? abo.latest_invoice : abo.latest_invoice.id, compte) : undefined;
    if (facture?.status === 'paid') await enregistrerFacture(facture, compte);
    return;
  }
  // Pack payé en une fois : séances créditées et ligne « Payé ».
  if (s.mode === 'payment' && s.payment_status === 'paid' && offre) {
    if (clientStripe) await admin.from('clients').update({ stripe_client: clientStripe }).eq('id', fiche.id);
    const quand = s.created;
    await crediterSeances(fiche, offre, quand, `achat:${s.id}`);
    await lignePaiement(fiche, `achat:${s.id}`, offre.nom, quand, (s.amount_total ?? 0) / 100, (s.amount_subtotal ?? 0) / 100);
  }
}

async function compteMisAJour(compte: Stripe.Account) {
  await admin
    .from('coachs')
    .update({ stripe_pret: !!compte.charges_enabled && !!compte.details_submitted })
    .eq('stripe_compte', compte.id);
}

/** Vérifie la signature avec le secret du webhook des comptes connectés, ou celui de la plateforme. */
async function lireEvenement(corps: string, signature: string) {
  const secrets = [Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET'), Deno.env.get('STRIPE_WEBHOOK_SECRET')].filter((s): s is string => !!s);
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(corps, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
    } catch {
      /* essai suivant */
    }
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (!Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') && !Deno.env.get('STRIPE_WEBHOOK_SECRET')) return new Response('STRIPE_CONNECT_WEBHOOK_SECRET manquant', { status: 503 });
  const corps = await req.text();
  const evt = await lireEvenement(corps, req.headers.get('stripe-signature') ?? '');
  if (!evt) return new Response('Signature invalide', { status: 400 });
  const compte: Compte = evt.account ? { stripeAccount: evt.account } : undefined;

  // Déjà reçu : Stripe renvoie parfois le même événement.
  const { error: doublon } = await admin.from('stripe_evenements').insert({ id: evt.id, type: evt.type });
  if (doublon) return new Response('déjà traité');

  try {
    switch (evt.type) {
      case 'account.updated':
        await compteMisAJour(evt.data.object);
        break;
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await paiementTermine(evt.data.object, compte);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await appliquerAbonnement(evt.data.object, compte);
        break;
      case 'invoice.paid':
        await enregistrerFacture(evt.data.object, compte);
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
