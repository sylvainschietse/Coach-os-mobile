// Illustrations des newsletters, livrées avec l'appli (assets/newsletters) : une photo par article de la
// bibliothèque (photo-NN) et les dessins des idées courtes (mag-*). Rangées dans le stockage à
// l'enregistrement : c'est l'adresse publique que les e-mails affichent.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { FICHIERS_ILLUSTRATIONS, fichierIllustration } from '@/domain/illustrations-newsletters';

import { PHOTOS_ARTICLES } from './photos-articles';

const FICHIERS: Record<string, number> = {
  ...PHOTOS_ARTICLES,
  'mag-cd8ea2': require('../../../assets/newsletters/mag-cd8ea2.jpg'),
  'mag-979c40': require('../../../assets/newsletters/mag-979c40.jpg'),
  'mag-2996d9': require('../../../assets/newsletters/mag-2996d9.jpg'),
  'mag-99cdc3': require('../../../assets/newsletters/mag-99cdc3.jpg'),
  'mag-8e90c1': require('../../../assets/newsletters/mag-8e90c1.jpg'),
  'mag-2f6d1f': require('../../../assets/newsletters/mag-2f6d1f.jpg'),
  'mag-78a392': require('../../../assets/newsletters/mag-78a392.jpg'),
  'mag-597f4f': require('../../../assets/newsletters/mag-597f4f.jpg'),
  'mag-a9f8cf': require('../../../assets/newsletters/mag-a9f8cf.jpg'),
  'mag-998acd': require('../../../assets/newsletters/mag-998acd.jpg'),
  'mag-0275dd': require('../../../assets/newsletters/mag-0275dd.jpg'),
  'mag-8d6273': require('../../../assets/newsletters/mag-8d6273.jpg'),
  'mag-1e9fd4': require('../../../assets/newsletters/mag-1e9fd4.jpg'),
  'mag-c184a1': require('../../../assets/newsletters/mag-c184a1.jpg'),
  'mag-5a6b51': require('../../../assets/newsletters/mag-5a6b51.jpg'),
  'mag-ec4271': require('../../../assets/newsletters/mag-ec4271.jpg'),
};

/** L'image d'une illustration, d'après son nom simple (« recette ») ou son fichier (« mag-979c40 »). */
export const imageIllustration = (cle: string): number => FICHIERS[fichierIllustration(cle)];
/** Au choix dans l'éditeur : les photos des articles, puis les dessins. */
export const CLES_ILLUSTRATIONS: string[] = [...Object.keys(PHOTOS_ARTICLES), ...FICHIERS_ILLUSTRATIONS];

/** Les octets JPEG d'une illustration livrée. */
export async function octetsIllustration(cle: string): Promise<ArrayBuffer> {
  const a = Asset.fromModule(FICHIERS[fichierIllustration(cle)]);
  await a.downloadAsync();
  const uri = a.localUri ?? a.uri;
  if (Platform.OS === 'web' || /^https?:/.test(uri)) return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}
