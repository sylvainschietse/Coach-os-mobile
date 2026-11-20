// Dictée d'une séance libre : le client raconte ce qu'il a fait (« 3 séries de 10 squats à 40 kilos, puis gainage
// 3 fois 45 secondes ») et on en tire des exercices et des séries, rapprochés de la bibliothèque. Tout se fait sur le
// téléphone, sans serveur ; le client relit et corrige avant d'enregistrer.
import type { ExerciceLibre, SerieLibre } from './activites';
import { rechercherExercices } from './programmes';
import type { Exercice } from './types';

const sansAccents = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const UNITES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, 'soixante-dix': 70, 'quatre-vingt': 80, 'quatre-vingts': 80, 'quatre-vingt-dix': 90, cent: 100,
};

/** « trois séries de dix » → « 3 séries de 10 » ; « vingt-cinq » → 25 ; « 12,5 » → 12.5. */
function chiffres(t: string) {
  return t
    .replace(/\b([a-z]+(?:-[a-z]+)*)(?:-et-|\s+et\s+)(un|une)\b/g, (m, d: string) => (UNITES[d] && UNITES[d] >= 20 ? String(UNITES[d] + 1) : m))
    .replace(/\b[a-z]+(?:-[a-z]+)*\b/g, (m) => {
      if (UNITES[m] !== undefined) return String(UNITES[m]);
      const [d, u] = [m.slice(0, m.lastIndexOf('-')), m.slice(m.lastIndexOf('-') + 1)];
      return m.includes('-') && UNITES[d] >= 20 && UNITES[u] !== undefined && UNITES[u] < 20 ? String(UNITES[d] + UNITES[u]) : m;
    })
    .replace(/(\d),(\d)/g, '$1.$2');
}

// Mots qui ne font pas partie du nom de l'exercice.
const VIDES = new Set(
  "j ai fait fais faire puis ensuite apres et avec de des du d la le les l a au aux en pour sur un une series serie fois tours tour reps rep repetitions repetition kg kilos kilo s secondes seconde sec min minutes minute chaque environ ok alors aussi encore x par cote".split(' '),
);

/** Un morceau de phrase = un exercice. */
function lireMorceau(brut: string): { nom: string; series: SerieLibre[] } | null {
  let t = ` ${chiffres(sansAccents(brut))} `
    .replace(/kilos?|kilogrammes?|kgs?/g, ' kg ')
    .replace(/\bsecondes?|\bsec\b/g, ' s ')
    .replace(/\bminutes?\b/g, ' min ')
    .replace(/(\d)\s*[x×*]\s*(\d)/g, '$1 x $2')
    .replace(/\s+/g, ' ');

  let nbSeries: number | undefined;
  let reps: number | undefined;
  let charge: number | undefined;
  let duree: number | undefined;
  const prendre = (re: RegExp, f: (m: RegExpMatchArray) => void) => {
    const m = t.match(re);
    if (m) {
      f(m);
      t = t.replace(m[0], ' ');
    }
  };
  const n = (s: string) => Number(s);

  prendre(/(\d+(?:\.\d+)?)\s*kg\b/, (m) => (charge = n(m[1])));
  prendre(/(\d+)\s*min\b(?:\s*(\d+)\s*s?\b)?/, (m) => (duree = n(m[1]) * 60 + (m[2] ? n(m[2]) : 0)));
  prendre(/(\d+)\s*s\b/, (m) => (duree = n(m[1])));
  // « 3 séries de 10 », « 3 x 10 », « 3 fois 10 », « 4 tours de 12 »
  prendre(/(\d+)\s*(?:series?|x|fois|tours?)\s*(?:de\s+)?(\d+)\b(?!\s*(?:kg|s\b|min))/, (m) => {
    nbSeries = n(m[1]);
    reps = n(m[2]);
  });
  prendre(/(\d+)\s*(?:series?|x|fois|tours?)\b/, (m) => (nbSeries ??= n(m[1])));
  prendre(/(\d+)\s*(?:repetitions?|reps?)\b/, (m) => (reps ??= n(m[1])));
  // « à 40 » sans unité après des répétitions : c'est la charge.
  if (charge === undefined) prendre(/\ba\s+(\d+(?:\.\d+)?)\b/, (m) => (charge = n(m[1])));
  // Il reste un nombre seul : des répétitions si on n'en a pas, sinon une charge.
  prendre(/\b(\d+(?:\.\d+)?)\b/, (m) => {
    if (reps === undefined) reps = n(m[1]);
    else charge ??= n(m[1]);
  });

  const nom = t
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .split(/[\s'’]+/)
    .filter((w) => w && !VIDES.has(w))
    .join(' ')
    .trim();
  if (!nom) return null;
  const serie: SerieLibre = {};
  if (reps !== undefined) serie.repetitions = reps;
  if (charge !== undefined) serie.charge = charge;
  if (duree !== undefined) serie.duree = duree;
  const combien = Math.min(Math.max(nbSeries ?? 1, 1), 20);
  return { nom, series: Object.keys(serie).length ? Array.from({ length: combien }, () => ({ ...serie })) : [] };
}

/**
 * Ce qu'on dit le plus souvent (sans accents ni petits mots : « soulevé de terre » devient « souleve terre »), et
 * l'exercice « standard » qu'on entend par là. Si le client précise le matériel
 * (« squat haltères »), la recherche normale le trouve.
 */
const USUELS: Record<string, string> = {
  squat: 'Squat arrière — barre',
  'squat barre': 'Squat arrière — barre',
  'souleve terre': 'Soulevé de terre conventionnel — barre',
  deadlift: 'Soulevé de terre conventionnel — barre',
  'developpe couche': 'Développé couché — barre',
  'bench press': 'Développé couché — barre',
  'developpe militaire': 'Développé militaire debout — barre',
  pompe: 'Pompe — poids du corps',
  traction: 'Traction pronation stricte — poids du corps',
  dip: 'Dips buste vertical — poids du corps',
  gainage: 'Planche avant-bras',
  planche: 'Planche avant-bras',
  'gainage lateral': 'Planche latérale',
  burpee: 'Burpee au sol',
  crunch: 'Crunch au sol',
  abdo: 'Crunch au sol',
  fente: 'Fente avant — haltères',
  'hip thrust': 'Hip thrust — barre',
  rowing: 'Rowing buste penché — barre',
  'presse cuisse': 'Presse à cuisses inclinée — machine',
  'rowing haltere': 'Rowing à un bras — haltères',
  presse: 'Presse à cuisses inclinée — machine',
  'leg curl': 'Leg curl couché — machine',
  'elevation laterale': 'Élévation latérale — haltères',
  swing: 'Swing russe kettlebell',
  'kettlebell swing': 'Swing russe kettlebell',
  'mountain climber': 'Mountain climber',
};

/** Ordre de préférence du matériel quand plusieurs variantes conviennent. */
const MATERIEL = [' — barre', ' — poids du corps', ' — haltères', ' — machine', ' — kettlebell'];
const rangMateriel = (nom: string) => {
  const i = MATERIEL.findIndex((m) => nom.endsWith(m));
  return i < 0 ? MATERIEL.length : i;
};

/** Le meilleur exercice de la bibliothèque pour un nom dicté, s'il y en a un. */
export function rapprocher(nom: string, catalogue: Exercice[]): Exercice | undefined {
  const mots = nom.split(' ').filter(Boolean);
  const singulier = mots.map((m) => (m.length > 3 ? m.replace(/(s|x)$/, '') : m));
  const usuel = USUELS[singulier.join(' ')] ?? USUELS[mots.join(' ')];
  const trouve = usuel && catalogue.find((e) => e.nom === usuel);
  if (trouve) return trouve;
  // On essaie la phrase entière, puis en retirant des mots à la fin (« squat lourd » → « squat »).
  for (const essai of [mots, singulier]) {
    for (let k = essai.length; k >= 1; k--) {
      const q = essai.slice(0, k).join(' ');
      const { exercices } = rechercherExercices(catalogue, q, undefined, 200);
      if (exercices.length) {
        // Parmi ceux qui commencent par les mots dits : la variante de matériel la plus courante, puis le nom le plus court.
        const premiers = exercices.filter((e) => sansAccents(e.nom).startsWith(sansAccents(q)));
        return (premiers.length ? premiers : exercices).slice().sort((a, b) => rangMateriel(a.nom) - rangMateriel(b.nom) || a.nom.length - b.nom.length)[0];
      }
    }
  }
  return undefined;
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Texte dicté → exercices, rapprochés de la bibliothèque quand c'est possible. */
export function lireDictee(texte: string, catalogue: Exercice[]): ExerciceLibre[] {
  const morceaux = texte
    .split(/[.;\n]|,|\b(?:puis|ensuite|apres ca|après ça|après|et apres|et après|enfin)\b/i)
    .map((m) => m.trim())
    .filter(Boolean);
  const exercices: ExerciceLibre[] = [];
  for (const m of morceaux) {
    const lu = lireMorceau(m);
    if (!lu) continue;
    const ex = rapprocher(lu.nom, catalogue);
    exercices.push({ exerciceId: ex?.id, nom: ex?.nom ?? majuscule(lu.nom), mesures: ex?.mesures, series: lu.series });
  }
  return exercices;
}
