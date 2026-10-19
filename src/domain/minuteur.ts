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
