// PDF A4 depuis une page HTML.
// · voirPdf : l'ouvrir pour le regarder (aperçu du téléphone, ou nouvel onglet sur le web).
// · ouvrirPdf : l'envoyer (partage du téléphone : WhatsApp, mail, Fichiers ; fenêtre « Enregistrer au format PDF » sur le web).
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function voirPdf(html: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  // Aperçu du téléphone : on voit le PDF page par page, et on peut l'enregistrer ou l'imprimer de là.
  await Print.printAsync({ html, width: 595, height: 842 });
}

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
