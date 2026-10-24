import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { LogOut, Timer } from 'lucide-react-native';
import { View } from 'react-native';

import { useSession } from '@/data/session';
import { BoutonIcone, EnTete } from '@/ui/coque';
import { EspaceClient, type OngletClient } from '@/ui/espace-client';
import { couleurs, LARGEUR_CLIENT } from '@/ui/theme';

const ONGLETS: OngletClient[] = ['programme', 'historique', 'suivi', 'nutrition', 'documents'];

export default function AccueilClient() {
  const { profil, deconnecter } = useSession();
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  if (profil?.role !== 'client') return <Redirect href="/" />;
  const initial = ONGLETS.find((o) => o === onglet) ?? 'programme';
  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      <EnTete
        largeur={LARGEUR_CLIENT}
        sousTitre="Mon espace coaching"
        droite={
          <>
            <BoutonIcone icone={Timer} nom="Ouvrir les minuteurs" onPress={() => router.push('/client/minuteur')} />
            <BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />
          </>
        }
      />
      <EspaceClient clientId={profil.clientId} prenom={profil.prenom} ongletInitial={initial} />
    </View>
  );
}
