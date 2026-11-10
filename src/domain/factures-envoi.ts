// Envoi d'une facture depuis la fiche client : nom de fichier lisible, message WhatsApp et e-mail prêts,
// au prénom du client et signés par le coach. Règles pures, sans appareil ni stockage.
import type { Facture } from './factures';

export interface Signature {
  /** « Sylvain » */
  prenom: string;
  telephone?: string;
  email?: string;
}

const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;

/** Caractères refusés par Android, iOS ou Windows dans un nom de fichier. */
const propre = (t: string) =>
  t
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** « Facture YC253 - Angelo Callegaro - Séances d'octobre 2026.pdf » */
export function nomFichierFacture(f: Pick<Facture, 'numero' | 'objet' | 'destinataire'>): string {
  const morceaux = [`Facture ${f.numero}`, f.destinataire.nom, f.objet].map((m) => propre(m ?? '')).filter(Boolean);
  return `${morceaux.join(' - ').slice(0, 120)}.pdf`;
}

/** « SCHIETSE Sylvain » → « Sylvain » : le nom de famille en capitales est laissé de côté. */
export function prenomEmetteur(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  const prenoms = mots.filter((m) => m !== m.toUpperCase() || m.length < 2);
  return (prenoms.length ? prenoms : mots).join(' ');
}

/** « Séances d'octobre 2026 » → « séances d'octobre 2026 » (un sigle en capitales reste tel quel). */
function objetDansLaPhrase(objet: string): string {
  const o = objet.trim();
  if (!o) return '';
  const premier = o.split(/\s/)[0];
  return premier === premier.toUpperCase() ? o : o.charAt(0).toLowerCase() + o.slice(1);
}

/** « ta facture YC253 (séances d'octobre 2026), d’un montant de 400 € » */
function phraseFacture(f: Facture): string {
  const objet = objetDansLaPhrase(f.objet);
  const montant = f.total > 0 ? `, d’un montant de ${euros(f.total)}` : '';
  return `ta facture ${f.numero}${objet ? ` (${objet})` : ''}${montant}`;
}

function phraseReglement(f: Facture): string {
  if (f.total === 0) return 'Elle est offerte, c’est simplement pour tes papiers.';
  if (f.payeLe) return 'Elle est déjà réglée, c’est simplement pour tes papiers.';
  return 'Elle est à régler par virement : les coordonnées bancaires figurent sur la facture.';
}

const RAPPEL_APPLI = 'Tu la retrouves aussi dans ton espace CoachGo, rubrique « Mes factures ».';

/** Message WhatsApp : WhatsApp ne prend pas de pièce jointe par lien, la facture reste dans l'espace du client. */
export function messageWhatsAppFacture(f: Facture, prenomClient: string, s: Signature): string {
  const bonjour = prenomClient.trim() ? `Bonjour ${prenomClient.trim()},` : 'Bonjour,';
  return [bonjour, '', `Je t’envoie ${phraseFacture(f)}. ${phraseReglement(f)}`, RAPPEL_APPLI, '', 'Merci et à bientôt,', s.prenom].join('\n');
}

/** E-mail avec la facture en pièce jointe : objet, message sobre et signature complète. */
export function emailFacture(f: Facture, prenomClient: string, s: Signature): { sujet: string; corps: string } {
  const bonjour = prenomClient.trim() ? `Bonjour ${prenomClient.trim()},` : 'Bonjour,';
  const objet = f.objet.trim();
  const signature = [s.prenom, 'Coach sportif', s.telephone?.trim(), s.email?.trim()].filter(Boolean).join('\n');
  return {
    sujet: `Ta facture ${f.numero}${objet ? ` · ${objet}` : ''}`,
    corps: [
      bonjour,
      '',
      `Tu trouveras ci-joint ${phraseFacture(f)}.`,
      phraseReglement(f),
      RAPPEL_APPLI,
      '',
      'Merci pour ta confiance, et à bientôt.',
      '',
      'Très cordialement,',
      '',
      signature,
    ].join('\n'),
  };
}
