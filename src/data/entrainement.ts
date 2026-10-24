// Accès aux données d'entraînement du lot 3 (bibliothèque, éditeur, cycles clients, calendrier, réalisations),
// en démo sur l'appareil ou dans Supabase. Les écrans ne parlent qu'à cette interface.
import { copierProgramme, copierSeance, LIBELLES_CYCLES, nomCopieClient } from '@/domain/entrainement';
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

export type ActionCreation = 'programme' | 'seance' | 'copyProgramme' | 'copySeance' | 'editProgramme' | 'editSeance' | 'attachSeance';

export interface SaisieCreation {
  nom: string;
  niveau?: string;
  objectif?: string;
  frequence?: number;
  duree?: number;
  materiel?: string;
  consignes?: string;
}

/**
 * manageProgramme d'origine : création libre (Brouillon, « coachos-free »), séance seule dans son conteneur
 * « Séance seule · nom », modification, copie indépendante avec le cycle choisi, rattachement d'une séance seule.
 */
export async function gererProgramme(
  coachId: string,
  action: ActionCreation,
  f: SaisieCreation,
  opts: { id?: string; programmeId?: string; cycle?: number } = {},
): Promise<{ id: string; programmeId: string }> {
  const nom = f.nom.trim().slice(0, 160);
  if (!nom) throw new Error('Le nom est obligatoire');
  const cycle = opts.cycle ?? 1;
  const criteres = {
    niveau: f.niveau || undefined,
    objectif: f.objectif || undefined,
    seancesParSemaine: f.frequence || undefined,
    dureeSemaines: f.duree || undefined,
    materiel: f.materiel || undefined,
  };

  if (action === 'editProgramme') {
    const { programme } = await entrainement.programme(opts.id!);
    await entrainement.enregistrerProgramme(coachId, { ...programme, ...criteres, titre: nom, consignes: f.consignes || undefined });
    return { id: programme.id, programmeId: programme.id };
  }
  if (action === 'editSeance') {
    const { seance, programme } = await entrainement.seance(opts.id!);
    await entrainement.enregistrerSeance(coachId, { ...seance, titre: nom, consignes: f.consignes || undefined });
    return { id: seance.id, programmeId: programme.id };
  }
  if (action === 'attachSeance') {
    const { seance, programme } = await entrainement.seance(opts.id!);
    if (!programme.seanceSeule) throw new Error('Seules les séances seules peuvent être déplacées');
    const cible = await entrainement.programme(opts.programmeId!);
    await entrainement.enregistrerSeance(coachId, { ...seance, programmeId: cible.programme.id, ordre: cible.seances.length + 1 });
    return { id: seance.id, programmeId: cible.programme.id };
  }
  if (action === 'programme' || action === 'copyProgramme') {
    if (action === 'copyProgramme') {
      const [{ programme }, seances] = await Promise.all([entrainement.programme(opts.id!), entrainement.seancesDuProgramme(opts.id!)]);
      const copie = copierProgramme({ ...programme, seances: [] }, seances, { titre: nom, cycle }, nouvelId);
      await entrainement.enregistrerProgramme(coachId, copie.programme, copie.seances);
      return { id: copie.programme.id, programmeId: copie.programme.id };
    }
    const id = nouvelId();
    await entrainement.enregistrerProgramme(coachId, { id, titre: nom, statut: 'Brouillon', version: 'coachos-free', ...criteres, consignes: f.consignes || undefined });
    return { id, programmeId: id };
  }

  // Séance : dans le programme donné, sinon dans un conteneur « Séance seule » créé avec elle.
  const source = action === 'copySeance' ? (await entrainement.seance(opts.id!)).seance : undefined;
  const parent = opts.programmeId ? await entrainement.programme(opts.programmeId) : undefined;
  const programmeId = parent?.programme.id ?? nouvelId();
  const ordre = (parent?.seances.length ?? 0) + 1;
  const seance: Seance = source
    ? copierSeance(source, { titre: nom, programmeId, ordre, cycle, clientId: parent?.programme.clientId }, nouvelId)
    : { id: nouvelId(), titre: nom, programmeId, ordre, consignes: f.consignes || undefined, blocs: [], clientId: parent?.programme.clientId };
  if (parent) await entrainement.enregistrerSeance(coachId, seance);
  else
    await entrainement.enregistrerProgramme(
      coachId,
      { id: programmeId, titre: `Séance seule · ${nom}`, statut: 'Brouillon', version: 'coachos-single', seanceSeule: true },
      [seance],
    );
  return { id: seance.id, programmeId };
}
