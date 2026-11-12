// Onglet Activité de l'espace coach : le bilan du mois, les paiements et les documents réunis sur une seule page,
// dans cet ordre (celui de l'ancien menu de l'Accueil), sans sous-onglets.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { couleurs, espace, polices } from '../theme';

export function ActiviteCoach({ bilan, paiements, documents }: { bilan: ReactNode; paiements: ReactNode; documents: ReactNode }) {
  return (
    <View style={{ gap: espace(8) }}>
      <Section titre="Bilan du mois">{bilan}</Section>
      <Section titre="Paiements">{paiements}</Section>
      <Section titre="Documents">{documents}</Section>
    </View>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <View style={{ gap: espace(3) }}>
      <Text accessibilityRole="header" style={{ fontFamily: polices.texteGras, fontSize: 20, color: couleurs.texte }}>
        {titre}
      </Text>
      {children}
    </View>
  );
}
