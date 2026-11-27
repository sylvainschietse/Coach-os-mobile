// Les objectifs proposés dans le questionnaire guidé. Chacun règle le sens du calcul des calories (perte, maintien,
// prise de muscle) et, quand il correspond, l'objectif du programme que le coach crée pour le client.
import type { Preferences } from './nutrition/calcul';

export interface ObjectifCoaching {
  cle: string;
  libelle: string;
  detail: string;
  /** Sens du calcul des calories. */
  calories: Preferences['objectif'];
  /** Objectif de programme (liste de la bibliothèque) quand il y en a un équivalent. */
  programme?: string;
  /** Question posée pour préciser (zone, sport, date…). */
  precision?: string;
  /** Profil à faire suivre par un professionnel de la nutrition : le calcul standard est désactivé. */
  specifique?: boolean;
}

export const OBJECTIFS_COACHING: ObjectifCoaching[] = [
  { cle: 'perte', libelle: 'Perdre du poids', detail: 'Affiner la silhouette en gardant le muscle', calories: 'perte', programme: 'Perte de poids' },
  { cle: 'muscle', libelle: 'Prendre du muscle', detail: 'Gagner en volume', calories: 'muscle', programme: 'Prise de muscle' },
  { cle: 'force', libelle: 'Gagner en force', detail: 'Progresser sur les gros mouvements', calories: 'maintien', programme: 'Prise de force' },
  { cle: 'forme', libelle: 'Me remettre en forme', detail: 'Reprendre une activité régulière', calories: 'maintien', programme: 'Remise en forme' },
  { cle: 'tonifier', libelle: 'Tonifier mon corps', detail: 'Raffermir, gainer, sculpter', calories: 'maintien', programme: 'Remise en forme' },
  {
    cle: 'reeducation',
    libelle: 'Rééducation',
    detail: 'Reprendre en sécurité après une blessure ou une opération',
    calories: 'maintien',
    programme: 'Remise en forme',
    precision: 'Quelle zone ou quelle blessure ? (ex. genou opéré en mars, entorse de cheville)',
  },
  {
    cle: 'preparation',
    libelle: 'Préparation physique',
    detail: 'Pour un sport, une compétition, un concours',
    calories: 'maintien',
    precision: 'Pour quel sport ou quelle échéance ? (ex. trail de 30 km en juin, concours pompier)',
  },
  {
    cle: 'endurance',
    libelle: 'Améliorer mon cardio',
    detail: 'Courir plus longtemps, moins m’essouffler',
    calories: 'maintien',
    programme: 'Remise en forme',
  },
  { cle: 'mobilite', libelle: 'Mobilité et souplesse', detail: 'Moins de raideurs, mieux bouger', calories: 'maintien', programme: 'Remise en forme' },
  {
    cle: 'dos',
    libelle: 'Soulager mon dos',
    detail: 'Posture et douleurs du quotidien',
    calories: 'maintien',
    programme: 'Remise en forme',
    precision: 'Où as-tu mal, et depuis quand ?',
  },
  {
    cle: 'grossesse',
    libelle: 'Grossesse ou post-partum',
    detail: 'Bouger en douceur, renforcer le périnée et la sangle',
    calories: 'maintien',
    precision: 'Où en es-tu ? (ex. 5e mois, accouchement il y a 3 mois)',
    specifique: true,
  },
  { cle: 'sante', libelle: 'Santé et bien-être', detail: 'Plus d’énergie, mieux dormir, moins de stress', calories: 'maintien', programme: 'Remise en forme' },
];

export const objectifCoachingDe = (cle: string) => OBJECTIFS_COACHING.find((o) => o.cle === cle);

/** Ce que le choix d'un objectif change dans le profil : sens des calories et, pour la grossesse, suivi spécifique. */
export function choisirObjectif(p: Preferences, cle: string): Preferences {
  const o = objectifCoachingDe(cle);
  if (!o) return p;
  const avant = objectifCoachingDe(p.objectifCoaching);
  return {
    ...p,
    objectifCoaching: o.cle,
    objectif: o.calories,
    objectifPrecision: avant?.cle === o.cle ? p.objectifPrecision : '',
    specifique: o.specifique ? true : avant?.specifique ? false : p.specifique,
  };
}

/** L'objectif lisible : celui du questionnaire s'il existe, sinon le sens des calories du formulaire complet. */
export function libelleObjectif(p: Pick<Preferences, 'objectif' | 'objectifCoaching' | 'objectifPrecision'>): string {
  const o = objectifCoachingDe(p.objectifCoaching);
  const base = o?.libelle ?? { perte: 'Perte de poids', muscle: 'Prise de muscle', maintien: 'Maintien' }[p.objectif];
  return p.objectifPrecision.trim() ? `${base} (${p.objectifPrecision.trim()})` : base;
}
