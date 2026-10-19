// Évaluation physique et entretien de la séance Booster.
// Champs repris tels quels de la base Airtable de Sylvain : évaluation qualitative par le coach,
// sans protocole (exercices, durées, charges) ni score global.

export type IdTest = 'poussee' | 'tirage' | 'jambes' | 'cardio' | 'mobilite' | 'posture';

export interface DefinitionTest {
  id: IdTest;
  libelle: string;
  resultats: string[];
  observations: string[];
  /** Effort perçu en fin de test, de 1 à 10 (cardio). */
  rpe?: boolean;
}

const RESULTATS_FORCE = ['Très à l’aise', 'Correct', 'Difficile', 'Très limité', 'Non réalisé', 'Non adapté'];

export const TESTS: DefinitionTest[] = [
  {
    id: 'poussee',
    libelle: 'Poussée',
    resultats: RESULTATS_FORCE,
    observations: ['Amplitude limitée', 'Gainage perdu', 'Épaules instables', 'Asymétrie', 'Compensation', 'Douleur / gêne'],
  },
  {
    id: 'tirage',
    libelle: 'Tirage',
    resultats: RESULTATS_FORCE,
    observations: ['Contrôle scapulaire limité', 'Compensation du tronc', 'Asymétrie', 'Amplitude limitée', 'Manque de contrôle', 'Douleur / gêne'],
  },
  {
    id: 'jambes',
    libelle: 'Jambes',
    resultats: RESULTATS_FORCE,
    observations: ['Genoux instables', 'Équilibre limité', 'Amplitude limitée', 'Compensation du dos', 'Asymétrie', 'Douleur / gêne'],
  },
  {
    id: 'cardio',
    libelle: 'Cardio',
    resultats: ['Bonne aisance', 'Aisance correcte', 'Essoufflement marqué', 'Très difficile', 'Test interrompu', 'Non réalisé', 'Non adapté'],
    observations: ['Rythme stable', 'Récupération rapide', 'Récupération lente', 'Fatigue précoce', 'Gêne', 'Douleur'],
    rpe: true,
  },
  {
    id: 'mobilite',
    libelle: 'Mobilité',
    resultats: ['Bonne', 'Correcte', 'Légèrement limitée', 'Nettement limitée', 'Très limitée', 'Non réalisée', 'Non adaptée'],
    observations: ['Chevilles', 'Hanches', 'Épaules', 'Thorax', 'Asymétrie', 'Douleur ou gêne'],
  },
  {
    id: 'posture',
    libelle: 'Posture',
    resultats: ['RAS', 'Légère asymétrie', 'Asymétrie nette', 'Compensation marquée', 'À approfondir', 'Non évaluée'],
    observations: ['Épaules', 'Bassin', 'Tête', 'Dos', 'Appuis', 'Droite-gauche'],
  },
];

export interface ResultatTest {
  /** Absent tant que le coach n'a rien choisi : ce n'est pas « Non réalisé ». */
  resultat?: string;
  observations: string[];
  rpe?: number;
}

export interface Evaluation {
  tests: Partial<Record<IdTest, ResultatTest>>;
  douleur?: 'Oui' | 'Non';
  /** Zone, mouvement concerné et gêne observée. */
  douleurPrecision?: string;
  notes?: string;
}

export const ENTRETIEN: { id: string; libelle: string }[] = [
  { id: 'pourquoiMaintenant', libelle: 'Pourquoi maintenant ?' },
  { id: 'dejaEssaye', libelle: 'Ce qui a déjà été essayé' },
  { id: 'freins', libelle: 'Freins identifiés' },
  { id: 'attentesCoach', libelle: 'Attentes envers le coach' },
  { id: 'projection', libelle: 'Projection à six mois' },
  { id: 'observationsCoach', libelle: 'Observations du coach' },
];

export const evaluationVide = (): Evaluation => ({ tests: {} });

/** Change le résultat d'un test ; toucher à nouveau le même résultat l'efface. */
export function choisirResultat(e: Evaluation, test: IdTest, resultat: string): Evaluation {
  const actuel = e.tests[test] ?? { observations: [] };
  return { ...e, tests: { ...e.tests, [test]: { ...actuel, resultat: actuel.resultat === resultat ? undefined : resultat } } };
}

export function basculerObservation(e: Evaluation, test: IdTest, observation: string): Evaluation {
  const actuel = e.tests[test] ?? { observations: [] };
  const definition = TESTS.find((t) => t.id === test)!;
  const coche = !actuel.observations.includes(observation);
  // Gardées dans l'ordre de la liste, comme dans Airtable.
  const observations = definition.observations.filter((o) => (o === observation ? coche : actuel.observations.includes(o)));
  return { ...e, tests: { ...e.tests, [test]: { ...actuel, observations } } };
}

export function choisirRpe(e: Evaluation, test: IdTest, rpe: number): Evaluation {
  const actuel = e.tests[test] ?? { observations: [] };
  return { ...e, tests: { ...e.tests, [test]: { ...actuel, rpe: actuel.rpe === rpe ? undefined : rpe } } };
}

/** Nombre de tests dont le résultat est choisi, pour l'avancement à l'écran. */
export const testsRenseignes = (e: Evaluation) => TESTS.filter((t) => e.tests[t.id]?.resultat).length;

/** La synthèse texte, au format attendu par le compte rendu. Un champ vide reste « non renseigné ». */
export function syntheseEvaluation(e: Evaluation): string {
  const lignes = TESTS.map((t) => {
    const r = e.tests[t.id];
    const morceaux = [r?.resultat ?? 'non renseigné'];
    if (t.rpe) morceaux.push(r?.rpe ? `RPE ${r.rpe}/10` : 'RPE non renseigné');
    if (r?.observations.length) morceaux.push(r.observations.join(', '));
    return `${t.libelle.toUpperCase()} — ${morceaux.join(' | ')}`;
  });
  const douleur = e.douleur ? [e.douleur.toLowerCase(), e.douleurPrecision?.trim()].filter(Boolean).join(' | ') : 'non renseigné';
  lignes.push(`DOULEUR / GÊNE — ${douleur}`);
  if (e.notes?.trim()) lignes.push(`NOTES — ${e.notes.trim()}`);
  return lignes.join('\n');
}
