// Un tuto vidéo ouvert en plein écran (depuis l'Aide ou une bulle d'astuce).
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';

import { useSession } from '@/data/session';
import { LecteurTuto } from '@/ui/aide/lecteur-tuto';

export default function TutoClient() {
  const { profil } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (profil?.role !== 'client' || profil.suspendu) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Tuto' }} />
      <LecteurTuto id={id ?? ''} onChoisir={(suivant) => router.setParams({ id: suivant })} />
    </>
  );
}
