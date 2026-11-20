// Briques des écrans Nutrition repris de l'app d'origine : bloc de quatre valeurs (Numbers de RecipePlanner),
// carte, lien externe et choix de portions par huitièmes.
import * as Linking from 'expo-linking';
import { ExternalLink } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { round, type Nutrition } from '@/domain/nutrition/recettes';

import { ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

/** Numbers d'origine : kcal, P, G, L en quatre cases, l'objectif dessous quand il existe. */
export function Valeurs({ n, cible }: { n: Nutrition; cible?: Nutrition | null }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {(
        [
          ['kcal', 'kcal'],
          ['protein', 'P · g'],
          ['carbs', 'G · g'],
          ['fat', 'L · g'],
        ] as const
      ).map(([k, libelle]) => (
        <View key={k} style={{ flex: 1, minWidth: 0, borderRadius: 8, backgroundColor: 'rgba(237,239,242,0.6)', paddingHorizontal: 4, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte }}>{k === 'kcal' ? Math.round(n[k]) : round(n[k])}</Text>
          <Text style={{ fontFamily: polices.texte, fontSize: 10, color: couleurs.texteDoux }}>{libelle}</Text>
          {cible && <Text style={{ marginTop: 4, fontFamily: polices.texte, fontSize: 10, color: couleurs.texteDoux }}>/ {Math.round(cible[k])}</Text>}
        </View>
      ))}
    </View>
  );
}

export function Bloc({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ts.carte, { borderRadius: 16, padding: 16 }, style]}>{children}</View>;
}

/** Lien `target=_blank` d'origine, souligné. */
export function Lien({ url, children, icone, petit }: { url: string; children: string; icone?: boolean; petit?: boolean }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: petit ? 20 : 32 }}>
      {icone && <ExternalLink size={16} color={couleurs.rouge} />}
      <Text style={{ fontFamily: icone ? polices.texteMoyen : polices.texte, fontSize: petit ? 11 : icone ? 14 : 12, color: icone ? couleurs.rouge : couleurs.texte, textDecorationLine: 'underline' }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** Portions de 1/8 à 4, la valeur courante comprise (Array.from({length: 32}) d'origine). */
export const choixPortions = (courante: number) =>
  Array.from(new Set([courante, ...Array.from({ length: 32 }, (_, n) => (n + 1) / 8)]))
    .sort((a, b) => a - b)
    .map((n) => ({ cle: String(n), libelle: n.toLocaleString('fr-FR') }));

export const doux = { fontFamily: polices.texte, fontSize: 12, lineHeight: 17, color: couleurs.texteDoux } as const;
