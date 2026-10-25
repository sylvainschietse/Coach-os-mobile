// Règles de l'entraînement reprises de l'app d'origine (apps/coach-os/src/lib) : trainingCycles.ts, prescription.ts,
// trainingSources.ts, copie.ts, programmeCreation.ts, suivi.ts. Pures, sans écran ni base.
import sources from '@/data/sources-entrainement.json';

import type { VarianteCycle } from './cycles';
import type { Exercice, LignePrescription, Programme, Seance } from './types';

type NouvelId = () => string;

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// ---------- Quatre cycles d'un modèle (trainingCycles.ts) ----------

export const LIBELLES_CYCLES = ['1 · Technique et régularité', '2 · Progression des charges', '3 · Hypertrophie et méthodes', '4 · Force et consolidation'];

const PHRASE_CYCLES =
  'Les prescriptions affichées par défaut correspondent au cycle 1. Les cycles 2–4 se choisissent lors de la duplication ou de l’attribution en copie.';

/** Même schéma que l'original : exactement quatre variantes complètes, sinon on les ignore. */
export function cyclesValides(v: unknown): v is Required<VarianteCycle>[] {
  if (!Array.isArray(v) || v.length !== 4) return false;
  return v.every(
    (x) =>
      x &&
      Number.isInteger(x.series) &&
      x.series >= 1 &&
      x.series <= 8 &&
      typeof x.repetitions === 'string' &&
      x.repetitions.length <= 100 &&
      typeof x.recuperationS === 'number' &&
      x.recuperationS >= 0 &&
      x.recuperationS <= 600 &&
      typeof x.rir === 'number' &&
      x.rir >= 0 &&
      x.rir <= 5 &&
      ['chargeIntensite', 'tempo', 'consignes', 'progressionPrevue'].every((k) => typeof x[k] === 'string') &&
      (x.exercice === undefined || (typeof x.exercice?.id === 'string' && typeof x.exercice?.nom === 'string' && x.exercice.nom.length > 0)),
  );
}

/**
 * Applique un cycle à une ligne. Cycle 1 : la ligne telle que le coach l'a réglée ; cycles 2 à 4 : la variante du modèle.
 * Le résultat ne porte plus de variantes : une copie est indépendante du modèle.
 */
export function appliquerCycle(l: LignePrescription, cycle = 1): LignePrescription {
  if (!cyclesValides(l.cycles) || !Number.isInteger(cycle) || cycle < 1 || cycle > 4) return l;
  const { cycles: _variantes, ...ligne } = l;
  if (cycle === 1) return ligne;
  const v = l.cycles[cycle - 1];
  const reps = lireRepetitions(v.repetitions);
  return {
    ...ligne,
    series: v.series,
    repetitions: v.repetitions,
    repetitionsMin: reps?.min,
    repetitionsMax: reps?.max,
    recuperationS: v.recuperationS,
    rir: Number(v.rir),
    // Texte vide dans la variante : on garde celui de la ligne (le catalogue ne le répète pas pour chaque cycle).
    chargeIntensite: v.chargeIntensite || ligne.chargeIntensite,
    tempo: v.tempo || ligne.tempo,
    consignes: v.consignes || ligne.consignes,
    progression: v.progressionPrevue || ligne.progression,
    exercice: v.exercice ? exerciceDuCycle(ligne.exercice, v.exercice) : ligne.exercice,
  };
}

/** Le mouvement du cycle remplace celui de la ligne ; sans mesures précisées, il garde celles de l'ancien (variante proche). */
const exerciceDuCycle = (avant: Exercice, v: NonNullable<VarianteCycle['exercice']>): Exercice => ({
  id: v.id,
  nom: v.nom,
  mesures: (v.mesures?.length ? v.mesures : avant.mesures) as Exercice['mesures'],
  videoUrl: v.videoUrl,
});

export const aDesCycles = (s: Pick<Seance, 'blocs'>) => s.blocs.some((b) => b.lignes.some((l) => cyclesValides(l.cycles)));

/** Consignes d'une séance copiée : la phrase sur le choix du cycle devient le cycle retenu. */
export const consignesDuCycle = (texte: string | undefined, cycle = 1) =>
  (texte ?? '').replace(PHRASE_CYCLES, `${LIBELLES_CYCLES[cycle - 1]} · Réglages enregistrés dans cette copie.`);

/** « 12–15 », « 6–8 par côté », « 10 » → bornes ; « AMRAP » → rien. */
export function lireRepetitions(texte?: string): { min: number; max: number } | undefined {
  const m = /^\s*(\d+)(?:\s*[-–à]\s*(\d+))?/.exec(texte ?? '');
  if (!m) return undefined;
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  return max >= min ? { min, max } : undefined;
}

// ---------- Prescription selon la famille (prescription.ts) ----------

export type TypeExercice = 'force' | 'statique' | 'porte' | 'rameur' | 'skierg' | 'velo' | 'course' | 'cardio';
export type Objectif = 'temps' | 'distance' | 'calories' | 'vitesse' | 'watts' | 'allure500' | 'allureKm';

export const LIBELLES_TYPE: Record<TypeExercice, string> = {
  force: 'Renforcement',
  statique: 'Statique / gainage',
  porte: 'Déplacement avec charge',
  rameur: 'Rameur',
  skierg: 'SkiErg',
  velo: 'Vélo',
  course: 'Course / marche',
  cardio: 'Autre appareil cardio',
};

export const LIBELLES_OBJECTIF: Record<Objectif, string> = {
  temps: 'Temps',
  distance: 'Distance',
  calories: 'Calories',
  vitesse: 'Vitesse',
  watts: 'Puissance',
  allure500: 'Temps au 500 m',
  allureKm: 'Allure au km',
};

export const UNITES_OBJECTIF: Record<Objectif, string> = {
  temps: 'Secondes',
  distance: 'Mètres',
  calories: 'Calories',
  vitesse: 'km/h',
  watts: 'Watts',
  allure500: 'min:ss / 500 m',
  allureKm: 'min:ss / km',
};

/** Règles exactes de l'original : un « rowing » de musculation reste un exercice de force. */
export function typeExercice(nom: string, famille = '', materiel: string | string[] = ''): TypeExercice {
  const tout = sansAccents(`${nom} ${famille} ${Array.isArray(materiel) ? materiel.join(' ') : materiel}`);
  if (/ski.?erg|skierg/.test(tout)) return 'skierg';
  if (/rameur|rowing machine|row.?erg|ergometre.*rame/.test(tout)) return 'rameur';
  if (/\bvelo\b|\bbike\b|airbike|assault.?bike|bicycl|cyclisme/.test(tout)) return 'velo';
  if (/course|courir|running|tapis.*(course|roulant)|jogging|sprint|marche.*(tapis|rapide)/.test(tout)) return 'course';
  if (/farmer|carry|marche.*(charge|valise)|suitcase|sled|traineau/.test(tout)) return 'porte';
  if (/planche|plank|gainage|isomet|statique|chaise|wall sit|l.?sit|dead hang|suspension.*maintien/.test(tout)) return 'statique';
  if (/elliptique|stepper|cardio.*machine|assault/.test(tout)) return 'cardio';
  return 'force';
}

export const typeDe = (e: Pick<Exercice, 'nom' | 'famille' | 'materiel'>) => typeExercice(e.nom, e.famille, e.materiel);

export function objectifsPour(k: TypeExercice): Objectif[] {
  if (k === 'rameur' || k === 'skierg') return ['temps', 'distance', 'calories', 'watts', 'allure500'];
  if (k === 'velo') return ['temps', 'distance', 'calories', 'vitesse', 'watts'];
  if (k === 'course') return ['temps', 'distance', 'vitesse', 'allureKm', 'calories', 'watts'];
  if (k === 'cardio') return ['temps', 'distance', 'calories', 'vitesse', 'watts'];
  if (k === 'porte') return ['temps', 'distance'];
  return ['temps'];
}

/** « 2:05 » → 125 secondes ; tout autre format → NaN (pas de conversion devinée). */
export function secondesAllure(v: string) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function objectifValide(k: Objectif, v: string) {
  const allure = k === 'allure500' || k === 'allureKm';
  const n = allure ? secondesAllure(v) : Number(v.replace(',', '.'));
  return (
    !!v.trim() &&
    (allure || /^\d+(?:[.,]\d+)?$/.test(v.trim())) &&
    Number.isFinite(n) &&
    n > 0 &&
    n <= 1000000 &&
    (!['temps', 'calories'].includes(k) || Number.isInteger(n))
  );
}

/** Ce qui est écrit dans « Charge / intensité » pour un objectif (temps et distance ont leur propre colonne). */
export function texteObjectif(k: Objectif, v: string) {
  const valeur = v.trim().replace(',', '.');
  if (k === 'calories') return `${valeur} cal`;
  if (k === 'vitesse') return `${valeur} km/h`;
  if (k === 'watts') return `${valeur} W`;
  if (k === 'allure500') return `${v.trim()} / 500 m`;
  if (k === 'allureKm') return `${v.trim()} / km`;
  return '';
}

export const estObjectifCardio = (charge?: string) => / cal$| km\/h$| W$| \/ (500 m|km)$/.test(charge ?? '');

/** Relit l'objectif d'une ligne enregistrée. */
export function lireObjectif(l: Pick<LignePrescription, 'distanceM' | 'dureeS' | 'chargeIntensite'>): { type: Objectif; valeur: string } {
  const c = (l.chargeIntensite ?? '').trim();
  const motifs: [Objectif, RegExp][] = [
    ['calories', /^([\d.,]+) cal$/],
    ['vitesse', /^([\d.,]+) km\/h$/],
    ['watts', /^([\d.,]+) W$/],
    ['allure500', /^(\d+:\d{2}) \/ 500 m$/],
    ['allureKm', /^(\d+:\d{2}) \/ km$/],
  ];
  for (const [type, motif] of motifs) {
    const m = motif.exec(c);
    if (m) return { type, valeur: m[1] };
  }
  if (l.distanceM !== undefined) return { type: 'distance', valeur: String(l.distanceM) };
  return { type: 'temps', valeur: l.dureeS === undefined ? '' : String(l.dureeS) };
}

/** Format de travail de la ligne dans l'éditeur (LigneAirtableDialog). */
export type Format = 'reps' | 'temps' | 'objectif';

export function formatDeLigne(l: Pick<LignePrescription, 'distanceM' | 'dureeS' | 'chargeIntensite'>, type: TypeExercice): Format {
  if (l.distanceM !== undefined || lireObjectif(l).type !== 'temps') return 'objectif';
  if (l.dureeS) return 'temps';
  if (type === 'statique') return 'temps';
  return ['rameur', 'skierg', 'velo', 'course', 'cardio', 'porte'].includes(type) ? 'objectif' : 'reps';
}

/** Type affiché d'une ligne existante : l'enregistrement peut corriger ce que le nom laisse deviner. */
export function typeDeLigne(l: LignePrescription): TypeExercice {
  const devine = typeDe(l.exercice);
  if (devine === 'force' && l.distanceM !== undefined) return 'porte';
  if (devine === 'force' && lireObjectif({ chargeIntensite: l.chargeIntensite }).type !== 'temps') return 'cardio';
  return devine;
}

const duree = (s?: number) => (s === undefined ? '' : s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);
export const dureeCourte = duree;

/** Les cases de la carte d'exercice (AirtableSeance) : seulement ce qui est renseigné. */
export function casesLigne(l: LignePrescription): [string, string][] {
  const cases: [string, string][] = [
    ['Séries', String(l.series)],
    ['Reps', l.repetitions ?? (l.repetitionsMin !== undefined ? repsNumeriques(l) : '')],
    ['Durée', duree(l.dureeS)],
    ['Récup.', duree(l.recuperationS)],
    ['RIR', l.rir === undefined ? '' : String(l.rir)],
    ['Tempo', l.tempo ?? ''],
  ];
  if (l.distanceM !== undefined) cases.push(['Distance', `${String(l.distanceM).replace('.', ',')} m`]);
  if (l.chargeIntensite) cases.push([estObjectifCardio(l.chargeIntensite) ? 'Objectif' : 'Charge', l.chargeIntensite]);
  return cases.filter(([, v]) => v !== '');
}

const repsNumeriques = (l: LignePrescription) =>
  l.repetitionsMax !== undefined && l.repetitionsMax !== l.repetitionsMin ? `${l.repetitionsMin}–${l.repetitionsMax}` : `${l.repetitionsMin}`;

/** La ligne de prescription vue par le client (SeanceLog) : « 3 × 12–15 · récup 2 min 30 · RIR 3 ». */
export function prescriptionClient(l: LignePrescription) {
  const reps = l.repetitions ?? (l.repetitionsMin !== undefined ? repsNumeriques(l) : '');
  const morceaux = [`${l.series} × ${reps || duree(l.dureeS) || '—'}`];
  if (l.recuperationS !== undefined) morceaux.push(`récup ${duree(l.recuperationS)}`);
  if (l.rir !== undefined) morceaux.push(`RIR ${l.rir}`);
  if (l.tempo) morceaux.push(`tempo ${l.tempo}`);
  if (l.chargeIntensite) morceaux.push(l.chargeIntensite);
  return morceaux.join(' · ');
}

// ---------- Collections et sources (trainingSources.ts) ----------

export const COLLECTIONS = ['Fondamentaux', 'Références', 'Calisthénie', 'Mes créations'];

export interface SourceEntrainement {
  code: string;
  category: string;
  author: string;
  title: string;
  url: string;
  changes: string;
}

export const sourceEntrainement = (nom: string) => (sources as SourceEntrainement[]).find((s) => nom.startsWith(`${s.code} · `));

export const collectionDe = (nom: string) => sourceEntrainement(nom)?.category || (/^MOD-SAL-/.test(nom) ? 'Fondamentaux' : 'Mes créations');

/** Recherche sans accents sur le nom, l'auteur de la référence et la collection. */
export const correspondRecherche = (nom: string, q: string) =>
  sansAccents([nom, sourceEntrainement(nom)?.author ?? '', collectionDe(nom)].join(' ')).includes(sansAccents(q.trim()));

export const NIVEAUX = ['Débutant', 'Intermédiaire', 'Confirmé', 'Expert'];
export const OBJECTIFS = ['Remise en forme', 'Perte de poids', 'Prise de muscle', 'Prise de force'];

/**
 * Titre affiché (client et coach) : sans les codes internes du modèle (MOD-…, REF-…, CAL-…), « Copie » ni la mention
 * d'adaptation. Le code reste dans le titre enregistré : il sert à la collection et à la recherche.
 */
export const titreClient = (nom: string) =>
  nom
    .split(' · ')
    .filter((x) => !/^(MOD|REF|CAL)-[A-Z0-9-]+$|^Copie$|^Adaptation Coach OS$/.test(x.trim()))
    .join(' · ') || nom;

/** Code interne d'un modèle (« MOD-SAL-23-3 »), montré en petit au coach seulement. */
export const codeModele = (nom: string) => /^((?:MOD|REF|CAL)-[A-Z0-9-]+)(?: · |$)/.exec(nom)?.[1];

// ---------- Copies indépendantes (copie.ts, programmeCreation.ts) ----------

/** Copie d'une séance : nouveaux identifiants, cycle appliqué, sans résultats ni lien avec l'original. */
export function copierSeance(
  source: Seance,
  opts: { titre?: string; programmeId?: string; ordre?: number; cycle?: number; clientId?: string },
  nouvelId: NouvelId,
): Seance {
  const cycle = opts.cycle ?? 1;
  return {
    id: nouvelId(),
    clientId: opts.clientId,
    programmeId: opts.programmeId,
    titre: (opts.titre ?? source.titre).slice(0, 160),
    ordre: opts.ordre ?? source.ordre,
    dominante: source.dominante,
    dureeMin: source.dureeMin,
    objectif: source.objectif,
    consignes: consignesDuCycle(source.consignes, cycle) || undefined,
    blocs: source.blocs.map((b) => ({ ...b, id: nouvelId(), lignes: b.lignes.map((l) => ({ ...appliquerCycle(l, cycle), id: nouvelId() })) })),
  };
}

/**
 * Copie d'un modèle. Pour un client (attribution en copie, copierModele) : Brouillon, cycle noté en tête des consignes,
 * lien vers le modèle d'origine. Pour la bibliothèque (Dupliquer le programme) : un nouveau modèle avec tous ses critères.
 */
export function copierProgramme(
  modele: Programme,
  seances: Seance[],
  opts: { titre: string; cycle?: number; clientId?: string },
  nouvelId: NouvelId,
): { programme: Programme; seances: Seance[] } {
  const cycle = opts.cycle ?? 1;
  const id = nouvelId();
  const commun = {
    id,
    titre: opts.titre.trim().slice(0, 250),
    statut: 'Brouillon',
    niveau: modele.niveau,
    objectif: modele.objectif,
    seancesParSemaine: modele.seancesParSemaine,
    dureeSemaines: modele.dureeSemaines,
    environnement: modele.environnement,
    contraintes: modele.contraintes,
  };
  const programme: Programme = opts.clientId
    ? {
        ...commun,
        clientId: opts.clientId,
        consignes: `${LIBELLES_CYCLES[cycle - 1]} · Cycle de ${modele.dureeSemaines ?? 5} semaines.\n${modele.consignes ?? ''}`,
        modeleOrigineId: modele.id,
        cycleApplique: cycle,
        seances: [],
      }
    : {
        ...commun,
        materiel: modele.materiel,
        consignes: modele.consignes,
        priorites: modele.priorites,
        dureeCibleMin: modele.dureeCibleMin,
        version: 'coachos-free',
        cycleApplique: aDesCyclesProgramme(seances) ? cycle : undefined,
        seances: [],
      };
  return {
    programme,
    seances: seances.map((s) => copierSeance(s, { programmeId: id, clientId: opts.clientId, cycle }, nouvelId)),
  };
}

const aDesCyclesProgramme = (seances: Seance[]) => seances.some(aDesCycles);

/** Nom d'une copie pour un client (setCycleProgramme). */
export const nomCopieClient = (client: string, cycle: string, modele: string) => `Copie · ${client} · ${cycle} · ${modele}`;

/** Remplacer l'exercice d'une ligne qui a des variantes : elles ne valent plus pour le nouveau mouvement. */
export function remplacerExercice(l: LignePrescription, exercice: Exercice): LignePrescription {
  const { cycles: _variantes, ...ligne } = l;
  return { ...ligne, exercice };
}

// ---------- Suivi et cycles du client (suivi.ts, getClientEspace.ts) ----------

const jourUtc = (d: string) => new Date(`${d}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const ajouterJours = (d: string, n: number) => {
  const v = jourUtc(d);
  v.setUTCDate(v.getUTCDate() + n);
  return iso(v);
};

/** Date du jour à Paris. */
export const aujourdhuiParis = (maintenant = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(maintenant);

/** Jour à Paris d'un horodatage. */
export const jourParis = (horodatage: string) => aujourdhuiParis(new Date(horodatage));

/** Fin d'un suivi en mois calendaires : 10/10 + 3 mois → 09/01. */
export function finSuivi(debut: string, mois: number) {
  if (!debut || !mois) return '';
  const d = jourUtc(debut);
  const cible = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mois, 1, 12));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0, 12)).getUTCDate();
  cible.setUTCDate(Math.min(d.getUTCDate(), dernier));
  cible.setUTCDate(cible.getUTCDate() - 1);
  return iso(cible);
}

export const semaineDe = (debut: string, ref: string) => Math.floor((jourUtc(ref).getTime() - jourUtc(debut).getTime()) / 864e5 / 7) + 1;

export const lundiDe = (d: string) => ajouterJours(d, -((jourUtc(d).getUTCDay() + 6) % 7));

export type StatutCycle = 'Brouillon' | 'Prêt' | 'Actif' | 'Terminé';
export type EtatCycle = 'a_venir' | 'en_cours' | 'depasse';

/** État dans le temps, distinct du statut enregistré par le coach. */
export function etatCycle(c: { debut: string; fin: string }, jour = aujourdhuiParis()): EtatCycle {
  if (!c.debut || jour < c.debut) return 'a_venir';
  if (c.fin && jour > c.fin) return 'depasse';
  return 'en_cours';
}

export const dansDates = (c: { debut: string; fin: string }, jour = aujourdhuiParis()) => !!c.debut && !!c.fin && c.debut <= jour && jour <= c.fin;

/** Semaine x / y d'un cycle en cours (getClientEspace). */
export function avancementCycle(c: { debut: string; fin: string }, jour = aujourdhuiParis()) {
  const etat = etatCycle(c, jour);
  const nbSemaines = c.debut && c.fin ? semaineDe(c.debut, c.fin) : 0;
  return { etat, nbSemaines, semaine: etat === 'en_cours' ? semaineDe(c.debut, jour) : null };
}

// ---------- Suggestion d'après un pourcentage du 1RM (performances.ts) ----------

/** Epley, sauf une répétition qui reprend la charge. */
export const unRm = (charge: number, reps: number) => Math.round((reps === 1 ? charge : charge * (1 + reps / 30)) * 100) / 100;

/** Seul un pourcentage de charge, ou explicitement de 1RM / max, produit une suggestion (pas un % de FC). */
export function lirePourcentage(charge: string, consignes = ''): { min: number; max: number } | null {
  const texte = charge.trim().replace(/,/g, '.');
  const seul = /^(\d+(?:\.\d+)?)\s*(?:[-–à]\s*(\d+(?:\.\d+)?))?\s*%\s*(?:(?:du|de|d[u']?)\s*)?(?:1\s*rm|rm|max(?:imum)?)?$/i;
  const m =
    texte.match(seul) ||
    consignes.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:[-–à]\s*(\d+(?:[.,]\d+)?))?\s*%\s*(?:(?:du|de)\s*)?(?:1\s*rm|max(?:imum)?)(?=\s|[.,;)]|$)/i);
  if (!m) return null;
  if (!texte.match(seul) && (consignes.match(/%/g) || []).length !== 1) return null;
  const min = Number(m[1].replace(',', '.'));
  const max = m[2] ? Number(m[2].replace(',', '.')) : min;
  if (!Number.isFinite(min) || min <= 0 || max < min || max > 100) return null;
  return { min, max };
}

export interface Reference {
  exerciceId: string;
  charge: number;
  repetitions: number;
  date: string;
}

export interface SuggestionPourcentage {
  pourcentMin: number;
  pourcentMax: number;
  chargeMin: number | null;
  chargeMax: number | null;
  brutMin: number | null;
  brutMax: number | null;
  rm: number | null;
  estime: boolean;
  dateReference: string;
  pas: number;
}

/** Arrondi vers le bas au pas de 2,5 kg ; sans référence, aucune charge proposée (pas de faux 0 kg). */
export function suggestionPourcentage(exerciceId: string, charge: string, consignes: string, references: Reference[]): SuggestionPourcentage | null {
  const p = lirePourcentage(charge, consignes);
  if (!p) return null;
  const r = [...references]
    .filter((x) => x.exerciceId === exerciceId && x.charge > 0 && x.repetitions >= 1 && x.repetitions <= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const rm = r ? unRm(r.charge, r.repetitions) : null;
  const brutMin = rm === null ? null : Math.round(rm * p.min) / 100;
  const brutMax = rm === null ? null : Math.round(rm * p.max) / 100;
  const arrondi = (v: number | null) => {
    if (v === null) return null;
    const a = Math.floor((v + 1e-9) / 2.5) * 2.5;
    return a <= 0 ? null : a;
  };
  return {
    pourcentMin: p.min,
    pourcentMax: p.max,
    chargeMin: arrondi(brutMin),
    chargeMax: arrondi(brutMax),
    brutMin,
    brutMax,
    rm,
    estime: !!r && r.repetitions > 1,
    dateReference: r?.date ?? '',
    pas: 2.5,
  };
}

// ---------- Comparaison de deux séances réalisées (BilanComparaison.tsx) ----------

export interface ResultatExercice {
  ligneId: string;
  nom: string;
  series: { n: number; texte: string }[];
}
export interface SeanceRealisee {
  date: string;
  cycleCle: string;
  cycleNom: string;
  exercices: ResultatExercice[];
}

/**
 * Deux derniers résultats d'un même exercice prescrit (même ligne) dans un même cycle : valeurs brutes,
 * sans calcul de progrès. Signale quand le nombre ou les numéros de séries diffèrent.
 */
export function comparerDeuxDernieres(seances: SeanceRealisee[]) {
  const groupes = new Map<string, { nom: string; cycleNom: string; items: { date: string; ex: ResultatExercice }[] }>();
  for (const s of seances)
    for (const e of s.exercices) {
      const k = `${s.cycleCle}|${e.ligneId}`;
      const g = groupes.get(k) ?? { nom: e.nom, cycleNom: s.cycleNom, items: [] };
      g.items.push({ date: s.date, ex: e });
      groupes.set(k, g);
    }
  const tous = [...groupes.values()];
  const comparables = tous
    .filter((g) => g.items.length >= 2)
    .map((g) => {
      const [recente, ancienne] = [...g.items].sort((x, y) => y.date.localeCompare(x.date));
      const n = Math.max(ancienne.ex.series.length, recente.ex.series.length);
      const nombreDiffere = ancienne.ex.series.length !== recente.ex.series.length;
      const numerosDifferent = ancienne.ex.series.map((s) => s.n).join() !== recente.ex.series.map((s) => s.n).join();
      return {
        nom: g.nom,
        cycleNom: g.cycleNom,
        ancienne,
        recente,
        lignes: Array.from({ length: n }, (_, k) => ({
          n: ancienne.ex.series[k]?.n ?? recente.ex.series[k]?.n,
          ancienne: ancienne.ex.series[k]?.texte ?? '—',
          recente: recente.ex.series[k]?.texte ?? '—',
        })),
        limite: nombreDiffere || numerosDifferent,
      };
    });
  return { total: tous.length, comparables };
}
