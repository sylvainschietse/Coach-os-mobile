// « Moi › Mes notifications » : rappels de séances, repas, motivation, bilan et messages du coach.
import { Redirect } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useSession } from '@/data/session';
import { ReglagesNotifications } from '@/ui/notifications/rappels';
import { couleurs, espace, LARGEUR_CLIENT } from '@/ui/theme';

export default function MesNotifications() {
  const { profil } = useSession();
  if (profil?.role !== 'client') return <Redirect href="/" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: couleurs.fond }} contentContainerStyle={{ padding: espace(4), paddingBottom: espace(12) }}>
      <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center' }}>
        <ReglagesNotifications clientId={profil.clientId} prenom={profil.prenom} />
      </View>
    </ScrollView>
  );
}
