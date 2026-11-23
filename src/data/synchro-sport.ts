// Copie des séances de Health Connect (Android) ou d'Apple Santé (iPhone) vers la base : depuis la dernière synchro
// (moins 3 jours, pour les montres et machines qui envoient en retard), ou les 30 derniers jours la première fois.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { lireSeances as lireAppleSante } from '@/lib/apple-sante';
import { lireSeances as lireHealthConnect } from '@/lib/health-connect';

import { activites } from './activites';

const cle = (clientId: string) => `coachos.health-connect.synchro.${clientId}`;

/** Service lu sur ce téléphone, pour les messages. */
export const nomServiceSante = Platform.OS === 'ios' ? 'Apple Santé' : 'Health Connect';

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
  const seances = Platform.OS === 'ios' ? await lireAppleSante(depuis) : await lireHealthConnect(depuis);
  let envoyees = 0;
  // La base reçoit au plus 200 séances par envoi.
  for (let i = 0; i < seances.length; i += 200) envoyees += await activites.enregistrer(clientId, seances.slice(i, i + 200));
  await AsyncStorage.setItem(cle(clientId), debut).catch(() => undefined);
  return { lues: seances.length, envoyees };
}
