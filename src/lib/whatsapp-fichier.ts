// Envoyer un fichier par WhatsApp à un numéro précis : la conversation s'ouvre sur ce numéro, le fichier joint et le
// message déjà écrits (module natif « whatsapp-fichier », Android). Ailleurs (web, iPhone, ancienne version de
// l'appli), on rend false : l'appelant ouvre alors WhatsApp avec le message et un lien vers le fichier.
import { File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type Natif = { installe(): boolean; envoyer(fichier: string, telephone: string, message: string, type: string): Promise<void> };

const natif = Platform.OS === 'android' ? requireOptionalNativeModule<Natif>('WhatsappFichier') : null;

/** Vrai si l'envoi avec fichier joint est possible sur ce téléphone. */
export function whatsAppAvecFichier(): boolean {
  try {
    return !!natif?.installe();
  } catch {
    return false;
  }
}

/**
 * Copie le fichier sous un nom lisible (c'est le nom que voit le client) dans le cache de l'appli, puis ouvre WhatsApp.
 * `telephone` : chiffres au format international, sans « + » (33612345678).
 */
export async function envoyerFichierWhatsApp(source: string, nom: string, telephone: string, message: string, type = 'application/pdf'): Promise<boolean> {
  if (!natif || !whatsAppAvecFichier()) return false;
  const dest = new File(Paths.cache, nom);
  if (!dest.exists) new File(source).copy(dest);
  await natif.envoyer(dest.uri, telephone, message, type);
  return true;
}
