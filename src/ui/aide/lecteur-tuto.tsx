// Un tuto ouvert : la vidéo verticale en plein écran sombre, son titre, son explication et « Tuto suivant ».
// La vidéo est lue depuis le compartiment « tutos » au moment où on l'ouvre : rien n'est embarqué dans l'appli.
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tutos } from '@/data/tutos';
import { TUTOS_PAR_DEFAUT, tutoSuivant, type Tuto } from '@/domain/tutos';
import { useCharger } from '@/lib/useCharger';

import { ChevronRight, X } from '../icones';
import { nuit, polices } from '../theme';

export function LecteurTuto({ id, onChoisir }: { id: string; onChoisir: (id: string) => void }) {
  const { donnee } = useCharger(() => tutos.lister(), 'tutos');
  const liste = donnee ?? TUTOS_PAR_DEFAUT;
  const { top, bottom } = useSafeAreaInsets();
  const index = liste.findIndex((t) => t.id === id);
  const tuto = index >= 0 ? liste[index] : null;
  const suivant = tuto ? tutoSuivant(liste, tuto.id) : null;
  const fermer = () => (router.canGoBack() ? router.back() : router.replace('/client/aide'));
  return (
    <View style={{ flex: 1, backgroundColor: nuit.fond }}>
      <View style={{ paddingTop: top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" onPress={fermer} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
          <X size={18} color={nuit.rougeDoux} />
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: nuit.rougeDoux }}>Fermer</Text>
        </Pressable>
        {tuto && <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: nuit.texteDiscret }}>{`${index + 1} / ${liste.length}`}</Text>}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom + 24, gap: 12, alignItems: 'center' }}>
        {tuto ? (
          <>
            {/* La clé recrée le lecteur au changement de tuto. */}
            <Video key={tuto.id} tuto={tuto} />
            <View style={{ alignSelf: 'stretch', maxWidth: 520, width: '100%', gap: 6 }}>
              <Text accessibilityRole="header" style={{ fontFamily: polices.titre, fontSize: 30, letterSpacing: 0.6, color: nuit.texte }}>
                {tuto.titre}
              </Text>
              {!!tuto.explication && <Text style={{ fontFamily: polices.texte, fontSize: 15, lineHeight: 21, color: nuit.texteTertiaire }}>{tuto.explication}</Text>}
              {suivant && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onChoisir(suivant.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, minHeight: 44, marginTop: 4 }}
                >
                  <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: nuit.rougeDoux }}>Tuto suivant : {suivant.titre}</Text>
                  <ChevronRight size={18} color={nuit.rougeDoux} />
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: polices.texte, fontSize: 15, color: nuit.texteTertiaire, marginTop: 40 }}>Ce tuto n’existe plus. Retrouve les autres dans l’Aide.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function Video({ tuto }: { tuto: Tuto }) {
  const { width, height } = useWindowDimensions();
  // 9:16, assez petit pour laisser voir le titre sous la vidéo.
  const hauteur = Math.min(height * 0.68, ((width - 32) * 16) / 9, 760);
  const largeur = Math.round((hauteur * 9) / 16);
  const adresse = tutos.adresse(tuto.video);
  if (!adresse)
    return (
      <Cadre largeur={largeur} hauteur={hauteur}>
        <Text style={{ fontFamily: polices.texte, fontSize: 14, color: nuit.texteTertiaire, textAlign: 'center', padding: 20 }}>
          Les vidéos se lisent dans l’appli connectée à ton compte.
        </Text>
      </Cadre>
    );
  return <Lecteur adresse={adresse} affiche={tutos.adresse(tuto.image) ?? undefined} largeur={largeur} hauteur={hauteur} />;
}

function Lecteur({ adresse, affiche, largeur, hauteur }: { adresse: string; affiche?: string; largeur: number; hauteur: number }) {
  const player = useVideoPlayer({ uri: adresse, metadata: affiche ? { artwork: affiche } : undefined }, (p) => {
    p.loop = false;
    p.play();
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  if (status === 'error')
    return (
      <Cadre largeur={largeur} hauteur={hauteur}>
        <Text style={{ fontFamily: polices.texte, fontSize: 14, color: nuit.erreur, textAlign: 'center', padding: 20 }}>
          La vidéo ne se charge pas. Vérifie ta connexion, puis rouvre le tuto.
          {__DEV__ && error?.message ? `\n${error.message}` : ''}
        </Text>
      </Cadre>
    );
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      style={{ width: largeur, height: hauteur, borderRadius: 14, backgroundColor: '#000' }}
    />
  );
}

function Cadre({ largeur, hauteur, children }: { largeur: number; hauteur: number; children: React.ReactNode }) {
  return <View style={{ width: largeur, height: hauteur, borderRadius: 14, backgroundColor: nuit.carte, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}
