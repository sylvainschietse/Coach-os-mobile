// Offres du coach : chaque coach crée ses propres formules, fixe ses prix et choisit ce qu'elles ouvrent dans l'appli.
// Le client paie directement le coach (Stripe Connect) : l'argent arrive sur le compte du coach, pas sur celui de CoachGo.

export type Periodicite = 'mois' | 'trimestre' | 'annee' | 'unique';
export type ModeleOffre = 'en_ligne' | 'hybride' | 'presentiel' | 'seances' | 'libre';

export interface Offre {
  id: string;
  modele: ModeleOffre;
  nom: string;
  accroche?: string;
  prix: number;
  periodicite: Periodicite;
  /** Programme, séances guidées, suivi et documents dans l'appli (nutrition limitée aux macros sans l'option). */
  accesAppli: boolean;
  /** Nutrition complète : recettes, plan de repas automatique et photo d'assiette. */
  nutrition: boolean;
  messagerie: boolean;
  videosMois: number;
  /** Séances avec le coach : par période pour un abonnement, dans le pack pour un paiement unique. */
  seances: number;
  essaiJours: number;
  active: boolean;
  /** L'offre que le coach conseille : badge « Mon conseil » sur la brochure et pour ses clients. Une seule à la fois. */
  conseil: boolean;
  ordre: number;
  /** Le prix actuel est en place sur le compte Stripe du coach : la page de paiement est prête. */
  enLigne: boolean;
}

export type SaisieOffre = Omit<Offre, 'id' | 'ordre' | 'enLigne'>;

/** Offres dans l'ordre choisi par le coach : celles en vente d'abord, puis celles qui ne sont plus proposées. */
export function trierOffres<T extends Pick<Offre, 'active' | 'ordre'>>(liste: T[]): T[] {
  return [...liste].sort((a, b) => Number(b.active) - Number(a.active) || a.ordre - b.ordre);
}

/**
 * Monte ou descend une offre en vente d'une place parmi les offres en vente.
 * Renvoie les identifiants de ces offres dans leur nouvel ordre (ordre 1, 2, 3…), ou rien si l'offre est déjà au bout.
 */
export function deplacerOffre(liste: Pick<Offre, 'id' | 'active' | 'ordre'>[], id: string, sens: -1 | 1): string[] | undefined {
  const ids = trierOffres(liste.filter((o) => o.active)).map((o) => o.id);
  const i = ids.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= ids.length) return undefined;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

export const PERIODICITES: Record<Periodicite, { libelle: string; suffixe: string; mois: number }> = {
  mois: { libelle: 'Chaque mois', suffixe: '/ mois', mois: 1 },
  trimestre: { libelle: 'Chaque trimestre', suffixe: '/ trimestre', mois: 3 },
  annee: { libelle: 'Chaque année', suffixe: '/ an', mois: 12 },
  unique: { libelle: 'En une fois (pack de séances)', suffixe: 'en une fois', mois: 0 },
};

/** Modèles proposés au coach pour créer une offre en deux appuis ; tout reste modifiable ensuite. */
export const MODELES: Record<Exclude<ModeleOffre, 'libre'>, { libelle: string; description: string; base: SaisieOffre }> = {
  en_ligne: {
    libelle: 'Suivi en ligne',
    description: 'Programme et suivi dans l’appli, à distance.',
    base: {
      modele: 'en_ligne',
      nom: 'Suivi en ligne',
      accroche: 'Pour t’entraîner seul, bien guidé.',
      prix: 79,
      periodicite: 'mois',
      accesAppli: true,
      nutrition: false,
      messagerie: true,
      videosMois: 2,
      seances: 0,
      essaiJours: 0,
      active: true,
      conseil: false,
    },
  },
  hybride: {
    libelle: 'Hybride',
    description: 'L’appli, plus des séances avec toi chaque mois.',
    base: {
      modele: 'hybride',
      nom: 'Hybride',
      accroche: 'Pour progresser vite, aux côtés de ton coach.',
      prix: 199,
      periodicite: 'mois',
      accesAppli: true,
      nutrition: true,
      messagerie: true,
      videosMois: 2,
      seances: 2,
      essaiJours: 0,
      active: true,
      conseil: false,
    },
  },
  presentiel: {
    libelle: 'Présentiel',
    description: 'Des séances en salle chaque mois, l’appli en plus.',
    base: {
      modele: 'presentiel',
      nom: 'Coaching en salle',
      accroche: 'Chaque semaine en salle avec ton coach.',
      prix: 240,
      periodicite: 'mois',
      accesAppli: true,
      nutrition: false,
      messagerie: true,
      videosMois: 0,
      seances: 4,
      essaiJours: 0,
      active: true,
      conseil: false,
    },
  },
  seances: {
    libelle: 'Pack de séances',
    description: 'Des séances payées en une fois, sans abonnement.',
    base: {
      modele: 'seances',
      nom: 'Pack 10 séances',
      accroche: 'À utiliser quand tu veux.',
      prix: 550,
      periodicite: 'unique',
      accesAppli: false,
      nutrition: false,
      messagerie: false,
      videosMois: 0,
      seances: 10,
      essaiJours: 0,
      active: true,
      conseil: false,
    },
  },
};

const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** « 149 € / mois », « 390 € / trimestre », « 550 € en une fois ». */
export const libellePrix = (o: Pick<Offre, 'prix' | 'periodicite'>, prix = o.prix) => `${euros(prix)} ${PERIODICITES[o.periodicite].suffixe}`;

/** Ce que l'offre comprend, ligne par ligne, tel que le client le lit. */
export function contenuOffre(
  o: Pick<Offre, 'periodicite' | 'accesAppli' | 'nutrition' | 'messagerie' | 'videosMois' | 'seances' | 'essaiJours'>,
  pour: 'client' | 'coach' = 'client',
): string[] {
  const unique = o.periodicite === 'unique';
  const periode = o.periodicite === 'annee' ? 'par an' : o.periodicite === 'trimestre' ? 'par trimestre' : 'par mois';
  // Le coach lit la fiche de son client : « avec toi » plutôt que « avec ton coach ».
  const coach = pour === 'coach';
  const avec = coach ? 'avec toi' : 'avec ton coach';
  return [
    o.seances ? (unique ? `${pluriel(o.seances, 'séance')} ${avec}` : `${pluriel(o.seances, 'séance')} ${avec} ${periode}`) : '',
    o.accesAppli ? (coach ? 'Programme et suivi dans l’appli' : 'Ton programme et ton suivi dans l’appli') : '',
    o.accesAppli ? (o.nutrition ? 'Nutrition complète : recettes, plan de repas, photo d’assiette' : coach ? 'Nutrition : macros' : 'Nutrition : tes macros') : '',
    o.messagerie ? `Messagerie ${avec}` : '',
    o.videosMois ? `${pluriel(o.videosMois, 'vidéo')} corrigée${o.videosMois > 1 ? 's' : ''} par mois` : '',
    o.essaiJours && !unique ? `${pluriel(o.essaiJours, 'jour')} d’essai offert${o.essaiJours > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
}

/** Ce que l'offre ouvre sur la fiche du client. Un pack de séances ne touche pas aux accès. */
export function droitsOffre(o: Pick<Offre, 'periodicite' | 'accesAppli' | 'nutrition' | 'videosMois'>) {
  if (o.periodicite === 'unique') return {};
  return { accesAppli: o.accesAppli, optionNutrition: o.accesAppli && o.nutrition, videosMois: o.accesAppli ? o.videosMois : 0 };
}

const nombre = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'));

/** Contrôle la saisie du coach : renvoie l'offre propre, ou un message d'erreur. */
export function lireOffre(s: Omit<SaisieOffre, 'prix'> & { prix: string }): SaisieOffre | string {
  const nom = s.nom.trim();
  if (!nom) return 'Donne un nom à ton offre, par exemple « Suivi en ligne ».';
  if (nom.length > 60) return 'Nom trop long : 60 caractères au plus.';
  const prix = nombre(s.prix);
  if (!s.prix.trim() || !Number.isFinite(prix) || prix < 0) return 'Prix illisible : écris par exemple 79 ou 79,90.';
  if (prix > 10000) return 'Prix trop élevé.';
  const unique = s.periodicite === 'unique';
  if (unique && s.seances < 1) return 'Un pack payé en une fois doit contenir au moins une séance.';
  const accroche = s.accroche?.trim().slice(0, 140) || undefined;
  const offre: SaisieOffre = {
    ...s,
    nom,
    accroche,
    prix: Math.round(prix * 100) / 100,
    accesAppli: unique ? false : s.accesAppli,
    nutrition: unique || !s.accesAppli ? false : s.nutrition,
    videosMois: unique ? 0 : Math.max(0, Math.min(30, Math.round(s.videosMois))),
    seances: Math.max(0, Math.min(100, Math.round(s.seances))),
    essaiJours: unique ? 0 : Math.max(0, Math.min(60, Math.round(s.essaiJours))),
  };
  if (!unique && !offre.accesAppli && !offre.seances && !offre.messagerie) return 'Coche au moins une chose dans l’offre.';
  return offre;
}

/** Offres de départ en démo : les formules de Sylvain, recréées comme n'importe quel coach le ferait. */
export const OFFRES_DEMO: Offre[] = [
  { ...MODELES.en_ligne.base, id: 'offre-appli', nom: 'Appli', accroche: 'Pour t’entraîner seul, bien guidé.', prix: 59, videosMois: 0, ordre: 1, enLigne: true },
  {
    ...MODELES.en_ligne.base,
    id: 'offre-appli-nutrition',
    nom: 'Appli + nutrition',
    accroche: 'Pour des résultats aussi dans l’assiette.',
    prix: 99,
    nutrition: true,
    videosMois: 0,
    ordre: 2,
    enLigne: true,
  },
  { ...MODELES.hybride.base, id: 'offre-hybride-leger', nom: 'Hybride léger', accroche: 'Pour garder le contact avec ton coach.', prix: 149, videosMois: 0, seances: 1, conseil: true, ordre: 3, enLigne: true },
  { ...MODELES.hybride.base, id: 'offre-hybride-complet', nom: 'Hybride complet', prix: 269, videosMois: 2, seances: 4, ordre: 4, enLigne: true },
];
