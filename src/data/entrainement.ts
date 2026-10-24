// Accès aux données d'entraînement du lot 3 (bibliothèque, éditeur, cycles clients, calendrier, réalisations),
// en démo sur l'appareil ou dans Supabase. Les écrans ne parlent qu'à cette interface.
import { copierProgramme, LIBELLES_CYCLES, nomCopieClient } from '@/domain/entrainement';
import type {
  CycleStocke,
  DemandeCreneau,
  ElementCorbeille,
  EnTeteProgramme,
  EspaceEntrainement,
  ModeLien,
  ModeleResume,
  Planification,
  ProgrammeDetail,
  RealisationCycle,
  RealisationLue,
  SeanceCoach,
  Suivi,
  SuiviClient,
} from '@/domain/entrainement-etat';
import type { Seance } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';

import { entrainementDemo } from './entrainement-demo';
import { creerEntrainementSupabase } from './entrainement-supabase';
import { supabase } from './supabase';

export interface Entrainement {
  bibliotheque(coachId: string): Promise<ModeleResume[]>;
  programme(id: string): Promise<ProgrammeDetail>;
  /** Les séances complètes d'un programme, pour une copie. */
  seancesDuProgramme(id: string): Promise<Seance[]>;
  seance(id: string): Promise<SeanceCoach>;
  /** En-tête seul (création, modification), ou en-tête et séances en une fois (copie : tout ou rien). */
  enregistrerProgramme(coachId: string, p: EnTeteProgramme, seances?: Seance[]): Promise<void>;
  /** La séance complète : ce qui n'y est plus est retiré (restaurable), jamais effacé. */
  enregistrerSeance(coachId: string, s: Seance): Promise<void>;
  restaurerLigne(seanceId: string, ligneId: string): Promise<void>;
  corbeille(coachId: string): Promise<ElementCorbeille[]>;
  supprimer(items: Pick<ElementCorbeille, 'kind' | 'id'>[]): Promise<void>;
  restaurer(item: Pick<ElementCorbeille, 'kind' | 'id'>): Promise<void>;

  suivis(coachId: string): Promise<SuiviClient[]>;
  enregistrerSuivi(coachId: string, s: Suivi): Promise<void>;
  enregistrerCycle(coachId: string, c: CycleStocke): Promise<void>;
  activerCycle(id: string): Promise<void>;
  deplacerCycle(id: string, sens: 1 | -1): Promise<void>;
  /** Résultats d'un client lus par le coach (Séances réalisées), avec la prescription actuelle de chaque ligne. */
  resultats(clientId: string): Promise<{ realisations: RealisationLue[]; prescriptions: Record<string, { series: number; repetitions?: string }> }>;

  espaceClient(clientId: string): Promise<EspaceEntrainement>;
  calendrier(clientId: string, cycleId: string): Promise<Planification[]>;
  planifier(clientId: string, d: DemandeCreneau): Promise<void>;
  annulerCreneau(clientId: string, id: string): Promise<void>;
  /** Idempotent : le même id renvoyé répond « doublon » sans rien créer. */
  enregistrerRealisation(r: RealisationCycle): Promise<'enregistree' | 'doublon'>;
}

export const entrainement: Entrainement = supabase ? creerEntrainementSupabase(supabase) : entrainementDemo;

/**
 * setCycleProgramme : « Lier tel quel » garde le modèle ; « Dupliquer pour personnaliser » crée d'abord une copie
 * indépendante au nom du client avec le cycle choisi, puis la lie. Le cycle n'est touché qu'une fois la copie créée.
 */
export async function lierProgramme(
  coachId: string,
  cycle: CycleStocke,
  modeleId: string,
  mode: ModeLien,
  opts: { client: string; cycleModele?: number },
) {
  let programmeId = modeleId;
  if (mode === 'Copie personnalisée') {
    const [{ programme: modele }, seances] = await Promise.all([entrainement.programme(modeleId), entrainement.seancesDuProgramme(modeleId)]);
    const n = opts.cycleModele ?? 1;
    const titre = nomCopieClient(opts.client, LIBELLES_CYCLES[n - 1], modele.titre);
    const copie = copierProgramme({ ...modele, seances: [] }, seances, { titre, cycle: n, clientId: cycle.clientId }, nouvelId);
    await entrainement.enregistrerProgramme(coachId, copie.programme, copie.seances);
    programmeId = copie.programme.id;
  }
  await entrainement.enregistrerCycle(coachId, { ...cycle, programmeId, mode });
}
