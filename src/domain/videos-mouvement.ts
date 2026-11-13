// Vidéos de mouvement : le client filme un exercice pendant sa séance (60 s au plus), le coach la regarde
// à côté des charges et répétitions, puis répond par écrit et/ou par un vocal. Effacées 30 jours après l'envoi.
import type { RealisationLue } from './entrainement-etat';

export const DUREE_MAX_S = 60;
/** Tolérance sur la durée lue dans la galerie (arrondis des téléphones). */
const MARGE_DUREE_S = 2;
export const TAILLE_MAX = 25 * 1024 * 1024;
export const CONSERVATION_JOURS = 30;
export const DUREE_MAX_VOCAL_S = 180;
export const MAX_COMMENTAIRE = 500;
export const MAX_REPONSE = 2000;

/** Réglages d'enregistrement dans l'appli : 720p à 2,5 Mb/s, soit environ 19 Mo pour une minute. */
export const QUALITE_ENREGISTREMENT = { videoQuality: '720p' as const, videoBitrate: 2_500_000 };

export type VideoMouvement = {
  id: string;
  clientId: string;
  realisationId?: string;
  seanceId?: string;
  ligneId?: string;
  exerciceId?: string;
  exerciceNom: string;
  seanceTitre?: string;
  chemin: string;
  typeFichier: string;
  taille: number;
  dureeS?: number;
  commentaire?: string;
  creeLe: string;
  expireLe: string;
  vueLe?: string;
  reponseTexte?: string;
  reponseAudio?: string;
  reponseAudioType?: string;
  reponseAudioDureeS?: number;
  reponseLe?: string;
};

/** Ce que la séance connaît au moment de filmer. */
export type ContexteVideo = {
  clientId: string;
  realisationId?: string;
  seanceId?: string;
  ligneId?: string;
  exerciceId?: string;
  exerciceNom: string;
  seanceTitre?: string;
};

export type FichierVideo = { type: string; taille: number; dureeS?: number };

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

/** « video/webm;codecs=vp9 » → « video/webm ». */
export const typeSimple = (t: string) => t.split(';')[0].trim().toLowerCase();

/** Type de la vidéo d'après son nom quand le téléphone ne le donne pas. */
export function typeVideo(type: string | undefined | null, nom?: string | null): string {
  const t = type ? typeSimple(type) : '';
  if (t.startsWith('video/')) return t;
  const ext = nom?.split('.').pop()?.toLowerCase();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === '3gp') return 'video/3gpp';
  return 'video/mp4';
}

/** Message de refus, ou null si la vidéo peut partir. */
export function verifierVideo(f: FichierVideo): string | null {
  if (!EXTENSIONS[typeSimple(f.type)] || !typeSimple(f.type).startsWith('video/')) return 'Ce format de vidéo n’est pas pris en charge (MP4, MOV ou WebM).';
  if (f.dureeS !== undefined && f.dureeS > DUREE_MAX_S + MARGE_DUREE_S) return `La vidéo dure ${Math.round(f.dureeS)} s : ${DUREE_MAX_S} s au plus. Coupez-la ou filmez une seule série.`;
  if (f.taille <= 0) return 'La vidéo est vide.';
  if (f.taille > TAILLE_MAX) {
    const mo = (f.taille / 1024 / 1024).toFixed(0);
    return `La vidéo pèse ${mo} Mo : 25 Mo au plus. Filmez-la depuis l’appli (« Filmer »), elle sera compressée.`;
  }
  return null;
}

export function verifierVocal(f: FichierVideo): string | null {
  if (!typeSimple(f.type).startsWith('audio/') || !EXTENSIONS[typeSimple(f.type)]) return 'Format de vocal non pris en charge.';
  if (f.taille <= 0) return 'Le vocal est vide.';
  if (f.taille > TAILLE_MAX) return 'Le vocal est trop lourd.';
  if (f.dureeS !== undefined && f.dureeS > DUREE_MAX_VOCAL_S + MARGE_DUREE_S) return `Le vocal dépasse ${DUREE_MAX_VOCAL_S / 60} minutes.`;
  return null;
}

export const extension = (type: string) => EXTENSIONS[typeSimple(type)] ?? 'bin';
export const cheminVideo = (clientId: string, id: string, type: string) => `${clientId}/${id}.${extension(type)}`;
export const cheminVocal = (clientId: string, id: string, type: string, quand: Date) => `${clientId}/${id}-reponse-${quand.getTime()}.${extension(type)}`;

export function nouvelleVideo(id: string, c: ContexteVideo, f: FichierVideo, commentaire: string, maintenant: Date): VideoMouvement {
  return {
    id,
    clientId: c.clientId,
    realisationId: c.realisationId,
    seanceId: c.seanceId,
    ligneId: c.ligneId,
    exerciceId: c.exerciceId,
    exerciceNom: c.exerciceNom.trim() || 'Exercice',
    seanceTitre: c.seanceTitre,
    chemin: cheminVideo(c.clientId, id, f.type),
    typeFichier: typeSimple(f.type),
    taille: f.taille,
    dureeS: f.dureeS !== undefined ? Math.max(1, Math.min(DUREE_MAX_S, Math.round(f.dureeS))) : undefined,
    commentaire: commentaire.trim().slice(0, MAX_COMMENTAIRE) || undefined,
    creeLe: maintenant.toISOString(),
    expireLe: new Date(maintenant.getTime() + CONSERVATION_JOURS * 86_400_000).toISOString(),
  };
}

export const expiree = (v: Pick<VideoMouvement, 'expireLe'>, maintenant: Date) => new Date(v.expireLe).getTime() <= maintenant.getTime();

/** Jours avant l’effacement, au plus proche (0 = dans les prochaines heures). */
export const joursRestants = (v: Pick<VideoMouvement, 'expireLe'>, maintenant: Date) =>
  Math.max(0, Math.round((new Date(v.expireLe).getTime() - maintenant.getTime()) / 86_400_000));

export const aReponse = (v: VideoMouvement) => !!(v.reponseTexte?.trim() || v.reponseAudio);

export type StatutVideo = 'nouvelle' | 'vue' | 'repondue';
export const statutVideo = (v: VideoMouvement): StatutVideo => (aReponse(v) ? 'repondue' : v.vueLe ? 'vue' : 'nouvelle');

/** Pour le coach : d'abord celles sans réponse (les plus anciennes en premier, elles expirent avant), puis les répondues. */
export function ordreCoach(videos: VideoMouvement[], maintenant: Date): VideoMouvement[] {
  const vivantes = videos.filter((v) => !expiree(v, maintenant));
  const attente = vivantes.filter((v) => !aReponse(v)).sort((a, b) => a.creeLe.localeCompare(b.creeLe));
  const repondues = vivantes.filter(aReponse).sort((a, b) => (b.reponseLe ?? b.creeLe).localeCompare(a.reponseLe ?? a.creeLe));
  return [...attente, ...repondues];
}

/** Pour le client dans sa séance : ses vidéos de cet exercice, la plus récente d'abord. */
export function videosDeLExercice(videos: VideoMouvement[], l: { id: string; exercice: { id: string } }, maintenant: Date) {
  return videos
    .filter((v) => !expiree(v, maintenant) && (v.ligneId === l.id || (!!v.exerciceId && v.exerciceId === l.exercice.id)))
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
}

/** La séance enregistrée et les séries de l'exercice filmé, à montrer au coach à côté de la vidéo. */
export function contexteSeance(v: VideoMouvement, realisations: RealisationLue[]) {
  const r = v.realisationId ? realisations.find((x) => x.id === v.realisationId) : undefined;
  if (!r) return undefined;
  const series = r.series
    .filter((s) => (v.ligneId ? s.ligneId === v.ligneId : s.exerciceId === v.exerciceId))
    .sort((a, b) => a.index - b.index);
  return { realisation: r, series };
}

/** « 0:42 » */
export const dureeLisible = (s?: number) => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
