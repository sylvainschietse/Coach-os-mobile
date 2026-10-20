import { Redirect } from 'expo-router';

import { useSession } from '@/data/session';
import { Ecran } from '@/ui/composants';
import { JournalNutritionVue, PlanNutritionCarte } from '@/ui/suivi/nutrition';

export default function NutritionClient() {
  const { profil } = useSession();
  if (profil?.role !== 'client') return <Redirect href="/" />;
  return (
    <Ecran>
      <PlanNutritionCarte clientId={profil.clientId} modifiable={false} />
      <JournalNutritionVue clientId={profil.clientId} saisie />
    </Ecran>
  );
}
