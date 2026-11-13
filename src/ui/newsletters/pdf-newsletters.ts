// Les PDF magazine de la bibliothèque, livrés avec l'appli : les regarder (aperçu du téléphone, nouvel onglet sur le
// web) et lire leurs octets pour les ranger dans les documents du coach.
import * as Print from 'expo-print';
import { Platform } from 'react-native';

import { octetsLivres, uriLivree } from './illustrations';
import { PDF_ARTICLES } from './pdf-articles';

export const aUnPdf = (article?: string): article is string => !!article && Object.prototype.hasOwnProperty.call(PDF_ARTICLES, article);

/** Le fichier du PDF sur le téléphone (une adresse sur le web). */
export const uriPdf = (article: string) => uriLivree(PDF_ARTICLES[article], 'pdf');

export const octetsPdf = (article: string) => octetsLivres(PDF_ARTICLES[article], 'pdf');

/** Ouvre le PDF pour le lire : celui livré avec l'appli, ou à défaut celui rangé en ligne (lien signé). */
export async function voirPdfArticle(article?: string, lien?: string) {
  const uri = aUnPdf(article) ? await uriLivree(PDF_ARTICLES[article], 'pdf') : lien;
  if (!uri) throw new Error('Ce PDF est introuvable.');
  if (Platform.OS === 'web') {
    window.open(uri, '_blank', 'noopener');
    return;
  }
  // L'aperçu du téléphone montre le PDF page par page ; on peut l'enregistrer ou l'imprimer de là.
  await Print.printAsync({ uri });
}
