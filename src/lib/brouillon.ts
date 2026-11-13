// lib/brouillon.tsx d'origine : brouillons de saisie gardés sur l'appareil et garde avant de les quitter.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/** Brouillons de saisie non enregistrés (clés de stockage), partagés par tout l'espace client. */
export const brouillonsOuverts = new Set<string>();

if (Platform.OS === 'web' && typeof window !== 'undefined')
  window.addEventListener('beforeunload', (e) => {
    if (brouillonsOuverts.size) e.preventDefault();
  });

let ouvreur: ((suite: () => void) => void) | null = null;

/** Monté une fois par la garde : reçoit la suite à exécuter après confirmation. */
export function enregistrerGarde(f: ((suite: () => void) => void) | null) {
  ouvreur = f;
}

/** Exécute `suite` directement, ou après confirmation si un brouillon (parmi `cles`, ou n'importe lequel) n'est pas enregistré. */
export function demanderSortie(suite: () => void, cles?: string[]) {
  const sale = cles ? cles.some((k) => brouillonsOuverts.has(k)) : brouillonsOuverts.size > 0;
  if (sale && ouvreur) ouvreur(suite);
  else suite();
}

export async function lireBrouillon<T>(cle: string): Promise<T | null> {
  try {
    const brut = await AsyncStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

/** `null` efface le brouillon. Une erreur de stockage n'empêche pas la saisie. */
export function ecrireBrouillon(cle: string, valeur: unknown | null) {
  if (valeur === null) {
    brouillonsOuverts.delete(cle);
    AsyncStorage.removeItem(cle).catch(() => {});
  } else {
    brouillonsOuverts.add(cle);
    AsyncStorage.setItem(cle, JSON.stringify(valeur)).catch(() => {});
  }
}
