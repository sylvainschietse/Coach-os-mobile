// Activités sportives venues des montres et des applis, lues pour l'instant dans Health Connect (Android).
// Tout est ramené au même format : distance, durée, allure, fréquence cardiaque et dénivelé.
// Les mêmes bornes sont vérifiées par la fonction SQL enregistrer_activites.

import { ajouterJours } from './entrainement';
import type { Bloc, Exercice, LignePrescription, Mesure, Seance, Valeurs } from './types';

export type Sport =
  | 'course'
  | 'trail'
  | 'velo'
  | 'marche'
  | 'randonnee'
  | 'natation'
  | 'musculation'
  | 'cours'
  | 'yoga'
  | 'aquatique'
  | 'raquette'
  | 'sport_co'
  | 'combat'
  | 'danse'
  | 'glisse'
  | 'autre';
export type SourceActivite = 'health_connect' | 'fichier' | 'strava' | 'garmin' | 'suunto' | 'polar' | 'manuel';

export const SPORTS: { cle: Sport; libelle: string }[] = [
  { cle: 'course', libelle: 'Course' },
  { cle: 'trail', libelle: 'Trail' },
  { cle: 'velo', libelle: 'Vélo' },
  { cle: 'marche', libelle: 'Marche' },
  { cle: 'randonnee', libelle: 'Randonnée' },
  { cle: 'natation', libelle: 'Natation' },
  { cle: 'musculation', libelle: 'Musculation' },
  { cle: 'cours', libelle: 'Cours collectif' },
  { cle: 'yoga', libelle: 'Yoga, Pilates, étirements' },
  { cle: 'aquatique', libelle: 'Activité aquatique' },
  { cle: 'raquette', libelle: 'Sport de raquette' },
  { cle: 'sport_co', libelle: 'Sport collectif' },
  { cle: 'combat', libelle: 'Sport de combat' },
  { cle: 'danse', libelle: 'Danse' },
  { cle: 'glisse', libelle: 'Glisse et plein air' },
  { cle: 'autre', libelle: 'Autre' },
];
export const libelleSport = (s: Sport) => SPORTS.find((x) => x.cle === s)?.libelle ?? 'Autre';

export const SOURCES: Record<SourceActivite, string> = {
  health_connect: 'Health Connect',
  fichier: 'Fichier',
  strava: 'Strava',
  garmin: 'Garmin',
  suunto: 'Suunto',
  polar: 'Polar',
  manuel: 'Saisie',
};

/** Ce que l'appli envoie à la base : une ligne par activité, reconnue par sa source et son identifiant d'origine. */
export interface NouvelleActivite {
  source: SourceActivite;
  idExterne: string;
  sport: Sport;
  titre: string;
  debut: string;
  dureeS: number;
  distanceM?: number;
  deniveleM?: number;
  fcMoy?: number;
  fcMax?: number;
  calories?: number;
  /** Application qui a enregistré la séance (ex. com.garmin.android.apps.connectmobile). */
  appareil?: string;
}

export interface Activite extends NouvelleActivite {
  id: string;
  clientId: string;
  importeeLe: string;
  /** Activité libre (source « manuel ») : effort ressenti de 1 à 10, note du client et exercices de musculation. */
  ressenti?: number;
  note?: string;
  exercices?: ExerciceLibre[];
}

// ---------- Heures de Paris ----------

/** Décalage de Paris (en heures) à un instant donné. */
function decalageParis(ms: number) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  const h = Number(p);
  const utc = new Date(ms).getUTCHours();
  return (((h - utc) % 24) + 24) % 24;
}

/** Instant (ISO) correspondant à une heure de Paris : heureParis('2026-03-29', 0) → '2026-03-28T23:00:00.000Z'. */
export function heureParis(jour: string, heure = 0) {
  const naif = Date.parse(`${jour}T00:00:00Z`) + heure * 3600e3;
  // Deux passes : le décalage peut changer entre l'heure naïve et l'heure réelle (passage à l'heure d'été).
  let ms = naif - decalageParis(naif) * 3600e3;
  ms = naif - decalageParis(ms) * 3600e3;
  return new Date(ms).toISOString();
}

/** Plage [minuit, minuit du lendemain[ d'un jour à Paris. */
export const plageJourParis = (jour: string) => ({ debut: heureParis(jour, 0), fin: heureParis(ajouterJours(jour, 1), 0) });

// ---------- Sommeil ----------

export interface PeriodeSommeil {
  debut: string;
  fin: string;
  origine: string;
  /** Phases d'éveil ou hors du lit, retirées du temps dormi. */
  eveils: { debut: string; fin: string }[];
}

const duree = (a: string, b: string) => Math.max(0, Date.parse(b) - Date.parse(a));

/**
 * Heures dormies la nuit qui se termine le matin de `jour` : périodes finissant entre 18 h la veille et 14 h ce jour-là,
 * d'une seule application (celle qui en compte le plus) pour ne pas additionner montre et téléphone.
 */
export function heuresDeSommeil(periodes: PeriodeSommeil[], jour: string): number | null {
  const de = Date.parse(heureParis(ajouterJours(jour, -1), 18));
  const a = Date.parse(heureParis(jour, 14));
  const nuit = periodes.filter((p) => Date.parse(p.fin) > de && Date.parse(p.fin) <= a);
  if (!nuit.length) return null;
  const parOrigine = new Map<string, number>();
  for (const p of nuit) {
    const eveil = p.eveils.reduce((s, e) => s + duree(e.debut, e.fin), 0);
    parOrigine.set(p.origine, (parOrigine.get(p.origine) ?? 0) + Math.max(0, duree(p.debut, p.fin) - eveil));
  }
  const ms = Math.max(...parOrigine.values());
  return Math.round((ms / 3600e3) * 100) / 100;
}

// ---------- Health Connect ----------

/** Codes ExerciseType de Health Connect vers nos sports. */
export function sportHealthConnect(code: number): Sport {
  switch (code) {
    case 56: // RUNNING
    case 57: // RUNNING_TREADMILL
      return 'course';
    case 8: // BIKING
    case 9: // BIKING_STATIONARY
      return 'velo';
    case 79: // WALKING
      return 'marche';
    case 37: // HIKING
      return 'randonnee';
    case 73: // SWIMMING_OPEN_WATER
    case 74: // SWIMMING_POOL
      return 'natation';
    default:
      return 'autre';
  }
}

/** Sports gardés : l'appli suit la course et l'endurance, pas chaque séance de renforcement déjà saisie ailleurs. */
export const SPORTS_IMPORTES: Sport[] = ['course', 'trail', 'velo', 'marche', 'randonnee', 'natation'];

// ---------- Affichage ----------

export function formaterDuree(s: number) {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(sec).padStart(2, '0')}`;
}

export const formaterDistance = (m: number) => `${(m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;

/** Allure en minutes par kilomètre (course, marche) : 5:07 /km. */
export function allure(distanceM: number | undefined, dureeS: number) {
  if (!distanceM || distanceM < 50 || !dureeS) return '';
  const sParKm = Math.round(dureeS / (distanceM / 1000));
  return `${Math.floor(sParKm / 60)}:${String(sParKm % 60).padStart(2, '0')} /km`;
}

/** Vitesse moyenne (vélo) : 27,4 km/h. */
export function vitesse(distanceM: number | undefined, dureeS: number) {
  if (!distanceM || !dureeS) return '';
  return `${((distanceM / dureeS) * 3.6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km/h`;
}

/** Allure pour la course et la marche, vitesse pour le vélo, allure aux 100 m pour la natation. */
export function rythme(a: Pick<NouvelleActivite, 'sport' | 'distanceM' | 'dureeS'>) {
  if (a.sport === 'velo') return vitesse(a.distanceM, a.dureeS);
  if (a.sport === 'natation') {
    if (!a.distanceM) return '';
    const s = Math.round(a.dureeS / (a.distanceM / 100));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /100 m`;
  }
  return allure(a.distanceM, a.dureeS);
}

export interface BilanSemaine {
  lundi: string;
  nombre: number;
  distanceM: number;
  dureeS: number;
  deniveleM: number;
  /** Distance par sport : on n'additionne pas les kilomètres de vélo à ceux de course. */
  distanceParSport: Partial<Record<Sport, number>>;
}

/** Totaux par semaine (lundi à Paris), les plus récentes d'abord. */
export function totauxParSemaine(activites: Pick<Activite, 'sport' | 'debut' | 'dureeS' | 'distanceM' | 'deniveleM'>[], lundiDe: (instant: string) => string): BilanSemaine[] {
  const m = new Map<string, BilanSemaine>();
  for (const a of activites) {
    const l = lundiDe(a.debut);
    const b = m.get(l) ?? { lundi: l, nombre: 0, distanceM: 0, dureeS: 0, deniveleM: 0, distanceParSport: {} };
    b.nombre += 1;
    b.distanceM += a.distanceM ?? 0;
    b.dureeS += a.dureeS;
    b.deniveleM += a.deniveleM ?? 0;
    if (a.distanceM) b.distanceParSport[a.sport] = (b.distanceParSport[a.sport] ?? 0) + a.distanceM;
    m.set(l, b);
  }
  return [...m.values()].sort((a, b) => b.lundi.localeCompare(a.lundi));
}

// ---------- Contrôles (identiques à la base) ----------

export function erreursActivite(a: NouvelleActivite): string[] {
  const e: string[] = [];
  if (!a.idExterne || a.idExterne.length > 200) e.push('Identifiant d’origine manquant.');
  if (Number.isNaN(Date.parse(a.debut)) || Date.parse(a.debut) > Date.now() + 3600e3) e.push('Date de début invalide.');
  if (!(a.dureeS > 0 && a.dureeS <= 7 * 86400)) e.push('Durée invalide.');
  if (a.distanceM !== undefined && !(a.distanceM >= 0 && a.distanceM <= 1_000_000)) e.push('Distance invalide.');
  if (a.deniveleM !== undefined && !(a.deniveleM >= 0 && a.deniveleM <= 20_000)) e.push('Dénivelé invalide.');
  for (const fc of [a.fcMoy, a.fcMax]) if (fc !== undefined && !(fc >= 25 && fc <= 250)) e.push('Fréquence cardiaque invalide.');
  if ((a.titre ?? '').length > 200) e.push('Titre trop long.');
  return [...new Set(e)];
}

// ---------- Activités libres (saisies par le client) ----------

/** Ce que le client note pour une série : répétitions et charge, ou une durée (gainage), ou une distance. */
export type SerieLibre = Pick<Valeurs, 'repetitions' | 'charge' | 'duree' | 'distance'>;

/** Un exercice d'une séance libre : pris dans la bibliothèque (exerciceId) ou simplement nommé. */
export interface ExerciceLibre {
  exerciceId?: string;
  nom: string;
  mesures?: Mesure[];
  series: SerieLibre[];
}

/** Ce que le client envoie : l'id est créé sur le téléphone, le renvoyer met à jour la même activité. */
export interface ActiviteLibre {
  id: string;
  sport: Sport;
  titre: string;
  debut: string;
  dureeS: number;
  distanceM?: number;
  ressenti?: number;
  note: string;
  exercices: ExerciceLibre[];
  /** Dépense estimée (kcal), calculée sur le téléphone avec le poids du client. */
  calories?: number;
}

export const estLibre = (a: Pick<Activite, 'source'>) => a.source === 'manuel';

export const RESSENTIS: Record<number, string> = {
  1: 'Très facile',
  2: 'Facile',
  3: 'Facile',
  4: 'Modéré',
  5: 'Modéré',
  6: 'Soutenu',
  7: 'Difficile',
  8: 'Très difficile',
  9: 'Très difficile',
  10: 'Maximal',
};

/** Séries réellement remplies (au moins une valeur). */
export const seriesRemplies = (series: SerieLibre[]) =>
  series.filter((s) => Object.values(s).some((v) => v !== undefined && v !== null && !Number.isNaN(v)));

/** « 3 × 10 à 40 kg », « 4 séries · 8 à 12 reps · 20 à 30 kg », « 3 × 45 s ». */
export function resumeSeries(series: SerieLibre[]) {
  const l = seriesRemplies(series);
  if (!l.length) return '';
  const plage = (vals: (number | undefined)[], unite: string) => {
    const v = vals.filter((x): x is number => x !== undefined);
    if (!v.length) return '';
    const min = Math.min(...v);
    const max = Math.max(...v);
    const n = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    return min === max ? `${n(min)}${unite}` : `${n(min)} à ${n(max)}${unite}`;
  };
  const reps = plage(l.map((s) => s.repetitions), '');
  const charge = plage(l.map((s) => s.charge), ' kg');
  const duree = plage(l.map((s) => s.duree), ' s');
  const distance = plage(l.map((s) => s.distance), ' m');
  const parSerie = [reps && (charge ? `${reps} reps` : `${reps} reps`), charge, duree, distance].filter(Boolean);
  return `${l.length} série${l.length > 1 ? 's' : ''}${parSerie.length ? ` · ${parSerie.join(' · ')}` : ''}`;
}

export function erreursActiviteLibre(a: ActiviteLibre, maintenant = Date.now()): string[] {
  const e: string[] = [];
  const t = Date.parse(a.debut);
  if (Number.isNaN(t)) e.push('Date invalide.');
  else if (t > maintenant + 3600e3) e.push('Une activité ne peut pas être dans le futur.');
  else if (t < maintenant - 365 * 864e5) e.push('Date trop ancienne.');
  if (!SPORTS.some((s) => s.cle === a.sport)) e.push('Choisis un type d’activité.');
  if (!(a.dureeS >= 60 && a.dureeS <= 86400)) e.push('Indique une durée entre 1 minute et 24 heures.');
  if (a.ressenti !== undefined && !(Number.isInteger(a.ressenti) && a.ressenti >= 1 && a.ressenti <= 10)) e.push('Le ressenti va de 1 à 10.');
  if (a.distanceM !== undefined && !(a.distanceM >= 0 && a.distanceM <= 1_000_000)) e.push('Distance invalide.');
  if (a.calories !== undefined && !(a.calories >= 0 && a.calories <= 50000)) e.push('Calories invalides.');
  if (a.titre.length > 200) e.push('Nom trop long.');
  if (a.note.length > 2000) e.push('Note trop longue (2 000 caractères au plus).');
  if (a.exercices.length > 40) e.push('40 exercices au plus.');
  for (const x of a.exercices) {
    if (!x.nom.trim() || x.nom.length > 200) e.push('Chaque exercice a besoin d’un nom.');
    if (x.series.length > 20) e.push('20 séries au plus par exercice.');
    for (const s of x.series)
      for (const v of Object.values(s)) if (v !== undefined && !(v >= 0 && v <= 100000)) e.push(`Valeur invalide pour ${x.nom || 'un exercice'}.`);
  }
  return [...new Set(e)];
}

/** Nettoie avant envoi : séries vides et exercices sans série retirés, textes rognés. */
export function preparerActiviteLibre(a: ActiviteLibre): ActiviteLibre {
  const exercices = a.exercices
    .map((x) => ({ ...x, nom: x.nom.trim(), series: seriesRemplies(x.series) }))
    .filter((x) => x.nom && x.series.length);
  return { ...a, titre: a.titre.trim(), note: a.note.trim(), exercices };
}

/** Titre lisible : « RPM », sinon le type d'activité. */
export const titreActivite = (a: Pick<Activite, 'sport' | 'titre'>) => a.titre || libelleSport(a.sport);

/**
 * Transforme une séance libre en séance de bibliothèque pour le coach : un bloc « Corps de séance », une ligne par
 * exercice de la bibliothèque, avec le nombre de séries, la fourchette de répétitions et la charge la plus lourde.
 * Les exercices tapés à la main (sans exerciceId) ne peuvent pas devenir des lignes : ils sont rappelés dans les consignes.
 */
export function seanceDepuisActivite(
  a: Pick<Activite, 'titre' | 'sport' | 'note' | 'exercices' | 'dureeS'>,
  catalogue: Exercice[],
  nouvelId: () => string,
  programmeId: string,
): { seance: Seance; ignores: string[] } {
  const lignes: LignePrescription[] = [];
  const ignores: string[] = [];
  for (const x of a.exercices ?? []) {
    const exercice = x.exerciceId ? catalogue.find((c) => c.id === x.exerciceId) : undefined;
    if (!exercice) {
      ignores.push(x.nom);
      continue;
    }
    const s = seriesRemplies(x.series);
    const reps = s.map((v) => v.repetitions).filter((v): v is number => v !== undefined);
    const charges = s.map((v) => v.charge).filter((v): v is number => v !== undefined && v > 0);
    const durees = s.map((v) => v.duree).filter((v): v is number => v !== undefined && v > 0);
    const min = reps.length ? Math.min(...reps) : undefined;
    const max = reps.length ? Math.max(...reps) : undefined;
    lignes.push({
      id: nouvelId(),
      exercice,
      series: Math.max(1, s.length),
      repetitions: min === undefined ? undefined : min === max ? String(min) : `${min}–${max}`,
      repetitionsMin: min,
      repetitionsMax: max,
      chargeIndicative: charges.length ? Math.max(...charges) : undefined,
      dureeS: !reps.length && durees.length ? Math.max(...durees) : undefined,
    });
  }
  const consignes = [a.note?.trim(), ignores.length ? `Aussi fait par le client : ${ignores.join(', ')}.` : ''].filter(Boolean).join('\n\n');
  const bloc: Bloc = { id: nouvelId(), titre: 'Corps de séance', lignes };
  return {
    seance: {
      id: nouvelId(),
      titre: titreActivite(a),
      programmeId,
      ordre: 1,
      consignes: consignes || undefined,
      dureeMin: Math.round(a.dureeS / 60) || undefined,
      blocs: [bloc],
    },
    ignores,
  };
}
