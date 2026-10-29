// Vocabulaire métier partagé par l'app client, l'espace coach et la base.
import type { VarianteCycle } from './cycles';
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

/** Phase d'une ligne dans Airtable (Exercices de séance). */
export type Phase = 'Échauffement' | 'Principal' | 'Finisher' | 'Retour au calme';

/** Une ligne de prescription : ce que le coach demande pour un exercice. */
export interface LignePrescription {
  id: string;
  exercice: Exercice;
  series: number;
  /** Répétitions telles que prescrites : « 12–15 », « 6–8 par côté ». */
  repetitions?: string;
  /** Lus dans `repetitions` quand c'est un nombre ou une fourchette : servent à la saisie. */
  repetitionsMin?: number;
  repetitionsMax?: number;
  chargeIndicative?: number;
  /** Charge / intensité, ou objectif cardio encodé comme dans l'app d'origine (« 20 cal », « 2:05 / 500 m »). */
  chargeIntensite?: string;
  dureeS?: number;
  distanceM?: number;
  recuperationS?: number;
  rir?: number;
  tempo?: string;
  consignes?: string;
  progression?: string;
  phase?: Phase;
  /** Les quatre variantes d'un modèle Fondamentaux (cycle 1 = la ligne elle-même). */
  cycles?: VarianteCycle[];
  /** Chrono réglé par le coach pour cet exercice (fractionné, tabata…). */
  minuteur?: ConfigMinuteur;
}

/** Façon d'enchaîner les exercices d'un bloc. */
export type FormatBloc = 'Classique' | 'Biset' | 'Superset' | 'Triset' | 'Circuit';

export interface Bloc {
  id: string;
  titre: string;
  lignes: LignePrescription[];
  /** Chrono réglé par le coach pour tout le bloc, quand c'est un circuit. */
  minuteur?: ConfigMinuteur;
  format?: FormatBloc;
  /** Descriptif libre du coach pour ce bloc. */
  description?: string;
  /** Tempo commun aux exercices du bloc, comme « 3-1-1-0 ». */
  tempo?: string;
  /** Mode de contraction : excentrique lente, pause isométrique… */
  contraction?: string;
}

export interface Seance {
  id: string;
  /** Vide pour une séance de modèle. */
  clientId?: string;
  titre: string;
  datePrevue?: string;
  consignes?: string;
  blocs: Bloc[];
  programmeId?: string;
  /** Jour dans la semaine type (J1, J2…). */
  ordre?: number;
  dominante?: string;
  dureeMin?: number;
  objectif?: string;
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
  statut?: string;
  environnement?: string;
  materiel?: string;
  contraintes?: string;
  /** Descriptif et consignes du programme (« Consignes générales » d'Airtable). */
  consignes?: string;
  dureeCibleMin?: number;
  priorites?: string[];
  version?: string;
  modeleOrigineId?: string;
  cycleApplique?: number;
  /** Conteneur « Séance seule · … » d'une séance créée hors programme. */
  seanceSeule?: boolean;
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
  /** Choisie par le client comme référence des charges calculées (% du 1RM) pour cet exercice, et seulement lui. */
  reference?: boolean;
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
  /** Code de l'aliment dans la table Ciqual (Anses). */
  codeCiqual?: string;
  /** Nutriments non mesurés : enregistrés à 0, mais à afficher comme inconnus. */
  valeursInconnues?: (keyof Macros)[];
  /** Nutriments présents à l'état de traces dans Ciqual (comptés 0). */
  traces?: (keyof Macros)[];
}

/** Un ingrédient garde ses valeurs pour 100 g : la recette ne change pas si la base change. */
export interface Ingredient extends Macros {
  alimentId?: string;
  nom: string;
  /** Grammes qui servent au calcul des macros (estimés pour une pièce ou une cuillère, égouttés pour une conserve) ; 0 quand la quantité est selon goût. */
  quantiteG: number;
  contient: Contient[];
  /** Valeurs pour 100 g inconnues : les macros de la recette viennent alors des valeurs publiées par portion. */
  valeursInconnues?: boolean;
  /** Quantité telle qu'écrite dans la recette source (ex. 2 pièce, 1 c. à soupe, selon goût). */
  quantite?: number;
  unite?: string;
  approximatif?: boolean;
  facultatif?: boolean;
}

export type RegimeSource = 'omnivore' | 'vegetarien' | 'vegan';

/** Une autre version de la recette publiée avec elle : végétarienne, végane, ou enrichie en protéines. */
export interface VarianteRecette {
  id: string;
  libelle: string;
  regime: RegimeSource;
  macrosPortion: Macros;
  ingredients: Ingredient[];
  notes?: string[];
  etapes?: string;
}

/** D'où vient une recette importée : la source et ce qu'en disent ses lecteurs (pas une validation du coach). */
export interface OrigineRecette {
  ref: string;
  nom: string;
  url: string;
  note?: number;
  votes?: number;
  verifieLe?: string;
  cuisine?: string;
  methode?: string;
  prepMin?: number;
}

export type TypeRecette = 'plat' | 'collation' | 'sucre' | 'sale';

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
  /** Valeurs par portion publiées par la source : elles priment sur le calcul par ingrédient. */
  macrosPortion?: Macros;
  variantes?: VarianteRecette[];
  origine?: OrigineRecette;
  types?: TypeRecette[];
  regimeSource?: RegimeSource;
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
