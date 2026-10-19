import AsyncStorage from '@react-native-async-storage/async-storage';

import { ajouterALaFile } from '@/domain/file-envoi';
import type { Exercice, Realisation, RealisationDetail, Seance } from '@/domain/types';

import { CATALOGUE_DEMO, CLIENTS_DEMO, HISTORIQUE_DEMO, SEANCES_DEMO } from './demo';
import { derniersParExercice, type Depot } from './depot';

const CLE = 'coachos.demo.realisations';
// Séances créées ou modifiées par le coach (null = retirée du programme).
const CLE_SEANCES = 'coachos.demo.seances';
const CLE_EXERCICES = 'coachos.demo.exercices';

async function lireJson<T>(cle: string, defaut: T): Promise<T> {
  try {
    const brut = await AsyncStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : defaut;
  } catch {
    return defaut;
  }
}

const lire = () => lireJson<Realisation[]>(CLE, []);
const seancesModifiees = () => lireJson<Record<string, Seance | null>>(CLE_SEANCES, {});
const exercicesCrees = () => lireJson<Exercice[]>(CLE_EXERCICES, []);

async function toutes(): Promise<Realisation[]> {
  return [...HISTORIQUE_DEMO, ...(await lire())];
}

/** Les séances d'origine, remplacées par les versions du coach quand il en a fait. */
async function seances(): Promise<Seance[]> {
  const modifiees = await seancesModifiees();
  const origine = SEANCES_DEMO.filter((s) => !(s.id in modifiees));
  const ajoutees = Object.values(modifiees).filter((s): s is Seance => s !== null);
  return [...origine, ...ajoutees];
}

async function catalogue(): Promise<Exercice[]> {
  return [...CATALOGUE_DEMO, ...(await exercicesCrees())];
}

async function detailleur() {
  const [liste, exercices] = await Promise.all([seances(), catalogue()]);
  const noms = Object.fromEntries(exercices.map((e) => [e.id, e.nom]));
  const titres = Object.fromEntries([...SEANCES_DEMO, ...liste].map((s) => [s.id, s.titre]));
  return (r: Realisation): RealisationDetail => ({ ...r, seanceTitre: titres[r.seanceId] ?? 'Séance', exercices: noms });
}

/** Mode démo : tout reste sur ce téléphone (ou ce navigateur), sans compte ni réseau. */
export const depotDemo: Depot = {
  mode: 'demo',

  async seancesDuClient(clientId) {
    const realisations = await toutes();
    return (await seances())
      .filter((s) => s.clientId === clientId)
      .map((s) => ({
        id: s.id,
        titre: s.titre,
        datePrevue: s.datePrevue,
        nbExercices: s.blocs.reduce((n, b) => n + b.lignes.length, 0),
        derniereRealisation: realisations
          .filter((r) => r.seanceId === s.id)
          .map((r) => r.fin)
          .sort()
          .at(-1),
      }));
  },

  async seance(id) {
    const seance = (await seances()).find((s) => s.id === id);
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
    const detailler = await detailleur();
    return CLIENTS_DEMO.map((c) => {
      const derniere = realisations
        .filter((r) => r.clientId === c.id)
        .sort((a, b) => b.fin.localeCompare(a.fin))
        .at(0);
      return {
        ...c,
        derniereSeance: derniere
          ? { titre: detailler(derniere).seanceTitre, fin: derniere.fin, commentaire: derniere.commentaire }
          : undefined,
      };
    });
  },

  async realisationsDuClient(clientId) {
    const detailler = await detailleur();
    return (await toutes())
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.fin.localeCompare(a.fin))
      .map(detailler);
  },

  exercices: catalogue,

  async creerExercice(_coachId, nom, mesures) {
    const exercice: Exercice = { id: `ex-perso-${Date.now()}`, nom: nom.trim(), mesures };
    await AsyncStorage.setItem(CLE_EXERCICES, JSON.stringify([...(await exercicesCrees()), exercice]));
    return exercice;
  },

  async sauverSeance(seance) {
    const modifiees = await seancesModifiees();
    await AsyncStorage.setItem(CLE_SEANCES, JSON.stringify({ ...modifiees, [seance.id]: seance }));
  },

  async archiverSeance(id) {
    const modifiees = await seancesModifiees();
    await AsyncStorage.setItem(CLE_SEANCES, JSON.stringify({ ...modifiees, [id]: null }));
  },
};

export async function effacerDemo() {
  await Promise.all([CLE, CLE_SEANCES, CLE_EXERCICES].map((c) => AsyncStorage.removeItem(c)));
}
