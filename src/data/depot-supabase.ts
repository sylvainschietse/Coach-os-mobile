import type { SupabaseClient } from '@supabase/supabase-js';

import { lireMinuteur } from '@/domain/minuteur';
import type { Mesure, Realisation, RealisationDetail, Seance, Valeurs } from '@/domain/types';

import { derniersParExercice, type Depot, type Profil } from './depot';

type LigneBase = {
  id: string;
  ordre: number;
  series: number;
  repetitions_min: number | null;
  repetitions_max: number | null;
  charge_indicative: number | null;
  duree_s: number | null;
  recuperation_s: number | null;
  rir: number | null;
  tempo: string | null;
  consignes: string | null;
  minuteur: unknown;
  exercices: { id: string; nom: string; mesures: Mesure[]; video_url: string | null };
};

type SerieBase = {
  id: string;
  ligne_id: string;
  exercice_id: string;
  index: number;
  valeurs: Valeurs;
  suggestion: Valeurs;
  exercices?: { nom: string } | null;
};

type RealisationBase = {
  id: string;
  seance_id: string;
  client_id: string;
  debut: string;
  fin: string;
  commentaire: string | null;
  seances?: { titre: string } | null;
  series_realisees: SerieBase[];
};

const sansNull = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

function versRealisation(r: RealisationBase): Realisation {
  return {
    id: r.id,
    seanceId: r.seance_id,
    clientId: r.client_id,
    debut: r.debut,
    fin: r.fin,
    commentaire: sansNull(r.commentaire),
    series: r.series_realisees
      .sort((a, b) => a.index - b.index)
      .map((s) => ({
        id: s.id,
        ligneId: s.ligne_id,
        exerciceId: s.exercice_id,
        index: s.index,
        valeurs: s.valeurs,
        suggestion: s.suggestion,
      })),
  };
}

function verifier<T>(resultat: { data: T | null; error: { message: string } | null }): T {
  if (resultat.error) throw new Error(resultat.error.message);
  if (resultat.data === null) throw new Error('Réponse vide');
  return resultat.data;
}

export function creerDepotSupabase(db: SupabaseClient): Depot {
  return {
    mode: 'supabase',

    async seancesDuClient(clientId) {
      const lignes = verifier(
        await db
          .from('seances')
          .select('id, titre, date_prevue, blocs(lignes(id)), realisations(fin)')
          .eq('client_id', clientId)
          .order('date_prevue', { ascending: false }),
      ) as unknown as {
        id: string;
        titre: string;
        date_prevue: string | null;
        blocs: { lignes: { id: string }[] }[];
        realisations: { fin: string }[];
      }[];
      return lignes.map((s) => ({
        id: s.id,
        titre: s.titre,
        datePrevue: sansNull(s.date_prevue),
        nbExercices: s.blocs.reduce((n, b) => n + b.lignes.length, 0),
        derniereRealisation: s.realisations.map((r) => r.fin).sort().at(-1),
      }));
    },

    async seance(id) {
      const s = verifier(
        await db
          .from('seances')
          .select('id, client_id, titre, date_prevue, consignes, blocs(id, ordre, titre, minuteur, lignes(*, exercices(*)))')
          .eq('id', id)
          .single(),
      ) as unknown as {
        id: string;
        client_id: string;
        titre: string;
        date_prevue: string | null;
        consignes: string | null;
        blocs: { id: string; ordre: number; titre: string; minuteur: unknown; lignes: LigneBase[] }[];
      };
      const seance: Seance = {
        id: s.id,
        clientId: s.client_id,
        titre: s.titre,
        datePrevue: sansNull(s.date_prevue),
        consignes: sansNull(s.consignes),
        blocs: s.blocs
          .sort((a, b) => a.ordre - b.ordre)
          .map((b) => ({
            id: b.id,
            titre: b.titre,
            minuteur: lireMinuteur(b.minuteur) ?? undefined,
            lignes: b.lignes
              .sort((x, y) => x.ordre - y.ordre)
              .map((l) => ({
                id: l.id,
                exercice: {
                  id: l.exercices.id,
                  nom: l.exercices.nom,
                  mesures: l.exercices.mesures,
                  videoUrl: sansNull(l.exercices.video_url),
                },
                series: l.series,
                repetitionsMin: sansNull(l.repetitions_min),
                repetitionsMax: sansNull(l.repetitions_max),
                chargeIndicative: l.charge_indicative === null ? undefined : Number(l.charge_indicative),
                dureeS: sansNull(l.duree_s),
                recuperationS: sansNull(l.recuperation_s),
                rir: sansNull(l.rir),
                tempo: sansNull(l.tempo),
                minuteur: lireMinuteur(l.minuteur) ?? undefined,
                consignes: sansNull(l.consignes),
              })),
          })),
      };
      return seance;
    },

    async historique(clientId, exerciceIds) {
      const lignes = verifier(
        await db
          .from('realisations')
          .select('id, seance_id, client_id, debut, fin, commentaire, series_realisees(*)')
          .eq('client_id', clientId)
          .order('fin', { ascending: false })
          .limit(20),
      ) as unknown as RealisationBase[];
      return derniersParExercice(lignes.map(versRealisation), exerciceIds);
    },

    async enregistrer(r) {
      const client = verifier(await db.from('clients').select('coach_id').eq('id', r.clientId).single()) as {
        coach_id: string;
      };
      const entete = await db.from('realisations').upsert(
        {
          id: r.id,
          seance_id: r.seanceId,
          client_id: r.clientId,
          coach_id: client.coach_id,
          debut: r.debut,
          fin: r.fin,
          commentaire: r.commentaire ?? null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (entete.error) throw new Error(entete.error.message);
      if (r.series.length === 0) return;
      const series = await db.from('series_realisees').upsert(
        r.series.map((s) => ({
          id: s.id,
          realisation_id: r.id,
          ligne_id: s.ligneId,
          exercice_id: s.exerciceId,
          index: s.index,
          valeurs: s.valeurs,
          suggestion: s.suggestion,
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (series.error) throw new Error(series.error.message);
    },

    async clientsDuCoach(coachId) {
      const lignes = verifier(
        await db
          .from('clients')
          .select('id, prenom, nom, realisations(fin, commentaire, seances(titre))')
          .eq('coach_id', coachId)
          .eq('actif', true)
          .order('prenom'),
      ) as unknown as {
        id: string;
        prenom: string;
        nom: string;
        realisations: { fin: string; commentaire: string | null; seances: { titre: string } | null }[];
      }[];
      return lignes.map((c) => {
        const derniere = [...c.realisations].sort((a, b) => b.fin.localeCompare(a.fin)).at(0);
        return {
          id: c.id,
          prenom: c.prenom,
          nom: c.nom,
          derniereSeance: derniere
            ? { titre: derniere.seances?.titre ?? 'Séance', fin: derniere.fin, commentaire: sansNull(derniere.commentaire) }
            : undefined,
        };
      });
    },

    async realisationsDuClient(clientId) {
      const lignes = verifier(
        await db
          .from('realisations')
          .select('id, seance_id, client_id, debut, fin, commentaire, seances(titre), series_realisees(*, exercices(nom))')
          .eq('client_id', clientId)
          .order('fin', { ascending: false }),
      ) as unknown as RealisationBase[];
      return lignes.map((r): RealisationDetail => {
        const exercices: Record<string, string> = {};
        r.series_realisees.forEach((s) => (exercices[s.exercice_id] = s.exercices?.nom ?? 'Exercice'));
        return { ...versRealisation(r), seanceTitre: r.seances?.titre ?? 'Séance', exercices };
      });
    },
  };
}

/** Après connexion : est-ce un coach ou un client ? */
export async function profilConnecte(db: SupabaseClient): Promise<Profil | null> {
  const { data: auth } = await db.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const coach = await db.from('coachs').select('id, nom').eq('user_id', userId).maybeSingle();
  if (coach.data) return { role: 'coach', coachId: coach.data.id, nom: coach.data.nom };
  const client = await db.from('clients').select('id, prenom').eq('user_id', userId).eq('actif', true).maybeSingle();
  if (client.data) return { role: 'client', clientId: client.data.id, prenom: client.data.prenom };
  return null;
}
