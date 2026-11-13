// Suivi d'un client vu par le coach : une période (jour, semaine, mois, année) qu'on parcourt avec ‹ ›, découpée en
// cases (les jours d'une semaine ou d'un mois, les mois d'une année) où chaque domaine (séances, force, corps,
// bien-être, nutrition, pas) range ses valeurs. Règles pures, sans écran ni base. Dates AAAA-MM-JJ.
import { ajouterJours, lundiDe } from './entrainement';

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee';
export const PERIODES: { cle: Periode; libelle: string }[] = [
  { cle: 'jour', libelle: 'Jour' },
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'annee', libelle: 'Année' },
];

export type Domaine = 'seances' | 'force' | 'corps' | 'bien-etre' | 'nutrition' | 'pas';
export const DOMAINES: { cle: Domaine; libelle: string }[] = [
  { cle: 'seances', libelle: 'Séances' },
  { cle: 'force', libelle: 'Force' },
  { cle: 'corps', libelle: 'Corps' },
  { cle: 'bien-etre', libelle: 'Bien-être' },
  { cle: 'nutrition', libelle: 'Nutrition' },
  { cle: 'pas', libelle: 'Pas' },
];

export interface Case {
  debut: string;
  fin: string;
  /** Sous la barre : L M M J V S D, le numéro du jour, ou l'initiale du mois. */
  libelle: string;
}

export interface Fenetre {
  periode: Periode;
  debut: string;
  fin: string;
  /** « 2 – 8 novembre », « novembre 2026 »… */
  titre: string;
  cases: Case[];
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const INITIALES_MOIS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const INITIALES_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const deux = (n: number) => String(n).padStart(2, '0');
const an = (d: string) => Number(d.slice(0, 4));
const moisDe = (d: string) => Number(d.slice(5, 7));
const jourDe = (d: string) => Number(d.slice(8, 10));
const premierDuMois = (a: number, m: number) => `${a}-${deux(m)}-01`;
const dernierDuMois = (a: number, m: number) => `${a}-${deux(m)}-${deux(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
const jourSemaine = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** `1er` pour le premier du mois, comme on l'écrit. */
const numero = (d: string) => (jourDe(d) === 1 ? '1er' : String(jourDe(d)));

/** Les jours de `debut` à `fin` inclus. */
export function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) jours.push(d);
  return jours;
}

/** La période qui contient `ancre`. */
export function fenetre(periode: Periode, ancre: string): Fenetre {
  if (periode === 'jour') {
    const titre = `${JOURS[jourSemaine(ancre)]} ${numero(ancre)} ${MOIS[moisDe(ancre) - 1]}`;
    return { periode, debut: ancre, fin: ancre, titre, cases: [{ debut: ancre, fin: ancre, libelle: INITIALES_JOURS[(jourSemaine(ancre) + 6) % 7] }] };
  }
  if (periode === 'semaine') {
    const debut = lundiDe(ancre);
    const fin = ajouterJours(debut, 6);
    const titre =
      moisDe(debut) === moisDe(fin)
        ? `${numero(debut)} – ${numero(fin)} ${MOIS[moisDe(fin) - 1]}`
        : `${numero(debut)} ${MOIS[moisDe(debut) - 1]} – ${numero(fin)} ${MOIS[moisDe(fin) - 1]}`;
    return { periode, debut, fin, titre, cases: joursEntre(debut, fin).map((d, i) => ({ debut: d, fin: d, libelle: INITIALES_JOURS[i] })) };
  }
  if (periode === 'mois') {
    const debut = premierDuMois(an(ancre), moisDe(ancre));
    const fin = dernierDuMois(an(ancre), moisDe(ancre));
    return { periode, debut, fin, titre: `${MOIS[moisDe(ancre) - 1]} ${an(ancre)}`, cases: joursEntre(debut, fin).map((d) => ({ debut: d, fin: d, libelle: String(jourDe(d)) })) };
  }
  const a = an(ancre);
  return {
    periode,
    debut: `${a}-01-01`,
    fin: `${a}-12-31`,
    titre: String(a),
    cases: INITIALES_MOIS.map((libelle, i) => ({ debut: premierDuMois(a, i + 1), fin: dernierDuMois(a, i + 1), libelle })),
  };
}

/** La période d'avant (n = −1) ou d'après (n = 1), en gardant un jour qui existe (31 mars − 1 mois = 28 ou 29 février). */
export function decaler(periode: Periode, ancre: string, n: number): string {
  if (periode === 'jour') return ajouterJours(ancre, n);
  if (periode === 'semaine') return ajouterJours(ancre, 7 * n);
  if (periode === 'annee') {
    const a = an(ancre) + n;
    return `${a}-${ancre.slice(5, 7)}-${deux(Math.min(jourDe(ancre), jourDe(dernierDuMois(a, moisDe(ancre)))))}`;
  }
  const total = an(ancre) * 12 + moisDe(ancre) - 1 + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${deux(m)}-${deux(Math.min(jourDe(ancre), jourDe(dernierDuMois(a, m))))}`;
}

/** Pas de suivi dans le futur : la période suivante n'existe que si elle commence au plus tard aujourd'hui. */
export const peutAvancer = (periode: Periode, ancre: string, aujourdhui: string) => fenetre(periode, decaler(periode, ancre, 1)).debut <= aujourdhui;

export interface PointDate {
  date: string;
  valeur: number;
}

export type Agregat = 'somme' | 'moyenne' | 'max' | 'dernier';

/** La valeur de chaque case ; une case sans point reste vide (undefined), ce n'est pas un zéro. */
export function parCase(points: PointDate[], cases: Case[], agregat: Agregat): (number | undefined)[] {
  return cases.map((c) => {
    const dedans = points.filter((p) => p.date >= c.debut && p.date <= c.fin).sort((a, b) => a.date.localeCompare(b.date));
    if (!dedans.length) return undefined;
    const v = dedans.map((p) => p.valeur);
    if (agregat === 'somme') return v.reduce((s, x) => s + x, 0);
    if (agregat === 'max') return Math.max(...v);
    if (agregat === 'dernier') return v[v.length - 1];
    return v.reduce((s, x) => s + x, 0) / v.length;
  });
}

/** Moyenne par jour renseigné sur la période (pas, calories, sommeil…) ; undefined sans aucun relevé. */
export function moyenneParJour(points: PointDate[], debut: string, fin: string): number | undefined {
  const parJour = new Map<string, number>();
  for (const p of points) if (p.date >= debut && p.date <= fin) parJour.set(p.date, (parJour.get(p.date) ?? 0) + p.valeur);
  if (!parJour.size) return undefined;
  return [...parJour.values()].reduce((s, x) => s + x, 0) / parJour.size;
}

/** Les points de la période, et l'écart entre le premier et le dernier (undefined s'il y en a moins de deux). */
export function surPeriode(points: PointDate[], debut: string, fin: string) {
  const dedans = points.filter((p) => p.date >= debut && p.date <= fin).sort((a, b) => a.date.localeCompare(b.date));
  const ecart = dedans.length >= 2 ? dedans[dedans.length - 1].valeur - dedans[0].valeur : undefined;
  return { points: dedans, dernier: dedans.at(-1), ecart };
}

/** La dernière valeur connue à la fin de la période (une mesure prise avant compte encore). */
export const derniereAvant = (points: PointDate[], fin: string) =>
  [...points].filter((p) => p.date <= fin).sort((a, b) => a.date.localeCompare(b.date)).at(-1);

/** Ce qu'il s'est passé dans une semaine, pour l'historique. */
export interface SemaineHistorique {
  lundi: string;
  seances: number;
  horsProgramme: number;
  bilan: boolean;
  records: number;
  mesures: boolean;
  repasPhoto: number;
}

/** Les `n` dernières semaines jusqu'à celle qui contient `fin`, la plus récente d'abord. */
export function historiqueSemaines(
  d: { seances: string[]; horsProgramme: string[]; bilans: string[]; records: string[]; mesures: string[]; repasPhoto: string[] },
  fin: string,
  n = 12,
): SemaineHistorique[] {
  const dans = (dates: string[], lundi: string) => dates.filter((x) => x >= lundi && x <= ajouterJours(lundi, 6)).length;
  return Array.from({ length: n }, (_, i) => {
    const lundi = ajouterJours(lundiDe(fin), -7 * i);
    return {
      lundi,
      seances: dans(d.seances, lundi),
      horsProgramme: dans(d.horsProgramme, lundi),
      bilan: d.bilans.includes(lundi),
      records: dans(d.records, lundi),
      mesures: dans(d.mesures, lundi) > 0,
      repasPhoto: dans(d.repasPhoto, lundi),
    };
  });
}

/** « 3 séances · bilan rempli · record battu · mesures prises… » ; « Rien de noté » pour une semaine vide. */
export function resumeSemaine(s: SemaineHistorique): string {
  const morceaux = [
    s.seances ? `${s.seances} séance${s.seances > 1 ? 's' : ''}` : 'aucune séance',
    s.horsProgramme ? `${s.horsProgramme} hors programme` : '',
    s.bilan ? 'bilan rempli' : 'pas de bilan',
    s.records ? (s.records > 1 ? `${s.records} records` : 'record battu') : '',
    s.mesures ? 'mesures prises' : '',
    s.repasPhoto ? `${s.repasPhoto} repas en photo` : '',
  ].filter(Boolean);
  const vide = !s.seances && !s.horsProgramme && !s.bilan && !s.records && !s.mesures && !s.repasPhoto;
  return vide ? 'Rien de noté' : morceaux.join(' · ');
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 2 nov. » pour la liste de l'historique. */
export const dateCourte = (d: string) => `${numero(d)} ${MOIS_COURTS[moisDe(d) - 1]}`;
