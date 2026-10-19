// Vocabulaire métier partagé par l'app client, l'espace coach et la base.
import type { ConfigMinuteur } from './minuteur';

/** Ce qu'on mesure sur un exercice. Un développé couché n'a ni distance ni allure. */
export type Mesure =
  | 'charge'
  | 'repetitions'
  | 'duree'
  | 'distance'
  | 'calories'
  | 'watts'
  | 'allure500';

export type Valeurs = Partial<Record<Mesure, number>>;

export interface Exercice {
  id: string;
  nom: string;
  mesures: Mesure[];
  videoUrl?: string;
}

/** Une ligne de prescription : ce que le coach demande pour un exercice. */
export interface LignePrescription {
  id: string;
  exercice: Exercice;
  series: number;
  repetitionsMin?: number;
  repetitionsMax?: number;
  chargeIndicative?: number;
  dureeS?: number;
  recuperationS?: number;
  rir?: number;
  tempo?: string;
  consignes?: string;
  /** Chrono réglé par le coach pour cet exercice (fractionné, tabata…). */
  minuteur?: ConfigMinuteur;
}

export interface Bloc {
  id: string;
  titre: string;
  lignes: LignePrescription[];
  /** Chrono réglé par le coach pour tout le bloc, quand c'est un circuit. */
  minuteur?: ConfigMinuteur;
}

export interface Seance {
  id: string;
  clientId: string;
  titre: string;
  datePrevue?: string;
  consignes?: string;
  blocs: Bloc[];
}

export interface SeanceResume {
  id: string;
  titre: string;
  datePrevue?: string;
  nbExercices: number;
  derniereRealisation?: string;
}

/** Une série telle que le client la voit pendant la séance. */
export interface SerieSaisie {
  ligneId: string;
  exerciceId: string;
  index: number;
  /** Préremplissage proposé, affiché grisé. Jamais enregistré tel quel. */
  suggestion: Valeurs;
  /** Ce que le client a réellement saisi ou confirmé. */
  valeurs: Valeurs;
  validee: boolean;
}

export interface SerieRealisee {
  id: string;
  ligneId: string;
  exerciceId: string;
  index: number;
  valeurs: Valeurs;
  suggestion: Valeurs;
}

/** Ce qui part vers la base. L'id est créé sur le téléphone pour éviter les doublons. */
export interface Realisation {
  id: string;
  seanceId: string;
  clientId: string;
  debut: string;
  fin: string;
  commentaire?: string;
  series: SerieRealisee[];
}

export interface RealisationDetail extends Realisation {
  seanceTitre: string;
  exercices: Record<string, string>;
}

export interface ClientResume {
  id: string;
  prenom: string;
  nom: string;
  derniereSeance?: { titre: string; fin: string; commentaire?: string };
}

/** Dernière série validée d'un exercice, utilisée pour la suggestion suivante. */
export interface HistoriqueExercice {
  exerciceId: string;
  date: string;
  series: Valeurs[];
}
