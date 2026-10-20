import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import { useSession } from '@/data/session';
import { Ecran } from '@/ui/composants';
import { FicheClient } from '@/ui/fiche-client';

export default function SuiviClient() {
  const { id, prenom } = useLocalSearchParams<{ id: string; prenom?: string }>();
  const { profil } = useSession();
  if (profil?.role !== 'coach') return <Redirect href="/" />;
  return (
    <Ecran largeurMax={760}>
      <Stack.Screen options={{ title: prenom ?? 'Suivi' }} />
      <FicheClient clientId={id} coachId={profil.coachId} />
    </Ecran>
  );
}
