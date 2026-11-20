import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/data/session';
import { supabase } from '@/data/supabase';
import { Bouton, Chargement, Texte } from '@/ui/composants';
import { espace } from '@/ui/theme';

/** Retour du lien de confirmation d'e-mail, ou de Google / Microsoft sur ordinateur. */
export default function RetourConnexion() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { actualiser } = useSession();
  const [fini, setFini] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      // Sur téléphone, le code du lien est échangé ici. Ouvert sur un autre appareil, l'adresse est
      // quand même confirmée : il suffit alors de se connecter avec son e-mail et son mot de passe.
      if (!data.session && typeof code === 'string') await supabase?.auth.exchangeCodeForSession(code).catch(() => undefined);
      const probleme = await actualiser();
      const connecte = (await supabase?.auth.getSession())?.data.session;
      setMessage(probleme ?? (connecte ? null : 'Ton adresse est confirmée. Connecte-toi avec ton e-mail et ton mot de passe.'));
      setFini(true);
    })();
  }, [code, actualiser]);

  if (!fini) return <Chargement />;
  if (!message) return <Redirect href="/" />;
  return (
    <View style={{ padding: espace(6), gap: espace(3) }}>
      <Texte>{message}</Texte>
      <Bouton libelle="Continuer" onPress={() => router.replace('/')} />
    </View>
  );
}
