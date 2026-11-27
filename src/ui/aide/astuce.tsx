// Bulle d'astuce : la première fois, une bulle sombre pointe vers un bouton qu'on ne voit pas toujours
// (« Photo de mon assiette », « Dicter ma recette »…). « Voir le tuto » ouvre la vidéo qui va avec,
// « J'ai compris » la ferme pour de bon sur ce téléphone.
import { router } from 'expo-router';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAstuce } from '@/lib/astuces';
import { ASTUCES, type CleAstuce } from '@/domain/tutos';

import { Lightbulb, PlayCircle } from '../icones';
import { couleurs, nuit, polices } from '../theme';

export function BulleAstuce({
  cle,
  active = true,
  apres,
  pointe = 'haut',
  decalagePointe = 32,
  style,
}: {
  cle: CleAstuce;
  /** Bulle du même écran à fermer d'abord : une seule à la fois. */
  apres?: CleAstuce;
  /** Faux : jamais affichée (aperçu du coach, démo d'un écran vide…). */
  active?: boolean;
  /** Côté de la petite flèche : vers le bouton du dessus (haut) ou du dessous (bas). */
  pointe?: 'haut' | 'bas' | 'aucune';
  decalagePointe?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { visible, fermer } = useAstuce(cle, active, apres);
  if (!visible) return null;
  const astuce = ASTUCES[cle];
  const fleche = (sens: 'haut' | 'bas') => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: decalagePointe,
        [sens === 'haut' ? 'top' : 'bottom']: -8,
        width: 0,
        height: 0,
        borderLeftWidth: 8,
        borderRightWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        [sens === 'haut' ? 'borderBottomWidth' : 'borderTopWidth']: 8,
        [sens === 'haut' ? 'borderBottomColor' : 'borderTopColor']: couleurs.texte,
      }}
    />
  );
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Astuce : ${astuce.texte}`}
      style={[{ backgroundColor: couleurs.texte, borderRadius: 14, padding: 14, gap: 10, marginTop: pointe === 'haut' ? 8 : 0, marginBottom: pointe === 'bas' ? 8 : 0 }, style]}
    >
      {pointe !== 'aucune' && fleche(pointe)}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lightbulb size={14} color="#7EE2A6" />
        <Text style={{ fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 2, color: '#7EE2A6' }}>ASTUCE</Text>
      </View>
      <Text style={{ fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: nuit.texte }}>{astuce.texte}</Text>
      <View style={{ flexDirection: 'row', justifyContent: astuce.tuto ? 'space-between' : 'flex-end', alignItems: 'center', gap: 12 }}>
        {astuce.tuto && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push({ pathname: '/client/tuto', params: { id: astuce.tuto } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}
          >
            <PlayCircle size={16} color="#7EE2A6" />
            <Text style={{ fontFamily: polices.texteGras, fontSize: 14, color: '#7EE2A6' }}>Voir le tuto</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={fermer} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 14, color: nuit.texte }}>J’ai compris</Text>
        </Pressable>
      </View>
    </View>
  );
}
