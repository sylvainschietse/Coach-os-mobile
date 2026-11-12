// Aperçu d'une page A4 HTML sur le web : cadre réduit à la largeur disponible.
import { createElement } from 'react';
import { View } from 'react-native';

export function ApercuHtml({ html, largeur, hauteur }: { html: string; largeur: number; hauteur: number }) {
  return (
    <View style={{ width: largeur, height: hauteur, overflow: 'hidden', borderRadius: 8 }}>
      {createElement('iframe', { srcDoc: html, title: 'Aperçu de la brochure', style: { width: largeur, height: hauteur, border: 0, display: 'block' } })}
    </View>
  );
}
