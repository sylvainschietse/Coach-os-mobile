// Séance en direct (ouverte depuis la fiche d'un client) : le coach note la séance en présentiel. Plein écran, sans en-tête.
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { BackHandler, View } from 'react-native';

import { depot } from '@/data';
import { useSession } from '@/data/session';
import { useCharger } from '@/lib/useCharger';
import { nuit } from '@/ui/entrainement/seance-blocs';
import { SeanceEnDirect } from '@/ui/entrainement/seance-direct';

export default function EcranSeanceDirecte() {
  const { clientId, prenom } = useLocalSearchParams<{ clientId: string; prenom?: string }>();
  const { profil } = useSession();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const clients = useCharger(() => (coachId && !prenom ? depot.clientsDuCoach(coachId) : Promise.resolve([])), `direct-clients-${coachId}`);
  const nom = prenom || clients.donnee?.find((c) => c.id === clientId)?.prenom || 'ton client';
  const quitter = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/coach/client/[id]', params: { id: clientId } })),
    [clientId],
  );

  // Le bouton retour d'Android ferme l'écran ; la saisie en cours reste gardée sur le téléphone.
  useEffect(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      quitter();
      return true;
    });
    return () => abonnement.remove();
  }, [quitter]);

  if (profil && profil.role !== 'coach') return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: nuit.fond }}>
      <Stack.Screen options={{ headerShown: false, title: 'Séance en direct' }} />
      <StatusBar style="light" />
      {coachId ? <SeanceEnDirect coachId={coachId} clientId={clientId} prenom={nom} onQuitter={quitter} /> : null}
    </View>
  );
}
