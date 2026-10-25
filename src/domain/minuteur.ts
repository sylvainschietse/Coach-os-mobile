export interface ConfigMinuteur {
  exercices: number;
  travailS: number;
  reposS: number;
  tours: number;
  reposEntreToursS: number;
}

export interface Phase {
  type: 'travail' | 'repos';
  tour: number;
  exercice: number;
  debutS: number;
  dureeS: number;
}

export const TABATA: ConfigMinuteur = { exercices: 8, travailS: 20, reposS: 10, tours: 1, reposEntreToursS: 0 };

export function planifier(config: ConfigMinuteur): Phase[] {
  const phases: Phase[] = [];
  let t = 0;
  for (let tour = 1; tour <= config.tours; tour++) {
    for (let exercice = 1; exercice <= config.exercices; exercice++) {
      phases.push({ type: 'travail', tour, exercice, debutS: t, dureeS: config.travailS });
      t += config.travailS;
      const dernierDuTour = exercice === config.exercices;
      const dernierTour = tour === config.tours;
      const repos = dernierDuTour ? (dernierTour ? 0 : config.reposEntreToursS) : config.reposS;
      if (repos > 0) {
        phases.push({ type: 'repos', tour, exercice, debutS: t, dureeS: repos });
        t += repos;
      }
    }
  }
  return phases;
}

export function dureeTotale(phases: Phase[]): number {
  const derniere = phases.at(-1);
  return derniere ? derniere.debutS + derniere.dureeS : 0;
}

export type EtatMinuteur =
  | { statut: 'en_cours'; phase: Phase; indexPhase: number; restantS: number }
  | { statut: 'termine' };

/**
 * L'état se calcule à partir du temps écoulé, pas d'un compteur qui tourne :
 * si le téléphone met l'app en pause, le minuteur reste juste au retour.
 */
export function etatA(phases: Phase[], ecouleS: number): EtatMinuteur {
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (ecouleS < p.debutS + p.dureeS) {
      return { statut: 'en_cours', phase: p, indexPhase: i, restantS: p.debutS + p.dureeS - ecouleS };
    }
  }
  return { statut: 'termine' };
}

/** Temps écoulé en tenant compte des pauses, à partir d'horodatages absolus. */
export function ecoule(debutMs: number, maintenantMs: number, pausesMs: number, pauseDepuisMs?: number): number {
  const finMs = pauseDepuisMs ?? maintenantMs;
  return Math.max(0, (finMs - debutMs - pausesMs) / 1000);
}

const secondes = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);

/** Résumé lisible d'un chrono, par exemple « 2 exercices · 40 s / 20 s · 3 tours ». */
export function resumeMinuteur(c: ConfigMinuteur): string {
  const morceaux = [
    c.exercices > 1 ? `${c.exercices} exercices` : null,
    c.reposS > 0 ? `${secondes(c.travailS)} / ${secondes(c.reposS)}` : secondes(c.travailS),
    c.tours > 1 ? `${c.tours} tours` : null,
    c.tours > 1 && c.reposEntreToursS > 0 ? `${secondes(c.reposEntreToursS)} entre les tours` : null,
  ];
  return morceaux.filter(Boolean).join(' · ');
}

/** Relit un chrono transmis par la séance (ou stocké en base) ; null s'il est incomplet. */
export function lireMinuteur(brut: unknown): ConfigMinuteur | null {
  let o = brut;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const v = o as Record<string, unknown>;
  const entier = (k: string, min: number) => (Number.isInteger(v[k]) && (v[k] as number) >= min ? (v[k] as number) : null);
  const config = {
    exercices: entier('exercices', 1),
    travailS: entier('travailS', 1),
    reposS: entier('reposS', 0) ?? 0,
    tours: entier('tours', 1) ?? 1,
    reposEntreToursS: entier('reposEntreToursS', 0) ?? 0,
  };
  if (config.exercices === null || config.travailS === null) return null;
  return config as ConfigMinuteur;
}

interface LigneChrono {
  exercice: { nom: string };
  series: number;
  dureeS?: number;
  repetitions?: string;
  recuperationS?: number;
}

/**
 * Bloc de gainage « 4 min · 20/10 » à plusieurs exercices au temps : les exercices s'alternent à chaque intervalle
 * (A, B, A, B…), au lieu d'enchaîner toutes les séries du premier puis du second. Le chrono réglé par le coach prime.
 */
export function circuitAlterne(bloc: { minuteur?: ConfigMinuteur; lignes: LigneChrono[] }): { config: ConfigMinuteur; noms: string[] } | null {
  const l = bloc.lignes;
  if (bloc.minuteur || l.length < 2) return null;
  const auTemps = l.every((x) => (x.dureeS ?? 0) > 0 && !x.repetitions?.trim());
  if (!auTemps || new Set(l.map((x) => x.series)).size > 1 || new Set(l.map((x) => x.dureeS)).size > 1) return null;
  const repos = Math.max(0, l[0].recuperationS ?? 0);
  return {
    config: { exercices: l.length, travailS: l[0].dureeS!, reposS: repos, tours: Math.max(1, l[0].series), reposEntreToursS: repos },
    noms: l.map((x) => x.exercice.nom),
  };
}

/** « Dead bug ↔ Planche latérale · 4 tours » */
export const resumeAlternance = (noms: string[], tours: number) => `${noms.join(' ↔ ')} · ${tours} tour${tours > 1 ? 's' : ''}`;
