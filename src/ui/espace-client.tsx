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

import { EntrainementClient } from './entrainement/espace-entrainement';
import { BoutonPanneauMinuteurs, useMinuteurs } from './entrainement/minuteurs';
import { MesDocuments } from './mes-documents';
import { NutritionProfil } from './nutrition/nutrition';
import { BandeauDemo, BarreClient, Selecteur, SousNav, type OngletDef } from './coque';
import { Carte, Puce, Puces, Texte } from './composants';
import { BilanSemaine } from './suivi/bilan-semaine';
import { Mensurations } from './suivi/mensurations';
import { Objectifs } from './suivi/objectifs';
import { Photos } from './suivi/photos';
import { Quotidien } from './suivi/quotidien';
import { Records } from './suivi/records';
import { Sport } from './suivi/sport';
import { couleurs, espace, LARGEUR_CLIENT, polices } from './theme';

export type OngletClient = 'programme' | 'historique' | 'suivi' | 'nutrition' | 'documents';
type RubriqueSuivi = 'hebdo' | 'mesures' | 'pr' | 'sport' | 'objectifs' | 'photos';

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
  { cle: 'sport', libelle: 'Sport' },
  { cle: 'objectifs', libelle: 'Objectifs' },
  { cle: 'photos', libelle: 'Photos' },
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
              {suivi === 'sport' && <Sport key={clientId} clientId={clientId} proprietaire={!apercu} />}
              {suivi === 'objectifs' && <RubriqueObjectifs key={clientId} clientId={clientId} apercu={!!apercu} />}
              {suivi === 'photos' && <Photos key={clientId} clientId={clientId} proprietaire={!apercu} />}
            </>
          )}
          {onglet === 'nutrition' && <NutritionProfil key={clientId} clientId={clientId} />}
          {onglet === 'documents' && (
            <MesDocuments key={clientId} clientId={clientId} />
          )}
        </View>
      </ScrollView>
      <BarreClient onglets={ONGLETS} valeur={onglet} onChange={(o) => demanderSortie(() => aller(o))} />
    </View>
  );
}

/** Objectifs : ceux du quotidien (pas, eau, sommeil…) d'abord, puis les objectifs personnels à échéance. */
function RubriqueObjectifs({ clientId, apercu }: { clientId: string; apercu: boolean }) {
  const [vue, setVue] = useState<'quotidien' | 'perso'>('quotidien');
  return (
    <>
      <Puces>
        <Puce libelle="Au quotidien" actif={vue === 'quotidien'} onPress={() => demanderSortie(() => setVue('quotidien'))} />
        <Puce libelle="Mes objectifs perso" actif={vue === 'perso'} onPress={() => demanderSortie(() => setVue('perso'))} />
      </Puces>
      {vue === 'quotidien' ? (
        // En aperçu, le coach ne note pas à la place du client mais peut choisir ses suivis et régler les cibles.
        <Quotidien clientId={clientId} saisie={!apercu} cibles parCoach={apercu} />
      ) : (
        <Objectifs clientId={clientId} apercu={apercu} />
      )}
    </>
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
