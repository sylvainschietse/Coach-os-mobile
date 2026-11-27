// Rubrique « Aide » du client : les tutos vidéo (titre, deux lignes d'explication, durée), puis « Besoin d'aide ?
// Contacte ton coach » qui ouvre la messagerie de l'appli. Ouverte par le « ? » de l'en-tête ou depuis Mon compte.
import { router } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { tutos } from '@/data/tutos';
import { dureeTuto, ETIQUETTE_PUBLIC, TUTOS_PAR_DEFAUT, type Tuto } from '@/domain/tutos';
import { useCharger } from '@/lib/useCharger';

import { Hero } from '../coque';
import { MessageCircle, Play } from '../icones';
import { arrondi, couleurs, espace, polices, titreSection } from '../theme';

export function AideTutos() {
  // La liste livrée avec l'appli s'affiche tout de suite ; celle du serveur la remplace dès qu'elle arrive.
  const { donnee } = useCharger(() => tutos.lister(), 'tutos');
  const liste = donnee ?? TUTOS_PAR_DEFAUT;
  return (
    <View style={{ gap: espace(3) }}>
      <Hero kicker="Aide" titre="Les tutos en vidéo" sousTitre="Moins d’une minute chacun, avec les sous-titres. Touche une vidéo pour la lancer." compact />
      {liste.map((t, i) => (
        <CarteTuto key={t.id} tuto={t} numero={i + 1} />
      ))}
      <BesoinAide />
    </View>
  );
}

function CarteTuto({ tuto, numero }: { tuto: Tuto; numero: number }) {
  const image = tutos.adresse(tuto.image);
  const etiquette = ETIQUETTE_PUBLIC[tuto.pour];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tuto ${numero} : ${tuto.titre}, ${dureeTuto(tuto.dureeSecondes)}`}
      onPress={() => router.push({ pathname: '/client/tuto', params: { id: tuto.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: espace(3),
        padding: espace(3),
        backgroundColor: couleurs.carte,
        borderWidth: 1,
        borderColor: couleurs.bordure,
        borderRadius: arrondi.global,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 62, height: 96, borderRadius: 9, overflow: 'hidden', backgroundColor: couleurs.noir, alignItems: 'center', justifyContent: 'center' }}>
        {image && <Image source={{ uri: image }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, width: 62, height: 110 }} accessibilityIgnoresInvertColors />}
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Play size={14} color={couleurs.blanc} fill={couleurs.blanc} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15.5, lineHeight: 20, color: couleurs.texte }}>
          {numero}. {tuto.titre}
        </Text>
        {!!tuto.explication && <Text style={{ fontFamily: polices.texte, fontSize: 13.5, lineHeight: 19, color: couleurs.texteDoux }}>{tuto.explication}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {tuto.dureeSecondes > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Play size={11} color={couleurs.rougeTexte} fill={couleurs.rougeTexte} />
              <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12.5, color: couleurs.rougeTexte }}>{dureeTuto(tuto.dureeSecondes)}</Text>
            </View>
          )}
          {etiquette && (
            <View style={{ borderRadius: 99, paddingHorizontal: 8, paddingVertical: 1, backgroundColor: tuto.pour === 'cycle' ? couleurs.violetClair : couleurs.vertClair }}>
              <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: tuto.pour === 'cycle' ? couleurs.violet : couleurs.vert }}>{etiquette}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function BesoinAide() {
  return (
    <View
      style={{
        marginTop: espace(2),
        padding: espace(4),
        gap: espace(2),
        alignItems: 'center',
        borderRadius: arrondi.global,
        borderWidth: 1,
        borderColor: 'rgba(195,24,30,0.2)',
        backgroundColor: couleurs.rougeClair,
      }}
    >
      <Text accessibilityRole="header" style={[titreSection, { textAlign: 'center' }]}>
        Besoin d’aide ?
      </Text>
      <Text style={{ fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texte, textAlign: 'center' }}>
        Une question, un souci avec l’appli ? Contacte ton coach, il te répond directement ici.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/client/messages')}
        style={({ pressed }) => ({
          alignSelf: 'stretch',
          minHeight: 48,
          marginTop: espace(1),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: arrondi.controle,
          backgroundColor: couleurs.rouge,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <MessageCircle size={18} color={couleurs.blanc} />
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.blanc }}>Écrire à mon coach</Text>
      </Pressable>
    </View>
  );
}
