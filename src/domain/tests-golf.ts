// Tests golf du Booster, pour un client golfeur. Mesures chiffrées (degrés, cm, secondes, répétitions, km/h),
// en plus des tests qualitatifs d'origine. Batterie inspirée du dépistage TPI (Titleist Performance Institute)
// et des tests physiques que les études relient à la vitesse de swing. Adaptée à une salle sans charges libres :
// la puissance de rotation se mesure à la poulie.

import { MESURES_MOBILITE, type FaconDeMesurer } from './mesure-angle';

export type IdTestGolf =
  | 'rotationThoracique'
  | 'rotationHanches'
  | 'toucherOrteils'
  | 'equilibreUnipodal'
  | 'pontUnipodal'
  | 'rotationPoulie'
  | 'sautVertical'
  | 'vitesseClub';

export type FamilleGolf = 'Mobilité' | 'Stabilité et équilibre' | 'Puissance' | 'Golf';

export interface ChampGolf {
  cle: string;
  libelle: string;
  unite: string;
}

export interface DefinitionTestGolf {
  id: IdTestGolf;
  famille: FamilleGolf;
  libelle: string;
  /** Le protocole en une ou deux phrases, affiché sous le titre pendant la séance. */
  protocole: string;
  /** Valeur de référence indicative, quand il en existe une. */
  repere?: string;
  champs: ChampGolf[];
  /** Plus haut = mieux (sauf distance doigts-sol). */
  sens: 'plus' | 'moins';
  facultatif?: boolean;
  /** Les champs en degrés peuvent se mesurer sur une vidéo. */
  video?: FaconDeMesurer;
}

const cotes = (unite: string, d = 'Droite', g = 'Gauche'): ChampGolf[] => [
  { cle: 'droite', libelle: d, unite },
  { cle: 'gauche', libelle: g, unite },
];

export const TESTS_GOLF: DefinitionTestGolf[] = [
  {
    id: 'rotationThoracique',
    famille: 'Mobilité',
    libelle: 'Rotation du haut du dos (assis)',
    protocole:
      'Assis, genoux serrés, un bâton posé sur les épaules. Le client tourne le buste au maximum de chaque côté sans bouger le bassin. On mesure l’angle entre le bâton et la ligne des épaules au départ.',
    repere: '45° ou plus de chaque côté',
    champs: cotes('°', 'Vers la droite', 'Vers la gauche'),
    sens: 'plus',
    video: MESURES_MOBILITE.find((m) => m.libelle === 'Rotation du haut du dos'),
  },
  {
    id: 'rotationHanches',
    famille: 'Mobilité',
    libelle: 'Rotation des hanches',
    protocole:
      'Allongé sur le ventre, genou plié à 90°. On laisse tomber le pied vers l’extérieur (rotation interne) puis vers l’intérieur (rotation externe), sans que le bassin se soulève.',
    repere: 'Environ 45° dans chaque sens, écart droite / gauche faible',
    champs: [
      { cle: 'interneDroite', libelle: 'Interne droite', unite: '°' },
      { cle: 'interneGauche', libelle: 'Interne gauche', unite: '°' },
      { cle: 'externeDroite', libelle: 'Externe droite', unite: '°' },
      { cle: 'externeGauche', libelle: 'Externe gauche', unite: '°' },
    ],
    sens: 'plus',
    video: MESURES_MOBILITE.find((m) => m.libelle === 'Rotation des hanches'),
  },
  {
    id: 'toucherOrteils',
    famille: 'Mobilité',
    libelle: 'Toucher des orteils',
    protocole: 'Debout, pieds joints, jambes tendues, le client se penche en avant. On mesure la distance entre le bout des doigts et le sol (0 s’il touche).',
    repere: '0 cm (doigts au sol)',
    champs: [{ cle: 'distance', libelle: 'Distance doigts-sol', unite: 'cm' }],
    sens: 'moins',
  },
  {
    id: 'equilibreUnipodal',
    famille: 'Stabilité et équilibre',
    libelle: 'Équilibre sur une jambe, yeux fermés',
    protocole: 'Pieds nus, bras le long du corps, l’autre genou levé, yeux fermés. Chrono arrêté dès que le pied bouge ou que le genou levé redescend.',
    repere: '10 s ou plus sur chaque jambe',
    champs: cotes('s', 'Jambe droite', 'Jambe gauche'),
    sens: 'plus',
  },
  {
    id: 'pontUnipodal',
    famille: 'Stabilité et équilibre',
    libelle: 'Pont fessier sur une jambe',
    protocole:
      'Sur le dos, pont fessier, puis une jambe tendue dans l’alignement de la cuisse. Chrono arrêté dès que le bassin bascule ou descend. Noter la bascule dans les observations.',
    repere: '10 s ou plus sans bascule du bassin',
    champs: cotes('s', 'Appui jambe droite', 'Appui jambe gauche'),
    sens: 'plus',
  },
  {
    id: 'rotationPoulie',
    famille: 'Puissance',
    libelle: 'Rotation explosive à la poulie',
    protocole:
      'De profil, poignée à hauteur de hanches, bras tendus. Le client tourne le buste vite et contrôlé, comme un swing. Charge fixe (par exemple 10 % du poids de corps), nombre de rotations complètes en 15 s. Reprendre la même charge au Booster suivant.',
    champs: [
      { cle: 'chargeKg', libelle: 'Charge utilisée', unite: 'kg' },
      { cle: 'coteSwing', libelle: 'Côté swing', unite: 'rép.' },
      { cle: 'coteOppose', libelle: 'Côté opposé', unite: 'rép.' },
    ],
    sens: 'plus',
  },
  {
    id: 'sautVertical',
    famille: 'Puissance',
    libelle: 'Saut vertical sans élan',
    protocole: 'Mains sur les hanches, flexion rapide puis saut le plus haut possible. Meilleur de 3 essais (une appli de téléphone suffit pour mesurer).',
    champs: [{ cle: 'hauteur', libelle: 'Meilleur saut', unite: 'cm' }],
    sens: 'plus',
  },
  {
    id: 'vitesseClub',
    famille: 'Golf',
    libelle: 'Vitesse de tête de club',
    protocole: 'Au driver, avec un radar ou un moniteur de lancement, après échauffement. Meilleure vitesse sur 5 swings.',
    champs: [{ cle: 'vitesse', libelle: 'Meilleure vitesse', unite: 'km/h' }],
    sens: 'plus',
    facultatif: true,
  },
];

/** Saisies telles que tapées (« 42 », « 12,5 »), par test puis par champ. */
export interface EvaluationGolf {
  /** Case « Client golfeur » cochée : les tests golf s'affichent et entrent dans le compte rendu. */
  actif: boolean;
  mesures: Partial<Record<IdTestGolf, Record<string, string>>>;
}

/** « 12,5 » → 12.5 ; vide ou illisible → undefined. */
export function lireMesure(v: string | undefined): number | undefined {
  const t = v?.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const afficher = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** « 42° », « 12,5 cm », « 8 rép. ». */
export function formaterMesure(n: number, unite: string): string {
  return unite === '°' ? `${afficher(n)}°` : `${afficher(n)} ${unite}`;
}

export function changerMesure(g: EvaluationGolf | undefined, test: IdTestGolf, champ: string, valeur: string): EvaluationGolf {
  const base = g ?? { actif: true, mesures: {} };
  return { ...base, mesures: { ...base.mesures, [test]: { ...(base.mesures[test] ?? {}), [champ]: valeur } } };
}

export const testGolfRenseigne = (g: EvaluationGolf | undefined, t: DefinitionTestGolf) =>
  t.champs.some((c) => lireMesure(g?.mesures[t.id]?.[c.cle]) !== undefined);

export const testsGolfRenseignes = (g: EvaluationGolf | undefined) => TESTS_GOLF.filter((t) => testGolfRenseigne(g, t)).length;

/** Écart avec le Booster précédent, dans le sens où il compte : « +5° », « −2 cm ». */
export function evolution(actuel: number, avant: number, unite: string): string {
  const d = actuel - avant;
  if (d === 0) return 'stable';
  return `${d > 0 ? '+' : '−'}${formaterMesure(Math.abs(d), unite)}`;
}

/** Lignes du compte rendu, au même format que les tests d'origine ; rien si le client n'est pas golfeur. */
export function syntheseGolf(g: EvaluationGolf | undefined, precedent?: EvaluationGolf): string[] {
  if (!g?.actif) return [];
  return TESTS_GOLF.filter((t) => !t.facultatif || testGolfRenseigne(g, t)).map((t) => {
    const morceaux = t.champs.flatMap((c) => {
      const n = lireMesure(g.mesures[t.id]?.[c.cle]);
      if (n === undefined) return [];
      const avant = lireMesure(precedent?.mesures[t.id]?.[c.cle]);
      const suivi = avant !== undefined && c.cle !== 'chargeKg' ? ` (${evolution(n, avant, c.unite)})` : '';
      return [`${c.libelle.toLowerCase()} ${formaterMesure(n, c.unite)}${suivi}`];
    });
    return `GOLF · ${t.libelle.toUpperCase()} — ${morceaux.length ? morceaux.join(' | ') : 'non renseigné'}`;
  });
}
