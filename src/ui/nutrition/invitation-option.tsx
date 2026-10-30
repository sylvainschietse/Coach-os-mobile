// Client sans l'option nutrition : un aperçu de ce qu'elle apporte (une semaine de repas en photos), et un mot à son
// coach. Aucun prix ni achat dans l'appli (règles Apple et Google) : le coach en parle de vive voix.
import { Lock, MessageCircle } from 'lucide-react-native';
import { Image, ScrollView, Text, View } from 'react-native';

import { monCoach } from '@/data/acces-client';
import { IDS_PAR_TITRE, PHOTOS_RECETTES } from '@/data/nutrition/photos-recettes';
import { normaliserTelephone } from '@/domain/crm';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { useCharger } from '@/lib/useCharger';

import { Action, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

// Une semaine type, tirée de la banque de recettes : ce que le plan automatique propose.
const APERCU = [
  { jour: 'Lundi', repas: [['Petit déj.', 'Overnight oats aux fruits rouges'], ['Déjeuner', 'Poke bowl thon, riz et avocat'], ['Dîner', 'Curry vert de poulet']] },
  { jour: 'Mardi', repas: [['Petit déj.', 'Pancakes protéinés à la banane'], ['Déjeuner', 'Bowl poulet, riz et brocoli'], ['Dîner', 'Papillotes de saumon, fenouil et citron']] },
  { jour: 'Mercredi', repas: [['Petit déj.', 'Granola aux fruits rouges et cerises'], ['Déjeuner', 'Burrito bowl aux haricots noirs'], ['Dîner', 'Pad thaï au poulet']] },
] as const;
const photo = (titre: string): number | undefined => PHOTOS_RECETTES[IDS_PAR_TITRE[titre]];

export function InvitationOptionNutrition() {
  const { donnee: coach } = useCharger(() => monCoach(), 'mon-coach');
  const telephone = normaliserTelephone(coach?.telephone);
  const nomCoach = coach?.nom ?? 'ton coach';
  const message = `Salut ${coach?.nom ?? ''} ! L’option nutrition avec les recettes et le plan de repas m’intéresse, on en parle ?`;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, paddingVertical: 16, gap: 12, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 16, gap: 6 }}>
        <Text style={[ts.kicker, { fontSize: 12 }]}>Aller plus loin</Text>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 20, color: couleurs.texte }}>Ta semaine de repas, prête à cuisiner</Text>
        <Text style={{ fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux }}>
          Un plan construit à partir de tes macros, avec 200 recettes adaptées à tes goûts.
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {APERCU.map(({ jour, repas }) => (
          <View key={jour} style={{ width: 168, gap: 8 }}>
            <Text style={{ fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte }}>{jour}</Text>
            {repas.map(([moment, titre]) => (
              <View key={titre} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: couleurs.discret }}>
                {photo(titre) !== undefined && <Image source={photo(titre)!} style={{ width: '100%', height: 92 }} resizeMode="cover" accessibilityIgnoresInvertColors />}
                <View style={{ padding: 8, gap: 2 }}>
                  <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.rouge, textTransform: 'uppercase', letterSpacing: 0.5 }}>{moment}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte }}>
                    {titre}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Lock size={14} color={couleurs.texteDoux} />
          <Text style={{ flex: 1, fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>Avec l’option nutrition. Ça t’intéresse ? Parles-en à {nomCoach}.</Text>
        </View>
        {telephone && (
          <Action
            icone={MessageCircle}
            libelle="J’en parle à mon coach"
            onPress={() => ouvrirLien(`https://wa.me/${telephone}?text=${encodeURIComponent(message)}`).catch(() => undefined)}
          />
        )}
      </View>
    </View>
  );
}
