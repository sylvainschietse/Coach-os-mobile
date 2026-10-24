import type { SupabaseClient } from '@supabase/supabase-js';

import { lireMinuteur } from '@/domain/minuteur';
import type {
  Exercice,
  JournalNutrition,
  Mensuration,
  Mesure,
  PlanNutrition,
  Programme,
  Realisation,
  RealisationDetail,
  RecordPerso,
  Seance,
  Valeurs,
} from '@/domain/types';
import { attribuerModele } from '@/domain/programmes';
import { nouvelId } from '@/lib/identifiant';

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
  retiree: boolean;
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

type ExerciceBase = {
  id: string;
  nom: string;
  mesures: Mesure[];
  video_url: string | null;
  famille?: string | null;
  materiel?: string[] | null;
  muscles?: string[] | null;
};

function versExercice(e: ExerciceBase): Exercice {
  return {
    id: e.id,
    nom: e.nom,
    mesures: e.mesures,
    videoUrl: sansNull(e.video_url),
    famille: sansNull(e.famille ?? null),
    materiel: e.materiel ?? undefined,
    muscles: e.muscles ?? undefined,
  };
}

/** Ce qu'attend la fonction enregistrer_seance : la séance avec l'id des exercices seulement. */
function versJson(s: Seance) {
  return {
    id: s.id,
    clientId: s.clientId,
    programmeId: s.programmeId ?? null,
    titre: s.titre,
    datePrevue: s.datePrevue ?? null,
    consignes: s.consignes ?? null,
    ordre: s.ordre ?? null,
    blocs: s.blocs.map((b) => ({
      id: b.id,
      titre: b.titre,
      minuteur: b.minuteur ?? null,
      lignes: b.lignes.map(({ exercice, ...l }) => ({ ...l, exerciceId: exercice.id, minuteur: l.minuteur ?? null })),
    })),
  };
}

type ProgrammeBase = {
  id: string;
  client_id: string | null;
  titre: string;
  objectif: string | null;
  duree_semaines: number | null;
  seances_par_semaine: number | null;
  niveau: string | null;
  notes: string | null;
  modele_seances: Programme['seances'];
};

const versProgramme = (p: ProgrammeBase): Programme => ({
  id: p.id,
  clientId: sansNull(p.client_id),
  titre: p.titre,
  objectif: sansNull(p.objectif),
  dureeSemaines: sansNull(p.duree_semaines),
  seancesParSemaine: sansNull(p.seances_par_semaine),
  niveau: sansNull(p.niveau),
  notes: sansNull(p.notes),
  seances: p.modele_seances ?? [],
});

const versLigneProgramme = (coachId: string, p: Programme) => ({
  id: p.id,
  coach_id: coachId,
  client_id: p.clientId ?? null,
  titre: p.titre.trim(),
  objectif: p.objectif ?? null,
  duree_semaines: p.dureeSemaines ?? null,
  seances_par_semaine: p.seancesParSemaine ?? null,
  niveau: p.niveau ?? null,
  notes: p.notes ?? null,
  modele_seances: p.clientId ? [] : p.seances,
});

// Les colonnes numeric reviennent en texte : on les relit en nombre.
const nombre = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

const MENSURATION = {
  poidsKg: 'poids_kg',
  masseGrassePct: 'masse_grasse_pct',
  tourTailleCm: 'tour_taille_cm',
  tourHanchesCm: 'tour_hanches_cm',
  tourPoitrineCm: 'tour_poitrine_cm',
  tourBrasCm: 'tour_bras_cm',
  tourCuisseCm: 'tour_cuisse_cm',
} as const;

const echec = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

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
          .select('id, titre, date_prevue, programme_id, blocs(retire, lignes(retiree)), realisations(fin)')
          .eq('client_id', clientId)
          .eq('archivee', false)
          .order('date_prevue', { ascending: true, nullsFirst: false }),
      ) as unknown as {
        id: string;
        titre: string;
        date_prevue: string | null;
        programme_id: string | null;
        blocs: { retire: boolean; lignes: { retiree: boolean }[] }[];
        realisations: { fin: string }[];
      }[];
      return lignes.map((s) => ({
        id: s.id,
        titre: s.titre,
        datePrevue: sansNull(s.date_prevue),
        programmeId: sansNull(s.programme_id),
        nbExercices: s.blocs.filter((b) => !b.retire).reduce((n, b) => n + b.lignes.filter((l) => !l.retiree).length, 0),
        derniereRealisation: s.realisations.map((r) => r.fin).sort().at(-1),
      }));
    },

    async seance(id) {
      const s = verifier(
        await db
          .from('seances')
          .select('id, client_id, titre, date_prevue, consignes, programme_id, ordre, blocs(id, ordre, titre, minuteur, retire, lignes(*, exercices(*)))')
          .eq('id', id)
          .single(),
      ) as unknown as {
        id: string;
        client_id: string;
        titre: string;
        date_prevue: string | null;
        consignes: string | null;
        programme_id: string | null;
        ordre: number | null;
        blocs: { id: string; ordre: number; titre: string; minuteur: unknown; retire: boolean; lignes: LigneBase[] }[];
      };
      const seance: Seance = {
        id: s.id,
        clientId: s.client_id,
        titre: s.titre,
        datePrevue: sansNull(s.date_prevue),
        consignes: sansNull(s.consignes),
        programmeId: sansNull(s.programme_id),
        ordre: sansNull(s.ordre),
        blocs: s.blocs
          .filter((b) => !b.retire)
          .sort((a, b) => a.ordre - b.ordre)
          .map((b) => ({
            id: b.id,
            titre: b.titre,
            minuteur: lireMinuteur(b.minuteur) ?? undefined,
            lignes: b.lignes
              .filter((l) => !l.retiree)
              .sort((x, y) => x.ordre - y.ordre)
              .map((l) => ({
                id: l.id,
                exercice: versExercice(l.exercices),
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

    async catalogue() {
      // Supabase renvoie au plus 1000 lignes par requête : on lit par pages.
      const tous: ExerciceBase[] = [];
      for (let debut = 0; ; debut += 1000) {
        const page = verifier(
          await db
            .from('exercices')
            .select('id, nom, mesures, video_url, famille, materiel, muscles')
            .eq('actif', true)
            .order('nom')
            .range(debut, debut + 999),
        ) as ExerciceBase[];
        tous.push(...page);
        if (page.length < 1000) break;
      }
      return tous.map(versExercice);
    },

    async creerExercice(coachId, e) {
      const ligne = verifier(
        await db.from('exercices').insert({ coach_id: coachId, nom: e.nom.trim(), mesures: e.mesures }).select('id, nom, mesures, video_url').single(),
      ) as ExerciceBase;
      return versExercice(ligne);
    },

    async enregistrerSeance(seance) {
      echec(await db.rpc('enregistrer_seance', { s: versJson(seance) }));
    },

    async archiverSeance(id) {
      echec(await db.from('seances').update({ archivee: true }).eq('id', id));
    },

    async modeles(coachId) {
      const lignes = verifier(
        await db.from('programmes').select('*').eq('coach_id', coachId).is('client_id', null).eq('archive', false).order('titre'),
      ) as ProgrammeBase[];
      return lignes.map(versProgramme);
    },

    async programme(id) {
      return versProgramme(verifier(await db.from('programmes').select('*').eq('id', id).single()) as ProgrammeBase);
    },

    async enregistrerModele(coachId, programme) {
      echec(await db.from('programmes').upsert(versLigneProgramme(coachId, programme)));
    },

    async archiverModele(id) {
      echec(await db.from('programmes').update({ archive: true }).eq('id', id));
    },

    async programmesDuClient(clientId) {
      const lignes = verifier(
        await db.from('programmes').select('*').eq('client_id', clientId).eq('archive', false).order('created_at', { ascending: false }),
      ) as ProgrammeBase[];
      return lignes.map(versProgramme);
    },

    async attribuerModele(coachId, modele, clientId, debut) {
      const { programme, seances } = attribuerModele(modele, clientId, debut, nouvelId);
      echec(await db.from('programmes').insert(versLigneProgramme(coachId, programme)));
      for (const s of seances) echec(await db.rpc('enregistrer_seance', { s: versJson(s) }));
    },

    async mensurations(clientId) {
      const lignes = verifier(
        await db.from('mensurations').select('*').eq('client_id', clientId).order('date', { ascending: false }),
      ) as Record<string, unknown>[];
      return lignes.map((l) => {
        const m: Mensuration = { id: l.id as string, clientId: l.client_id as string, date: l.date as string, note: sansNull(l.note as string | null) };
        for (const [cle, colonne] of Object.entries(MENSURATION)) m[cle as keyof typeof MENSURATION] = nombre(l[colonne]);
        return m;
      });
    },

    async ajouterMensuration(m) {
      const ligne: Record<string, unknown> = { id: m.id, client_id: m.clientId, date: m.date, note: m.note ?? null };
      for (const [cle, colonne] of Object.entries(MENSURATION)) ligne[colonne] = m[cle as keyof typeof MENSURATION] ?? null;
      echec(await db.from('mensurations').upsert(ligne));
    },

    async supprimerMensuration(id) {
      echec(await db.from('mensurations').delete().eq('id', id));
    },

    async records(clientId) {
      const lignes = verifier(await db.from('records').select('*').eq('client_id', clientId).order('date', { ascending: false })) as {
        id: string;
        client_id: string;
        exercice_id: string | null;
        libelle: string;
        valeur: string;
        unite: RecordPerso['unite'];
        repetitions: number | null;
        date: string;
        note: string | null;
      }[];
      return lignes.map((r) => ({
        id: r.id,
        clientId: r.client_id,
        exerciceId: sansNull(r.exercice_id),
        libelle: r.libelle,
        valeur: Number(r.valeur),
        unite: r.unite,
        repetitions: sansNull(r.repetitions),
        date: r.date,
        note: sansNull(r.note),
      }));
    },

    async ajouterRecord(r) {
      echec(
        await db.from('records').upsert({
          id: r.id,
          client_id: r.clientId,
          exercice_id: r.exerciceId ?? null,
          libelle: r.libelle.trim(),
          valeur: r.valeur,
          unite: r.unite,
          repetitions: r.repetitions ?? null,
          date: r.date,
          note: r.note ?? null,
        }),
      );
    },

    async supprimerRecord(id) {
      echec(await db.from('records').delete().eq('id', id));
    },

    async planNutrition(clientId) {
      const { data, error } = await db.from('plans_nutrition').select('*').eq('client_id', clientId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        clientId: data.client_id,
        calories: sansNull(data.calories),
        proteinesG: sansNull(data.proteines_g),
        glucidesG: sansNull(data.glucides_g),
        lipidesG: sansNull(data.lipides_g),
        eauL: nombre(data.eau_l),
        conseils: sansNull(data.conseils),
        majLe: data.updated_at,
      } satisfies PlanNutrition;
    },

    async enregistrerPlanNutrition(p) {
      echec(
        await db.from('plans_nutrition').upsert({
          client_id: p.clientId,
          calories: p.calories ?? null,
          proteines_g: p.proteinesG ?? null,
          glucides_g: p.glucidesG ?? null,
          lipides_g: p.lipidesG ?? null,
          eau_l: p.eauL ?? null,
          conseils: p.conseils ?? null,
          updated_at: new Date().toISOString(),
        }),
      );
    },

    async journalNutrition(clientId) {
      const lignes = verifier(
        await db.from('journal_nutrition').select('*').eq('client_id', clientId).order('date', { ascending: false }).limit(60),
      ) as { id: string; client_id: string; date: string; respect: number | null; eau_l: string | null; repas: string | null; ressenti: string | null }[];
      return lignes.map(
        (j): JournalNutrition => ({
          id: j.id,
          clientId: j.client_id,
          date: j.date,
          respect: sansNull(j.respect),
          eauL: nombre(j.eau_l),
          repas: sansNull(j.repas),
          ressenti: sansNull(j.ressenti),
        }),
      );
    },

    async enregistrerJournal(j) {
      echec(
        await db.from('journal_nutrition').upsert(
          {
            client_id: j.clientId,
            date: j.date,
            respect: j.respect ?? null,
            eau_l: j.eauL ?? null,
            repas: j.repas ?? null,
            ressenti: j.ressenti ?? null,
          },
          { onConflict: 'client_id,date' },
        ),
      );
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
  let client = await db.from('clients').select('id, prenom').eq('user_id', userId).eq('actif', true).maybeSingle();
  if (!client.data) {
    // Première connexion avec Google, Microsoft ou un e-mail vérifié : on cherche sa fiche client.
    const { data: rattache } = await db.rpc('rattacher_mon_compte');
    if (rattache) client = await db.from('clients').select('id, prenom').eq('id', rattache).maybeSingle();
  }
  if (client.data) return { role: 'client', clientId: client.data.id, prenom: client.data.prenom };
  return null;
}
