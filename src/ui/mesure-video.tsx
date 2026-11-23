// « Mesurer en vidéo » : filmer (ou choisir une vidéo), s'arrêter sur la bonne image, toucher 2 ou 3 points ;
// l'angle calculé remplit la mesure. La vidéo reste sur le téléphone : seul l'angle est enregistré.
import { useEvent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { calculerAngle, POINTS_NECESSAIRES, type FaconDeMesurer, type Point } from '@/domain/mesure-angle';

import { Bouton } from './composants';
import { Modale } from './crm/dossier';
import { couleurs, espace, polices } from './theme';

async function obtenirVideo(source: 'camera' | 'galerie'): Promise<string | null> {
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new Error('Autorise l’appareil photo dans les réglages du téléphone, ou choisis une vidéo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], quality: 1, videoMaxDuration: 60 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return r.canceled || !r.assets?.length ? null : r.assets[0].uri;
}

/** Petit lien sous un champ en degrés. */
export function LienMesureVideo({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.lien} hitSlop={6}>
      <Text style={styles.lienTexte}>📹 Mesurer en vidéo</Text>
    </Pressable>
  );
}

export function MesureVideoModale({
  titre,
  facon,
  onValider,
  onFermer,
  avant,
}: {
  titre: string;
  facon: FaconDeMesurer;
  onValider: (angle: number) => void;
  onFermer: () => void;
  /** Contenu affiché au-dessus de la vidéo (choix de la mesure, nom). */
  avant?: React.ReactNode;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string>();
  const choisir = async (source: 'camera' | 'galerie') => {
    setErreur(undefined);
    try {
      const u = await obtenirVideo(source);
      if (u) setUri(u);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Vidéo impossible à ouvrir.');
    }
  };
  return (
    <Modale titre={titre} onFermer={onFermer}>
      <View style={{ gap: espace(3) }}>
        {avant}
        <Text style={styles.consigne}>{facon.filmer}</Text>
        {!uri ? (
          <View style={{ gap: espace(2) }}>
            <Bouton libelle="Filmer" onPress={() => choisir('camera')} />
            <Bouton variante="discret" libelle="Choisir une vidéo du téléphone" onPress={() => choisir('galerie')} />
            {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}
          </View>
        ) : (
          <Mesureur key={uri} uri={uri} facon={facon} onValider={onValider} onAutre={() => setUri(null)} />
        )}
      </View>
    </Modale>
  );
}

function Mesureur({ uri, facon, onValider, onAutre }: { uri: string; facon: FaconDeMesurer; onValider: (angle: number) => void; onAutre: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
  });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { width, height } = useWindowDimensions();
  const largeur = Math.min(width - 64, 520);
  const hauteur = Math.min(Math.round(largeur * 1.4), Math.round(height * 0.5));
  const [points, setPoints] = useState<Point[]>([]);
  const zone = useRef<ComponentRef<typeof View>>(null);
  const [largeurBarre, setLargeurBarre] = useState(1);
  const besoin = POINTS_NECESSAIRES[facon.mode];
  const angle = calculerAngle(facon.mode, points);
  const duree = player.duration || 0;

  const toucher = (e: GestureResponderEvent) => {
    if (isPlaying) player.pause();
    const ajouter = (p: Point) => setPoints((x) => (x.length >= besoin ? [p] : [...x, p]));
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    // Sur le web, locationX peut se rapporter au dessin plutôt qu'à la zone : on repart de la position dans la page.
    if (Platform.OS === 'web' && zone.current) zone.current.measureInWindow((x, y) => ajouter({ x: pageX - x, y: pageY - y }));
    else ajouter({ x: locationX, y: locationY });
  };
  // Image à image : seekBy, précis depuis que seekTolerance est à zéro.
  const allerA = (t: number) => player.seekBy(Math.max(0, Math.min(duree || Infinity, t)) - player.currentTime);
  const deplacer = (s: number) => {
    player.pause();
    allerA(player.currentTime + s);
  };
  const prochain = points.length < besoin ? facon.points[points.length] : undefined;

  return (
    <View style={{ gap: espace(3) }}>
      <View style={{ width: largeur, height: hauteur, alignSelf: 'center', backgroundColor: couleurs.noir, borderRadius: 10, overflow: 'hidden' }}>
        <VideoView player={player} nativeControls={false} contentFit="contain" style={{ width: largeur, height: hauteur }} />
        <Pressable ref={zone} accessibilityLabel="Toucher pour placer un point" onPress={toucher} style={StyleSheet.absoluteFill}>
          <Svg width={largeur} height={hauteur} pointerEvents="none">
            {points.length >= 2 && (
              <Line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#FFD400" strokeWidth={3} />
            )}
            {points.length === 3 && <Line x1={points[1].x} y1={points[1].y} x2={points[2].x} y2={points[2].y} stroke="#FFD400" strokeWidth={3} />}
            {facon.mode !== 'trois-points' && points.length >= 1 && (
              <Line
                x1={points[0].x - (facon.mode === 'horizontale' ? 60 : 0)}
                y1={points[0].y - (facon.mode === 'verticale' ? 60 : 0)}
                x2={points[0].x + (facon.mode === 'horizontale' ? 60 : 0)}
                y2={points[0].y + (facon.mode === 'verticale' ? 60 : 0)}
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}
            {points.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={9} fill="#C3181E" stroke="#FFFFFF" strokeWidth={2} />
            ))}
          </Svg>
        </Pressable>
        {angle !== undefined && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeTexte}>{`${angle}°`}</Text>
          </View>
        )}
      </View>

      <Pressable
        accessibilityLabel="Position dans la vidéo"
        onLayout={(e) => setLargeurBarre(e.nativeEvent.layout.width || 1)}
        onPress={(e) => {
          player.pause();
          allerA((e.nativeEvent.locationX / largeurBarre) * duree);
        }}
        style={styles.barre}
      >
        <View style={[styles.barreRemplie, { width: `${duree ? Math.min(100, (currentTime / duree) * 100) : 0}%` }]} />
      </Pressable>
      <View style={styles.commandes}>
        <Commande libelle="−1 s" onPress={() => deplacer(-1)} />
        <Commande libelle="◀ image" onPress={() => deplacer(-1 / 30)} />
        <Commande libelle={isPlaying ? 'Pause' : 'Lecture'} onPress={() => (isPlaying ? player.pause() : player.play())} />
        <Commande libelle="image ▶" onPress={() => deplacer(1 / 30)} />
        <Commande libelle="+1 s" onPress={() => deplacer(1)} />
      </View>

      <Text style={styles.etape}>
        {prochain
          ? `Arrête la vidéo sur la position maximale, puis touche : ${points.length + 1}. ${prochain}`
          : `Angle mesuré : ${angle}°. Touche l’image pour recommencer les points.`}
      </Text>
      <Text style={styles.ordre}>{facon.points.map((p, i) => `${i + 1}. ${p}`).join('   ')}</Text>

      <View style={{ gap: espace(2) }}>
        <Bouton libelle={angle !== undefined ? `Garder ${angle}°` : `Place les ${besoin} points`} onPress={() => angle !== undefined && onValider(angle)} desactive={angle === undefined} />
        <Bouton variante="discret" libelle="Autre vidéo" onPress={onAutre} />
      </View>
    </View>
  );
}

function Commande({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.commande}>
      <Text style={styles.commandeTexte}>{libelle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lien: { alignSelf: 'flex-start', paddingVertical: 4 },
  lienTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge },
  consigne: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  badge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTexte: { fontFamily: polices.texteGras, fontSize: 22, color: '#FFD400' },
  barre: { height: 24, justifyContent: 'center', backgroundColor: couleurs.discret, borderRadius: 12, overflow: 'hidden' },
  barreRemplie: { height: 24, backgroundColor: couleurs.rouge, opacity: 0.6 },
  commandes: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2), justifyContent: 'center' },
  commande: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte },
  commandeTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte },
  etape: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte },
  ordre: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
});
