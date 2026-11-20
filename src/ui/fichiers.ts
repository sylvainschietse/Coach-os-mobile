// Choisir un fichier sur l'appareil et ouvrir un fichier stocké, sur le web comme sur le téléphone.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Fichier } from '@/data/documents';
import { FORMATS } from '@/domain/documents';

/** null si la personne a renoncé. */
export async function choisirFichier(): Promise<Fichier | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: [...FORMATS], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const type = a.mimeType || a.file?.type || '';
  if (Platform.OS === 'web' && a.file) return { nom: a.name, type, taille: a.file.size, donnees: a.file };
  const donnees = await new File(a.uri).arrayBuffer();
  return { nom: a.name, type, taille: a.size ?? donnees.byteLength, donnees };
}

/**
 * Ouvre le fichier dans un nouvel onglet (web) ou le navigateur / la visionneuse du téléphone.
 * Sur le web l'onglet s'ouvre tout de suite, sinon le navigateur le bloquerait après l'attente du lien.
 */
export async function ouvrirFichier(lien: () => Promise<string>, nom: string) {
  if (Platform.OS === 'web') {
    const onglet = window.open('', '_blank');
    try {
      const url = await lien();
      const cible = url.startsWith('data:') ? URL.createObjectURL(await (await fetch(url)).blob()) : url;
      if (onglet) onglet.location.href = cible;
      else window.location.assign(cible);
    } catch (e) {
      onglet?.close();
      throw e;
    }
    return;
  }
  const url = await lien();
  if (!url.startsWith('data:')) return Linking.openURL(url);
  // Démo sur téléphone : le fichier est recopié dans le cache puis montré par le système.
  const f = new File(Paths.cache, nom);
  if (f.exists) f.delete();
  f.create();
  f.write(url.slice(url.indexOf(',') + 1), { encoding: 'base64' });
  await Sharing.shareAsync(f.uri);
}

/** Copie locale du fichier stocké, pour la joindre à un e-mail (téléphone seulement). */
export async function copieLocale(lien: string, nom: string): Promise<string> {
  const f = new File(Paths.cache, nom);
  if (f.exists) f.delete();
  if (lien.startsWith('data:')) {
    f.create();
    f.write(lien.slice(lien.indexOf(',') + 1), { encoding: 'base64' });
    return f.uri;
  }
  return (await File.downloadFileAsync(lien, f)).uri;
}
