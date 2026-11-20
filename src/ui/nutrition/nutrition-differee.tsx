// L'espace nutrition (plans, recettes, table des aliments : plus de 2 Mo) ne se charge qu'à l'ouverture de l'onglet
// Nutrition : la version web n'a plus à le télécharger avant d'afficher le premier écran.
import { lazy, Suspense, type ComponentProps } from 'react';

import { Chargement } from '../composants';

const NutritionChargee = lazy(() => import('./nutrition').then((m) => ({ default: m.NutritionProfil })));

export function NutritionProfil(props: ComponentProps<typeof NutritionChargee>) {
  return (
    <Suspense fallback={<Chargement />}>
      <NutritionChargee {...props} />
    </Suspense>
  );
}
