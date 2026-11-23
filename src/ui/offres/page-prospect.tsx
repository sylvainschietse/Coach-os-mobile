// Habillage des pages vues par les prospects (offre partagée, questionnaire d'accueil) : la marque CoachGo, le fond
// sombre à lueur rouge des séances, et les lignes « ce que tu reçois ». Audit design, point 1.
import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Check, type LucideIcon } from '@/ui/icones';

import { Logo } from '../coque';
import { couleurs, nuit, polices } from '../theme';

/** Fond sombre avec la lueur rouge du coin haut gauche (web) ; uni sur téléphone. */
export const SCENE_PROSPECT = {
  backgroundColor: couleurs.noir,
  backgroundImage:
    'radial-gradient(circle at 0% 0%, rgba(224, 38, 44, 0.45) 0%, rgba(224, 38, 44, 0) 65%), radial-gradient(circle at 100% 0%, rgba(224, 38, 44, 0.18) 0%, rgba(224, 38, 44, 0) 55%)',
} as ViewStyle;

/** Textes sur le fond sombre (contraste AA vérifié sur #111216). */
export const SUR_SCENE = { texte: couleurs.blanc, doux: '#C9CBD1', discret: '#A3A7B0', kicker: nuit.rougeDoux };

export function Marque() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Logo />
      <Text accessibilityRole="header" style={{ fontFamily: polices.titre, fontSize: 24, letterSpacing: 0.8, color: couleurs.blanc }}>
        COACH<Text style={{ color: '#FF4B51' }}>GO</Text>
      </Text>
    </View>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: polices.texteGras, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: SUR_SCENE.kicker }}>{children}</Text>;
}

/** Une ligne « ce que tu reçois » : carte blanche, icône dans un carré rouge pâle. */
export function LigneAvantage({ libelle, icone: Icone = Check, style }: { libelle: string; icone?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 14, padding: 14 },
        style,
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: couleurs.rougeClair, alignItems: 'center', justifyContent: 'center' }}>
        <Icone size={20} color={couleurs.rouge} />
      </View>
      <Text style={{ flex: 1, fontFamily: polices.texteGras, fontSize: 16, lineHeight: 22, color: couleurs.texte }}>{libelle}</Text>
    </View>
  );
}
