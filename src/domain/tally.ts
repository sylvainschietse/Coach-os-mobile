// Lot 6 · Réception du questionnaire Tally historique (tally.so/r/81Ye7r) sans passer par Make.
// Le webhook Tally envoie chaque réponse ; on la traduit dans les clés du questionnaire Coach OS (questionnaire.ts),
// puis la base fait le même rapprochement que le formulaire de l'app (téléphone, puis e-mail, jamais le nom).
// Ce fichier est aussi copié dans la fonction Edge `tally` (Deno) : aucune dépendance.

/** Identifiants des questions du formulaire Tally → clés du questionnaire Coach OS. Lus sur le formulaire, en lecture seule. */
export const QUESTIONS_TALLY: Record<string, string> = {
  LYoJO1: 'nom',
  pWZ7zb: 'prenom',
  '1vBJRW': 'telephone',
  MYGJVX: 'email',
  JDBJod: 'dateNaissance',
  BQKXY5: 'motivation',
  k79y41: 'objectif',
  vOrAav: 'objectifAutre',
  KJe64A: 'pourquoi',
  LJzbjj: 'echeance',
  p7dKNq: 'sommeilHeures',
  '1JklYQ': 'sommeilQualite',
  MJDb2p: 'reveilRepose',
  JJd6r4: 'alimentation',
  g7e0Vl: 'repas',
  yEN6bB: 'grignotage',
  XMrD7j: 'proteines',
  '8PzKYO': 'fruitsLegumes',
  '0J7xYN': 'ultraTransformes',
  zrNqAa: 'sel',
  '5G4zY6': 'boissonsSucrees',
  dDN6Gq: 'restaurant',
  YMRQB5: 'eau',
  DJKNOq: 'stress',
  l7qy2B: 'tabac',
  RJd0ed: 'alcool',
  o7DyNe: 'activiteReguliere',
  GJKzEp: 'activites',
  OJlzq7: 'activitesAutre',
  VMj07J: 'anciennete',
  PXD6Q5: 'seancesActuelles',
  EJ5XVX: 'seancesPossibles',
  rdB69l: 'lieu',
  '4oB80k': 'materiel',
  j7by4x: 'materielAutre',
  '2JBedL': 'typesAimes',
  xPjpby: 'aEviter',
  RJd0eJ: 'douleur',
  o7DyNV: 'douleurDetail',
  GJKzEo: 'contreIndication',
  OJlzq8: 'attentes',
  PXD6Qb: 'dejaCoach',
  EJ5XVN: 'coachApprecie',
  rdB69v: 'coachDecu',
  '4oB80O': 'bonCoach',
  j7by4E: 'motivationNote',
  '2JBedV': 'empeche',
  xPjpbo: 'obstacle',
  ZzoNky: 'obstacleAutre',
  NJD6NQ: 'autreChose',
};

/** Même séparateur que les choix multiples du questionnaire de l'app. */
const SEPARATEUR = ', ';

type ChampTally = { key?: string; label?: string; type?: string; value?: unknown; options?: { id: string; text: string }[] };
export type WebhookTally = { eventId?: string; eventType?: string; data?: { responseId?: string; submissionId?: string; formId?: string; fields?: ChampTally[] } };

function texteDe(champ: ChampTally): string {
  const v = champ.value;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    // Choix : Tally envoie les identifiants des options ; on garde leur libellé.
    const libelles = v.map((x) => champ.options?.find((o) => o.id === x)?.text ?? String(x));
    return libelles.filter(Boolean).join(SEPARATEUR);
  }
  return String(v).trim();
}

/** AAAA-MM-JJ (Tally) → JJ/MM/AAAA (questionnaire de l'app). */
const dateFr = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v);

/**
 * Traduit une réponse Tally. `envoi` (identifiant de la réponse Tally) rend la réception rejouable sans doublon.
 * Les questions inconnues (ajoutées plus tard dans Tally) sont ignorées et listées dans `ignorees` pour le journal.
 */
export function reponsesDepuisTally(w: WebhookTally): { envoi: string; reponses: Record<string, string>; ignorees: string[] } {
  if (w.eventType && w.eventType !== 'FORM_RESPONSE') throw new Error(`Événement Tally non pris en charge : ${w.eventType}`);
  const d = w.data;
  const envoi = d?.responseId || d?.submissionId;
  if (!d || !envoi || !Array.isArray(d.fields)) throw new Error('Réponse Tally incomplète');
  const reponses: Record<string, string> = { source: 'Tally' };
  const ignorees: string[] = [];
  for (const champ of d.fields) {
    // Tally ajoute aussi une entrée par case cochée (question_<id>_<option>, valeur vraie/faux) : seule la question elle-même compte.
    const id = /^question_([A-Za-z0-9]+)$/.exec(champ.key ?? '')?.[1];
    if (!id && /^question_[A-Za-z0-9]+_/.test(champ.key ?? '')) continue;
    const cle = id ? QUESTIONS_TALLY[id] : undefined;
    if (!cle) {
      if (champ.label) ignorees.push(champ.label);
      continue;
    }
    const t = texteDe(champ);
    if (t) reponses[cle] = cle === 'dateNaissance' ? dateFr(t) : t;
  }
  return { envoi: `tally:${envoi}`, reponses, ignorees };
}
