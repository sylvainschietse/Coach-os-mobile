// Mémoire des écrans : la dernière version de chaque donnée chargée, pour l'afficher tout de suite quand on revient
// sur un écran (puis la mettre à jour en silence). Certaines données (la séance du jour) sont aussi gardées sur le
// téléphone, pour ouvrir la séance sans réseau. Tout est effacé à la déconnexion.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TAILLE_MAX_GARDEE } from '@/domain/reseau';

const PREFIXE = 'coachos.memoire.';
const memoire = new Map<string, unknown>();

export function lireMemoire<T>(cle: string): T | undefined {
  return memoire.get(cle) as T | undefined;
}

export function ecrireMemoire(cle: string, valeur: unknown, surLeTelephone = false) {
  memoire.set(cle, valeur);
  if (!surLeTelephone) return;
  try {
    const texte = JSON.stringify(valeur);
    if (texte.length <= TAILLE_MAX_GARDEE) AsyncStorage.setItem(PREFIXE + cle, texte).catch(() => {});
  } catch {
    // Donnée non sérialisable : elle reste seulement en mémoire.
  }
}

export async function lireTelephone<T>(cle: string): Promise<T | undefined> {
  try {
    const texte = await AsyncStorage.getItem(PREFIXE + cle);
    return texte ? (JSON.parse(texte) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** À la déconnexion ou au changement de compte : rien d'un compte ne doit s'afficher dans un autre. */
export async function viderMemoire() {
  memoire.clear();
  try {
    const cles = await AsyncStorage.getAllKeys();
    const nos = cles.filter((c) => c.startsWith(PREFIXE));
    if (nos.length) await AsyncStorage.multiRemove(nos);
  } catch {
    // Rien à faire : au pire, la donnée gardée sera remplacée au prochain chargement.
  }
}

// « Réessayer » sur un écran relance tous les chargements en échec ou encore en attente.
const abonnes = new Set<() => void>();
export function ecouterReessai(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
export function toutReessayer() {
  abonnes.forEach((fn) => fn());
}
