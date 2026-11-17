import { AlertTriangle, CheckCircle2, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { effacerAnnonce, useAnnonce } from '@/lib/enregistrement';

import { arrondi, couleurs, espace, polices } from './theme';

/**
 * Bandeau « Enregistré » (vert) ou « Ça n'a pas marché » (rouge), en haut de l'écran. Monté à la racine de l'appli
 * et dans chaque fenêtre (Modale) : c'est celui du dessus qui s'affiche.
 */
export function Annonce() {
  const annonce = useAnnonce();
  const insets = useSafeAreaInsets();
  if (!annonce) return null;
  const ok = annonce.type === 'ok';
  const Icone = ok ? CheckCircle2 : AlertTriangle;
  return (
    <View pointerEvents="box-none" style={[styles.zone, { top: insets.top + espace(3) }]}>
      <View
        key={annonce.id}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.bandeau, ok ? styles.ok : styles.erreur]}
      >
        <Icone size={20} color="#FFFFFF" strokeWidth={2.4} />
        <Text style={styles.texte}>{annonce.texte}</Text>
        {!ok && (
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer le message" hitSlop={10} onPress={effacerAnnonce}>
            <X size={18} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { position: 'absolute', left: espace(4), right: espace(4), alignItems: 'center', zIndex: 1000, elevation: 1000 },
  bandeau: {
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(2),
    paddingVertical: espace(3),
    paddingHorizontal: espace(4),
    borderRadius: arrondi.global,
    boxShadow: '0 8px 24px rgba(17, 18, 22, 0.22)',
  },
  ok: { backgroundColor: couleurs.vert },
  erreur: { backgroundColor: couleurs.rougeTexte },
  texte: { flexShrink: 1, color: '#FFFFFF', fontFamily: polices.texteMoyen, fontSize: 15, lineHeight: 20 },
});
