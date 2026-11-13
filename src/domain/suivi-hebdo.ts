// Suivi de la semaine repris de l'app Zite (lot 4) : bilan hebdomadaire et synthèse automatique (lib/weekly.ts,
// lib/autoWeekly.ts), objectifs personnels (lib/goals.ts) et photos de progression (lib/photos.ts).
// La même synthèse est écrite en SQL dans la fonction enregistrer_bilan ; les tests vérifient qu'elles concordent.
import { ajouterJours, aujourdhuiParis, lundiDe } from './entrainement';

// ---------- Bilan de la semaine ----------

export const SCORES = [
  ['energie', 'Énergie', '1 = très faible · 10 = excellente'],
  ['sommeil', 'Qualité du sommeil', '1 = très mauvaise · 10 = excellente'],
  ['stress', 'Stress', '1 = très faible · 10 = très élevé'],
  ['motivation', 'Motivation', '1 = très faible · 10 = très forte'],
] as const;
export type CleScore = (typeof SCORES)[number][0];

export const TEXTES = [
  ['difficultes', 'Qu’est-ce qui a été difficile ?', 'Régularité, emploi du temps, exercices…', 2000],
  ['douleurs', 'Douleurs ou gênes à signaler ?', 'Facultatif : où, quand et pendant quel exercice ?', 1500],
  ['victoire', 'Une réussite cette semaine ?', 'Même une petite victoire compte.', 1000],
] as const;
export type CleTexte = (typeof TEXTES)[number][0];

export type ReponsesBilan = Record<CleScore, number> & Record<CleTexte, string> & { seances: number };

export type SourceRetour = 'Automatique' | 'Coach' | '';

export interface BilanHebdo {
  id: string;
  clientId: string;
  /** Prénom et nom du client, pour la liste du coach. */
  nom: string;
  /** Lundi de la semaine concernée. */
  semaine: string;
  reponses: ReponsesBilan;
  envoyeLe: string;
  retourCoach: string;
  priorite: string;
  reponduLe: string;
  sourceRetour: SourceRetour;
  aRevoir: boolean;
}

export const lundiCourant = (jour = aujourdhuiParis()) => lundiDe(jour);
export const finSemaine = (lundi: string) => ajouterJours(lundi, 6);

/** Les 8 dernières semaines proposées au client, la plus récente d'abord. */
export const semainesProposees = (jour = aujourdhuiParis()) => Array.from({ length: 8 }, (_, i) => ajouterJours(lundiCourant(jour), -7 * i));

export function semaineValide(d: string, jour = aujourdhuiParis()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d && lundiDe(d) === d && d <= lundiCourant(jour);
}

/** Message d'erreur, ou null si les réponses sont complètes (mêmes bornes que le schéma d'origine). */
export function erreurReponses(r: ReponsesBilan): string | null {
  const entier = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (SCORES.some(([k]) => !entier(r[k], 1, 10)) || !entier(r.seances, 0, 30)) return 'Complétez les quatre scores et le nombre de séances réalisées.';
  if (TEXTES.some(([k, , , max]) => typeof r[k] !== 'string' || r[k].length > max)) return 'Réponse trop longue.';
  return null;
}

const SANS_DOULEUR = /^(?:non|aucun(?:e)?(?: douleur(?:s)?| gêne(?:s)?)?|pas de (?:douleur(?:s)?|gêne(?:s)?)|ras|rien|0)[.! ]*$/i;

/** buildAutoWeekly d'origine : synthèse, priorité et « à vérifier » (douleur, énergie ou sommeil bas, stress élevé). */
export function syntheseAutomatique(a: ReponsesBilan, precedent: { semaine: string; reponses: ReponsesBilan } | null, cible: number | null) {
  const douleur = !!a.douleurs.trim() && !SANS_DOULEUR.test(a.douleurs.trim());
  const bas = a.energie <= 3 || a.sommeil <= 3;
  const stress = a.stress >= 8;
  const motivation = a.motivation <= 3;
  const s = (n: number) => (n > 1 ? 's' : '');
  const paragraphes = [
    `Tu as déclaré ${a.seances} séance${s(a.seances)} cette semaine${cible === null ? '.' : ` pour un objectif de ${cible} séance${s(cible)} dans ton programme.`}`,
    `Énergie : ${a.energie}/10 · sommeil : ${a.sommeil}/10 · stress : ${a.stress}/10 · motivation : ${a.motivation}/10.`,
  ];
  if (precedent) {
    const ecart = (n: number) => (n === 0 ? 'stable' : `${n > 0 ? '+' : ''}${n} point${Math.abs(n) > 1 ? 's' : ''}`);
    const p = precedent.reponses;
    paragraphes.push(
      `Par rapport au bilan du ${precedent.semaine.split('-').reverse().join('/')} : énergie ${ecart(a.energie - p.energie)}, sommeil ${ecart(a.sommeil - p.sommeil)}, motivation ${ecart(a.motivation - p.motivation)}.`,
    );
  }
  if (a.victoire.trim()) paragraphes.push(`Réussite que tu as signalée : ${a.victoire.trim()}`);
  if (a.difficultes.trim()) paragraphes.push(`Difficulté que tu as signalée : ${a.difficultes.trim()}`);
  if (douleur) paragraphes.push('Une douleur ou une gêne a été signalée : ton coach doit regarder ce point.');
  let priorite: string;
  if (douleur) priorite = 'Décrire à ton coach la gêne, le mouvement concerné et le moment où elle apparaît, pour faire le point avant de faire évoluer les charges.';
  else if (bas) priorite = 'Faire le point avec ton coach sur ton énergie et ton sommeil, puis convenir avec lui d’un rythme réaliste pour la semaine suivante.';
  else if (stress) priorite = 'Identifier la principale contrainte de la semaine et en parler à ton coach pour organiser les séances prévues autour de celle-ci.';
  else if (a.seances === 0 || (cible !== null && a.seances < cible))
    priorite =
      cible !== null
        ? `Bloquer dans ton agenda les ${cible} créneaux prévus par ton programme pour la semaine suivante, puis signaler au coach les éventuelles contraintes.`
        : 'Choisir avec ton coach les créneaux des séances prévues au programme pour la semaine suivante.';
  else if (motivation) priorite = 'Identifier avec ton coach un objectif simple et motivant pour la semaine suivante, en tenant compte de la difficulté que tu as signalée.';
  else if (a.sommeil <= 5) priorite = 'Choisir un horaire de coucher régulier cette semaine et noter ta qualité de sommeil dans le prochain bilan.';
  else if (a.difficultes.trim()) priorite = 'Choisir avec ton coach une solution concrète à la difficulté signalée, tout en gardant les séances prévues au programme.';
  else
    priorite =
      cible !== null
        ? `Planifier les ${cible} séances de la semaine suivante selon ton programme, et noter une réussite à partager au prochain bilan.`
        : 'Planifier les séances de la semaine suivante selon ton programme, et noter une réussite à partager au prochain bilan.';
  return { retourCoach: paragraphes.join('\n\n'), priorite, sourceRetour: 'Automatique' as const, aRevoir: douleur || bas || stress };
}

/** Ordre de la file du coach : à vérifier ou sans réponse d'abord, puis les semaines récentes. */
export const trierBilansCoach = (b: BilanHebdo[]) =>
  [...b].sort((x, y) => Number(!x.aRevoir && !!x.reponduLe) - Number(!y.aRevoir && !!y.reponduLe) || y.semaine.localeCompare(x.semaine));

export const aVerifier = (b: BilanHebdo) => !b.reponduLe || b.aRevoir;

// ---------- Objectifs ----------

export const UNITES_OBJECTIF = ['kg', 'répétitions', 'minutes', 'km', 'séances', 'cm'] as const;
export type UniteObjectif = (typeof UNITES_OBJECTIF)[number];

export interface ValeurObjectif {
  date: string;
  valeur: number;
  envoiId: string;
}

export interface Objectif {
  id: string;
  clientId: string;
  titre: string;
  unite: UniteObjectif;
  depart: number;
  cible: number;
  /** Date facultative (vide sinon). */
  echeance: string;
  historique: ValeurObjectif[];
  creeLe: string;
  modifieLe: string;
  atteintLe: string;
  archive: boolean;
  /** Dernier envoi appliqué (archiver, restaurer) : renvoyé deux fois, il ne fait rien de plus. */
  dernierEnvoi?: string;
}

export const progression = (depart: number, cible: number, actuel: number) => Math.max(0, Math.min(100, ((actuel - depart) / (cible - depart)) * 100));
export const atteint = (depart: number, cible: number, actuel: number) => (cible > depart ? actuel >= cible : actuel <= cible);
export const valeurActuelle = (o: Objectif) => o.historique.at(-1)?.valeur ?? o.depart;

export function lireObjectif(o: Objectif) {
  const actuel = valeurActuelle(o);
  return { ...o, actuel, progression: progression(o.depart, o.cible, actuel), atteint: atteint(o.depart, o.cible, actuel) };
}

export interface NouvelObjectif {
  titre: string;
  unite: UniteObjectif;
  depart: number;
  cible: number;
  echeance: string;
}

const quantiteValide = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1000000;

export function erreurObjectif(o: NouvelObjectif, jour = aujourdhuiParis()): string | null {
  const t = o.titre.trim();
  if (t.length < 3 || t.length > 120) return 'Nommez votre objectif (3 à 120 caractères)';
  if (!UNITES_OBJECTIF.includes(o.unite)) return 'Unité invalide';
  if (!quantiteValide(o.depart) || !quantiteValide(o.cible)) return 'Renseignez le départ et la cible';
  if (o.depart === o.cible) return 'La cible doit être différente du point de départ';
  if (o.echeance && (!/^\d{4}-\d{2}-\d{2}$/.test(o.echeance) || o.echeance < jour || o.echeance > '2100-12-31')) return 'Échéance invalide';
  return null;
}

export type ActionObjectif = { action: 'creer'; objectif: NouvelObjectif } | { action: 'progresser'; valeur: number; version: string } | { action: 'archiver' | 'restaurer'; version: string };

/**
 * saveMyGoal d'origine, sur l'état du mode démo : même envoi deux fois → rien de plus ; version périmée → refus ;
 * « atteint le » posé à la première valeur qui atteint la cible, retiré si une valeur repasse en dessous.
 */
export function appliquerObjectif(liste: Objectif[], clientId: string, envoiId: string, a: ActionObjectif, id?: string, maintenant = new Date().toISOString()): Objectif[] {
  if (a.action === 'creer') {
    if (liste.some((o) => o.id === envoiId || o.historique.some((h) => h.envoiId === envoiId))) return liste;
    const erreur = erreurObjectif(a.objectif, maintenant.slice(0, 10));
    if (erreur) throw new Error(erreur);
    const o: Objectif = {
      id: envoiId,
      clientId,
      ...a.objectif,
      titre: a.objectif.titre.trim(),
      historique: [{ date: maintenant, valeur: a.objectif.depart, envoiId }],
      creeLe: maintenant,
      modifieLe: maintenant,
      atteintLe: '',
      archive: false,
    };
    return [...liste, o];
  }
  const o = liste.find((x) => x.id === id && x.clientId === clientId);
  if (!o) throw new Error('Objectif hors de votre dossier');
  if (o.historique.some((h) => h.envoiId === envoiId) || o.dernierEnvoi === envoiId) return liste;
  if (a.version !== o.modifieLe) throw new Error('Cet objectif a changé. Actualisez avant de réessayer.');
  let suite: Objectif;
  if (a.action === 'progresser') {
    if (o.archive) throw new Error('Cet objectif est archivé');
    if (!quantiteValide(a.valeur)) throw new Error('Valeur actuelle invalide');
    if (o.historique.length >= 500) throw new Error('Historique complet : créez un nouvel objectif');
    suite = {
      ...o,
      historique: [...o.historique, { date: maintenant, valeur: a.valeur, envoiId }],
      atteintLe: atteint(o.depart, o.cible, a.valeur) ? o.atteintLe || maintenant : '',
    };
  } else suite = { ...o, archive: a.action === 'archiver' };
  return liste.map((x) => (x.id === o.id ? { ...suite, modifieLe: maintenant, dernierEnvoi: envoiId } : x));
}

// ---------- Photos de progression ----------

export const VUES = ['Face', 'Profil', 'Dos'] as const;
export type VuePhoto = (typeof VUES)[number];

export interface Photo {
  id: string;
  clientId: string;
  date: string;
  vue: VuePhoto;
  partage: boolean;
}

/** Le client voit toutes ses photos ; le coach seulement celles que le client partage. */
export const photoVisible = (p: Pick<Photo, 'partage'>, proprietaire: boolean) => proprietaire || p.partage;

/** JPEG en data URL, comme l'original (350 000 caractères au plus). */
export const imageValide = (image: string) => image.length <= 350000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(image);
