// Messagerie coach-client : un fil par client, avec du texte, des photos, des vidéos et des vocaux.
// Les vidéos du client (ici ou depuis sa séance) sont comptées chaque mois face à celles incluses dans sa formule.
import { extension, typeSimple } from './videos-mouvement';

export const MAX_TEXTE = 2000;
export const TAILLE_MAX_PIECE = 25 * 1024 * 1024;
export const DUREE_MAX_VIDEO_S = 60;
export const DUREE_MAX_VOCAL_S = 300;
/** Les vidéos sont effacées au bout de 30 jours, comme les vidéos de mouvement. */
export const CONSERVATION_VIDEOS_JOURS = 30;

export type Auteur = 'coach' | 'client';
export type GenrePiece = 'photo' | 'video' | 'vocal';

export interface Message {
  id: string;
  clientId: string;
  auteur: Auteur;
  texte?: string;
  pieceChemin?: string;
  pieceType?: string;
  pieceTaille?: number;
  pieceDureeS?: number;
  /** Vidéo effacée après 30 jours : le message reste. */
  pieceExpiree?: boolean;
  creeLe: string;
  luLe?: string;
}

export interface Conversation {
  clientId: string;
  prenom: string;
  nom: string;
  dernier?: { texte?: string; pieceType?: string; auteur: Auteur; le: string };
  nonLus: number;
}

export type PieceJointe = { type: string; taille: number; dureeS?: number };

const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export function genrePiece(type?: string): GenrePiece | undefined {
  const t = type ? typeSimple(type) : '';
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'vocal';
  return undefined;
}

export const extensionPiece = (type: string) => {
  const t = typeSimple(type);
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/heic') return 'heic';
  return extension(t);
};
export const cheminPiece = (clientId: string, id: string, type: string) => `${clientId}/${id}.${extensionPiece(type)}`;

/** Message de refus, ou null si la pièce jointe peut partir. */
export function verifierPiece(p: PieceJointe): string | null {
  const t = typeSimple(p.type);
  const genre = genrePiece(t);
  if (!genre || (genre === 'photo' && !TYPES_PHOTO.includes(t)) || (genre !== 'photo' && extension(t) === 'bin'))
    return 'Ce fichier n’est pas pris en charge : photo, vidéo ou vocal seulement.';
  if (p.taille <= 0) return 'Le fichier est vide.';
  if (p.taille > TAILLE_MAX_PIECE) return `Le fichier pèse ${Math.round(p.taille / 1024 / 1024)} Mo : 25 Mo au plus.`;
  if (genre === 'video' && p.dureeS !== undefined && p.dureeS > DUREE_MAX_VIDEO_S + 2) return `La vidéo dure ${Math.round(p.dureeS)} s : ${DUREE_MAX_VIDEO_S} s au plus.`;
  if (genre === 'vocal' && p.dureeS !== undefined && p.dureeS > DUREE_MAX_VOCAL_S + 2) return `Le vocal dépasse ${DUREE_MAX_VOCAL_S / 60} minutes.`;
  return null;
}

/** Message de refus d'un envoi (texte et/ou pièce jointe), ou null. */
export function verifierEnvoi(texte: string, piece?: PieceJointe): string | null {
  if (!texte.trim() && !piece) return 'Écris un message ou ajoute une photo, une vidéo ou un vocal.';
  if (texte.length > MAX_TEXTE) return `Message trop long : ${MAX_TEXTE} caractères au plus.`;
  return piece ? verifierPiece(piece) : null;
}

export function nouveauMessage(id: string, clientId: string, auteur: Auteur, texte: string, piece: PieceJointe | undefined, maintenant: Date): Message {
  return {
    id,
    clientId,
    auteur,
    texte: texte.trim() || undefined,
    pieceChemin: piece ? cheminPiece(clientId, id, piece.type) : undefined,
    pieceType: piece ? typeSimple(piece.type) : undefined,
    pieceTaille: piece?.taille,
    pieceDureeS: piece?.dureeS !== undefined ? Math.max(1, Math.round(piece.dureeS)) : undefined,
    creeLe: maintenant.toISOString(),
  };
}

/** Messages de l'autre personne pas encore lus par moi. */
export const nonLus = (messages: Message[], moi: Auteur) => messages.filter((m) => m.auteur !== moi && !m.luLe);

/** Vidéo du coach ou du client de plus de 30 jours, à effacer. */
export const videoAPurger = (m: Message, maintenant: Date) =>
  !!m.pieceChemin && genrePiece(m.pieceType) === 'video' && maintenant.getTime() - new Date(m.creeLe).getTime() > CONSERVATION_VIDEOS_JOURS * 86_400_000;

/** « Photo », « Vidéo (0:42) », ou le début du texte : aperçu d'un message dans une liste ou une notification. */
export function apercu(m: { texte?: string; pieceType?: string }, longueur = 80): string {
  const t = m.texte?.trim().replace(/\s+/g, ' ');
  if (t) return t.length > longueur ? `${t.slice(0, longueur - 1)}…` : t;
  const genre = genrePiece(m.pieceType);
  return genre === 'photo' ? 'Photo' : genre === 'video' ? 'Vidéo' : genre === 'vocal' ? 'Message vocal' : 'Message';
}

// ---------- Dates (heure de Paris) ----------

const PARIS = 'Europe/Paris';
const jourParis = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: PARIS });

/** Premier jour du mois en cours à Paris, « AAAA-MM-01 ». */
export const debutMois = (maintenant: Date) => `${jourParis(maintenant).slice(0, 7)}-01`;

/** Envoyée pendant le mois en cours (heure de Paris) ? */
export const duMois = (iso: string, maintenant: Date) => jourParis(new Date(iso)).slice(0, 7) === jourParis(maintenant).slice(0, 7);

/** Nombre de vidéos envoyées par le client ce mois-ci : messages vidéo + vidéos de mouvement. */
export function videosEnvoyeesDuMois(messages: Pick<Message, 'auteur' | 'pieceType' | 'creeLe'>[], videosMouvement: { creeLe: string }[], maintenant: Date) {
  const parMessage = messages.filter((m) => m.auteur === 'client' && genrePiece(m.pieceType) === 'video' && duMois(m.creeLe, maintenant)).length;
  return parMessage + videosMouvement.filter((v) => duMois(v.creeLe, maintenant)).length;
}

/** « 14:32 » aujourd'hui, « hier 14:32 », sinon « 3 nov. 14:32 ». */
export function heureMessage(iso: string, maintenant: Date) {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' });
  const jour = jourParis(d);
  if (jour === jourParis(maintenant)) return heure;
  if (jour === jourParis(new Date(maintenant.getTime() - 86_400_000))) return `hier ${heure}`;
  return `${d.toLocaleDateString('fr-FR', { timeZone: PARIS, day: 'numeric', month: 'short' })} ${heure}`;
}

/** Les messages triés du plus ancien au plus récent, pour l'affichage du fil. */
export const ordreFil = (messages: Message[]) => [...messages].sort((a, b) => a.creeLe.localeCompare(b.creeLe));

/** Conversations : non lues d'abord, puis la plus récente. */
export const ordreConversations = (c: Conversation[]) =>
  [...c].sort((a, b) => Number(b.nonLus > 0) - Number(a.nonLus > 0) || (b.dernier?.le ?? '').localeCompare(a.dernier?.le ?? '') || a.prenom.localeCompare(b.prenom));
