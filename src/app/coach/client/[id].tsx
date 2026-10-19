import { Stack, useLocalSearchParams } from 'expo-router';

import { Ecran } from '@/ui/composants';
import { DetailClient } from '@/ui/detail-client';

export default function SuiviClient() {
  const { id, prenom } = useLocalSearchParams<{ id: string; prenom?: string }>();
  return (
    <Ecran>
      <Stack.Screen options={{ title: prenom ?? 'Suivi' }} />
      <DetailClient clientId={id} />
    </Ecran>
  );
}
