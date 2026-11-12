// Illustrations des thèmes de newsletter, livrées avec l'appli (assets/newsletters). Rangées dans le stockage à
// l'enregistrement : c'est l'adresse publique que les e-mails affichent.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export const ILLUSTRATIONS: Record<string, number> = {
  conseil: require('../../../assets/newsletters/conseil.jpg'),
  recette: require('../../../assets/newsletters/recette.jpg'),
  saison: require('../../../assets/newsletters/saison.jpg'),
  recup: require('../../../assets/newsletters/recup.jpg'),
  defi: require('../../../assets/newsletters/defi.jpg'),
  nouveautes: require('../../../assets/newsletters/nouveautes.jpg'),
  manque: require('../../../assets/newsletters/manque.jpg'),
  reprendre: require('../../../assets/newsletters/reprendre.jpg'),
  temoignage: require('../../../assets/newsletters/temoignage.jpg'),
  offre: require('../../../assets/newsletters/offre.jpg'),
  objectif: require('../../../assets/newsletters/objectif.jpg'),
  mythes: require('../../../assets/newsletters/mythes.jpg'),
};
export const CLES_ILLUSTRATIONS = Object.keys(ILLUSTRATIONS);

/** Les octets JPEG d'une illustration livrée. */
export async function octetsIllustration(cle: string): Promise<ArrayBuffer> {
  const a = Asset.fromModule(ILLUSTRATIONS[cle] ?? ILLUSTRATIONS.conseil);
  await a.downloadAsync();
  const uri = a.localUri ?? a.uri;
  if (Platform.OS === 'web' || /^https?:/.test(uri)) return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}
