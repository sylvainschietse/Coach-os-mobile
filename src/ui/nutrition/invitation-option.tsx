// Client sans l'option nutrition : ce qu'elle apporte, et un mot à son coach. Aucun prix ni achat dans l'appli
// (règles Apple et Google) : le coach en parle de vive voix.
import { CalendarDays, ChefHat, MessageCircle } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { monCoach } from '@/data/acces-client';
import { normaliserTelephone } from '@/domain/crm';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { useCharger } from '@/lib/useCharger';

import { Action, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

const ATOUTS = [
  { icone: CalendarDays, texte: 'Un plan de repas de la semaine, construit à partir de tes macros.' },
  { icone: ChefHat, texte: 'Des recettes adaptées à tes goûts, et tes propres recettes calculées.' },
];

export function InvitationOptionNutrition() {
  const { donnee: coach } = useCharger(() => monCoach(), 'mon-coach');
  const telephone = normaliserTelephone(coach?.telephone);
  const nomCoach = coach?.nom ?? 'ton coach';
  const message = `Salut ${coach?.nom ?? ''} ! L’option nutrition avec les recettes et le plan de repas m’intéresse, on en parle ?`;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 16, gap: 12 }}>
      <Text style={[ts.kicker, { fontSize: 12 }]}>Aller plus loin</Text>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte }}>Des repas tout prêts pour atteindre tes objectifs</Text>
      {ATOUTS.map(({ icone: Icone, texte }) => (
        <View key={texte} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icone size={18} color={couleurs.rouge} />
          <Text style={{ flex: 1, fontFamily: polices.texte, fontSize: 14, color: couleurs.texte }}>{texte}</Text>
        </View>
      ))}
      <Text style={{ fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux }}>Ça t’intéresse ? Parles-en à {nomCoach}.</Text>
      {telephone && (
        <Action
          icone={MessageCircle}
          libelle="J’en parle à mon coach"
          onPress={() => ouvrirLien(`https://wa.me/${telephone}?text=${encodeURIComponent(message)}`).catch(() => undefined)}
        />
      )}
    </View>
  );
}
