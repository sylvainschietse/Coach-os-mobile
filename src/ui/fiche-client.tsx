import { useState } from 'react';
import { View } from 'react-native';

import { Puce, Puces } from './composants';
import { DetailClient } from './detail-client';
import { SeancesClientCoach } from './programmes/seances-client';
import { Mensurations } from './suivi/mensurations';
import { JournalNutritionVue, PlanNutritionCarte } from './suivi/nutrition';
import { Records } from './suivi/records';
import { espace } from './theme';

type Onglet = 'seances' | 'historique' | 'mesures' | 'records' | 'nutrition';
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'seances', libelle: 'Séances' },
  { cle: 'historique', libelle: 'Réalisé' },
  { cle: 'mesures', libelle: 'Mensurations' },
  { cle: 'records', libelle: 'Records' },
  { cle: 'nutrition', libelle: 'Nutrition' },
];

/** Tout ce que le coach suit d'un client, au même endroit. */
export function FicheClient({ clientId, coachId }: { clientId: string; coachId: string }) {
  const [onglet, setOnglet] = useState<Onglet>('seances');
  return (
    <View style={{ gap: espace(4) }}>
      <Puces>
        {ONGLETS.map((o) => (
          <Puce key={o.cle} libelle={o.libelle} actif={onglet === o.cle} onPress={() => setOnglet(o.cle)} />
        ))}
      </Puces>
      {onglet === 'seances' && <SeancesClientCoach clientId={clientId} coachId={coachId} />}
      {onglet === 'historique' && <DetailClient clientId={clientId} />}
      {onglet === 'mesures' && <Mensurations clientId={clientId} saisie={false} />}
      {onglet === 'records' && <Records clientId={clientId} saisie={false} />}
      {onglet === 'nutrition' && (
        <>
          <PlanNutritionCarte clientId={clientId} modifiable />
          <JournalNutritionVue clientId={clientId} saisie={false} />
        </>
      )}
    </View>
  );
}
