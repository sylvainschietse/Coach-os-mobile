// La séance « sans téléphone » (ouverte par « Démarrer sans téléphone », ou par le rappel après la séance) : chrono et
// liste des blocs pendant l'effort, puis la séance se note après coup. Plein écran, sans en-tête.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { useSession } from '@/data/session';
import { useCharger } from '@/lib/useCharger';
import { nuit } from '@/ui/entrainement/seance-blocs';
import { SeanceSansTelephone } from '@/ui/entrainement/seance-libre';
import { polices } from '@/ui/theme';

export default function SeanceLibre() {
  const { seance: seanceId, plan } = useLocalSearchParams<{ seance: string; plan?: string }>();
  const { profil } = useSession();
  const clientId = profil?.role === 'client' ? profil.clientId : '';
  const espace = useCharger(() => (clientId ? entrainement.espaceClient(clientId) : Promise.resolve(null)), `espace-${clientId}`);
  const quitter = () => (router.canGoBack() ? router.back() : router.replace('/client'));

  useEffect(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      quitter();
      return true;
    });
    return () => abonnement.remove();
  }, []);

  const e = espace.donnee;
  const s = e?.seances.find((x) => x.id === seanceId);

  return (
    <View style={{ flex: 1, backgroundColor: nuit.fond }}>
      <Stack.Screen options={{ headerShown: false, title: 'Séance sans téléphone' }} />
      <StatusBar style="light" />
      {e && s && e.cycle ? (
        <SeanceSansTelephone key={s.id} clientId={clientId} cycleId={e.cycle.id} seance={s} historique={e.realisations} planificationId={plan || undefined} onQuitter={quitter} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={{ fontFamily: polices.texte, fontSize: 15, color: nuit.doux, textAlign: 'center' }}>
            {espace.erreur ?? (e ? 'Cette séance n’est plus au programme.' : 'Chargement de ta séance…')}
          </Text>
          {(espace.erreur || e) && (
            <Text accessibilityRole="button" onPress={quitter} style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: nuit.rougeDoux }}>
              Retour à l’accueil
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
