// C07 Documents et U11 Mes documents : règles pures, sans stockage.
// Un document = une ligne versionnée ; chaque nouveau fichier en est une nouvelle version, et c'est
// la version courante qui est servie partout (espace client comme e-mail).
import { jourLocal, type Contact } from './crm';

/** Choix de Champs-CRM.json (table Documents). */
export const TYPES_DOCUMENT = ["Plan d'action", 'Contrat', 'Facture', 'Bilan', 'Avant / Après', 'Photo', 'Autre'] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const TAILLE_MAX = 10 * 1024 * 1024;
export const FORMATS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

export interface Document {
  id: string;
  contactId?: string;
  boosterId?: string;
  nom: string;
  type: TypeDocument;
  /** AAAA-MM-JJ. */
  date: string;
  version: number;
  /** Fichier de la version courante dans le compartiment privé ; absent tant qu'aucun fichier n'est déposé. */
  chemin?: string;
  nomFichier?: string;
  typeFichier?: string;
  taille?: number;
  partageClient: boolean;
  /** Vrai seulement si l'envoi est confirmé : ouvrir une messagerie ne suffit pas. */
  envoye: boolean;
  /** Notes internes du coach, jamais servies au client. */
  commentaires?: string;
  creeLe: string;
  modifieLe: string;
}

/** Ce que le client reçoit : ni commentaires, ni drapeaux internes. */
export type DocumentClient = Pick<Document, 'id' | 'nom' | 'type' | 'date' | 'version' | 'chemin' | 'nomFichier' | 'typeFichier' | 'taille'>;

export interface SaisieDocument {
  nom?: string;
  contactId?: string | null;
  boosterId?: string | null;
  type?: TypeDocument;
  date?: string;
  envoye?: boolean;
  commentaires?: string | null;
}

/** Fichier choisi sur l'appareil, avant dépôt. */
export interface FichierChoisi {
  nom: string;
  type: string;
  taille: number;
}

export function verifierFichier(f: FichierChoisi, max = TAILLE_MAX): string | undefined {
  if (!(FORMATS as readonly string[]).includes(f.type)) return 'Format refusé : déposez un PDF ou une image (JPEG, PNG, WebP, HEIC).';
  if (f.taille > max) return `Fichier trop lourd : ${Math.ceil(f.taille / 1024 / 1024)} Mo pour ${Math.round(max / 1024 / 1024)} Mo au plus.`;
  if (f.taille === 0) return 'Ce fichier est vide.';
  return undefined;
}

/** Nom de fichier sans accents, espaces ni caractères refusés par le stockage. */
export function nomPropre(nom: string): string {
  const point = nom.lastIndexOf('.');
  const [base, ext] = point > 0 ? [nom.slice(0, point), nom.slice(point + 1)] : [nom, ''];
  const nettoie = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  const b = nettoie(base).slice(0, 60) || 'document';
  const e = nettoie(ext).slice(0, 8);
  return e ? `${b}.${e}` : b;
}

/** <coach>/<document>/v<version>-<nom> : chaque version a son propre fichier, rien n'est écrasé. */
export const cheminFichier = (coachId: string, documentId: string, version: number, nom: string) =>
  `${coachId}/${documentId}/v${version}-${nomPropre(nom)}`;

/** Version que prendra le prochain fichier : la première reste v1, les suivantes s'ajoutent. */
export const versionSuivante = (d: Pick<Document, 'version' | 'chemin'>) => (d.chemin ? d.version + 1 : d.version);

export function nouveauDocument(id: string, saisie: SaisieDocument, maintenant: Date): Document {
  const nom = saisie.nom?.trim();
  if (!nom) throw new Error('Donnez un nom au document.');
  if (!saisie.contactId) throw new Error('Choisissez un contact');
  const iso = maintenant.toISOString();
  return {
    id,
    nom,
    contactId: saisie.contactId,
    boosterId: saisie.boosterId ?? undefined,
    type: saisie.type ?? 'Autre',
    date: saisie.date ?? jourLocal(maintenant),
    version: 1,
    partageClient: false,
    envoye: saisie.envoye ?? false,
    commentaires: saisie.commentaires?.trim() || undefined,
    creeLe: iso,
    modifieLe: iso,
  };
}

export function modifierDocument(d: Document, saisie: SaisieDocument, maintenant: Date): Document {
  const nom = saisie.nom === undefined ? d.nom : saisie.nom.trim();
  if (!nom) throw new Error('Donnez un nom au document.');
  if (saisie.contactId === null) throw new Error('Choisissez un contact');
  const suivant = { ...d, nom, modifieLe: maintenant.toISOString() };
  if (saisie.contactId !== undefined) suivant.contactId = saisie.contactId;
  if (saisie.boosterId !== undefined) suivant.boosterId = saisie.boosterId ?? undefined;
  if (saisie.type) suivant.type = saisie.type;
  if (saisie.date) suivant.date = saisie.date;
  if (saisie.envoye !== undefined) suivant.envoye = saisie.envoye;
  if (saisie.commentaires !== undefined) suivant.commentaires = saisie.commentaires?.trim() || undefined;
  return suivant;
}

/** Nouveau fichier déposé : nouvelle version, et l'envoi confirmé ne vaut que pour l'ancienne. */
export function deposerVersion(d: Document, chemin: string, f: FichierChoisi, maintenant: Date): Document {
  return {
    ...d,
    version: versionSuivante(d),
    chemin,
    nomFichier: f.nom,
    typeFichier: f.type,
    taille: f.taille,
    envoye: false,
    modifieLe: maintenant.toISOString(),
  };
}

export const pourLeClient = (d: Document): DocumentClient => ({
  id: d.id,
  nom: d.nom,
  type: d.type,
  date: d.date,
  version: d.version,
  chemin: d.chemin,
  nomFichier: d.nomFichier,
  typeFichier: d.typeFichier,
  taille: d.taille,
});

/** Mes documents : partagés, avec fichier, et rattachés à un dossier de ce client seulement. */
export function documentsPartages(docs: Document[], contactsDuClient: string[]): DocumentClient[] {
  const siens = new Set(contactsDuClient);
  return docs
    .filter((d) => d.partageClient && d.chemin && d.contactId && siens.has(d.contactId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.modifieLe.localeCompare(a.modifieLe))
    .map(pourLeClient);
}

/** Recherche et filtre « Dossier : X » de la rubrique, plus récents d'abord. */
export function filtrerDocuments(docs: Document[], contacts: Pick<Contact, 'id' | 'prenom' | 'nom'>[], recherche: string, contactId?: string) {
  const q = recherche.trim().toLowerCase();
  const nom = new Map(contacts.map((c) => [c.id, `${c.prenom} ${c.nom}`.trim()]));
  return docs
    .filter((d) => !contactId || d.contactId === contactId)
    .filter((d) => !q || [d.nom, d.contactId && nom.get(d.contactId)].filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.modifieLe.localeCompare(a.modifieLe));
}

/** Nom d'origine (createBoosterReport) : un seul document par Booster, versionné. */
export const nomCompteRendu = (c: Pick<Contact, 'prenom' | 'nom'>) => `Compte rendu Booster · ${`${c.prenom} ${c.nom}`.trim()}`;

export const tailleLisible = (o?: number) =>
  o === undefined ? '' : o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
