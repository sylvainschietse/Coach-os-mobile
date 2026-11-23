// Les newsletters (50 articles et leurs textes : 0,35 Mo) ne se chargent qu'à l'ouverture de la rubrique.
import { lazy, Suspense } from 'react';

import { Chargement } from '../composants';

const MesNewslettersChargees = lazy(() => import('./mes-newsletters').then((m) => ({ default: m.MesNewsletters })));

export function MesNewsletters() {
  return (
    <Suspense fallback={<Chargement />}>
      <MesNewslettersChargees />
    </Suspense>
  );
}
