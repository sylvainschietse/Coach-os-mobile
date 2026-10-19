import type {
  ClientResume,
  Exercice,
  Mesure,
  HistoriqueExercice,
  Realisation,
  RealisationDetail,
  Seance,
  SeanceResume,
} from '@/domain/types';

/** Tout ce dont les écrans ont besoin, quelle que soit la source (démo locale ou Supabase). */
export interface Depot {
  mode: 'demo' | 'supabase';
  seancesDuClient(clientId: string): Promise<SeanceResume[]>;
  seance(id: string): Promise<Seance>;
  historique(clientId: string, exerciceIds: string[]): Promise<Record<string, HistoriqueExercice>>;
  /** Doit être idempotent : renvoyer la même réalisation ne crée rien de plus. */
  enregistrer(realisation: Realisation): Promise<void>;
  clientsDuCoach(coachId: string): Promise<ClientResume[]>;
  realisationsDuClient(clientId: string): Promise<RealisationDetail[]>;
  /** Catalogue commun et exercices propres au coach. */
  exercices(): Promise<Exercice[]>;
  creerExercice(coachId: string, nom: string, mesures: Mesure[]): Promise<Exercice>;
  /** Crée ou remplace la séance entière (blocs, exercices, chronos). */
  sauverSeance(seance: Seance): Promise<void>;
  /** Retire la séance du programme du client sans effacer ce qu'il a déjà fait. */
  archiverSeance(id: string): Promise<void>;
}

export type Profil =
  | { role: 'client'; clientId: string; prenom: string }
  | { role: 'coach'; coachId: string; nom: string };

/** Garde, pour chaque exercice, la réalisation la plus récente. */
export function derniersParExercice(realisations: Realisation[], exerciceIds: string[]) {
  const resultat: Record<string, HistoriqueExercice> = {};
  const triees = [...realisations].sort((a, b) => b.fin.localeCompare(a.fin));
  for (const exerciceId of exerciceIds) {
    for (const r of triees) {
      const series = r.series.filter((s) => s.exerciceId === exerciceId);
      if (series.length > 0) {
        resultat[exerciceId] = { exerciceId, date: r.fin, series: series.map((s) => s.valeurs) };
        break;
      }
    }
  }
  return resultat;
}
