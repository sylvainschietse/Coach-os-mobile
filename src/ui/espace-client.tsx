// Espace client repris de coach-os-espace-client/App.tsx : barre du bas Programme / Séances / Suivi /
// Nutrition / Documents, sous-rubriques Suivi et Nutrition. Sert aussi à l'aperçu « Vue client » du coach.
import { useFocusEffect } from 'expo-router';
import { Dumbbell, FileText, History, TrendingUp, Utensils } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { depot } from '@/data';
import { envoyerEnAttente } from '@/data/file-envoi';
import { demanderSortie } from '@/lib/brouillon';
import { useCharger } from '@/lib/useCharger';

import { JournalRepas } from './alimentation/journal-repas';
import { PlanSemaine } from './alimentation/plan-semaine';
import { ProfilNutritionCarte } from './alimentation/profil';
import { RecettesClient } from './alimentation/recettes';
import { EntrainementClient } from './entrainement/espace-entrainement';
import { BoutonPanneauMinuteurs, useMinuteurs } from './entrainement/minuteurs';
import { MesDocuments } from './mes-documents';
import { BandeauDemo, BarreClient, NonRepris, Selecteur, SousNav, type OngletDef } from './coque';
import { Carte, Texte } from './composants';
import { BilanSemaine } from './suivi/bilan-semaine';
import { Mensurations } from './suivi/mensurations';
import { JournalNutritionVue, PlanNutritionCarte } from './suivi/nutrition';
import { Objectifs } from './suivi/objectifs';
import { Photos } from './suivi/photos';
import { Records } from './suivi/records';
import { couleurs, espace, LARGEUR_CLIENT, polices } from './theme';

export type OngletClient = 'programme' | 'historique' | 'suivi' | 'nutrition' | 'documents';
type RubriqueSuivi = 'hebdo' | 'mesures' | 'pr' | 'objectifs' | 'photos';
type RubriqueNutrition = 'profil' | 'recettes' | 'semaine' | 'journal' | 'personnelles';

const ONGLETS: OngletDef<OngletClient>[] = [
  { cle: 'programme', libelle: 'Programme', icone: Dumbbell },
  { cle: 'historique', libelle: 'Séances', icone: History },
  { cle: 'suivi', libelle: 'Suivi', icone: TrendingUp },
  { cle: 'nutrition', libelle: 'Nutrition', icone: Utensils },
  { cle: 'documents', libelle: 'Documents', icone: FileText },
];
const SUIVI: OngletDef<RubriqueSuivi>[] = [
  { cle: 'hebdo', libelle: 'Bilan semaine' },
  { cle: 'mesures', libelle: 'Mesures' },
  { cle: 'pr', libelle: 'Performances' },
  { cle: 'objectifs', libelle: 'Objectifs' },
  { cle: 'photos', libelle: 'Photos' },
];
const NUTRITION: OngletDef<RubriqueNutrition>[] = [
  { cle: 'profil', libelle: 'Mon profil' },
  { cle: 'recettes', libelle: 'Recettes' },
  { cle: 'semaine', libelle: 'Ma semaine' },
  { cle: 'journal', libelle: 'Journal' },
  { cle: 'personnelles', libelle: 'Mes recettes' },
];

export interface Apercu {
  clients: { id: string; prenom: string }[];
  onChoisir: (id: string) => void;
}

export function EspaceClient({
  clientId,
  prenom,
  apercu,
  ongletInitial = 'programme',
}: {
  clientId: string;
  prenom: string;
  /** Aperçu coach : sélecteur de dossier explicite, ouverture des séances réservée au client. */
  apercu?: Apercu;
  ongletInitial?: OngletClient;
}) {
  const [onglet, setOnglet] = useState<OngletClient>(ongletInitial);
  const [suivi, setSuivi] = useState<RubriqueSuivi>('hebdo');
  const [nutrition, setNutrition] = useState<RubriqueNutrition>('profil');
  const minuteurs = useMinuteurs();
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);

  const aller = (o: OngletClient) => {
    setOnglet(o);
    defilement.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={defilement} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: espace(4), paddingTop: espace(5), paddingBottom: minuteurs?.actif ? 240 : 128 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center', gap: espace(5) }}>
          {depot.mode === 'demo' && <BandeauDemo />}
          {apercu && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(195,24,30,0.2)', backgroundColor: 'rgba(195,24,30,0.05)', padding: 16, gap: 8 }}>
              <Text style={{ fontSize: 14, fontFamily: polices.texteGras, color: couleurs.texte }}>Aperçu coach — dossier client</Text>
              <Selecteur
                libelle="Choisir le client à consulter"
                options={apercu.clients.map((c) => ({ cle: c.id, libelle: c.prenom }))}
                valeur={clientId}
                onChange={(id) => demanderSortie(() => apercu.onChoisir(id))}
              />
            </View>
          )}
          {(onglet === 'programme' || onglet === 'historique') && (
            <>
              {onglet === 'programme' && <BoutonPanneauMinuteurs />}
              <EnAttente clientId={clientId} apercu={!!apercu} />
              <EntrainementClient
                key={`${clientId}:${onglet}`}
                clientId={clientId}
                prenom={prenom}
                apercu={!!apercu}
                vue={onglet}
                onRepos={(secondes, libelle) => minuteurs?.repos(secondes, libelle)}
                onAller={(o) =>
                  demanderSortie(() => {
                    if (o === 'suivi') setSuivi('hebdo');
                    aller(o);
                  })
                }
              />
            </>
          )}
          {onglet === 'suivi' && (
            <>
              <SousNav nom="Rubriques du suivi" grille="suivi" onglets={SUIVI} valeur={suivi} onChange={(r) => demanderSortie(() => setSuivi(r))} />
              {suivi === 'hebdo' && <BilanSemaine key={clientId} clientId={clientId} apercu={!!apercu} />}
              {suivi === 'mesures' && <Mensurations key={clientId} clientId={clientId} />}
              {suivi === 'pr' && <Records key={clientId} clientId={clientId} />}
              {suivi === 'objectifs' && <Objectifs key={clientId} clientId={clientId} apercu={!!apercu} />}
              {suivi === 'photos' && <Photos key={clientId} clientId={clientId} proprietaire={!apercu} />}
            </>
          )}
          {onglet === 'nutrition' && (
            <>
              <SousNav nom="Rubriques Nutrition" grille="nutrition" onglets={NUTRITION} valeur={nutrition} onChange={setNutrition} />
              {nutrition === 'profil' && <ProfilNutritionCarte key={clientId} clientId={clientId} />}
              {nutrition === 'recettes' && <RecettesClient key={clientId} clientId={clientId} />}
              {nutrition === 'semaine' && (
                <>
                  <PlanSemaine key={`s${clientId}`} clientId={clientId} modifiable={false} />
                  <NonRepris ecran="Liste de courses" lot={5} />
                  <PlanNutritionCarte key={`p${clientId}`} clientId={clientId} modifiable={false} />
                  <JournalNutritionVue key={`j${clientId}`} clientId={clientId} saisie={!apercu} />
                </>
              )}
              {nutrition === 'journal' && <JournalRepas key={clientId} clientId={clientId} saisie={!apercu} />}
              {nutrition === 'personnelles' && (
                <NonRepris ecran="Mes recettes" lot={5} detail="Les recettes personnelles déjà créées restent dans Recettes." />
              )}
            </>
          )}
          {onglet === 'documents' && (
            <MesDocuments key={clientId} clientId={clientId} />
          )}
        </View>
      </ScrollView>
      <BarreClient onglets={ONGLETS} valeur={onglet} onChange={(o) => demanderSortie(() => aller(o))} />
    </View>
  );
}

/** File d'envoi de l'ancienne saisie hors ligne : ce qui attend encore le réseau reste signalé. */
function EnAttente({ clientId, apercu }: { clientId: string; apercu: boolean }) {
  const attente = useCharger(() => (apercu ? Promise.resolve(0) : envoyerEnAttente()), `attente-${clientId}`);
  useFocusEffect(attente.recharger);
  if (!attente.donnee) return null;
  return (
    <Carte style={{ borderColor: couleurs.rouge }}>
      <Texte>
        {attente.donnee === 1 ? '1 séance attend' : `${attente.donnee} séances attendent`} le réseau. Elle sera envoyée à votre coach automatiquement, rien
        n’est perdu.
      </Texte>
    </Carte>
  );
}
