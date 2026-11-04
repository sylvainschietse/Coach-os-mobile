// PDF A4 depuis une page HTML : fenêtre d'impression sur le web (« Enregistrer au format PDF »),
// fichier PDF à partager sur téléphone (WhatsApp, mail, Fichiers).
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function ouvrirPdf(html: string, titre: string) {
  if (Platform.OS === 'web') {
    const cadre = document.createElement('iframe');
    Object.assign(cadre.style, { position: 'fixed', width: '0', height: '0', border: '0' });
    cadre.srcdoc = html;
    cadre.onload = () => {
      cadre.contentWindow?.print();
      setTimeout(() => cadre.remove(), 60000);
    };
    document.body.appendChild(cadre);
    return;
  }
  // A4 en points (72 par pouce).
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: titre, UTI: 'com.adobe.pdf' });
}
