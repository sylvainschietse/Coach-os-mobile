// Badges, série de semaines et grade du client : tout se calcule à partir de ce qu'il a déjà fait (séances du
// programme, activités en plus, records, journées notées). Rien n'est stocké : un badge gagné ne se perd jamais,
// seule la série en cours retombe à zéro après une semaine ratée (avec un joker par mois).

export type CleBadge =
  | 'premiere'
  | 'semaine'
  | 'feu'
  | 'pilier'
  | 'inarretable'
  | 'seances25'
  | 'seances50'
  | 'record'
  | 'records5'
  | 'tonnes10'
  | 'tonnes50'
  | 'bonus'
  | 'mi_parcours'
  | 'cycle'
  | 'journee7'
  | 'journee30'
  | 'carnet';

export type FamilleBadge = 'regularite' | 'progres' | 'programme' | 'habitudes';

export interface DefinitionBadge {
  cle: CleBadge;
  nom: string;
  /** Court, sur la pastille ronde. */
  sigle: string;
  famille: FamilleBadge;
  /** Comment le gagner, écrit pour le client. */
  comment: string;
  /** Le message affiché quand il tombe. */
  bravo: string;
}

export const BADGES: DefinitionBadge[] = [
  { cle: 'premiere', nom: 'Première séance', sigle: '1', famille: 'regularite', comment: 'Fais ta première séance.', bravo: 'C’est parti ! La première est toujours la plus dure.' },
  { cle: 'semaine', nom: 'Semaine complète', sigle: '100%', famille: 'regularite', comment: 'Fais toutes les séances prévues dans une même semaine.', bravo: 'Toutes tes séances de la semaine sont faites. Respect.' },
  { cle: 'feu', nom: 'En feu', sigle: '3', famille: 'regularite', comment: 'Tiens 3 semaines complètes d’affilée.', bravo: '3 semaines sans lâcher. L’habitude est en train de s’installer.' },
  { cle: 'pilier', nom: 'Pilier', sigle: '6', famille: 'regularite', comment: 'Tiens 6 semaines complètes d’affilée.', bravo: '6 semaines d’affilée : tu es devenu·e un pilier.' },
  { cle: 'inarretable', nom: 'Inarrêtable', sigle: '12', famille: 'regularite', comment: 'Tiens 12 semaines complètes d’affilée.', bravo: '12 semaines. Plus rien ne t’arrête.' },
  { cle: 'seances25', nom: '25 séances', sigle: '25', famille: 'regularite', comment: 'Cumule 25 séances (programme et activités en plus).', bravo: '25 séances au compteur, bravo !' },
  { cle: 'seances50', nom: '50 séances', sigle: '50', famille: 'regularite', comment: 'Cumule 50 séances.', bravo: '50 séances. Tu peux être fier·e du chemin parcouru.' },
  { cle: 'record', nom: 'Premier record', sigle: 'PR', famille: 'progres', comment: 'Note ton premier record.', bravo: 'Premier record ! Ce n’est que le début.' },
  { cle: 'records5', nom: '5 records', sigle: '5 PR', famille: 'progres', comment: 'Note 5 records.', bravo: '5 records : tu progresses, et ça se voit.' },
  { cle: 'tonnes10', nom: '10 tonnes', sigle: '10 t', famille: 'progres', comment: 'Soulève 10 tonnes au total pendant tes séances (charge × répétitions).', bravo: '10 tonnes soulevées depuis le début, l’équivalent de 7 voitures.' },
  { cle: 'tonnes50', nom: '50 tonnes', sigle: '50 t', famille: 'progres', comment: 'Soulève 50 tonnes au total.', bravo: '50 tonnes ! Le poids d’un camion bien chargé.' },
  { cle: 'bonus', nom: 'Séance en plus', sigle: '+1', famille: 'programme', comment: 'Ajoute une activité en dehors du programme (cours, course, vélo…).', bravo: 'Une séance en bonus, ça compte aussi.' },
  { cle: 'mi_parcours', nom: 'Mi-parcours', sigle: '½', famille: 'programme', comment: 'Arrive à la moitié de ton cycle.', bravo: 'La moitié du cycle est faite, le plus dur aussi.' },
  { cle: 'cycle', nom: 'Cycle bouclé', sigle: 'OK', famille: 'programme', comment: 'Termine un cycle d’entraînement.', bravo: 'Cycle bouclé ! Ton coach prépare la suite.' },
  { cle: 'journee7', nom: 'Une semaine notée', sigle: '7 j', famille: 'habitudes', comment: 'Note ta journée (sommeil, eau, stress…) 7 jours de suite.', bravo: 'Une semaine de suivi : ton coach voit tout, il peut mieux t’aider.' },
  { cle: 'carnet', nom: 'Carnet tenu', sigle: '5/5', famille: 'habitudes', comment: 'Note 5 séances en entier : chaque exercice avec ses charges et répétitions (à la main ou à voix haute).', bravo: '5 séances notées en entier : ton coach peut ajuster ton programme au kilo près.' },
  { cle: 'journee30', nom: 'Un mois noté', sigle: '30 j', famille: 'habitudes', comment: 'Note ta journée 30 jours de suite.', bravo: '30 jours notés, c’est devenu un réflexe.' },
];

export const BADGE = Object.fromEntries(BADGES.map((b) => [b.cle, b])) as Record<CleBadge, DefinitionBadge>;

export const FAMILLES: { cle: FamilleBadge; libelle: string }[] = [
  { cle: 'regularite', libelle: 'Régularité' },
  { cle: 'progres', libelle: 'Progrès' },
  { cle: 'programme', libelle: 'Programme' },
  { cle: 'habitudes', libelle: 'Petites habitudes' },
];

/** Grades : le nombre de badges gagnés fait monter le client. Noms identiques pour tout le monde. */
export const GRADES = [
  { nom: 'Recrue', seuil: 0, detail: 'Tu commences l’aventure.' },
  { nom: 'Challenger', seuil: 3, detail: 'Tu as pris le rythme.' },
  { nom: 'Athlète', seuil: 6, detail: 'Le sport fait partie de ta semaine.' },
  { nom: 'Élite', seuil: 10, detail: 'Peu de gens tiennent aussi longtemps.' },
  { nom: 'Légende', seuil: 14, detail: 'Le sommet du coaching.' },
] as const;

export interface EntreeBadges {
  aujourdhui: string;
  /** Jours (AAAA-MM-JJ, heure de Paris) des séances du programme faites. */
  seancesProgramme: string[];
  /** Jours des activités faites en dehors du programme (libres ou depuis la montre). */
  activites: string[];
  /** Séances prévues par semaine (1 au minimum). */
  parSemaine: number;
  nbRecords: number;
  /** Charge × répétitions cumulées, en kg. */
  tonnageKg: number;
  /** Cycle en cours : semaine atteinte et nombre de semaines. */
  cycle?: { semaine: number | null; nbSemaines: number };
  cycleTermine: boolean;
  /** Jours où au moins un suivi du quotidien a été noté. */
  joursNotes: string[];
  /** Séances du programme notées en entier (chaque exercice a au moins une série). */
  seancesDetaillees?: number;
}

export interface Progression {
  gagnes: CleBadge[];
  /** Semaines complètes d'affilée en cours (la semaine en cours compte dès qu'elle est complète). */
  serie: number;
  meilleureSerie: number;
  /** Séances faites cette semaine (programme et en plus) face à l'objectif. */
  semaine: { faites: number; objectif: number };
  grade: (typeof GRADES)[number];
  suivant?: (typeof GRADES)[number];
  /** Pour la jauge et l'explication des badges pas encore gagnés. */
  avancement: Partial<Record<CleBadge, { fait: number; but: number }>>;
}

const jourUTC = (j: string) => new Date(`${j}T12:00:00Z`);
const ajouter = (j: string, n: number) => {
  const d = jourUTC(j);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Le lundi de la semaine du jour. */
export const lundiDe = (j: string) => ajouter(j, -((jourUTC(j).getUTCDay() + 6) % 7));

/** Plus longue suite de jours consécutifs présents. */
function suiteDeJours(jours: string[]) {
  const set = new Set(jours);
  let meilleure = 0;
  for (const j of set) {
    if (set.has(ajouter(j, -1))) continue;
    let n = 1;
    while (set.has(ajouter(j, n))) n++;
    meilleure = Math.max(meilleure, n);
  }
  return meilleure;
}

/**
 * Semaines complètes d'affilée. Une semaine ratée peut être couverte par le joker du mois (un par mois civil, mois
 * du lundi) : elle ne casse pas la série, mais ne la fait pas monter. La semaine en cours ne casse jamais la série.
 */
export function series(completes: Set<string>, aujourdhui: string, premiere?: string) {
  const courante = lundiDe(aujourdhui);
  const debut = premiere ? lundiDe(premiere) : courante;
  // Meilleure série, du plus ancien au plus récent.
  let meilleure = 0;
  let n = 0;
  const jokers = new Set<string>();
  for (let l = debut; l < courante; l = ajouter(l, 7)) {
    const mois = l.slice(0, 7);
    if (completes.has(l)) n++;
    else if (n > 0 && !jokers.has(mois)) jokers.add(mois);
    else n = 0;
    meilleure = Math.max(meilleure, n);
  }
  let serie = n;
  if (completes.has(courante)) serie++;
  return { serie, meilleure: Math.max(meilleure, serie) };
}

export function progression(e: EntreeBadges): Progression {
  const objectif = Math.max(1, Math.round(e.parSemaine));
  const parLundi = new Map<string, number>();
  for (const j of [...e.seancesProgramme, ...e.activites]) parLundi.set(lundiDe(j), (parLundi.get(lundiDe(j)) ?? 0) + 1);
  const completes = new Set([...parLundi].filter(([, n]) => n >= objectif).map(([l]) => l));
  const tous = [...e.seancesProgramme, ...e.activites].sort();
  const { serie, meilleure } = series(completes, e.aujourdhui, tous[0]);
  const total = tous.length;
  const notes = suiteDeJours(e.joursNotes);
  const tonnes = e.tonnageKg / 1000;
  const miCycle = e.cycle && e.cycle.nbSemaines > 1 ? Math.ceil(e.cycle.nbSemaines / 2) : 0;

  const avancement: Progression['avancement'] = {
    premiere: { fait: Math.min(total, 1), but: 1 },
    semaine: { fait: Math.min(parLundi.get(lundiDe(e.aujourdhui)) ?? 0, objectif), but: objectif },
    feu: { fait: Math.min(meilleure, 3), but: 3 },
    pilier: { fait: Math.min(meilleure, 6), but: 6 },
    inarretable: { fait: Math.min(meilleure, 12), but: 12 },
    seances25: { fait: Math.min(total, 25), but: 25 },
    seances50: { fait: Math.min(total, 50), but: 50 },
    record: { fait: Math.min(e.nbRecords, 1), but: 1 },
    records5: { fait: Math.min(e.nbRecords, 5), but: 5 },
    tonnes10: { fait: Math.min(Math.floor(tonnes), 10), but: 10 },
    tonnes50: { fait: Math.min(Math.floor(tonnes), 50), but: 50 },
    bonus: { fait: Math.min(e.activites.length, 1), but: 1 },
    journee7: { fait: Math.min(notes, 7), but: 7 },
    journee30: { fait: Math.min(notes, 30), but: 30 },
    carnet: { fait: Math.min(e.seancesDetaillees ?? 0, 5), but: 5 },
    ...(miCycle ? { mi_parcours: { fait: Math.min(e.cycle?.semaine ?? 0, miCycle), but: miCycle } } : {}),
  };
  const gagnes = BADGES.filter((b) => {
    if (b.cle === 'semaine') return completes.size > 0;
    if (b.cle === 'cycle') return e.cycleTermine;
    if (b.cle === 'mi_parcours') return e.cycleTermine || (!!miCycle && (e.cycle?.semaine ?? 0) >= miCycle);
    const a = avancement[b.cle];
    return !!a && a.fait >= a.but;
  }).map((b) => b.cle);

  const rang = GRADES.reduce((r, g, i) => (gagnes.length >= g.seuil ? i : r), 0);
  return {
    gagnes,
    serie,
    meilleureSerie: meilleure,
    semaine: { faites: parLundi.get(lundiDe(e.aujourdhui)) ?? 0, objectif },
    grade: GRADES[rang],
    suivant: GRADES[rang + 1],
    avancement,
  };
}

/** Badges gagnés depuis la dernière visite : ceux à fêter. */
export const nouveaux = (gagnes: CleBadge[], vus: CleBadge[] | null) => (vus === null ? [] : gagnes.filter((b) => !vus.includes(b)));
