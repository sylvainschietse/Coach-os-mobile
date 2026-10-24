import { Redirect, useLocalSearchParams } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { View } from 'react-native';

import { useSession } from '@/data/session';
import { demanderSortie } from '@/lib/brouillon';
import { BoutonIcone, EnTete } from '@/ui/coque';
import { LanceurMinuteurs, Minuteurs } from '@/ui/entrainement/minuteurs';
import { EspaceClient, type OngletClient } from '@/ui/espace-client';
import { couleurs, LARGEUR_CLIENT } from '@/ui/theme';

const ONGLETS: OngletClient[] = ['programme', 'historique', 'suivi', 'nutrition', 'documents'];

export default function AccueilClient() {
  const { profil, deconnecter } = useSession();
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  if (profil?.role !== 'client') return <Redirect href="/" />;
  const initial = ONGLETS.find((o) => o === onglet) ?? 'programme';
  return (
    <Minuteurs key={profil.clientId} utilisateurId={profil.clientId}>
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete
          largeur={LARGEUR_CLIENT}
          sousTitre="Mon espace coaching"
          droite={
            <>
              <LanceurMinuteurs />
              <BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={() => demanderSortie(deconnecter)} />
            </>
          }
        />
        <EspaceClient clientId={profil.clientId} prenom={profil.prenom} ongletInitial={initial} />
      </View>
    </Minuteurs>
  );
}
