// La séance du client en mode immersif, un bloc par page (ouverte par « Démarrer la séance »). Plein écran, sans
// en-tête : « Quitter » revient à l'accueil et garde la séance en cours sur le téléphone.
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { depot } from '@/data';
import { entrainement } from '@/data/entrainement';
import { useSession } from '@/data/session';
import type { Reference } from '@/domain/entrainement';
import { useCharger } from '@/lib/useCharger';
import { nuit, SeanceParBloc } from '@/ui/entrainement/seance-blocs';
import { polices } from '@/ui/theme';

export default function SeanceBloc() {
  const { seance: seanceId, plan } = useLocalSearchParams<{ seance: string; plan?: string }>();
  const { profil } = useSession();
  const clientId = profil?.role === 'client' ? profil.clientId : '';
  const espace = useCharger(() => (clientId ? entrainement.espaceClient(clientId) : Promise.resolve(null)), `espace-${clientId}`);
  const records = useCharger(() => (clientId ? depot.records(clientId) : Promise.resolve([])), `records-${clientId}`);
  const quitter = () => (router.canGoBack() ? router.back() : router.replace('/client'));

  // Écran allumé pendant la séance. Sur navigateur le verrou peut être refusé : sans conséquence.
  useEffect(() => {
    activateKeepAwakeAsync('seance-bloc').catch(() => {});
    return () => {
      deactivateKeepAwake('seance-bloc').catch(() => {});
    };
  }, []);

  useEffect(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      quitter();
      return true;
    });
    return () => abonnement.remove();
  }, []);

  const e = espace.donnee;
  const s = e?.seances.find((x) => x.id === seanceId);
  const references: Reference[] = (records.donnee ?? [])
    .filter((r) => r.reference && r.unite === 'kg' && r.exerciceId)
    .map((r) => ({ exerciceId: r.exerciceId!, charge: r.valeur, repetitions: r.repetitions ?? 1, date: r.date }));

  return (
    <View style={{ flex: 1, backgroundColor: nuit.fond }}>
      <Stack.Screen options={{ headerShown: false, title: 'Séance' }} />
      <StatusBar style="light" />
      {e && s && e.cycle ? (
        <SeanceParBloc
          key={s.id}
          clientId={clientId}
          cycleId={e.cycle.id}
          seance={s}
          historique={e.realisations}
          references={references}
          planificationId={plan || undefined}
          onQuitter={quitter}
          onEnregistre={() => {}}
        />
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
