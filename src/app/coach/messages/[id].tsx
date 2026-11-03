// Fil d'un client côté coach, en plein écran (depuis la liste des messages ou une notification).
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { depot } from '@/data';
import { useSession } from '@/data/session';
import { useCharger } from '@/lib/useCharger';
import { Conversation } from '@/ui/messagerie/conversation';
import { couleurs } from '@/ui/theme';

export default function MessagesCoach() {
  const { profil } = useSession();
  const { id, nom } = useLocalSearchParams<{ id: string; nom?: string }>();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  // Depuis une notification, seul l'identifiant du client est connu : son prénom vient de la liste.
  const clients = useCharger(() => (coachId && !nom ? depot.clientsDuCoach(coachId) : Promise.resolve([])), `clients-${coachId}-${nom ?? ''}`);
  if (profil?.role !== 'coach') return <Redirect href="/" />;
  const prenom = nom ?? clients.donnee?.find((c) => c.id === id)?.prenom ?? 'ce client';
  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      <Stack.Screen options={{ title: prenom === 'ce client' ? 'Messages' : prenom }} />
      <Conversation key={id} clientId={id} moi="coach" nomAutre={prenom} pleinEcran />
    </View>
  );
}
