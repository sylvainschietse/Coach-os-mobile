// Retour de Google après la connexion de l'agenda : la fenêtre de connexion se ferme et l'app reprend la main.
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Carte, Ecran, Texte, Titre } from '@/ui/composants';

WebBrowser.maybeCompleteAuthSession();

export default function RetourGoogle() {
  const { google } = useLocalSearchParams<{ google?: string }>();
  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Google Agenda' }} />
      <Carte>
        <Titre>{google === 'ok' ? 'Google Agenda connecté' : 'Connexion non aboutie'}</Titre>
        <Texte doux>{google === 'ok' ? 'Tu peux fermer cette fenêtre et revenir à ton agenda.' : 'Ferme cette fenêtre et réessaie depuis les réglages de l’agenda.'}</Texte>
      </Carte>
    </Ecran>
  );
}
