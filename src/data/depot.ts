import type {
  ClientResume,
  Exercice,
  HistoriqueExercice,
  JournalNutrition,
  Mensuration,
  PlanNutrition,
  Programme,
  Realisation,
  RealisationDetail,
  RecordPerso,
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

  // Création par le coach
  /** Le catalogue du coach (et le catalogue commun), exercices actifs. */
  catalogue(): Promise<Exercice[]>;
  creerExercice(coachId: string, exercice: Pick<Exercice, 'nom' | 'mesures'>): Promise<Exercice>;
  /** Crée ou remplace la séance (blocs et lignes compris). */
  enregistrerSeance(seance: Seance): Promise<void>;
  /** La séance disparaît de l'app du client ; ce qu'il a déjà fait reste dans son historique. */
  archiverSeance(id: string): Promise<void>;
  modeles(coachId: string): Promise<Programme[]>;
  programme(id: string): Promise<Programme>;
  enregistrerModele(coachId: string, programme: Programme): Promise<void>;
  archiverModele(id: string): Promise<void>;
  programmesDuClient(clientId: string): Promise<Programme[]>;
  /** Copie le modèle chez le client : un programme et ses séances, datées à partir de `debut`. */
  attribuerModele(coachId: string, modele: Programme, clientId: string, debut?: string): Promise<void>;

  // Suivi du client
  mensurations(clientId: string): Promise<Mensuration[]>;
  ajouterMensuration(m: Mensuration): Promise<void>;
  supprimerMensuration(id: string): Promise<void>;
  records(clientId: string): Promise<RecordPerso[]>;
  ajouterRecord(r: RecordPerso): Promise<void>;
  supprimerRecord(id: string): Promise<void>;
  /** Fait de ce record la référence de son exercice ; l'ancienne référence du même exercice cesse de l'être. */
  definirReference(id: string): Promise<void>;
  planNutrition(clientId: string): Promise<PlanNutrition | null>;
  enregistrerPlanNutrition(plan: PlanNutrition): Promise<void>;
  journalNutrition(clientId: string): Promise<JournalNutrition[]>;
  /** Une entrée par jour : la renvoyer pour la même date la remplace. */
  enregistrerJournal(j: JournalNutrition): Promise<void>;
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
