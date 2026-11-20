// Version web de la vidéo intégrée : un iframe YouTube à la place de la vue web native.
import { createElement, useState } from 'react';
import { View, type ViewStyle } from 'react-native';

import { idYoutube, miniatureYoutube } from '@/domain/video';

import { Miniature } from './video-miniature';
import { VignetteVideo } from './vignette-video';

const lienLecteur = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;

export function VideoIntegree({ url, nom, style }: { url: string; nom: string; style?: ViewStyle }) {
  const [lecture, setLecture] = useState(false);
  const id = idYoutube(url);
  if (!id) return <VignetteVideo url={url} nom={nom} largeur={120} />;
  const cadre: ViewStyle = { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: '#000', ...style };
  if (lecture)
    return (
      <View style={cadre}>
        {createElement('iframe', {
          src: lienLecteur(id),
          title: nom,
          allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
          allowFullScreen: true,
          style: { border: 0, width: '100%', height: '100%' },
        })}
      </View>
    );
  // Miniature un peu plus basse que le lecteur : la page du bloc garde ses séries visibles.
  return <Miniature image={miniatureYoutube(url)!} nom={nom} style={{ ...cadre, aspectRatio: 2.2 }} onPress={() => setLecture(true)} />;
}
