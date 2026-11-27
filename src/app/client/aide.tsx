// Rubrique « Aide » du client : les tutos vidéo et « Besoin d'aide ? Contacte ton coach ».
import { Redirect, Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useSession } from '@/data/session';
import { AideTutos } from '@/ui/aide/aide';
import { couleurs, espace, LARGEUR_CLIENT } from '@/ui/theme';

export default function AideClient() {
  const { profil } = useSession();
  if (profil?.role !== 'client' || profil.suspendu) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      <Stack.Screen options={{ title: 'Aide' }} />
      <ScrollView contentContainerStyle={{ padding: espace(4), paddingBottom: espace(12) }}>
        <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center' }}>
          <AideTutos />
        </View>
      </ScrollView>
    </View>
  );
}
