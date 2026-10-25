// Proposition de séance renvoyée par l'assistant (fonction creer-seance) : on la relit avant de la montrer,
// pour qu'une valeur hors bornes ne passe jamais dans l'éditeur. Rien n'est enregistré sans validation du coach.
import { lireRepetitions } from './entrainement';
import type { Bloc, Mesure, Phase } from './types';

export interface LigneProposee {
  exercice: { id: string; nom: string; mesures?: string[]; videoUrl?: string };
  series: number;
  repetitions?: string;
  dureeS?: number;
  recuperationS?: number;
  rir?: number;
  consignes?: string;
  phase?: string;
}

export interface PropositionSeance {
  titre?: string;
  consignes?: string;
  blocs?: { titre?: string; lignes?: LigneProposee[] }[];
  remarque?: string;
  /** Lignes écartées par le serveur parce que l'exercice n'existe pas dans la bibliothèque. */
  ecartes?: number;
}

const PHASES: Phase[] = ['Échauffement', 'Principal', 'Finisher', 'Retour au calme'];
const MESURES: Mesure[] = ['charge', 'repetitions', 'duree', 'distance', 'calories', 'watts', 'allure500'];
const borne = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);
const texte = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Blocs prêts pour l'éditeur, avec de nouveaux identifiants. Une ligne sans exercice reconnu est écartée. */
export function blocsProposes(p: PropositionSeance, nouvelId: () => string): Bloc[] {
  return (p.blocs ?? [])
    .map((b, i): Bloc => ({
      id: nouvelId(),
      titre: texte(b.titre, 80) ?? `Bloc ${i + 1}`,
      lignes: (b.lignes ?? [])
        .filter((l) => typeof l?.exercice?.id === 'string' && !!texte(l.exercice.nom, 200))
        .map((l) => {
          const dureeS = borne(l.dureeS, 1, 3600);
          const repetitions = dureeS ? undefined : texte(l.repetitions, 40);
          const bornes = lireRepetitions(repetitions);
          const mesures = (l.exercice.mesures ?? []).filter((m): m is Mesure => (MESURES as string[]).includes(m));
          return {
            id: nouvelId(),
            exercice: { id: l.exercice.id, nom: l.exercice.nom.trim(), mesures: mesures.length ? mesures : dureeS ? ['duree'] : ['charge', 'repetitions'], videoUrl: l.exercice.videoUrl },
            series: borne(l.series, 1, 8) ?? 3,
            repetitions,
            repetitionsMin: bornes?.min,
            repetitionsMax: bornes?.max,
            dureeS,
            recuperationS: borne(l.recuperationS, 0, 600),
            rir: borne(l.rir, 0, 5),
            consignes: texte(l.consignes, 500),
            phase: PHASES.find((x) => x === l.phase) ?? 'Principal',
          };
        }),
    }))
    .filter((b) => b.lignes.length > 0);
}
