import { useState } from 'react';
import { View } from 'react-native';

import { Puce, Puces } from './composants';
import { JournalRepas } from './alimentation/journal-repas';
import { ProfilNutritionCarte } from './alimentation/profil';
import { DetailClient } from './detail-client';
import { SeancesClientCoach } from './programmes/seances-client';
import { Mensurations } from './suivi/mensurations';
import { Photos } from './suivi/photos';
import { JournalNutritionVue, PlanNutritionCarte } from './suivi/nutrition';
import { Quotidien } from './suivi/quotidien';
import { Records } from './suivi/records';
import { Sport } from './suivi/sport';
import { espace } from './theme';

type Onglet = 'seances' | 'historique' | 'mesures' | 'quotidien' | 'records' | 'sport' | 'photos' | 'nutrition';
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'seances', libelle: 'Séances' },
  { cle: 'historique', libelle: 'Réalisé' },
  { cle: 'mesures', libelle: 'Mensurations' },
  { cle: 'quotidien', libelle: 'Quotidien' },
  { cle: 'records', libelle: 'Records' },
  { cle: 'sport', libelle: 'Sport' },
  { cle: 'photos', libelle: 'Photos' },
  { cle: 'nutrition', libelle: 'Nutrition' },
];

/** Tout ce que le coach suit d'un client, au même endroit. */
const SOUS_ONGLETS = [
  { cle: 'repas', libelle: 'Repas' },
  { cle: 'plan', libelle: 'Plan et ressenti' },
  { cle: 'profil', libelle: 'Profil et besoins' },
] as const;

function Nutrition({ clientId, coachId }: { clientId: string; coachId: string }) {
  const [onglet, setOnglet] = useState<(typeof SOUS_ONGLETS)[number]['cle']>('repas');
  return (
    <>
      <Puces>
        {SOUS_ONGLETS.map((o) => (
          <Puce key={o.cle} libelle={o.libelle} actif={onglet === o.cle} onPress={() => setOnglet(o.cle)} />
        ))}
      </Puces>
      {onglet === 'repas' && <JournalRepas clientId={clientId} coachId={coachId} saisie={false} />}
      {onglet === 'plan' && (
        <>
          <PlanNutritionCarte clientId={clientId} modifiable />
          <JournalNutritionVue clientId={clientId} saisie={false} />
        </>
      )}
      {onglet === 'profil' && <ProfilNutritionCarte clientId={clientId} />}
    </>
  );
}

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
      {onglet === 'quotidien' && <Quotidien clientId={clientId} cibles parCoach />}
      {onglet === 'records' && <Records clientId={clientId} saisie={false} />}
      {onglet === 'sport' && <Sport clientId={clientId} proprietaire={false} />}
      {onglet === 'photos' && <Photos clientId={clientId} proprietaire={false} />}
      {onglet === 'nutrition' && <Nutrition clientId={clientId} coachId={coachId} />}
    </View>
  );
}
