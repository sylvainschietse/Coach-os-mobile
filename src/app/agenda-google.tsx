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
        <Titre>{google === 'valider' ? 'Presque fini' : 'Connexion non aboutie'}</Titre>
        <Texte doux>
          {google === 'valider'
            ? 'Ferme cette fenêtre et reviens dans l’appli, sur l’écran où tu as demandé la connexion : elle se termine là.'
            : 'Ferme cette fenêtre et réessaie depuis les réglages de l’agenda.'}
        </Texte>
      </Carte>
    </Ecran>
  );
}
