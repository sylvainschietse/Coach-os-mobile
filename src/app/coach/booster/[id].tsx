import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Ecran } from '@/ui/composants';
import { SeanceBooster } from '@/ui/crm/booster';

export default function EcranBooster() {
  const { id, contact } = useLocalSearchParams<{ id: string; contact: string }>();
  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Séance Booster' }} />
      <SeanceBooster boosterId={id} contactId={contact} onFermer={() => router.back()} />
    </Ecran>
  );
}
