// Page ouverte depuis le lien « Ne plus recevoir ces nouvelles » d'une newsletter, sans compte. Le lien contient un
// jeton propre au contact : un toucher sur le bouton le retire des prochaines newsletters de son coach.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { newsletters } from '@/data/newsletters';
import { Bouton, Carte, Ecran, Texte, Titre } from '@/ui/composants';
import { couleurs, espace } from '@/ui/theme';

export default function Desabonnement() {
  const { jeton } = useLocalSearchParams<{ jeton: string }>();
  const [coach, setCoach] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const [occupe, setOccupe] = useState(false);
  const exemple = jeton === 'exemple';

  async function confirmer() {
    setOccupe(true);
    setErreur(undefined);
    try {
      setCoach(await newsletters.desabonner(jeton));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le désabonnement n’a pas pu être enregistré.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Newsletter' }} />
      <Carte style={{ gap: espace(3), padding: 24 }}>
        <Titre>{coach ? 'C’est noté' : 'Ne plus recevoir ces nouvelles'}</Titre>
        {coach ? (
          <Texte>Tu ne recevras plus les newsletters de {coach}. Tes rendez-vous, factures et messages continuent d’arriver normalement. Pour les recevoir à nouveau, dis-le simplement à ton coach.</Texte>
        ) : exemple ? (
          <Texte doux>Ceci est le lien d’un e-mail de test : dans les vrais envois, chaque personne a son propre lien.</Texte>
        ) : (
          <>
            <Texte>Tu ne recevras plus les newsletters de ton coach. Tes rendez-vous, factures et messages, eux, continueront d’arriver.</Texte>
            <View style={{ alignSelf: 'flex-start' }}>
              <Bouton libelle={occupe ? 'Un instant…' : 'Me désabonner'} desactive={occupe || !jeton} onPress={confirmer} />
            </View>
          </>
        )}
        {erreur && <Texte style={{ color: couleurs.rouge }}>{erreur}</Texte>}
      </Carte>
    </Ecran>
  );
}
