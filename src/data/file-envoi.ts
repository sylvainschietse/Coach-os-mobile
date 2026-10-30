import AsyncStorage from '@react-native-async-storage/async-storage';

import { ajouterALaFile, viderLaFile } from '@/domain/file-envoi';
import type { Realisation } from '@/domain/types';

import { depot } from './index';

const CLE = 'coachos.file-envoi';

async function lire(): Promise<Realisation[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    return brut ? (JSON.parse(brut) as Realisation[]) : [];
  } catch {
    return [];
  }
}

let enCours: Promise<number> | null = null;

/** Tente d'envoyer ce qui attend. Renvoie le nombre de séances encore en attente. */
export function envoyerEnAttente(): Promise<number> {
  enCours ??= (async () => {
    try {
      const { restante } = await viderLaFile(await lire(), (r) => depot.enregistrer(r));
      await AsyncStorage.setItem(CLE, JSON.stringify(restante));
      return restante.length;
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

/** La séance est d'abord rangée sur le téléphone, puis envoyée si le réseau le permet. */
export async function enregistrerSeance(realisation: Realisation): Promise<'envoyee' | 'en_attente'> {
  await AsyncStorage.setItem(CLE, JSON.stringify(ajouterALaFile(await lire(), realisation)));
  const restantes = await envoyerEnAttente();
  return restantes === 0 ? 'envoyee' : 'en_attente';
}
