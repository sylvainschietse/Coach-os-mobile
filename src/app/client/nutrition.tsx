import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useSession } from '@/data/session';
import { JournalRepas } from '@/ui/alimentation/journal-repas';
import { ProfilNutritionCarte } from '@/ui/alimentation/profil';
import { RecettesClient } from '@/ui/alimentation/recettes';
import { Ecran, Puce, Puces } from '@/ui/composants';
import { JournalNutritionVue, PlanNutritionCarte } from '@/ui/suivi/nutrition';

type Onglet = 'repas' | 'recettes' | 'profil' | 'plan';
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'repas', libelle: 'Mes repas' },
  { cle: 'recettes', libelle: 'Recettes' },
  { cle: 'profil', libelle: 'Mon profil' },
  { cle: 'plan', libelle: 'Plan et ressenti' },
];

export default function NutritionClient() {
  const { profil } = useSession();
  const { onglet: depart } = useLocalSearchParams<{ onglet?: Onglet }>();
  const [onglet, setOnglet] = useState<Onglet>(ONGLETS.some((o) => o.cle === depart) ? depart! : 'repas');
  if (profil?.role !== 'client') return <Redirect href="/" />;
  return (
    <Ecran>
      <Puces>
        {ONGLETS.map((o) => (
          <Puce key={o.cle} libelle={o.libelle} actif={onglet === o.cle} onPress={() => setOnglet(o.cle)} />
        ))}
      </Puces>
      {onglet === 'repas' && <JournalRepas clientId={profil.clientId} saisie />}
      {onglet === 'recettes' && <RecettesClient clientId={profil.clientId} />}
      {onglet === 'profil' && <ProfilNutritionCarte clientId={profil.clientId} />}
      {onglet === 'plan' && (
        <>
          <PlanNutritionCarte clientId={profil.clientId} modifiable={false} />
          <JournalNutritionVue clientId={profil.clientId} saisie />
        </>
      )}
    </Ecran>
  );
}
