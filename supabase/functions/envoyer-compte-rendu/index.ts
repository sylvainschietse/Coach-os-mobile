// Transmet le PDF d'un compte rendu au scénario Make qui envoie l'e-mail au client (contrat repris de l'original).
// Le webhook reste dans les secrets Supabase (ZITE_MAKE_REPORT_WEBHOOK_URL, nom historique), jamais dans l'app.
// Un accusé de réception de Make n'est pas un e-mail envoyé : « Envoyé » n'est coché que si Make confirme
// sent=true pour ce document avec l'identifiant du message. Une tentative existante bloque tout nouvel envoi.
// Appelée avec le jeton du coach : les règles d'accès de la base vérifient que le document est le sien.

import { createClient } from 'npm:@supabase/supabase-js@2';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

const MESSAGES: Record<string, string> = {
  envoye: 'Envoi déjà confirmé : le compte rendu ne sera pas renvoyé.',
  en_cours: 'Une transmission est déjà en cours pour cette version.',
  transmis: 'Make a déjà reçu cette version. Vérifiez son résultat dans Make avant tout nouvel envoi.',
  echec: 'La dernière transmission n’a pas abouti. Vérifiez Make, puis relancez si aucun e-mail n’est parti.',
  bloque: 'Make a refusé la demande (crédits ou opérations épuisés). Relancez une fois Make rétabli.',
};

function webhook() {
  const brut = Deno.env.get('ZITE_MAKE_REPORT_WEBHOOK_URL');
  if (!brut) return null;
  try {
    const url = new URL(brut);
    return url.protocol === 'https:' && /^hook\.(?:[a-z0-9-]+\.)?(?:make\.com|integromat\.com)$/.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  let corps: { documentId?: string; relancer?: boolean; verifier?: boolean };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await db.auth.getUser();
  if (!moi.user) return repondre({ erreur: 'Connexion requise.' }, 401);

  const url = webhook();
  // Pour l'écran Automatisations : dit seulement si le raccordement est renseigné, sans jamais renvoyer l'adresse.
  if (corps.verifier) return repondre({ configure: !!url });
  if (!url) return repondre({ erreur: 'Make non raccordé : le webhook des comptes rendus n’est pas renseigné.' }, 503);
  if (!corps.documentId) return repondre({ erreur: 'Document manquant.' }, 400);

  const { data: d } = await db.from('documents').select('id, nom, version, chemin, nom_fichier, contact_id, booster_id, coaching_id').eq('id', corps.documentId).maybeSingle();
  if (!d) return repondre({ erreur: 'Document introuvable.' }, 404);
  const { data: c } = d.contact_id ? await db.from('contacts').select('id, prenom, email').eq('id', d.contact_id).maybeSingle() : { data: null };
  if (!c?.email) return repondre({ erreur: 'Ajoutez d’abord l’e-mail du contact.' }, 400);

  const { data: reserve, error: refus } = await db.rpc('reserver_envoi_compte_rendu', {
    p_document: d.id, p_version: d.version, p_relancer: corps.relancer === true,
  });
  if (refus) return repondre({ erreur: refus.message }, 400);
  if (reserve !== 'ok') return repondre({ etat: reserve, message: MESSAGES[reserve] ?? 'Tentative déjà enregistrée.' }, 409);

  const noter = (etat: string, detail: string) => db.rpc('noter_envoi_compte_rendu', { p_document: d.id, p_version: d.version, p_etat: etat, p_detail: detail });
  const { data: signe } = await db.storage.from('documents').createSignedUrl(d.chemin, 3600);
  if (!signe) {
    await noter('echec', 'PDF inaccessible : rien n’a été transmis à Make.');
    return repondre({ etat: 'echec', message: 'PDF inaccessible : rien n’a été transmis.' }, 500);
  }

  const cle = `${d.id}:${d.version}`;
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': cle },
      body: JSON.stringify({
        event: 'coachos.report.send', schemaVersion: 1, idempotencyKey: cle, documentId: d.id, contactId: c.id,
        boosterId: d.booster_id ?? null, coachingId: d.coaching_id ?? null, to: c.email, firstName: c.prenom ?? '',
        subject: d.nom || 'Votre compte rendu', pdfUrl: signe.signedUrl, filename: d.nom_fichier || 'compte-rendu.pdf',
      }),
    });
  } catch {
    await noter('echec', 'Résultat incertain : pas de réponse de Make. Vérifiez son journal avant de relancer.');
    return repondre({ etat: 'echec', message: 'Transmission non confirmée. Vérifiez Make pour éviter un doublon.' }, 502);
  }

  const texte = await reponse.text();
  if (!reponse.ok) {
    const bloque = reponse.status === 402 || reponse.status === 429 || /credit|operation|quota/i.test(texte);
    await noter(bloque ? 'bloque' : 'echec', `Make a répondu HTTP ${reponse.status}`);
    return repondre({ etat: bloque ? 'bloque' : 'echec', message: bloque ? MESSAGES.bloque : `Make a répondu HTTP ${reponse.status}.` }, 502);
  }
  let ack: { sent?: unknown; documentId?: unknown; providerMessageId?: unknown } = {};
  try {
    ack = JSON.parse(texte);
  } catch {
    // Make répond souvent « Accepted » en texte : c'est un accusé de réception, pas un envoi.
  }
  const envoye = ack.sent === true && ack.documentId === d.id && typeof ack.providerMessageId === 'string' && ack.providerMessageId.length > 0;
  await noter(envoye ? 'envoye' : 'transmis', envoye ? 'Envoi confirmé par le fournisseur de messagerie' : 'Make a reçu la demande. Envoi non encore confirmé.');
  return repondre({
    etat: envoye ? 'envoye' : 'transmis',
    message: envoye ? 'Compte rendu envoyé et confirmé.' : 'Demande reçue par Make. Envoi au client non encore confirmé.',
  });
});
