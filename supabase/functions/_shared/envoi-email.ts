// Lot 6 · Envoi direct de l'e-mail du compte rendu par Brevo, sans scénario Make (Make n'a plus de crédit).
// La fonction Edge `envoyer-compte-rendu` prépare la demande et lit la réponse avec ces fonctions.
// Une réponse 201 avec messageId veut dire que Brevo a accepté l'e-mail, pas qu'il est lu : c'est la même preuve que le
// providerMessageId exigé de Make. Ce fichier est aussi copié dans supabase/functions/_shared (Deno) : aucune dépendance.

export const API_BREVO = 'https://api.brevo.com/v3/smtp/email';

export type EtatEnvoi = 'envoye' | 'transmis' | 'echec' | 'bloque';

/** Traduit la réponse de Brevo. Sans messageId, rien n'est compté comme envoyé ni relancé d'office. Crédits ou limite atteints : blocage. */
export function lireReponseBrevo(status: number, texte: string): { etat: EtatEnvoi; detail: string } {
  let corps: { messageId?: unknown; code?: unknown; message?: unknown } = {};
  try {
    corps = JSON.parse(texte);
  } catch {
    // Réponse non JSON : traitée selon le seul code HTTP.
  }
  const id = typeof corps.messageId === 'string' ? corps.messageId : '';
  if (status >= 200 && status < 300) {
    return id ? { etat: 'envoye', detail: `E-mail accepté par Brevo (${id})` } : { etat: 'transmis', detail: 'Brevo a reçu la demande sans identifiant de message : envoi non confirmé.' };
  }
  const message = typeof corps.message === 'string' ? corps.message : '';
  if (status === 402 || status === 429 || /credit|quota|limit/i.test(message)) return { etat: 'bloque', detail: `Brevo a refusé l’envoi (HTTP ${status}) : quota ou crédits atteints.` };
  if (status === 401) return { etat: 'echec', detail: 'Brevo refuse la clé d’API (BREVO_API_KEY) : rien n’a été envoyé.' };
  if (/sender/i.test(message)) return { etat: 'echec', detail: 'Adresse d’expédition non validée dans Brevo : rien n’a été envoyé.' };
  return { etat: 'echec', detail: `Brevo a répondu HTTP ${status}${message ? ` : ${message}` : ''}` };
}
