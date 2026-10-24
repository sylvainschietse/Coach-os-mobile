import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Ecran } from '@/ui/composants';
import { FicheContactVue } from '@/ui/crm/fiche';

export default function FicheContact() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Fiche contact' }} />
      <FicheContactVue
        id={id}
        onVoirClient={(clientId, prenom) => router.push({ pathname: '/coach/client/[id]', params: { id: clientId, prenom } })}
      />
    </Ecran>
  );
}
