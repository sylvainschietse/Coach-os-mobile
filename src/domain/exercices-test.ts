// Exercices choisis par le coach pendant les tests (Booster et onglet Tests de la fiche client).
// Dans Poussée, Tirage, Jambes et Centre du corps, le coach coche un ou plusieurs exercices proposés ou en tape un
// autre ; il peut aussi ajouter des exercices libres. Chaque exercice se mesure à sa façon (répétitions, temps,
// distance, calories ou simple annotation) et peut porter une variante (charge, version adaptée) pour l'adapter au
// profil du client.

export type CategorieExercice = 'poussee' | 'tirage' | 'jambes' | 'core' | 'libre';

export type TypeMesure = 'reps' | 'temps' | 'distance' | 'calories' | 'note';

export interface DefinitionMesure {
  id: TypeMesure;
  libelle: string;
  /** Unité affichée après la valeur ; vide pour une annotation. */
  unite: string;
  /** Exemple dans la case de saisie. */
  exemple: string;
}

export const TYPES_MESURE: DefinitionMesure[] = [
  { id: 'reps', libelle: 'Répétitions', unite: 'rép.', exemple: '12' },
  { id: 'temps', libelle: 'Temps', unite: 's', exemple: '45 ou 1:30' },
  { id: 'distance', libelle: 'Distance', unite: 'm', exemple: '500' },
  { id: 'calories', libelle: 'Calories', unite: 'cal', exemple: '15' },
  { id: 'note', libelle: 'Annotation', unite: '', exemple: 'Bonne technique, fin difficile' },
];

export const mesure = (id: TypeMesure) => TYPES_MESURE.find((m) => m.id === id)!;

export interface ExerciceTest {
  id: string;
  categorie: CategorieExercice;
  nom: string;
  mesure: TypeMesure;
  /** Telle que tapée : « 12 », « 1:30 », ou une phrase pour une annotation. */
  valeur: string;
  /** Charge ou version adaptée : « 8 kg », « sur les genoux », « élastique rouge ». */
  variante?: string;
}

export const CATEGORIES_EXERCICE: { id: CategorieExercice; libelle: string }[] = [
  { id: 'poussee', libelle: 'Poussée' },
  { id: 'tirage', libelle: 'Tirage' },
  { id: 'jambes', libelle: 'Jambes' },
  { id: 'core', libelle: 'Centre du corps' },
  { id: 'libre', libelle: 'Exercices au choix' },
];

export const libelleCategorie = (c: CategorieExercice) => CATEGORIES_EXERCICE.find((x) => x.id === c)!.libelle;

/** Exercices proposés d'un toucher, avec leur façon de mesurer la plus courante (modifiable ensuite). */
export const EXERCICES_PROPOSES: Record<CategorieExercice, { nom: string; mesure: TypeMesure }[]> = {
  poussee: [
    { nom: 'Pompes', mesure: 'reps' },
    { nom: 'Pompes sur les genoux', mesure: 'reps' },
    { nom: 'Pompes inclinées', mesure: 'reps' },
    { nom: 'Développé couché haltères', mesure: 'reps' },
    { nom: 'Développé épaules haltères', mesure: 'reps' },
    { nom: 'Dips sur banc', mesure: 'reps' },
  ],
  tirage: [
    { nom: 'Rowing haltère', mesure: 'reps' },
    { nom: 'Tirage horizontal poulie', mesure: 'reps' },
    { nom: 'Rowing TRX', mesure: 'reps' },
    { nom: 'Tirage vertical poulie', mesure: 'reps' },
    { nom: 'Traction', mesure: 'reps' },
    { nom: 'Traction assistée', mesure: 'reps' },
    { nom: 'Suspension à la barre', mesure: 'temps' },
  ],
  jambes: [
    { nom: 'Squat', mesure: 'reps' },
    { nom: 'Goblet squat', mesure: 'reps' },
    { nom: 'Fentes alternées', mesure: 'reps' },
    { nom: 'Step-up', mesure: 'reps' },
    { nom: 'Chaise contre le mur', mesure: 'temps' },
    { nom: 'Hip thrust', mesure: 'reps' },
    { nom: 'Squat sauté', mesure: 'reps' },
  ],
  core: [
    { nom: 'Planche', mesure: 'temps' },
    { nom: 'Planche latérale', mesure: 'temps' },
    { nom: 'Hollow hold', mesure: 'temps' },
    { nom: 'Dead bug', mesure: 'reps' },
    { nom: 'Bird dog', mesure: 'reps' },
    { nom: 'Crunch', mesure: 'reps' },
    { nom: 'Relevés de jambes', mesure: 'reps' },
    { nom: 'Mountain climbers', mesure: 'reps' },
  ],
  libre: [
    { nom: 'Rameur', mesure: 'distance' },
    { nom: 'Vélo', mesure: 'calories' },
    { nom: 'Course', mesure: 'distance' },
    { nom: 'Burpees', mesure: 'reps' },
    { nom: 'Corde à sauter', mesure: 'reps' },
  ],
};

/** Accepte aussi l'id d'un test (cardio, mobilité…) : la liste est alors vide. */
export const exercicesDe = (liste: ExerciceTest[] | undefined, c: CategorieExercice | string) => (liste ?? []).filter((x) => x.categorie === c);

const memeNom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Toucher un exercice proposé l'ajoute ; le toucher à nouveau le retire. */
export function basculerPropose(liste: ExerciceTest[] | undefined, c: CategorieExercice, nom: string, nouvelId: () => string): ExerciceTest[] {
  const l = liste ?? [];
  if (l.some((x) => x.categorie === c && memeNom(x.nom, nom))) return l.filter((x) => !(x.categorie === c && memeNom(x.nom, nom)));
  const p = EXERCICES_PROPOSES[c].find((x) => x.nom === nom);
  return [...l, { id: nouvelId(), categorie: c, nom, mesure: p?.mesure ?? 'reps', valeur: '' }];
}

/** Ajoute un exercice à nommer par le coach. */
export const ajouterExercice = (liste: ExerciceTest[] | undefined, c: CategorieExercice, id: string): ExerciceTest[] => [
  ...(liste ?? []),
  { id, categorie: c, nom: '', mesure: 'reps', valeur: '' },
];

export const modifierExercice = (liste: ExerciceTest[] | undefined, id: string, patch: Partial<Omit<ExerciceTest, 'id' | 'categorie'>>): ExerciceTest[] =>
  (liste ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x));

export const retirerExercice = (liste: ExerciceTest[] | undefined, id: string): ExerciceTest[] => (liste ?? []).filter((x) => x.id !== id);

/** Un exercice compte dès qu'il a un nom ; sans valeur il reste « à mesurer ». */
export const exercicesRenseignes = (liste: ExerciceTest[] | undefined) => (liste ?? []).filter((x) => x.nom.trim()).length;

/** « 1:30 » → 90, « 45 » → 45, « 12,5 » → 12.5 ; vide ou illisible → undefined. */
export function lireValeur(m: TypeMesure, v: string | undefined): number | undefined {
  const t = v?.trim().replace(',', '.');
  if (!t || m === 'note') return undefined;
  const mmss = m === 'temps' ? /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(t) : null;
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const nombre = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** 90 s → « 1 min 30 s », 45 s → « 45 s ». */
const duree = (s: number) => {
  if (s < 60) return `${nombre(s)} s`;
  const min = Math.floor(s / 60);
  const reste = Math.round(s - min * 60);
  return reste ? `${min} min ${String(reste).padStart(2, '0')} s` : `${min} min`;
};

/** « 12 rép. », « 1 min 30 s », « 500 m », « 15 cal », ou l'annotation telle quelle. */
export function formaterValeur(m: TypeMesure, valeur: string): string {
  if (m === 'note') return valeur.trim();
  const n = lireValeur(m, valeur);
  if (n === undefined) return valeur.trim();
  if (m === 'temps') return duree(n);
  if (m === 'distance' && n >= 1000) return `${nombre(n / 1000)} km`;
  return `${nombre(n)} ${mesure(m).unite}`;
}

/** Valeur tapée mais illisible pour une mesure chiffrée. */
export const valeurInvalide = (x: Pick<ExerciceTest, 'mesure' | 'valeur'>) => x.mesure !== 'note' && !!x.valeur.trim() && lireValeur(x.mesure, x.valeur) === undefined;

/** « Pompes (sur les genoux) : 12 rép. » ; sans valeur : « Pompes : à mesurer ». */
export function texteExercice(x: ExerciceTest): string {
  const nom = `${x.nom.trim()}${x.variante?.trim() ? ` (${x.variante.trim()})` : ''}`;
  const v = formaterValeur(x.mesure, x.valeur);
  return `${nom} : ${v || 'à mesurer'}`;
}

/** Écart avec la dernière fois pour le même exercice mesuré pareil : « +3 rép. », « +15 s », « stable ». */
export function ecartExercice(x: ExerciceTest, avant: ExerciceTest | undefined): string | undefined {
  if (!avant || avant.mesure !== x.mesure) return undefined;
  const a = lireValeur(avant.mesure, avant.valeur);
  const n = lireValeur(x.mesure, x.valeur);
  if (a === undefined || n === undefined) return undefined;
  const d = n - a;
  if (d === 0) return 'stable';
  return `${d > 0 ? '+' : '−'}${formaterValeur(x.mesure, String(Math.abs(d)))}`;
}

/** Le même exercice (même catégorie, même nom) dans une liste plus ancienne. */
export const exerciceAvant = (avant: ExerciceTest[] | undefined, x: ExerciceTest) =>
  x.nom.trim() ? (avant ?? []).find((a) => a.categorie === x.categorie && memeNom(a.nom, x.nom)) : undefined;

/** Les exercices d'une catégorie en une phrase, pour la synthèse et les comptes rendus. */
export function resumeExercices(liste: ExerciceTest[] | undefined, c: CategorieExercice | string, precedent?: ExerciceTest[]): string {
  return exercicesDe(liste, c)
    .filter((x) => x.nom.trim())
    .map((x) => {
      const ecart = ecartExercice(x, exerciceAvant(precedent, x));
      return `${texteExercice(x)}${ecart ? ` (${ecart})` : ''}`;
    })
    .join(', ');
}
