// Vidéo de démonstration lue dans la séance, sans quitter l'appli : la miniature YouTube, puis le lecteur à sa place
// au premier appui. Un lien qui n'est pas YouTube s'ouvre comme avant (VignetteVideo).
import { useState } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { idYoutube, miniatureYoutube } from '@/domain/video';

import { Miniature } from './video-miniature';
import { VignetteVideo } from './vignette-video';

/** Lecteur intégré : le Referer évite le refus de YouTube (« erreur 153 ») dans une vue web d'application. */
const lienLecteur = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
const REFERER = 'https://coachgo.app';

export function VideoIntegree({ url, nom, style }: { url: string; nom: string; style?: ViewStyle }) {
  const [lecture, setLecture] = useState(false);
  const id = idYoutube(url);
  if (!id) return <VignetteVideo url={url} nom={nom} largeur={120} />;
  const cadre: ViewStyle = { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: '#000', ...style };
  if (lecture)
    return (
      <View style={cadre}>
        <WebView
          source={{ uri: lienLecteur(id), headers: { Referer: REFERER } }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          style={{ flex: 1, backgroundColor: '#000' }}
          {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
        />
      </View>
    );
  // Miniature un peu plus basse que le lecteur : la page du bloc garde ses séries visibles.
  return <Miniature image={miniatureYoutube(url)!} nom={nom} style={{ ...cadre, aspectRatio: 2.2 }} onPress={() => setLecture(true)} />;
}
