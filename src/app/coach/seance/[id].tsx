import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';

import { depot } from '@/data';
import { useSession } from '@/data/session';
import { nouvelleSeance } from '@/domain/programmes';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';
import { Chargement, Ecran, Erreur } from '@/ui/composants';
import { EditeurSeance } from '@/ui/programmes/editeur-seance';

export default function SeanceCoach() {
  const { id, clientId } = useLocalSearchParams<{ id: string; clientId?: string }>();
  const { profil } = useSession();
  const nouvelle = id === 'nouvelle';
  const { donnee: seance, erreur } = useCharger(
    () => (nouvelle ? Promise.resolve(nouvelleSeance(clientId ?? '', nouvelId)) : depot.seance(id)),
    `${id}-${clientId}`,
  );
  if (profil?.role !== 'coach') return <Redirect href="/" />;

  return (
    <Ecran largeurMax={760}>
      <Stack.Screen options={{ title: nouvelle ? 'Nouvelle séance' : 'Modifier la séance' }} />
      {erreur && <Erreur message={erreur} />}
      {!seance && !erreur && <Chargement />}
      {seance && (
        <EditeurSeance
          initiale={seance}
          coachId={profil.coachId}
          onEnregistrer={async (s) => {
            await depot.enregistrerSeance(s);
            router.back();
          }}
        />
      )}
    </Ecran>
  );
}
