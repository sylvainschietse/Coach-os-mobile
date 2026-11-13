// lib/timer.ts d'origine (U05) : minuteur de repos simple ou d'intervalles (préparation, travail, repos, tours).
// Le temps écoulé se calcule depuis l'heure de départ : il reste juste si l'écran a été verrouillé.

export interface ConfigMinuteurs {
  mode: 'rest' | 'interval';
  exercices: number;
  tours: number;
  travail: number;
  repos: number;
  preparation: number;
  libelle: string;
}

export interface Marche {
  config: ConfigMinuteurs;
  statut: 'running' | 'paused' | 'done';
  ecouleMs: number;
  departLe: number;
}

export const CONFIG_DEFAUT: ConfigMinuteurs = { mode: 'interval', exercices: 8, tours: 1, travail: 20, repos: 10, preparation: 5, libelle: 'Intervalles' };

const entier = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

export function configValide(c: ConfigMinuteurs | null | undefined): c is ConfigMinuteurs {
  return (
    !!c &&
    ['rest', 'interval'].includes(c.mode) &&
    typeof c.libelle === 'string' &&
    c.libelle.length <= 200 &&
    entier(c.exercices, 1, 30) &&
    entier(c.tours, 1, 20) &&
    entier(c.travail, 1, 3600) &&
    entier(c.repos, 0, 3600) &&
    entier(c.preparation, 0, 30) &&
    (c.mode !== 'rest' || c.repos >= 1)
  );
}

/** Durée totale en secondes ; le dernier repos est inclus, comme dans l'original. */
export const duree = (c: ConfigMinuteurs) => (c.mode === 'rest' ? c.repos : c.preparation + c.exercices * c.tours * (c.travail + c.repos));

export const ecoule = (m: Marche, maintenant: number) =>
  Math.min(duree(m.config) * 1000, Math.max(0, m.ecouleMs + (m.statut === 'running' ? maintenant - m.departLe : 0)));

export function mettreEnPause(m: Marche, maintenant: number): Marche {
  const e = ecoule(m, maintenant);
  return { ...m, statut: e >= duree(m.config) * 1000 ? 'done' : 'paused', ecouleMs: e, departLe: maintenant };
}

export const reprendre = (m: Marche, maintenant: number): Marche => ({ ...m, statut: 'running', departLe: maintenant });

export type Etape = { type: 'done' | 'rest' | 'prepare' | 'work'; restant: number; index: number; exercice: number; tour: number; cle: string };

export function etape(c: ConfigMinuteurs, ecouleMs: number): Etape {
  const t = Math.max(0, ecouleMs / 1000);
  const total = duree(c);
  if (t >= total) return { type: 'done', restant: 0, index: c.exercices * c.tours, exercice: c.exercices, tour: c.tours, cle: 'done' };
  if (c.mode === 'rest') return { type: 'rest', restant: Math.ceil(total - t), index: 1, exercice: 1, tour: 1, cle: 'rest' };
  if (t < c.preparation) return { type: 'prepare', restant: Math.ceil(c.preparation - t), index: 0, exercice: 1, tour: 1, cle: 'prepare' };
  const actif = t - c.preparation;
  const cycle = c.travail + c.repos;
  const i = Math.floor(actif / cycle);
  const dans = actif - i * cycle;
  const travail = dans < c.travail;
  return {
    type: travail ? 'work' : 'rest',
    restant: Math.ceil((travail ? c.travail : cycle) - dans),
    index: i + 1,
    exercice: (i % c.exercices) + 1,
    tour: Math.floor(i / c.exercices) + 1,
    cle: `${travail ? 'work' : 'rest'}:${i}`,
  };
}

export const horloge = (secondes: number) => `${String(Math.floor(secondes / 60)).padStart(2, '0')}:${String(secondes % 60).padStart(2, '0')}`;

/** Marche relue depuis l'appareil : rejetée si elle est invalide, terminée si le temps est dépassé. */
export function relireMarche(m: Marche | null | undefined, maintenant: number): Marche | null {
  if (!m || !configValide(m.config) || !['running', 'paused', 'done'].includes(m.statut) || !Number.isFinite(m.ecouleMs) || m.ecouleMs < 0 || !Number.isFinite(m.departLe))
    return null;
  const e = ecoule(m, maintenant);
  return e >= duree(m.config) * 1000 ? { ...m, statut: 'done', ecouleMs: e } : m;
}
