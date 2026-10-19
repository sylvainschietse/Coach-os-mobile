import AsyncStorage from '@react-native-async-storage/async-storage';

import { ajouterALaFile } from '@/domain/file-envoi';
import type { Realisation, RealisationDetail } from '@/domain/types';

import { CLIENTS_DEMO, HISTORIQUE_DEMO, SEANCES_DEMO } from './demo';
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

async function toutes(): Promise<Realisation[]> {
  return [...HISTORIQUE_DEMO, ...(await lire())];
}

function detailler(r: Realisation): RealisationDetail {
  const seance = SEANCES_DEMO.find((s) => s.id === r.seanceId);
  const exercices: Record<string, string> = {};
  seance?.blocs.forEach((b) => b.lignes.forEach((l) => (exercices[l.exercice.id] = l.exercice.nom)));
  return { ...r, seanceTitre: seance?.titre ?? 'Séance', exercices };
}

/** Mode démo : tout reste sur ce téléphone (ou ce navigateur), sans compte ni réseau. */
export const depotDemo: Depot = {
  mode: 'demo',

  async seancesDuClient(clientId) {
    const realisations = await toutes();
    return SEANCES_DEMO.filter((s) => s.clientId === clientId).map((s) => ({
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
    const seance = SEANCES_DEMO.find((s) => s.id === id);
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
    return [...CLIENTS_DEMO, ...(await clientsAjoutes())].map((c) => {
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
    return (await toutes())
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.fin.localeCompare(a.fin))
      .map(detailler);
  },
};

export async function effacerDemo() {
  await AsyncStorage.removeItem(CLE);
}
