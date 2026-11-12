// Aperçu d'une page A4 HTML dans l'appli (téléphone) : vue web réduite à la largeur disponible.
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export function ApercuHtml({ html, largeur, hauteur }: { html: string; largeur: number; hauteur: number }) {
  return (
    <View style={{ width: largeur, height: hauteur, overflow: 'hidden', borderRadius: 8 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        style={{ width: largeur, height: hauteur, backgroundColor: 'transparent' }}
        // Le zoom de la page est déjà réglé dans le HTML : pas de zoom du téléphone par-dessus.
        scalesPageToFit={false}
      />
    </View>
  );
}
