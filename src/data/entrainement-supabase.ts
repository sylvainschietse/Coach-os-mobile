import type { SupabaseClient } from '@supabase/supabase-js';

import type { VarianteCycle } from '@/domain/cycles';
import type { CycleClient, EnTeteProgramme, ModeLien, Planification, RealisationLue, SeanceStockee, Suivi } from '@/domain/entrainement-etat';
import { espaceClient, type Etat } from '@/domain/entrainement-etat';
import { lireMinuteur } from '@/domain/minuteur';
import type { Exercice, LignePrescription, Mesure, Phase, Seance, Valeurs } from '@/domain/types';

import type { Entrainement } from './entrainement';

const sansNull = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const nombre = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

function verifier<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null) throw new Error('Réponse vide');
  return r.data;
}
const echec = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

type LigneBase = {
  id: string;
  ordre: number;
  series: number;
  repetitions: string | null;
  repetitions_min: number | null;
  repetitions_max: number | null;
  charge_indicative: number | null;
  charge_intensite: string | null;
  duree_s: number | null;
  distance_m: number | null;
  recuperation_s: number | null;
  rir: number | null;
  tempo: string | null;
  consignes: string | null;
  progression: string | null;
  phase: Phase | null;
  cycles: VarianteCycle[] | null;
  minuteur: unknown;
  retiree: boolean;
  exercices: { id: string; nom: string; mesures: Mesure[]; video_url: string | null; famille: string | null; materiel: string[] | null; muscles: string[] | null };
};
type BlocBase = { id: string; ordre: number; titre: string; minuteur: unknown; retire: boolean; lignes: LigneBase[] };
type SeanceBase = {
  id: string;
  coach_id: string;
  client_id: string | null;
  programme_id: string | null;
  titre: string;
  date_prevue: string | null;
  consignes: string | null;
  ordre: number | null;
  dominante: string | null;
  duree_prevue_min: number | null;
  objectif: string | null;
  supprime_le: string | null;
  blocs: BlocBase[];
};

const versExercice = (e: LigneBase['exercices']): Exercice => ({
  id: e.id,
  nom: e.nom,
  mesures: e.mesures,
  videoUrl: sansNull(e.video_url),
  famille: sansNull(e.famille),
  materiel: e.materiel ?? undefined,
  muscles: e.muscles ?? undefined,
});

const versLigne = (l: LigneBase): LignePrescription => ({
  id: l.id,
  exercice: versExercice(l.exercices),
  series: l.series,
  repetitions: sansNull(l.repetitions),
  repetitionsMin: sansNull(l.repetitions_min),
  repetitionsMax: sansNull(l.repetitions_max),
  chargeIndicative: nombre(l.charge_indicative),
  chargeIntensite: sansNull(l.charge_intensite),
  dureeS: sansNull(l.duree_s),
  distanceM: nombre(l.distance_m),
  recuperationS: sansNull(l.recuperation_s),
  rir: sansNull(l.rir),
  tempo: sansNull(l.tempo),
  consignes: sansNull(l.consignes),
  progression: sansNull(l.progression),
  phase: sansNull(l.phase),
  cycles: l.cycles ?? undefined,
  minuteur: lireMinuteur(l.minuteur) ?? undefined,
});

function versSeance(s: SeanceBase): SeanceStockee {
  const blocs = [...s.blocs].filter((b) => !b.retire).sort((a, b) => a.ordre - b.ordre);
  return {
    id: s.id,
    coachId: s.coach_id,
    clientId: sansNull(s.client_id),
    programmeId: sansNull(s.programme_id),
    titre: s.titre,
    datePrevue: sansNull(s.date_prevue),
    consignes: sansNull(s.consignes),
    ordre: sansNull(s.ordre),
    dominante: sansNull(s.dominante),
    dureeMin: sansNull(s.duree_prevue_min),
    objectif: sansNull(s.objectif),
    supprimeLe: sansNull(s.supprime_le),
    blocs: blocs.map((b) => ({
      id: b.id,
      titre: b.titre,
      minuteur: lireMinuteur(b.minuteur) ?? undefined,
      lignes: b.lignes.filter((l) => !l.retiree).sort((x, y) => x.ordre - y.ordre).map(versLigne),
    })),
    retraits: blocs.flatMap((b) => b.lignes.filter((l) => l.retiree).map((l) => ({ blocId: b.id, ligne: versLigne(l) }))),
  };
}

const SEANCE = '*, blocs(id, ordre, titre, minuteur, retire, lignes(*, exercices(id, nom, mesures, video_url, famille, materiel, muscles)))';

type ProgrammeBase = {
  id: string;
  coach_id: string;
  client_id: string | null;
  titre: string;
  objectif: string | null;
  duree_semaines: number | null;
  seances_par_semaine: number | null;
  niveau: string | null;
  notes: string | null;
  statut: string | null;
  environnement: string | null;
  materiel: string | null;
  contraintes: string | null;
  consignes: string | null;
  duree_cible_min: number | null;
  priorites: string[] | null;
  version: string | null;
  modele_origine_id: string | null;
  cycle_applique: number | null;
  seance_seule: boolean;
  supprime_le: string | null;
};

const versProgramme = (p: ProgrammeBase): EnTeteProgramme & { coachId: string; supprimeLe?: string } => ({
  id: p.id,
  coachId: p.coach_id,
  clientId: sansNull(p.client_id),
  titre: p.titre,
  objectif: sansNull(p.objectif),
  dureeSemaines: sansNull(p.duree_semaines),
  seancesParSemaine: sansNull(p.seances_par_semaine),
  niveau: sansNull(p.niveau),
  notes: sansNull(p.notes),
  statut: sansNull(p.statut),
  environnement: sansNull(p.environnement),
  materiel: sansNull(p.materiel),
  contraintes: sansNull(p.contraintes),
  consignes: sansNull(p.consignes),
  dureeCibleMin: sansNull(p.duree_cible_min),
  priorites: p.priorites ?? [],
  version: sansNull(p.version),
  modeleOrigineId: sansNull(p.modele_origine_id),
  cycleApplique: sansNull(p.cycle_applique),
  seanceSeule: p.seance_seule,
  supprimeLe: sansNull(p.supprime_le),
});

/** Ce qu'attend enregistrer_seance : la séance avec l'id des exercices seulement. */
const seanceJson = (s: Seance) => ({
  id: s.id,
  clientId: s.clientId ?? null,
  programmeId: s.programmeId ?? null,
  titre: s.titre,
  datePrevue: s.datePrevue ?? null,
  consignes: s.consignes ?? null,
  ordre: s.ordre ?? null,
  dominante: s.dominante ?? null,
  dureeMin: s.dureeMin ?? null,
  objectif: s.objectif ?? null,
  blocs: s.blocs.map((b) => ({
    id: b.id,
    titre: b.titre,
    minuteur: b.minuteur ?? null,
    lignes: b.lignes.map(({ exercice, ...l }) => ({ ...l, exerciceId: exercice.id, minuteur: l.minuteur ?? null, cycles: l.cycles ?? null })),
  })),
});

type CycleBase = {
  id: string;
  suivi_id: string;
  client_id: string;
  ordre: number;
  nom: string;
  objectif: string | null;
  debut: string;
  fin: string;
  statut: CycleClient['statut'];
  programme_id: string | null;
  mode: ModeLien | null;
};
const versCycle = (c: CycleBase): Omit<CycleClient, 'programmeNom' | 'nbResultats'> => ({
  id: c.id,
  suiviId: c.suivi_id,
  clientId: c.client_id,
  ordre: c.ordre,
  nom: c.nom,
  objectif: sansNull(c.objectif),
  debut: c.debut,
  fin: c.fin,
  statut: c.statut,
  programmeId: sansNull(c.programme_id),
  mode: sansNull(c.mode),
});

type RealisationBase = {
  id: string;
  seance_id: string;
  client_id: string;
  cycle_id: string | null;
  programme_id: string | null;
  planification_id: string | null;
  debut: string;
  fin: string;
  note: number | null;
  commentaire: string | null;
  seance_titre: string | null;
  programme_nom: string | null;
  cycle_nom: string | null;
  seances: { titre: string } | null;
  series_realisees: { id: string; ligne_id: string; exercice_id: string; index: number; valeurs: Valeurs; suggestion: Valeurs; exercice_nom: string | null }[];
};
const REALISATION =
  'id, seance_id, client_id, cycle_id, programme_id, planification_id, debut, fin, note, commentaire, seance_titre, programme_nom, cycle_nom, seances(titre), series_realisees(*)';

const versRealisation = (r: RealisationBase): RealisationLue => {
  const noms: Record<string, string> = {};
  r.series_realisees.forEach((s) => (noms[s.ligne_id] = s.exercice_nom ?? 'Exercice'));
  return {
    id: r.id,
    seanceId: r.seance_id,
    clientId: r.client_id,
    cycleId: sansNull(r.cycle_id),
    planificationId: sansNull(r.planification_id),
    programmeId: sansNull(r.programme_id),
    debut: r.debut,
    fin: r.fin,
    note: sansNull(r.note),
    commentaire: sansNull(r.commentaire),
    seanceTitre: r.seance_titre ?? r.seances?.titre ?? 'Séance',
    programmeNom: sansNull(r.programme_nom),
    cycleNom: sansNull(r.cycle_nom),
    noms,
    series: [...r.series_realisees]
      .sort((a, b) => a.index - b.index)
      .map((s) => ({ id: s.id, ligneId: s.ligne_id, exerciceId: s.exercice_id, index: s.index, valeurs: s.valeurs, suggestion: s.suggestion })),
  };
};

type PlanBase = {
  id: string;
  client_id: string;
  cycle_id: string;
  seance_id: string;
  seance_titre: string;
  date: string;
  heure: string | null;
  statut: Planification['statut'];
  realisee_le: string | null;
  realisation_id: string | null;
  envoi_id: string;
};
const versPlan = (p: PlanBase): Planification => ({
  id: p.id,
  clientId: p.client_id,
  cycleId: p.cycle_id,
  seanceId: p.seance_id,
  seanceTitre: p.seance_titre,
  date: p.date,
  heure: sansNull(p.heure),
  statut: p.statut,
  realiseeLe: sansNull(p.realisee_le),
  realisationId: sansNull(p.realisation_id),
  envoiId: p.envoi_id,
});

/** Supabase renvoie au plus 1 000 lignes par requête. */
async function tout<T>(page: (debut: number, fin: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    const p = verifier(await page(debut, debut + 999)) as T[];
    lignes.push(...p);
    if (p.length < 1000) return lignes;
  }
}

export function creerEntrainementSupabase(db: SupabaseClient): Entrainement {
  const seancesDe = async (programmeId: string) =>
    (verifier(await db.from('seances').select(SEANCE).eq('programme_id', programmeId).is('supprime_le', null)) as SeanceBase[])
      .map(versSeance)
      .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.titre.localeCompare(b.titre));
  const enTete = async (id: string) => versProgramme(verifier(await db.from('programmes').select('*').eq('id', id).single()) as ProgrammeBase);
  const sans = <T extends { coachId: string; supprimeLe?: string; retraits?: unknown }>({ coachId: _c, supprimeLe: _s, retraits: _r, ...x }: T) => x;

  return {
    async bibliotheque(coachId) {
      const [ps, ss] = await Promise.all([
        tout<ProgrammeBase>((a, b) =>
          db.from('programmes').select('*').eq('coach_id', coachId).is('client_id', null).is('supprime_le', null).eq('archive', false).order('titre').range(a, b),
        ),
        tout<{ programme_id: string }>((a, b) =>
          db.from('seances').select('programme_id').eq('coach_id', coachId).is('client_id', null).is('supprime_le', null).not('programme_id', 'is', null).range(a, b),
        ),
      ]);
      const nb = new Map<string, number>();
      ss.forEach((s) => nb.set(s.programme_id, (nb.get(s.programme_id) ?? 0) + 1));
      return ps.map((p) => ({
        id: p.id,
        titre: p.titre,
        niveau: sansNull(p.niveau),
        objectif: sansNull(p.objectif),
        seancesParSemaine: sansNull(p.seances_par_semaine),
        dureeSemaines: sansNull(p.duree_semaines),
        environnement: sansNull(p.environnement),
        statut: sansNull(p.statut),
        nbSeances: nb.get(p.id) ?? 0,
        seanceSeule: p.seance_seule,
      }));
    },

    async programme(id) {
      const [p, ss] = await Promise.all([enTete(id), seancesDe(id)]);
      return {
        programme: sans(p),
        seances: ss.map((s) => ({
          id: s.id,
          titre: s.titre,
          ordre: s.ordre,
          dominante: s.dominante,
          dureeMin: s.dureeMin,
          objectif: s.objectif,
          nbExercices: s.blocs.reduce((n, b) => n + b.lignes.length, 0),
        })),
      };
    },

    seancesDuProgramme: async (id) => (await seancesDe(id)).map(sans),

    async seance(id) {
      const s = versSeance(verifier(await db.from('seances').select(SEANCE).eq('id', id).is('supprime_le', null).single()) as SeanceBase);
      const p = s.programmeId ? await enTete(s.programmeId) : undefined;
      return {
        seance: sans(s),
        programme: { id: p?.id ?? '', titre: p?.titre ?? 'Séance', clientId: p?.clientId, seanceSeule: !!p?.seanceSeule },
        retraits: s.retraits ?? [],
      };
    },

    async enregistrerProgramme(_coachId, p, seances = []) {
      echec(await db.rpc('enregistrer_programme', { p: { ...p, seances: seances.map(seanceJson) } }));
    },

    async enregistrerSeance(_coachId, s) {
      echec(await db.rpc('enregistrer_seance', { s: seanceJson(s) }));
    },

    async restaurerLigne(_seanceId, ligneId) {
      const l = verifier(await db.from('lignes').update({ retiree: false }).eq('id', ligneId).select('bloc_id').single()) as { bloc_id: string };
      echec(await db.from('blocs').update({ retire: false }).eq('id', l.bloc_id));
    },

    async corbeille(coachId) {
      const [ps, ss] = await Promise.all([
        db.from('programmes').select('id, titre, supprime_le').eq('coach_id', coachId).not('supprime_le', 'is', null),
        db.from('seances').select('id, titre, supprime_le').eq('coach_id', coachId).not('supprime_le', 'is', null),
      ]);
      type L = { id: string; titre: string; supprime_le: string };
      return [
        ...(verifier(ps) as L[]).map((x) => ({ kind: 'programme' as const, ...x })),
        ...(verifier(ss) as L[]).map((x) => ({ kind: 'seance' as const, ...x })),
      ]
        .sort((a, b) => b.supprime_le.localeCompare(a.supprime_le))
        .map((x) => ({ kind: x.kind, id: x.id, nom: x.titre }));
    },

    async supprimer(items) {
      echec(await db.rpc('mettre_a_la_corbeille', { items }));
    },

    async restaurer(it) {
      echec(await db.from(it.kind === 'programme' ? 'programmes' : 'seances').update({ supprime_le: null }).eq('id', it.id));
    },

    async suivis(coachId) {
      const [clients, suivis, cycles, resultats] = await Promise.all([
        db.from('clients').select('id, prenom, nom').eq('coach_id', coachId).eq('actif', true).order('prenom'),
        db.from('suivis').select('id, client_id, debut, duree_mois').eq('coach_id', coachId),
        db.from('cycles').select('*').eq('coach_id', coachId).order('ordre'),
        tout<{ cycle_id: string }>((a, b) => db.from('realisations').select('cycle_id').eq('coach_id', coachId).not('cycle_id', 'is', null).range(a, b)),
      ]);
      const cs = (verifier(cycles) as CycleBase[]).map(versCycle);
      const ids = [...new Set(cs.map((c) => c.programmeId).filter(Boolean))] as string[];
      const noms = new Map(
        ids.length ? (verifier(await db.from('programmes').select('id, titre').in('id', ids)) as { id: string; titre: string }[]).map((p) => [p.id, p.titre]) : [],
      );
      const nb = new Map<string, number>();
      resultats.forEach((r) => nb.set(r.cycle_id, (nb.get(r.cycle_id) ?? 0) + 1));
      const ss = verifier(suivis) as { id: string; client_id: string; debut: string; duree_mois: number }[];
      return (verifier(clients) as { id: string; prenom: string; nom: string }[]).map((c) => {
        const s = ss.find((x) => x.client_id === c.id);
        return {
          clientId: c.id,
          nom: `${c.prenom} ${c.nom}`.trim(),
          suivi: s && { id: s.id, clientId: c.id, debut: s.debut, dureeMois: s.duree_mois },
          cycles: cs
            .filter((x) => x.clientId === c.id)
            .map((x) => ({ ...x, programmeNom: x.programmeId ? noms.get(x.programmeId) : undefined, nbResultats: nb.get(x.id) ?? 0 })),
        };
      });
    },

    async enregistrerSuivi(coachId, s: Suivi) {
      echec(
        await db
          .from('suivis')
          .upsert({ id: s.id, coach_id: coachId, client_id: s.clientId, debut: s.debut, duree_mois: s.dureeMois }, { onConflict: 'client_id' }),
      );
    },

    async enregistrerCycle(coachId, c) {
      const existe = verifier(await db.from('cycles').select('id, ordre').eq('suivi_id', c.suiviId)) as { id: string; ordre: number }[];
      const avant = existe.find((x) => x.id === c.id);
      const ligne = {
        nom: c.nom.trim(),
        objectif: c.objectif || null,
        debut: c.debut,
        fin: c.fin,
        statut: c.statut,
        programme_id: c.programmeId ?? null,
        mode: c.mode ?? null,
      };
      if (avant) echec(await db.from('cycles').update(ligne).eq('id', c.id));
      else
        echec(
          await db.from('cycles').insert({
            ...ligne,
            id: c.id,
            suivi_id: c.suiviId,
            coach_id: coachId,
            client_id: c.clientId,
            ordre: existe.reduce((m, x) => Math.max(m, x.ordre), 0) + 1,
          }),
        );
    },

    async activerCycle(id) {
      echec(await db.rpc('activer_cycle', { c: id }));
    },

    async deplacerCycle(id, sens) {
      echec(await db.rpc('deplacer_cycle', { c: id, sens }));
    },

    async resultats(clientId) {
      const realisations = (
        await tout<RealisationBase>((a, b) => db.from('realisations').select(REALISATION).eq('client_id', clientId).order('fin', { ascending: false }).range(a, b))
      ).map(versRealisation);
      const ids = [...new Set(realisations.flatMap((r) => r.series.map((s) => s.ligneId)))];
      const prescriptions: Record<string, { series: number; repetitions?: string }> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const lignes = verifier(await db.from('lignes').select('id, series, repetitions').in('id', ids.slice(i, i + 200))) as {
          id: string;
          series: number;
          repetitions: string | null;
        }[];
        lignes.forEach((l) => (prescriptions[l.id] = { series: l.series, repetitions: sansNull(l.repetitions) }));
      }
      return { realisations, prescriptions };
    },

    async espaceClient(clientId) {
      const [suivi, cycles, realisations] = await Promise.all([
        db.from('suivis').select('id, client_id, debut, duree_mois').eq('client_id', clientId).maybeSingle(),
        db.from('cycles').select('*').eq('client_id', clientId).in('statut', ['Actif', 'Terminé']).order('ordre'),
        tout<RealisationBase>((a, b) => db.from('realisations').select(REALISATION).eq('client_id', clientId).order('fin', { ascending: false }).range(a, b)),
      ]);
      echec(suivi);
      const cs = (verifier(cycles) as CycleBase[]).map(versCycle);
      const actif = cs.find((c) => c.statut === 'Actif');
      const programmes: Etat['programmes'] = [];
      const seances: Etat['seances'] = [];
      if (actif?.programmeId) {
        // Le client ne lit que le programme de son cycle actif : les autres cycles restent sans nom de programme.
        const [p, ss] = await Promise.all([enTete(actif.programmeId), seancesDe(actif.programmeId)]);
        programmes.push(p);
        seances.push(...ss);
      }
      const s = suivi.data as { id: string; client_id: string; debut: string; duree_mois: number } | null;
      // Les mêmes règles d'assemblage que la démo : un seul endroit décide de ce que voit le client.
      const etat: Etat = {
        programmes,
        seances,
        suivis: s ? [{ id: s.id, clientId, debut: s.debut, dureeMois: s.duree_mois }] : [],
        cycles: cs,
        planifications: [],
        realisations: realisations.map(versRealisation),
      };
      return espaceClient(etat, clientId);
    },

    async calendrier(clientId, cycleId) {
      return (verifier(await db.from('planifications').select('*').eq('client_id', clientId).eq('cycle_id', cycleId).order('date')) as PlanBase[]).map(versPlan);
    },

    async planifier(_clientId, d) {
      echec(await db.rpc('planifier_seance', { p: { ...d, heure: d.heure ?? '' } }));
    },

    async annulerCreneau(_clientId, id) {
      echec(await db.rpc('annuler_creneau', { c: id }));
    },

    async enregistrerRealisation(r) {
      const resultat = verifier(await db.rpc('enregistrer_realisation', { r })) as string;
      return resultat === 'doublon' ? 'doublon' : 'enregistree';
    },
  };
}
