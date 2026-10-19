import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold, useFonts } from '@expo-google-fonts/jost';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { envoyerEnAttente } from '@/data/file-envoi';
import { SessionProvider, useSession } from '@/data/session';
import { preparerNotifications } from '@/lib/notifications';
import { couleurs, polices } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { pret } = useSession();
  const [policesPretes] = useFonts({ BebasNeue_400Regular, Jost_400Regular, Jost_500Medium, Jost_600SemiBold });

  useEffect(() => {
    if (pret && policesPretes) SplashScreen.hideAsync();
  }, [pret, policesPretes]);

  if (!pret || !policesPretes) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: couleurs.noir },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontFamily: polices.titre, fontSize: 24 },
        contentStyle: { backgroundColor: couleurs.fond },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="client/index" options={{ title: 'Mes séances' }} />
      <Stack.Screen name="client/seance/[id]" options={{ title: 'Séance' }} />
      <Stack.Screen name="client/minuteur" options={{ title: 'Minuteur' }} />
      <Stack.Screen name="coach/index" options={{ title: 'Coach OS' }} />
      <Stack.Screen name="coach/client/[id]" options={{ title: 'Suivi' }} />
      <Stack.Screen name="coach/contact/[id]" options={{ title: 'Fiche contact' }} />
      <Stack.Screen name="coach/booster/[id]" options={{ title: 'Séance Booster' }} />
      <Stack.Screen name="questionnaire/[lien]" options={{ title: 'Questionnaire d’accueil' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    preparerNotifications();
    envoyerEnAttente();
    // Au retour sur l'app (réseau revenu en salle), on renvoie ce qui attend.
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') envoyerEnAttente();
    });
    return () => abonnement.remove();
  }, []);

  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Navigation />
    </SessionProvider>
  );
}
