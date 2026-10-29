// Copie des séances de Health Connect vers la base : depuis la dernière synchro (moins 3 jours, pour les montres
// qui envoient en retard), ou les 30 derniers jours la première fois — Health Connect n'en donne pas plus au départ.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { lireSeances } from '@/lib/health-connect';

import { activites } from './activites';

const cle = (clientId: string) => `coachos.health-connect.synchro.${clientId}`;

export async function derniereSynchro(clientId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(cle(clientId));
  } catch {
    return null;
  }
}

export async function synchroniserSport(clientId: string): Promise<{ lues: number; envoyees: number }> {
  const derniere = await derniereSynchro(clientId);
  const depuis = new Date(derniere ? Date.parse(derniere) - 3 * 864e5 : Date.now() - 30 * 864e5).toISOString();
  const debut = new Date().toISOString();
  const seances = await lireSeances(depuis);
  const envoyees = seances.length ? await activites.enregistrer(clientId, seances) : 0;
  await AsyncStorage.setItem(cle(clientId), debut).catch(() => undefined);
  return { lues: seances.length, envoyees };
}
