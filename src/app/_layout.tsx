import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold, useFonts } from '@expo-google-fonts/jost';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';

import { envoyerEnAttente } from '@/data/file-envoi';
import { SessionProvider, useSession } from '@/data/session';
import { prevenirMessages } from '@/data/messagerie';
import { preparerNotifications } from '@/lib/notifications';
import { preparerCanaux } from '@/lib/rappels';
import { prevenirCloche } from '@/data/cloche';
import { couleurs, polices } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { pret } = useSession();
  const [policesPretes] = useFonts({ JetBrainsMono_500Medium, BebasNeue_400Regular, Jost_400Regular, Jost_500Medium, Jost_600SemiBold });

  useEffect(() => {
    if (pret && policesPretes) SplashScreen.hideAsync();
  }, [pret, policesPretes]);

  if (!pret || !policesPretes) return null;

  return (
    <>
      {Platform.OS !== 'web' && <OuvertureNotifications />}
      <Stack
        screenOptions={{
          // En-tête d'origine : dégradé sombre et ligne rouge de 2px.
          headerBackground: () => <View style={enTete} />,
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontFamily: polices.titre, fontSize: 24 },
          contentStyle: { backgroundColor: couleurs.fond },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="client/index" options={{ headerShown: false, title: 'Mon espace coaching' }} />
        <Stack.Screen name="client/seance/[id]" options={{ title: 'Séance' }} />
        <Stack.Screen name="client/seance-bloc" options={{ headerShown: false, title: 'Séance' }} />
        <Stack.Screen name="client/seance-libre" options={{ headerShown: false, title: 'Séance sans téléphone' }} />
        <Stack.Screen name="client/minuteur" options={{ title: 'Minuteur' }} />
        <Stack.Screen name="client/suivi" options={{ title: 'Mon suivi' }} />
        <Stack.Screen name="client/nutrition" options={{ title: 'Nutrition' }} />
        <Stack.Screen name="client/donnees" options={{ title: 'Mes données' }} />
        <Stack.Screen name="client/messages" options={{ title: 'Mon coach' }} />
        <Stack.Screen name="client/notifications" options={{ title: 'Mes notifications' }} />
        <Stack.Screen name="coach/index" options={{ headerShown: false, title: 'CoachGo' }} />
        <Stack.Screen name="coach/client/[id]" options={{ title: 'Suivi' }} />
        <Stack.Screen name="coach/contact/[id]" options={{ title: 'Fiche contact' }} />
        <Stack.Screen name="coach/seance/[id]" options={{ title: 'Séance' }} />
        <Stack.Screen name="coach/modele/[id]" options={{ title: 'Programme' }} />
        <Stack.Screen name="coach/booster/[id]" options={{ title: 'Séance Booster' }} />
        <Stack.Screen name="coach/compte-rendu/[id]" options={{ title: 'Compte rendu' }} />
        <Stack.Screen name="coach/messages/[id]" options={{ title: 'Messages' }} />
        <Stack.Screen name="questionnaire/[lien]" options={{ title: 'Questionnaire d’accueil' }} />
        <Stack.Screen name="rdv/[jeton]" options={{ title: 'Mon rendez-vous' }} />
        <Stack.Screen name="desabonnement/[jeton]" options={{ title: 'Newsletter' }} />
        <Stack.Screen name="offre/[id]" options={{ title: 'Offre de coaching' }} />
        <Stack.Screen name="agenda-google" options={{ title: 'Google Agenda' }} />
      </Stack>
    </>
  );
}

/** Toucher une notification ouvre l'écran qu'elle annonce (messages, séance, repas, bilan). Téléphone seulement. */
function OuvertureNotifications() {
  const reponse = Notifications.useLastNotificationResponse();
  const ouverte = reponse?.notification.request.identifier;
  const url = reponse?.notification.request.content.data?.url;
  useEffect(() => {
    if (!ouverte || typeof url !== 'string' || !url.startsWith('/')) return;
    // « navigate » : l'espace client déjà ouvert change d'onglet au lieu de s'empiler une seconde fois.
    router.navigate(url as never);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [ouverte, url]);
  return null;
}

const enTete = {
  flex: 1,
  backgroundColor: '#18191D',
  backgroundImage: 'linear-gradient(110deg, #111216, #202126)',
  borderBottomWidth: 2,
  borderBottomColor: couleurs.rougeMarque,
} as const;

export default function RootLayout() {
  useEffect(() => {
    preparerNotifications();
    void preparerCanaux().catch(() => undefined);
    // Un message arrive pendant que l'appli est ouverte : les pastilles se mettent à jour.
    const recu =
      Platform.OS === 'web'
        ? { remove: () => undefined }
        : Notifications.addNotificationReceivedListener((n) => {
            if (n.request.content.data?.genre === 'message') prevenirMessages();
            else prevenirCloche();
          });
    envoyerEnAttente();
    // Au retour sur l'app (réseau revenu en salle), on renvoie ce qui attend.
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') envoyerEnAttente();
    });
    return () => {
      abonnement.remove();
      recu.remove();
    };
  }, []);

  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Navigation />
    </SessionProvider>
  );
}
