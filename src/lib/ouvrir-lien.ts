// Comme les liens `target="_blank"` de l'original : sur le web, WhatsApp ou une page externe s'ouvre dans un nouvel onglet
// au lieu de remplacer CoachGo (et ses saisies en cours). Ailleurs, le système ouvre l'application concernée.
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { lienWhatsAppNatif, lireLienWhatsApp } from '@/domain/whatsapp';
import { ouvrirConversationWhatsApp } from '@/lib/whatsapp-fichier';

export async function ouvrirLien(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && /^https?:/i.test(url)) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  // Android : l'intention adressée à WhatsApp ouvre vraiment la conversation du numéro, message prérempli.
  const wa = lireLienWhatsApp(url);
  if (wa) {
    try {
      if (await ouvrirConversationWhatsApp(wa.telephone, wa.message)) return;
    } catch {
      // On retombe sur les liens ci-dessous.
    }
  }
  const natif = lienWhatsAppNatif(url);
  if (natif) {
    try {
      await Linking.openURL(natif);
      return;
    } catch {
      // WhatsApp absent du téléphone : le lien wa.me ouvre la page web de WhatsApp.
    }
  }
  await Linking.openURL(url);
}
