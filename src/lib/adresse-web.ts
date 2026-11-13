import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Adresse publique d'une page de l'app, à envoyer à quelqu'un (questionnaire, accès client).
 * Sur le web, c'est l'adresse du site ouvert. Sur téléphone, Linking donnerait « coachos://… », qui ne s'ouvre pas
 * chez le destinataire : on part du site web de l'app (EXPO_PUBLIC_ADRESSE_WEB).
 */
export function adresseWeb(chemin: string) {
  const base = process.env.EXPO_PUBLIC_ADRESSE_WEB?.replace(/\/+$/, '');
  if (Platform.OS === 'web' || !base) return Linking.createURL(chemin);
  return base + '/' + chemin.replace(/^\/+/, '');
}
