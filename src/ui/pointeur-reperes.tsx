// Pointer des repères anatomiques sur une photo ou une image de vidéo : un repère à la fois, dans l'ordre,
// avec une grille pour vérifier que le téléphone était droit. Les points sont dans le repère de la zone affichée :
// seuls des angles en sont tirés, ils ne dépendent pas de la taille d'affichage.
import { useEvent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import type { Repere } from '@/domain/bilan-postural';
import type { Point } from '@/domain/mesure-angle';

import { couleurs, espace, polices } from './theme';

export async function obtenirMedia(type: 'photo' | 'video', source: 'camera' | 'galerie'): Promise<string | null> {
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new Error('Autorise l’appareil photo dans les réglages du téléphone, ou choisis un fichier.');
  }
  const options: ImagePicker.ImagePickerOptions =
    type === 'photo' ? { mediaTypes: ['images'], quality: 0.9 } : { mediaTypes: ['videos'], quality: 1, videoMaxDuration: 60 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return r.canceled || !r.assets?.length ? null : r.assets[0].uri;
}

export function PointeurReperes({
  media,
  uri,
  reperes,
  points,
  onChange,
}: {
  media: 'photo' | 'video';
  uri: string;
  reperes: Repere[];
  points: Record<string, Point>;
  onChange: (p: Record<string, Point>) => void;
}) {
  const { width, height } = useWindowDimensions();
  const largeur = Math.min(width - 64, 560);
  const hauteur = Math.min(Math.round(largeur * 1.5), Math.round(height * 0.6));
  const premierManquant = reperes.findIndex((r) => !points[r.cle]);
  const [choisi, setChoisi] = useState<number | null>(null);
  const actif = choisi ?? (premierManquant === -1 ? null : premierManquant);
  const zone = useRef<ComponentRef<typeof View>>(null);

  const poser = (p: Point) => {
    if (actif === null) return;
    onChange({ ...points, [reperes[actif].cle]: p });
    setChoisi(null);
  };
  const toucher = (e: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    // Sur le web, locationX peut se rapporter au dessin plutôt qu'à la zone : on repart de la position dans la page.
    if (Platform.OS === 'web' && zone.current) zone.current.measureInWindow((x, y) => poser({ x: pageX - x, y: pageY - y }));
    else poser({ x: locationX, y: locationY });
  };

  const dessin = (
    <Pressable ref={zone} accessibilityLabel="Toucher pour placer le repère" onPress={toucher} style={StyleSheet.absoluteFill}>
      <Svg width={largeur} height={hauteur} pointerEvents="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={`v${f}`} x1={largeur * f} y1={0} x2={largeur * f} y2={hauteur} stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="4 6" />
        ))}
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={`h${f}`} x1={0} y1={hauteur * f} x2={largeur} y2={hauteur * f} stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="4 6" />
        ))}
        {reperes.map((r, i) => {
          const p = points[r.cle];
          if (!p) return null;
          return [
            <Circle key={`c${r.cle}`} cx={p.x} cy={p.y} r={7} fill={i === actif ? '#FFD400' : '#C3181E'} stroke="#FFFFFF" strokeWidth={2} />,
            <SvgText key={`t${r.cle}`} x={p.x + 10} y={p.y - 8} fill="#FFFFFF" stroke="#000000" strokeWidth={0.6} fontSize={13} fontWeight="bold">
              {String(i + 1)}
            </SvgText>,
          ];
        })}
      </Svg>
    </Pressable>
  );

  return (
    <View style={{ gap: espace(3) }}>
      <Text style={styles.etape}>
        {actif !== null ? `Touche l’image : ${actif + 1}. ${reperes[actif].libelle}` : 'Tous les repères sont placés. Touche un repère de la liste pour le déplacer.'}
      </Text>
      {media === 'photo' ? (
        <View style={[styles.cadre, { width: largeur, height: hauteur }]}>
          <Image source={{ uri }} resizeMode="contain" style={{ width: largeur, height: hauteur }} />
          {dessin}
        </View>
      ) : (
        <VideoPointee uri={uri} largeur={largeur} hauteur={hauteur}>
          {dessin}
        </VideoPointee>
      )}
      <View style={styles.liste}>
        {reperes.map((r, i) => (
          <Pressable
            key={r.cle}
            accessibilityRole="button"
            onPress={() => setChoisi(i)}
            style={[styles.puce, i === actif && styles.puceActive, !!points[r.cle] && i !== actif && styles.pucePlacee]}
          >
            <Text style={[styles.puceTexte, i === actif && { color: couleurs.texte }]}>{`${points[r.cle] ? '✓ ' : ''}${i + 1}. ${r.libelle}`}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function VideoPointee({ uri, largeur, hauteur, children }: { uri: string; largeur: number; hauteur: number; children: ReactNode }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
  });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [largeurBarre, setLargeurBarre] = useState(1);
  const duree = player.duration || 0;
  return (
    <View style={{ gap: espace(2) }}>
      <View style={[styles.cadre, { width: largeur, height: hauteur }]}>
        <VideoView player={player} nativeControls={false} contentFit="contain" style={{ width: largeur, height: hauteur }} />
        {children}
      </View>
      <Pressable
        accessibilityLabel="Position dans la vidéo"
        onLayout={(e) => setLargeurBarre(e.nativeEvent.layout.width || 1)}
        onPress={(e) => allerA(player, duree, (e.nativeEvent.locationX / largeurBarre) * duree)}
        style={styles.barre}
      >
        <View style={[styles.barreRemplie, { width: `${duree ? Math.min(100, (currentTime / duree) * 100) : 0}%` }]} />
      </Pressable>
      <View style={styles.commandes}>
        <Commande libelle="−1 s" onPress={() => allerA(player, duree, player.currentTime - 1)} />
        <Commande libelle="◀ image" onPress={() => allerA(player, duree, player.currentTime - 1 / 30)} />
        <Commande libelle={isPlaying ? 'Pause' : 'Lecture'} onPress={() => (isPlaying ? player.pause() : player.play())} />
        <Commande libelle="image ▶" onPress={() => allerA(player, duree, player.currentTime + 1 / 30)} />
        <Commande libelle="+1 s" onPress={() => allerA(player, duree, player.currentTime + 1)} />
      </View>
    </View>
  );
}

function allerA(player: VideoPlayer, duree: number, t: number) {
  player.pause();
  player.seekBy(Math.max(0, Math.min(duree || Infinity, t)) - player.currentTime);
}

function Commande({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.commande}>
      <Text style={styles.commandeTexte}>{libelle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cadre: { alignSelf: 'center', backgroundColor: couleurs.noir, borderRadius: 10, overflow: 'hidden' },
  etape: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte },
  liste: { gap: espace(1) },
  puce: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: couleurs.bordure },
  puceActive: { borderColor: '#E0B800', backgroundColor: '#FFF6C7' },
  pucePlacee: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vertClair },
  puceTexte: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texte },
  barre: { height: 24, justifyContent: 'center', backgroundColor: couleurs.discret, borderRadius: 12, overflow: 'hidden' },
  barreRemplie: { height: 24, backgroundColor: couleurs.rouge, opacity: 0.6 },
  commandes: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2), justifyContent: 'center' },
  commande: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte },
  commandeTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte },
});
