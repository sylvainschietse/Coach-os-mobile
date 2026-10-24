import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useSession } from '@/data/session';
import { Ecran, Puce, Puces } from '@/ui/composants';
import { Mensurations } from '@/ui/suivi/mensurations';
import { Records } from '@/ui/suivi/records';

export default function SuiviClient() {
  const { profil } = useSession();
  const { onglet: depart } = useLocalSearchParams<{ onglet?: string }>();
  const [onglet, setOnglet] = useState(depart === 'records' ? 'records' : 'mesures');
  if (profil?.role !== 'client') return <Redirect href="/" />;
  return (
    <Ecran>
      <Stack.Screen options={{ title: onglet === 'records' ? 'Mes records' : 'Mes mensurations' }} />
      <Puces>
        <Puce libelle="Mensurations" actif={onglet === 'mesures'} onPress={() => setOnglet('mesures')} />
        <Puce libelle="Records" actif={onglet === 'records'} onPress={() => setOnglet('records')} />
      </Puces>
      {onglet === 'mesures' ? <Mensurations clientId={profil.clientId} /> : <Records clientId={profil.clientId} />}
    </Ecran>
  );
}
