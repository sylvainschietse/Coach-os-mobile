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
  /** Classement du catalogue de Sylvain (importé d'Airtable) : sert à chercher un exercice. */
  famille?: string;
  materiel?: string[];
  muscles?: string[];
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
  programmeId?: string;
  ordre?: number;
}

/** Séance d'un modèle de programme : pas encore attribuée à un client. */
export type SeanceModele = Omit<Seance, 'clientId' | 'programmeId'>;

export interface Programme {
  id: string;
  /** Vide pour un modèle réutilisable. */
  clientId?: string;
  titre: string;
  objectif?: string;
  dureeSemaines?: number;
  seancesParSemaine?: number;
  niveau?: string;
  notes?: string;
  seances: SeanceModele[];
}

export interface SeanceResume {
  id: string;
  titre: string;
  programmeId?: string;
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

/** Mensurations saisies par le client (ou par le coach pendant un bilan). */
export interface Mensuration {
  id: string;
  clientId: string;
  date: string;
  poidsKg?: number;
  masseGrassePct?: number;
  tourTailleCm?: number;
  tourHanchesCm?: number;
  tourPoitrineCm?: number;
  tourBrasCm?: number;
  tourCuisseCm?: number;
  note?: string;
}

export type UniteRecord = 'kg' | 'reps' | 's' | 'm' | 'cal';

/** Un record personnel (PR) noté par le client. */
export interface RecordPerso {
  id: string;
  clientId: string;
  exerciceId?: string;
  libelle: string;
  valeur: number;
  unite: UniteRecord;
  /** Pour une charge : à combien de répétitions (1 = 1RM). */
  repetitions?: number;
  date: string;
  note?: string;
}

export interface PlanNutrition {
  clientId: string;
  calories?: number;
  proteinesG?: number;
  glucidesG?: number;
  lipidesG?: number;
  eauL?: number;
  conseils?: string;
  majLe?: string;
}

export interface JournalNutrition {
  id: string;
  clientId: string;
  date: string;
  /** Respect du plan ressenti par le client, de 1 à 5. */
  respect?: number;
  eauL?: number;
  repas?: string;
  ressenti?: string;
}

// Alimentation : profil, base d'aliments, recettes et journal des repas.
export type Sexe = 'femme' | 'homme';
export type NiveauActivite = 'sedentaire' | 'leger' | 'modere' | 'actif' | 'tres_actif';
export type ObjectifNutrition = 'perte' | 'maintien' | 'prise';
export type Regime = 'vegetarien' | 'vegan' | 'pescetarien' | 'sans_gluten' | 'sans_lactose' | 'low_carb' | 'high_protein';
/** Ce qu'un aliment contient et qui compte pour un régime ou une allergie. */
export type Contient = 'viande' | 'poisson' | 'fruits_de_mer' | 'oeuf' | 'lait' | 'gluten' | 'miel';

export interface ProfilNutrition {
  clientId: string;
  sexe?: Sexe;
  /** AAAA-MM-JJ */
  naissance?: string;
  tailleCm?: number;
  /** Vide : on prend la dernière pesée des mensurations. */
  poidsKg?: number;
  activite?: NiveauActivite;
  objectif?: ObjectifNutrition;
  regimes: Regime[];
  /** Allergies, aliments refusés : texte libre, une virgule entre chaque. */
  exclusions?: string;
  majLe?: string;
}

/** Valeurs pour 100 g. */
export interface Macros {
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
}

export interface Aliment extends Macros {
  id: string;
  nom: string;
  marque?: string;
  codeBarres?: string;
  categorie?: string;
  fibres?: number;
  portionG?: number;
  portionLibelle?: string;
  contient: Contient[];
  /** base : base commune ; off : Open Food Facts (code-barres) ; coach / client : ajouté à la main. */
  source: 'base' | 'off' | 'coach' | 'client';
  /** Aliment personnel d'un client. */
  clientId?: string;
}

/** Un ingrédient garde ses valeurs pour 100 g : la recette ne change pas si la base change. */
export interface Ingredient extends Macros {
  alimentId?: string;
  nom: string;
  quantiteG: number;
  contient: Contient[];
}

export interface Recette {
  id: string;
  /** Vide : recette personnelle d'un client. */
  clientId?: string;
  titre: string;
  description?: string;
  portions: number;
  tempsMin?: number;
  etapes?: string;
  ingredients: Ingredient[];
  /** Le client ne voit dans la banque que les recettes approuvées par le coach. */
  statut: 'brouillon' | 'approuvee';
  /** Régimes confirmés à la main (sans gluten notamment), en plus de ce que disent les ingrédients. */
  regimesConfirmes: Regime[];
  archive?: boolean;
}

export type MomentRepas = 'petit_dejeuner' | 'dejeuner' | 'collation' | 'diner';

/** Une ligne du journal des repas, avec ses totaux déjà calculés. */
export interface EntreeRepas extends Macros {
  id: string;
  clientId: string;
  date: string;
  moment: MomentRepas;
  libelle: string;
  quantiteG?: number;
  portions?: number;
  alimentId?: string;
  recetteId?: string;
  source: 'saisie' | 'scan' | 'photo' | 'recette';
}
