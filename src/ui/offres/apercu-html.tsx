// Aperçu d'une page A4 HTML dans l'appli (téléphone) : vue web réduite à la largeur disponible.
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

/** `defile` : la page défile dans son cadre (article long), au lieu d'être montrée en entier. */
export function ApercuHtml({ html, largeur, hauteur, defile }: { html: string; largeur: number; hauteur: number; defile?: boolean }) {
  return (
    <View style={{ width: largeur, height: hauteur, overflow: 'hidden', borderRadius: 8 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={!!defile}
        nestedScrollEnabled={!!defile}
        style={{ width: largeur, height: hauteur, backgroundColor: 'transparent' }}
        // Le zoom de la page est déjà réglé dans le HTML : pas de zoom du téléphone par-dessus.
        scalesPageToFit={false}
      />
    </View>
  );
}
