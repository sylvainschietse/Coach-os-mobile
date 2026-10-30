import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Ecran } from '@/ui/composants';
import { CompteRenduVue } from '@/ui/crm/compte-rendu';

export default function EcranCompteRendu() {
  const { id, contact } = useLocalSearchParams<{ id: string; contact: string }>();
  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Compte rendu' }} />
      <CompteRenduVue
        boosterId={id}
        contactId={contact}
        onModifierSeance={() => router.replace({ pathname: '/coach', params: { onglet: 'crm', rubrique: 'Boosters', booster: id, bc: contact } })}
      />
    </Ecran>
  );
}
