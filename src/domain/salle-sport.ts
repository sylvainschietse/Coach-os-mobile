// Où le client s'entraîne et avec quel matériel : choisi dans le questionnaire guidé (Ma nutrition › Mes objectifs),
// repris quand le coach crée un programme pour lui (champ « Matériel disponible », lu par l'assistant de séances).
// Le matériel d'une salle de chaîne est un équipement habituel, pas un inventaire du club : le client l'ajuste.

export const MATERIELS = [
  'Machines guidées',
  'Poulies',
  'Haltères',
  'Barre et disques',
  'Banc',
  'Rack à squat',
  'Barre de traction',
  'Kettlebell',
  'Élastiques',
  'TRX ou sangles',
  'Tapis',
  'Cardio (tapis, vélo, rameur)',
] as const;

const SALLE_COMPLETE = [
  'Machines guidées',
  'Poulies',
  'Haltères',
  'Barre et disques',
  'Banc',
  'Rack à squat',
  'Barre de traction',
  'Kettlebell',
  'Tapis',
  'Cardio (tapis, vélo, rameur)',
];

/** Marques de machines proposées au client (les vidéos d'exercices pourront suivre la marque de son club). */
export const MARQUES = ['Technogym', 'Hammer Strength', 'Life Fitness', 'Matrix', 'Panatta', 'gym80', 'Precor', 'Cybex', 'Eleiko', 'Autre marque'] as const;

export interface Salle {
  cle: string;
  libelle: string;
  type: 'salle' | 'maison' | 'exterieur' | 'coach';
  /** Matériel coché d'office en choisissant ce lieu. */
  materiel: string[];
  /** Marques présentes dans tous les clubs de l'enseigne, quand c'est connu. */
  marques?: string[];
}

export const SALLES: Salle[] = [
  { cle: 'wellness', libelle: 'Wellness Sport Club', type: 'salle', materiel: SALLE_COMPLETE, marques: ['Technogym', 'Hammer Strength'] },
  { cle: 'basic-fit', libelle: 'Basic-Fit', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'fitness-park', libelle: 'Fitness Park', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'on-air', libelle: 'On Air', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'keepcool', libelle: 'Keepcool', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'orange-bleue', libelle: 'L’Orange Bleue', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'neoness', libelle: 'Neoness', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'autre-salle', libelle: 'Une autre salle', type: 'salle', materiel: SALLE_COMPLETE },
  { cle: 'coach', libelle: 'Avec mon coach', type: 'coach', materiel: [] },
  { cle: 'maison', libelle: 'À la maison', type: 'maison', materiel: ['Tapis'] },
  { cle: 'exterieur', libelle: 'En extérieur', type: 'exterieur', materiel: [] },
];

export const salleDe = (cle: string) => SALLES.find((s) => s.cle === cle);

/** Choisir un lieu : son matériel habituel est coché, ce que le client avait ajouté à la main (élastiques…) reste. */
export function choisirSalle(cle: string, materielActuel: string[], ancienne = ''): string[] {
  const avant = salleDe(ancienne)?.materiel ?? [];
  const ajouts = materielActuel.filter((m) => !avant.includes(m));
  return MATERIELS.filter((m) => (salleDe(cle)?.materiel ?? []).includes(m) || ajouts.includes(m));
}

/** Choisir un lieu : marques connues de l'enseigne cochées, celles ajoutées à la main gardées. */
export function choisirMarques(cle: string, actuelles: string[], ancienne = ''): string[] {
  const avant = salleDe(ancienne)?.marques ?? [];
  const ajouts = actuelles.filter((m) => !avant.includes(m));
  return MARQUES.filter((m) => (salleDe(cle)?.marques ?? []).includes(m) || ajouts.includes(m));
}

/** Les lieux où l'on précise le club : une salle (le matériel varie d'un club à l'autre d'une même enseigne). */
export const avecClub = (cle: string) => salleDe(cle)?.type === 'salle';

/** Texte du champ « Matériel disponible » d'un programme : lieu puis matériel, ou vide si rien n'est renseigné. */
export function materielPourProgramme(salle: string, materiel: string[], club = '', marques: string[] = []): string {
  const lieu = [salleDe(salle)?.libelle, club.trim()].filter(Boolean).join(' ') + (marques.length ? ` (${marques.join(', ')})` : '');
  const liste = materiel.length ? materiel.join(', ') : salleDe(salle)?.type === 'maison' || salleDe(salle)?.type === 'exterieur' ? 'poids du corps' : '';
  return [lieu, liste].filter(Boolean).join(' · ').slice(0, 200);
}

/** « Lyon  Part-Dieu » et « lyon part-dieu » désignent le même club. */
export const normerClub = (club: string) =>
  club
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
