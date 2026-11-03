// Messagerie du client avec son coach : écran dédié, ouvert depuis l'en-tête, l'accueil ou une notification.
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

import { monCoach } from '@/data/acces-client';
import { useSession } from '@/data/session';
import { useCharger } from '@/lib/useCharger';
import { Conversation } from '@/ui/messagerie/conversation';
import { couleurs } from '@/ui/theme';

export default function MessagesClient() {
  const { profil } = useSession();
  const coach = useCharger(() => monCoach().catch(() => null), 'mon-coach');
  if (profil?.role !== 'client' || profil.suspendu) return <Redirect href="/" />;
  const nom = coach.donnee?.nom ?? 'ton coach';
  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      <Stack.Screen options={{ title: coach.donnee?.nom ? `Mon coach · ${coach.donnee.nom}` : 'Mon coach' }} />
      <Conversation clientId={profil.clientId} moi="client" nomAutre={nom} horaires={coach.donnee?.horairesReponse} pleinEcran />
    </View>
  );
}
