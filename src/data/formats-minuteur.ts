// Formats de minuteur enregistrés par le client. Avec Supabase, ils vivent sur son compte (retrouvés sur un autre
// téléphone) ; une copie reste sur l'appareil pour les afficher tout de suite et hors connexion. En démo, sur l'appareil.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { lireFormat, lireSon, type FormatEnregistre, type Son } from '@/domain/formats-minuteur';

import { supabase } from './supabase';

const cle = (clientId: string) => `coachos.formats-minuteur:${clientId}`;
const tri = (l: FormatEnregistre[]) => [...l].sort((a, b) => b.majLe.localeCompare(a.majLe));

export async function formatsLocaux(clientId: string): Promise<FormatEnregistre[]> {
  try {
    const brut = await AsyncStorage.getItem(cle(clientId));
    const liste = brut ? (JSON.parse(brut) as unknown[]) : [];
    return tri(liste.map(lireFormat).filter((f): f is FormatEnregistre => !!f));
  } catch {
    return [];
  }
}

const garder = (clientId: string, l: FormatEnregistre[]) => AsyncStorage.setItem(cle(clientId), JSON.stringify(l)).catch(() => {});

/** Les formats du compte ; la copie de l'appareil si le réseau ne répond pas. */
export async function listerFormats(clientId: string): Promise<FormatEnregistre[]> {
  if (!supabase) return formatsLocaux(clientId);
  const { data, error } = await supabase.from('formats_minuteur').select('id, nom, reglage, son, maj_le').order('maj_le', { ascending: false }).limit(50);
  if (error) return formatsLocaux(clientId);
  const liste = tri((data ?? []).map((l) => lireFormat({ ...l, majLe: l.maj_le })).filter((f): f is FormatEnregistre => !!f));
  await garder(clientId, liste);
  return liste;
}

/** Ajoute ou met à jour (même id) ; renvoie la liste à jour. */
export async function enregistrerFormat(clientId: string, f: FormatEnregistre): Promise<FormatEnregistre[]> {
  const propre = lireFormat(f);
  if (!propre) throw new Error('Donne un nom à ton format.');
  const maintenant = new Date().toISOString();
  if (supabase) {
    const { error } = await supabase
      .from('formats_minuteur')
      .upsert({ id: propre.id, client_id: clientId, nom: propre.nom, reglage: propre.reglage, son: propre.son, maj_le: maintenant });
    if (error) throw new Error(error.message.includes('50 formats') ? error.message : 'Le format n’a pas pu être enregistré. Vérifie ta connexion.');
  }
  const liste = tri([{ ...propre, majLe: maintenant }, ...(await formatsLocaux(clientId)).filter((x) => x.id !== propre.id)]);
  await garder(clientId, liste);
  return liste;
}

export async function supprimerFormat(clientId: string, id: string): Promise<FormatEnregistre[]> {
  if (supabase) {
    const { error } = await supabase.from('formats_minuteur').delete().eq('id', id);
    if (error) throw new Error('Le format n’a pas pu être supprimé. Vérifie ta connexion.');
  }
  const liste = (await formatsLocaux(clientId)).filter((x) => x.id !== id);
  await garder(clientId, liste);
  return liste;
}

const CLE_SON = 'coachos.minuteur.son';

/** Le dernier son réglé sur ce téléphone : repris pour un nouveau minuteur et pour le chrono d'une séance. */
export async function lireSonPrefere(): Promise<Son> {
  try {
    return lireSon(JSON.parse((await AsyncStorage.getItem(CLE_SON)) ?? '{}'));
  } catch {
    return lireSon({});
  }
}

export const garderSonPrefere = (son: Son) => AsyncStorage.setItem(CLE_SON, JSON.stringify(son)).catch(() => {});
