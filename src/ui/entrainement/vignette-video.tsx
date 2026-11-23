// Vignette de la vidéo de démonstration d'un exercice : miniature YouTube avec un bouton lecture, ouvre la vidéo.
// Sans miniature possible (lien d'un autre site, image en échec), on retombe sur un simple lien « Vidéo ».
import { PlayCircle } from '@/ui/icones';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { miniatureYoutube } from '@/domain/video';

import { couleurs, polices } from '../theme';
import { ouvrirLien } from '@/lib/ouvrir-lien';

export function VignetteVideo({ url, nom, largeur = 128 }: { url: string; nom: string; largeur?: number }) {
  const [echec, setEchec] = useState(false);
  const image = miniatureYoutube(url);
  const ouvrir = () => ouvrirLien(url).catch(() => undefined);

  if (!image || echec) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Vidéo : ${nom}`}
        onPress={ouvrir}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}
      >
        <PlayCircle size={16} color={couleurs.rouge} />
        <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.rouge }}>Vidéo</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Voir la démonstration : ${nom}`}
      onPress={ouvrir}
      style={({ pressed }) => ({
        width: largeur,
        aspectRatio: 16 / 9,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: couleurs.bordure,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Image source={{ uri: image }} onError={() => setEchec(true)} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <PlayCircle size={22} color={couleurs.blanc} />
        </View>
      </View>
    </Pressable>
  );
}
