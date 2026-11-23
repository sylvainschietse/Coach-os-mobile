// Le vrai minuteur du client : des formats tout prêts (Tabata, EMOM, AMRAP…), ses formats enregistrés et le son
// (sonnerie au choix, décompte avant départ, bips 3, 2, 1 avant la fin de chaque phase).
// Tout se calcule à partir du temps écoulé depuis le départ : le minuteur reste juste si l'écran a été verrouillé.
import { planifier, type ConfigMinuteur } from './minuteur';

export type CleFormat = 'tabata' | 'emom' | 'amrap' | 'intervalles' | 'fortime' | 'rebours' | 'repos' | 'pyramide';
export type Sonnerie = 'gong' | 'sifflet' | 'cloche' | 'boxe' | 'digital' | 'vibreur';

export interface Reglage {
  format: CleFormat;
  /** Tabata, intervalles. */
  exercices: number;
  /** Tabata, intervalles, EMOM. */
  tours: number;
  /** Travail d'un intervalle ; premier palier de la pyramide. */
  travailS: number;
  /** Repos entre deux intervalles ou deux paliers. */
  reposS: number;
  reposEntreToursS: number;
  /** AMRAP, for time (temps limite), compte à rebours, repos. */
  dureeS: number;
  /** EMOM : durée d'un tour (1 min en général). */
  minuteS: number;
  /** Pyramide : ce que gagne chaque palier, et le palier du sommet. */
  pasS: number;
  sommetS: number;
}

export interface Son {
  sonnerie: Sonnerie;
  /** Décompte avant le départ. */
  preparationS: 0 | 3 | 5 | 10;
  bipsTravail: boolean;
  bipsRepos: boolean;
  vibrer: boolean;
}

export interface FormatEnregistre {
  id: string;
  nom: string;
  reglage: Reglage;
  son: Son;
  majLe: string;
}

export interface Phase {
  type: 'preparation' | 'travail' | 'repos';
  debutS: number;
  dureeS: number;
  tour: number;
  exercice: number;
  /** For time : le chrono monte au lieu de descendre. */
  montant?: boolean;
}

export const SON_DEFAUT: Son = { sonnerie: 'gong', preparationS: 5, bipsTravail: true, bipsRepos: true, vibrer: true };

const BASE: Reglage = {
  format: 'intervalles',
  exercices: 1,
  tours: 1,
  travailS: 20,
  reposS: 10,
  reposEntreToursS: 0,
  dureeS: 600,
  minuteS: 60,
  pasS: 10,
  sommetS: 60,
};

export interface InfoFormat {
  cle: CleFormat;
  nom: string;
  quoi: string;
  defaut: Reglage;
}

export const FORMATS: InfoFormat[] = [
  { cle: 'tabata', nom: 'Tabata', quoi: '8 × 20 s effort, 10 s repos', defaut: { ...BASE, format: 'tabata', exercices: 8, travailS: 20, reposS: 10 } },
  { cle: 'emom', nom: 'EMOM', quoi: 'Un exercice au début de chaque minute', defaut: { ...BASE, format: 'emom', tours: 12, minuteS: 60 } },
  { cle: 'amrap', nom: 'AMRAP', quoi: 'Max de tours dans un temps donné', defaut: { ...BASE, format: 'amrap', dureeS: 600 } },
  { cle: 'intervalles', nom: 'Intervalles', quoi: 'Travail, repos, tours, au choix', defaut: { ...BASE, format: 'intervalles', exercices: 6, travailS: 40, reposS: 20, tours: 2, reposEntreToursS: 60 } },
  { cle: 'fortime', nom: 'For time', quoi: 'Chrono qui monte, avec temps limite', defaut: { ...BASE, format: 'fortime', dureeS: 1200 } },
  { cle: 'rebours', nom: 'Compte à rebours', quoi: 'Une durée, une sonnerie', defaut: { ...BASE, format: 'rebours', dureeS: 300 } },
  { cle: 'repos', nom: 'Repos', quoi: 'Récup entre deux séries', defaut: { ...BASE, format: 'repos', dureeS: 90 } },
  { cle: 'pyramide', nom: 'Pyramide', quoi: 'Effort qui monte puis redescend', defaut: { ...BASE, format: 'pyramide', travailS: 20, pasS: 10, sommetS: 60, reposS: 15 } },
];

export const infoFormat = (cle: CleFormat) => FORMATS.find((f) => f.cle === cle)!;

export interface Champ {
  cle: keyof Omit<Reglage, 'format'>;
  libelle: string;
  aide?: string;
  pas: number;
  min: number;
  max: number;
  /** « temps » : affiché en m:ss. */
  temps: boolean;
}

const C = {
  exercices: { cle: 'exercices', libelle: 'Intervalles par tour', pas: 1, min: 1, max: 30, temps: false },
  tours: { cle: 'tours', libelle: 'Tours', pas: 1, min: 1, max: 60, temps: false },
  travailS: { cle: 'travailS', libelle: 'Travail', pas: 5, min: 5, max: 3600, temps: true },
  reposS: { cle: 'reposS', libelle: 'Repos', pas: 5, min: 0, max: 3600, temps: true },
  reposEntreToursS: { cle: 'reposEntreToursS', libelle: 'Repos entre les tours', pas: 15, min: 0, max: 3600, temps: true },
  minuteS: { cle: 'minuteS', libelle: 'Durée d’un tour', aide: 'une minute en général', pas: 15, min: 15, max: 600, temps: true },
  pasS: { cle: 'pasS', libelle: 'Chaque palier ajoute', pas: 5, min: 5, max: 300, temps: true },
  sommetS: { cle: 'sommetS', libelle: 'Palier du sommet', pas: 5, min: 10, max: 3600, temps: true },
} satisfies Record<string, Champ>;
const duree = (libelle: string, aide?: string): Champ => ({ cle: 'dureeS', libelle, aide, pas: 15, min: 15, max: 7200, temps: true });

/** Les réglages montrés pour chaque format, dans l'ordre. */
export const CHAMPS: Record<CleFormat, Champ[]> = {
  tabata: [C.travailS, C.reposS, { ...C.exercices, libelle: 'Intervalles' }, C.tours, C.reposEntreToursS],
  emom: [C.minuteS, C.tours],
  amrap: [duree('Durée')],
  intervalles: [C.exercices, C.travailS, C.reposS, C.tours, C.reposEntreToursS],
  fortime: [duree('Temps limite', 'le chrono s’arrête là')],
  rebours: [duree('Durée')],
  repos: [duree('Durée du repos')],
  pyramide: [{ ...C.travailS, libelle: 'Premier palier' }, C.pasS, C.sommetS, C.reposS],
};

/** Ramène chaque valeur dans ses bornes (réglage relu, ou venu d'un ancien format). */
export function borner(r: Reglage): Reglage {
  const out = { ...BASE, ...r };
  for (const c of Object.values(CHAMPS).flat()) {
    const v = Number(out[c.cle]);
    out[c.cle] = Number.isFinite(v) ? Math.min(c.max, Math.max(c.min, Math.round(v))) : BASE[c.cle];
  }
  if (out.sommetS < out.travailS) out.sommetS = out.travailS;
  return out;
}

/** Les durées de travail de la pyramide : 20, 30, 40… jusqu'au sommet, puis on redescend. */
export function paliers(r: Reglage): number[] {
  const montee: number[] = [];
  for (let s = r.travailS; s <= r.sommetS && montee.length < 30; s += r.pasS) montee.push(s);
  if (montee.at(-1) !== r.sommetS && montee.length < 30) montee.push(r.sommetS);
  return [...montee, ...montee.slice(0, -1).reverse()];
}

/** Les phases du minuteur, décompte de départ compris. */
export function compiler(r: Reglage, son: Pick<Son, 'preparationS'>): Phase[] {
  const phases: Phase[] = [];
  let t = 0;
  const ajouter = (p: Omit<Phase, 'debutS'>) => {
    if (p.dureeS <= 0) return;
    phases.push({ ...p, debutS: t });
    t += p.dureeS;
  };
  if (son.preparationS > 0) ajouter({ type: 'preparation', dureeS: son.preparationS, tour: 1, exercice: 1 });
  switch (r.format) {
    case 'tabata':
    case 'intervalles':
      for (const p of planifier({ exercices: r.exercices, travailS: r.travailS, reposS: r.reposS, tours: r.tours, reposEntreToursS: r.reposEntreToursS }))
        ajouter({ type: p.type, dureeS: p.dureeS, tour: p.tour, exercice: p.exercice });
      break;
    case 'emom':
      for (let tour = 1; tour <= r.tours; tour++) ajouter({ type: 'travail', dureeS: r.minuteS, tour, exercice: 1 });
      break;
    case 'pyramide': {
      const liste = paliers(r);
      liste.forEach((s, i) => {
        ajouter({ type: 'travail', dureeS: s, tour: 1, exercice: i + 1 });
        if (i < liste.length - 1) ajouter({ type: 'repos', dureeS: r.reposS, tour: 1, exercice: i + 1 });
      });
      break;
    }
    case 'repos':
      ajouter({ type: 'repos', dureeS: r.dureeS, tour: 1, exercice: 1 });
      break;
    default:
      ajouter({ type: 'travail', dureeS: r.dureeS, tour: 1, exercice: 1, montant: r.format === 'fortime' });
  }
  return phases;
}

export const dureeTotale = (phases: Phase[]) => {
  const d = phases.at(-1);
  return d ? d.debutS + d.dureeS : 0;
};

export type Etat = { statut: 'en_cours'; phase: Phase; index: number; restantS: number; ecouleDansPhaseS: number } | { statut: 'termine' };

export function etatA(phases: Phase[], ecouleS: number): Etat {
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (ecouleS < p.debutS + p.dureeS) return { statut: 'en_cours', phase: p, index: i, restantS: p.debutS + p.dureeS - ecouleS, ecouleDansPhaseS: ecouleS - p.debutS };
  }
  return { statut: 'termine' };
}

/** Le décompte de départ bipe toujours ; travail et repos selon les réglages. Pas de bips sur une phase de 3 s ou moins. */
export const avecBips = (p: Phase, son: Son) => p.dureeS > 3 && (p.type === 'preparation' || (p.type === 'travail' ? son.bipsTravail : son.bipsRepos));

/** Ce qui doit sonner à un instant donné, d'après la seconde affichée avant et après. */
export type Signal = 'bip' | 'sonnerie' | null;
export function signalEntre(phases: Phase[], son: Son, avantS: number, apresS: number): Signal {
  if (apresS <= avantS) return null;
  const a = etatA(phases, avantS);
  const b = etatA(phases, apresS);
  if (a.statut === 'termine') return null;
  if (b.statut === 'termine' || b.index !== a.index) return 'sonnerie';
  // Une seconde affichée vient de passer à 3, 2 ou 1.
  const secA = Math.ceil(a.restantS);
  const secB = Math.ceil(b.restantS);
  return secB !== secA && secB <= 3 && secB >= 1 && avecBips(b.phase, son) ? 'bip' : null;
}

/** Une alerte de téléphone verrouillé par fin de phase : 3 s avant la fin quand elle a des bips (le son les contient). */
export interface Alerte {
  dansS: number;
  bips: boolean;
  titre: string;
  corps: string;
}

export function alertes(phases: Phase[], son: Son, depuisS: number, nomExercice: (n: number) => string | undefined = () => undefined, max = 60): Alerte[] {
  const out: Alerte[] = [];
  phases.forEach((p, i) => {
    const fin = p.debutS + p.dureeS;
    const bips = avecBips(p, son);
    const dansS = fin - (bips ? 3 : 0) - depuisS;
    if (dansS < 1 || out.length >= max) return;
    const suivante = phases[i + 1];
    const titre = !suivante ? 'Terminé, bravo !' : suivante.type === 'travail' ? 'Go !' : 'Repos';
    const corps = !suivante
      ? 'Minuteur terminé.'
      : suivante.type === 'travail'
        ? (nomExercice(suivante.exercice) ?? (suivante.tour > 1 ? `Tour ${suivante.tour}` : 'C’est parti'))
        : `${Math.round(suivante.dureeS)} s de récup`;
    out.push({ dansS, bips, titre, corps: bips ? `3, 2, 1… ${corps}` : corps });
  });
  return out;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const horloge = (s: number) => mmss(Math.max(0, Math.round(s)));

const temps = (s: number) => (s % 60 === 0 && s >= 60 ? `${s / 60} min` : s > 60 ? mmss(s) : `${s} s`);

/** « EMOM · 12 × 1 min » */
export function resume(r: Reglage): string {
  const nom = infoFormat(r.format).nom;
  switch (r.format) {
    case 'tabata':
    case 'intervalles':
      return [nom, `${r.exercices} × ${temps(r.travailS)}${r.reposS ? ` / ${temps(r.reposS)}` : ''}`, r.tours > 1 ? `${r.tours} tours` : null].filter(Boolean).join(' · ');
    case 'emom':
      return `${nom} · ${r.tours} × ${temps(r.minuteS)}`;
    case 'pyramide':
      return `${nom} · ${temps(r.travailS)} → ${temps(r.sommetS)}`;
    default:
      return `${nom} · ${temps(r.dureeS)}`;
  }
}

export const NOMS_SONNERIES: Record<Sonnerie, string> = { gong: 'Gong', sifflet: 'Sifflet', cloche: 'Cloche', boxe: 'Ring de boxe', digital: 'Digital', vibreur: 'Vibreur seul' };

/** « Gong · départ 5 s » */
export const resumeSon = (s: Son) => [NOMS_SONNERIES[s.sonnerie], s.preparationS ? `départ ${s.preparationS} s` : null].filter(Boolean).join(' · ');

/** Le chrono réglé par le coach dans une séance devient des intervalles. */
export const depuisSeance = (c: ConfigMinuteur): Reglage => ({ ...BASE, format: 'intervalles', ...c });

const SONNERIES = Object.keys(NOMS_SONNERIES) as Sonnerie[];

export function lireSon(brut: unknown): Son {
  const v = (brut && typeof brut === 'object' ? brut : {}) as Partial<Son>;
  return {
    sonnerie: SONNERIES.includes(v.sonnerie as Sonnerie) ? (v.sonnerie as Sonnerie) : SON_DEFAUT.sonnerie,
    preparationS: ([0, 3, 5, 10] as const).find((x) => x === v.preparationS) ?? SON_DEFAUT.preparationS,
    bipsTravail: typeof v.bipsTravail === 'boolean' ? v.bipsTravail : true,
    bipsRepos: typeof v.bipsRepos === 'boolean' ? v.bipsRepos : true,
    vibrer: typeof v.vibrer === 'boolean' ? v.vibrer : true,
  };
}

export function lireReglage(brut: unknown): Reglage | null {
  if (!brut || typeof brut !== 'object') return null;
  const v = brut as Partial<Reglage>;
  if (!FORMATS.some((f) => f.cle === v.format)) return null;
  return borner({ ...infoFormat(v.format!).defaut, ...v } as Reglage);
}

export function lireFormat(brut: unknown): FormatEnregistre | null {
  if (!brut || typeof brut !== 'object') return null;
  const v = brut as Record<string, unknown>;
  const reglage = lireReglage(v.reglage);
  const nom = typeof v.nom === 'string' ? v.nom.trim().slice(0, 60) : '';
  if (!reglage || !nom || typeof v.id !== 'string') return null;
  return { id: v.id, nom, reglage, son: lireSon(v.son), majLe: typeof v.majLe === 'string' ? v.majLe : new Date(0).toISOString() };
}
