// Mesure d'angle sur une image de vidéo : le coach touche 2 ou 3 points, l'application calcule l'angle.
// L'image est affichée sans déformation (même échelle en largeur et en hauteur), donc l'angle mesuré à l'écran
// est celui de la vidéo.

export interface Point {
  x: number;
  y: number;
}

/**
 * - trois-points : angle au 2e point, entre les segments vers le 1er et le 3e (articulation, rotation).
 * - verticale : écart du segment (2 points) avec la verticale du téléphone (tibia, tronc).
 * - horizontale : écart du segment (2 points) avec l'horizontale du téléphone (épaules, bassin).
 */
export type ModeAngle = 'trois-points' | 'verticale' | 'horizontale';

export const POINTS_NECESSAIRES: Record<ModeAngle, number> = { 'trois-points': 3, verticale: 2, horizontale: 2 };

const degres = (rad: number) => (rad * 180) / Math.PI;

/** Angle au sommet, de 0 à 180°. */
export function angleTroisPoints(a: Point, sommet: Point, b: Point): number {
  const v1 = { x: a.x - sommet.x, y: a.y - sommet.y };
  const v2 = { x: b.x - sommet.x, y: b.y - sommet.y };
  const n = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (!n) return 0;
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / n));
  return degres(Math.acos(cos));
}

/** Écart entre le segment et la verticale (ou l'horizontale), de 0 à 90°, quel que soit l'ordre des points. */
export function angleAvecAxe(a: Point, b: Point, axe: 'verticale' | 'horizontale'): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (!dx && !dy) return 0;
  return degres(axe === 'verticale' ? Math.atan2(dx, dy) : Math.atan2(dy, dx));
}

/** L'angle arrondi au degré, ou undefined tant qu'il manque des points. */
export function calculerAngle(mode: ModeAngle, points: Point[]): number | undefined {
  if (points.length < POINTS_NECESSAIRES[mode]) return undefined;
  const brut = mode === 'trois-points' ? angleTroisPoints(points[0], points[1], points[2]) : angleAvecAxe(points[0], points[1], mode);
  return Math.round(brut);
}

export interface FaconDeMesurer {
  mode: ModeAngle;
  /** Où filmer, puis quoi toucher, dans l'ordre. */
  filmer: string;
  points: string[];
}

export interface ModeleMesure extends FaconDeMesurer {
  libelle: string;
}

const AXE = (filmer: string, p1: string, p2: string, mode: 'verticale' | 'horizontale'): FaconDeMesurer => ({ mode, filmer, points: [p1, p2] });

/** Mesures proposées dans le test Mobilité ; « Autre mesure » laisse le coach nommer et placer ses 3 points. */
export const MESURES_MOBILITE: ModeleMesure[] = [
  {
    libelle: 'Rotation des hanches',
    ...AXE('Client allongé sur le ventre, genou plié à 90°. Filmer depuis les pieds, téléphone bien droit.', 'Genou', 'Cheville', 'verticale'),
  },
  {
    libelle: 'Flexion de cheville (genou vers le mur)',
    ...AXE('Fente face au mur, talon au sol. Filmer de profil, téléphone bien droit.', 'Cheville', 'Genou', 'verticale'),
  },
  {
    libelle: 'Flexion de hanche (jambe tendue)',
    mode: 'trois-points',
    filmer: 'Client allongé sur le dos, une jambe levée tendue. Filmer de profil.',
    points: ['Épaule', 'Hanche', 'Cheville de la jambe levée'],
  },
  {
    libelle: 'Flexion d’épaule (bras au-dessus de la tête)',
    mode: 'trois-points',
    filmer: 'Debout ou allongé sur le dos, bras tendu vers l’arrière. Filmer de profil.',
    points: ['Hanche', 'Épaule', 'Poignet'],
  },
  {
    libelle: 'Rotation du haut du dos',
    mode: 'trois-points',
    filmer: 'Assis, bâton sur les épaules. Filmer d’au-dessus. Prévoir un repère au sol parallèle aux épaules au départ.',
    points: ['Un point du repère au sol', 'Centre de la nuque', 'Bout du bâton'],
  },
  {
    libelle: 'Autre mesure',
    mode: 'trois-points',
    filmer: 'Filmer l’articulation de profil ou de face, en entier dans l’image.',
    points: ['1er segment', 'Articulation (sommet de l’angle)', '2e segment'],
  },
];

/** Mesures proposées dans le test Posture. */
export const MESURES_POSTURE: ModeleMesure[] = [
  {
    libelle: 'Inclinaison des épaules',
    ...AXE('Client debout, de face ou de dos. Téléphone bien droit, à hauteur de poitrine.', 'Épaule droite', 'Épaule gauche', 'horizontale'),
  },
  {
    libelle: 'Inclinaison du bassin',
    ...AXE('Client debout, de face ou de dos. Téléphone bien droit, à hauteur de bassin.', 'Hanche droite', 'Hanche gauche', 'horizontale'),
  },
  {
    libelle: 'Tête en avant (profil)',
    ...AXE('Client debout, de profil, regard droit devant. Téléphone bien droit.', 'Base du cou (vertèbre saillante)', 'Oreille', 'horizontale'),
  },
  {
    libelle: 'Inclinaison du tronc (profil)',
    ...AXE('Client debout, de profil. Téléphone bien droit.', 'Hanche', 'Épaule', 'verticale'),
  },
  {
    libelle: 'Alignement du genou (face)',
    mode: 'trois-points',
    filmer: 'Client debout ou en squat, de face.',
    points: ['Hanche', 'Genou', 'Cheville'],
  },
  {
    libelle: 'Autre mesure',
    mode: 'trois-points',
    filmer: 'Filmer le client en entier dans l’image, téléphone bien droit.',
    points: ['1er point', 'Sommet de l’angle', '3e point'],
  },
];

/** Une mesure gardée dans un test : nom donné par le coach et angle en degrés. */
export interface MesureAngle {
  libelle: string;
  angle: number;
}
