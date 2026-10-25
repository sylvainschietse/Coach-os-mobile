// Comme les liens `target="_blank"` de l'original : sur le web, WhatsApp ou une page externe s'ouvre dans un nouvel onglet
// au lieu de remplacer Coach OS (et ses saisies en cours). Ailleurs, le système ouvre l'application concernée.
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export async function ouvrirLien(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && /^https?:/i.test(url)) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  await Linking.openURL(url);
}
