import AsyncStorage from '@react-native-async-storage/async-storage';

import { ajouterALaFile } from '@/domain/file-envoi';
import { attribuerModele } from '@/domain/programmes';
import type {
  Exercice,
  JournalNutrition,
  Mensuration,
  PlanNutrition,
  Programme,
  Realisation,
  RealisationDetail,
  RecordPerso,
  Seance,
} from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';

import catalogueDemo from './catalogue-demo.json';
import {
  CLIENTS_DEMO,
  EXERCICES_DEMO,
  HISTORIQUE_DEMO,
  JOURNAL_DEMO,
  MENSURATIONS_DEMO,
  MODELES_DEMO,
  PLANS_DEMO,
  RECORDS_DEMO,
  SEANCES_DEMO,
} from './demo';
import { derniersParExercice, type Depot } from './depot';

const CLE = 'coachos.demo.realisations';

async function lire(): Promise<Realisation[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    return brut ? (JSON.parse(brut) as Realisation[]) : [];
  } catch {
    return [];
  }
}

/** Prospects passés clients depuis l'accueil des clients (voir data/crm.ts). */
async function clientsAjoutes(): Promise<{ id: string; prenom: string; nom: string }[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem('coachos.demo.clients-ajoutes')) ?? '[]');
  } catch {
    return [];
  }
}

/** Une liste gardée sur l'appareil, partant des données fictives ; une entrée du même id remplace l'originale. */
function collection<T extends object>(cle: string, initiale: T[], id: (x: T) => string) {
  const charger = async (): Promise<T[]> => {
    try {
      const brut = await AsyncStorage.getItem(`coachos.demo.${cle}`);
      if (brut) return JSON.parse(brut) as T[];
    } catch {
      // Stockage indisponible : on repart des données fictives.
    }
    return initiale;
  };
  const sauver = (liste: T[]) => AsyncStorage.setItem(`coachos.demo.${cle}`, JSON.stringify(liste));
  return {
    lire: charger,
    async mettre(x: T) {
      const liste = await charger();
      await sauver([...liste.filter((y) => id(y) !== id(x)), x]);
    },
    async retirer(cle: string) {
      await sauver((await charger()).filter((y) => id(y) !== cle));
    },
  };
}

const seancesStockees = collection<Seance & { archivee?: boolean }>('seances', SEANCES_DEMO, (s) => s.id);
const programmesStockes = collection<Programme & { archive?: boolean }>('programmes', MODELES_DEMO, (p) => p.id);
const exercicesAjoutes = collection<Exercice>('exercices', [], (e) => e.id);
const mensurationsStockees = collection<Mensuration>('mensurations', MENSURATIONS_DEMO, (m) => m.id);
const recordsStockes = collection<RecordPerso>('records', RECORDS_DEMO, (r) => r.id);
const plansStockes = collection<PlanNutrition>('plans-nutrition', PLANS_DEMO, (p) => p.clientId);
const journalStocke = collection<JournalNutrition>('journal-nutrition', JOURNAL_DEMO, (j) => `${j.clientId}|${j.date}`);

const seancesVisibles = async () => (await seancesStockees.lire()).filter((s) => !s.archivee);

async function toutes(): Promise<Realisation[]> {
  return [...HISTORIQUE_DEMO, ...(await lire())];
}

function detailler(r: Realisation, seances: Seance[]): RealisationDetail {
  const seance = seances.find((s) => s.id === r.seanceId);
  const exercices: Record<string, string> = {};
  seance?.blocs.forEach((b) => b.lignes.forEach((l) => (exercices[l.exercice.id] = l.exercice.nom)));
  return { ...r, seanceTitre: seance?.titre ?? 'Séance', exercices };
}

/** Mode démo : tout reste sur ce téléphone (ou ce navigateur), sans compte ni réseau. */
export const depotDemo: Depot = {
  mode: 'demo',

  async seancesDuClient(clientId) {
    const realisations = await toutes();
    const seances = (await seancesVisibles()).filter((s) => s.clientId === clientId);
    seances.sort((a, b) => (a.datePrevue ?? '9999').localeCompare(b.datePrevue ?? '9999') || (a.ordre ?? 0) - (b.ordre ?? 0));
    return seances.map((s) => ({
      id: s.id,
      titre: s.titre,
      datePrevue: s.datePrevue,
      programmeId: s.programmeId,
      nbExercices: s.blocs.reduce((n, b) => n + b.lignes.length, 0),
      derniereRealisation: realisations
        .filter((r) => r.seanceId === s.id)
        .map((r) => r.fin)
        .sort()
        .at(-1),
    }));
  },

  async seance(id) {
    const seance = (await seancesStockees.lire()).find((s) => s.id === id);
    if (!seance) throw new Error('Séance introuvable');
    return seance;
  },

  async historique(clientId, exerciceIds) {
    const realisations = (await toutes()).filter((r) => r.clientId === clientId);
    return derniersParExercice(realisations, exerciceIds);
  },

  async enregistrer(realisation) {
    const actuelles = await lire();
    await AsyncStorage.setItem(CLE, JSON.stringify(ajouterALaFile(actuelles, realisation)));
  },

  async clientsDuCoach() {
    const realisations = await toutes();
    const seances = await seancesStockees.lire();
    return [...CLIENTS_DEMO, ...(await clientsAjoutes())].map((c) => {
      const derniere = realisations
        .filter((r) => r.clientId === c.id)
        .sort((a, b) => b.fin.localeCompare(a.fin))
        .at(0);
      return {
        ...c,
        derniereSeance: derniere
          ? { titre: detailler(derniere, seances).seanceTitre, fin: derniere.fin, commentaire: derniere.commentaire }
          : undefined,
      };
    });
  },

  async realisationsDuClient(clientId) {
    const seances = await seancesStockees.lire();
    return (await toutes())
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.fin.localeCompare(a.fin))
      .map((r) => detailler(r, seances));
  },

  async catalogue() {
    const catalogue = catalogueDemo as Exercice[];
    // Sans catalogue importé, les quelques exercices des séances fictives suffisent à essayer.
    const base = catalogue.length > 0 ? catalogue : Object.values(EXERCICES_DEMO);
    const deja = new Set(base.map((e) => e.id));
    const extra = Object.values(EXERCICES_DEMO).filter((e) => !deja.has(e.id));
    return [...base, ...extra, ...(await exercicesAjoutes.lire())].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  },

  async creerExercice(_coachId, e) {
    const exercice: Exercice = { id: `ex-perso-${nouvelId()}`, nom: e.nom.trim(), mesures: e.mesures };
    await exercicesAjoutes.mettre(exercice);
    return exercice;
  },

  async enregistrerSeance(seance) {
    await seancesStockees.mettre(seance);
  },

  async archiverSeance(id) {
    const s = (await seancesStockees.lire()).find((x) => x.id === id);
    if (s) await seancesStockees.mettre({ ...s, archivee: true });
  },

  async modeles() {
    return (await programmesStockes.lire()).filter((p) => !p.clientId && !p.archive).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  },

  async programme(id) {
    const p = (await programmesStockes.lire()).find((x) => x.id === id);
    if (!p) throw new Error('Programme introuvable');
    return p;
  },

  async enregistrerModele(_coachId, programme) {
    await programmesStockes.mettre(programme);
  },

  async archiverModele(id) {
    const p = (await programmesStockes.lire()).find((x) => x.id === id);
    if (p) await programmesStockes.mettre({ ...p, archive: true });
  },

  async programmesDuClient(clientId) {
    return (await programmesStockes.lire()).filter((p) => p.clientId === clientId && !p.archive);
  },

  async attribuerModele(_coachId, modele, clientId, debut) {
    const { programme, seances } = attribuerModele(modele, clientId, debut, nouvelId);
    await programmesStockes.mettre(programme);
    for (const s of seances) await seancesStockees.mettre(s);
  },

  async mensurations(clientId) {
    return (await mensurationsStockees.lire()).filter((m) => m.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date));
  },
  ajouterMensuration: (m) => mensurationsStockees.mettre(m),
  supprimerMensuration: (id) => mensurationsStockees.retirer(id),

  async records(clientId) {
    return (await recordsStockes.lire()).filter((r) => r.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date));
  },
  ajouterRecord: (r) => recordsStockes.mettre(r),
  supprimerRecord: (id) => recordsStockes.retirer(id),

  async planNutrition(clientId) {
    return (await plansStockes.lire()).find((p) => p.clientId === clientId) ?? null;
  },
  enregistrerPlanNutrition: (p) => plansStockes.mettre({ ...p, majLe: new Date().toISOString() }),

  async journalNutrition(clientId) {
    return (await journalStocke.lire()).filter((j) => j.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date));
  },
  enregistrerJournal: (j) => journalStocke.mettre(j),
};

export async function effacerDemo() {
  await AsyncStorage.multiRemove(
    [CLE, ...['seances', 'programmes', 'exercices', 'mensurations', 'records', 'plans-nutrition', 'journal-nutrition'].map((c) => `coachos.demo.${c}`)],
  );
}
