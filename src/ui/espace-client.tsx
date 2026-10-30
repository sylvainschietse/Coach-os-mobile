// Espace client : barre du bas Accueil / Programme / Suivi / Nutrition / Moi, sous-rubriques Suivi et Nutrition. Sert aussi à l'aperçu « Vue client » du coach.
import { useFocusEffect } from 'expo-router';
import { Dumbbell, Home, TrendingUp, User, Utensils } from 'lucide-react-native';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { envoyerEnAttente } from '@/data/file-envoi';
import { demanderSortie } from '@/lib/brouillon';
import { useCharger } from '@/lib/useCharger';

import { SeancesRestantes } from './abonnement';
import { EntrainementClient } from './entrainement/espace-entrainement';
import { useMinuteurs } from './entrainement/minuteurs';
import { MonCompte } from './mon-compte';
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

export type OngletClient = 'accueil' | 'programme' | 'suivi' | 'nutrition' | 'moi';
type RubriqueSuivi = 'hebdo' | 'mesures' | 'pr' | 'activite';

const ONGLETS: OngletDef<OngletClient>[] = [
  { cle: 'accueil', libelle: 'Accueil', icone: Home },
  { cle: 'programme', libelle: 'Programme', icone: Dumbbell },
  { cle: 'suivi', libelle: 'Suivi', icone: TrendingUp },
  { cle: 'nutrition', libelle: 'Nutrition', icone: Utensils },
  { cle: 'moi', libelle: 'Moi', icone: User },
];
const SUIVI: OngletDef<RubriqueSuivi>[] = [
  { cle: 'hebdo', libelle: 'Bilan semaine' },
  { cle: 'mesures', libelle: 'Mensurations et photos' },
  { cle: 'pr', libelle: 'Performances' },
  { cle: 'activite', libelle: 'Activité et objectifs' },
];

export interface Apercu {
  clients: { id: string; prenom: string }[];
  onChoisir: (id: string) => void;
}

export function EspaceClient({
  clientId,
  prenom,
  apercu,
  ongletInitial = 'accueil',
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
  const abo = useCharger(() => abonnements.lire(clientId), `abo-${clientId}`);

  const enHaut = useCallback(() => defilement.current?.scrollTo({ y: 0, animated: false }), []);
  const aller = (o: OngletClient) => {
    setOnglet(o);
    enHaut();
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
          {(onglet === 'accueil' || onglet === 'programme') && (
            <>
              <EnAttente clientId={clientId} apercu={!!apercu} />
              <EntrainementClient
                key={`${clientId}:${onglet}`}
                clientId={clientId}
                prenom={prenom}
                apercu={!!apercu}
                vue={onglet}
                onRepos={(secondes, libelle) => minuteurs?.repos(secondes, libelle)}
                onHaut={enHaut}
                onProgramme={() => aller('programme')}
              />
              {onglet === 'accueil' && <SeancesRestantes clientId={clientId} />}
            </>
          )}
          {onglet === 'suivi' && (
            <>
              <SousNav nom="Rubriques du suivi" grille="suivi" onglets={SUIVI} valeur={suivi} onChange={(r) => demanderSortie(() => setSuivi(r))} />
              {suivi === 'hebdo' && <BilanSemaine key={clientId} clientId={clientId} apercu={!!apercu} />}
              {/* Les photos de progression accompagnent les mesures : une seule rubrique. */}
              {suivi === 'mesures' && (
                <View style={{ gap: espace(6) }}>
                  <Mensurations key={clientId} clientId={clientId} />
                  <Photos key={`photos-${clientId}`} clientId={clientId} proprietaire={!apercu} />
                </View>
              )}
              {suivi === 'pr' && <Records key={clientId} clientId={clientId} />}
              {suivi === 'activite' && <ActiviteObjectifs key={clientId} clientId={clientId} apercu={!!apercu} />}
            </>
          )}
          {onglet === 'nutrition' && abo.donnee && <NutritionProfil key={clientId} clientId={clientId} optionNutrition={abo.donnee.optionNutrition} />}
          {onglet === 'moi' && <MonCompte key={clientId} clientId={clientId} prenom={prenom} apercu={!!apercu} />}
        </View>
      </ScrollView>
      <BarreClient onglets={ONGLETS} valeur={onglet} onChange={(o) => demanderSortie(() => aller(o))} />
    </View>
  );
}

/** Activité et objectifs : le quotidien (pas, eau, sommeil…), le sport synchronisé et les objectifs personnels à échéance. */
function ActiviteObjectifs({ clientId, apercu }: { clientId: string; apercu: boolean }) {
  const [vue, setVue] = useState<'quotidien' | 'sport' | 'perso'>('quotidien');
  return (
    <>
      <Puces>
        <Puce libelle="Au quotidien" actif={vue === 'quotidien'} onPress={() => demanderSortie(() => setVue('quotidien'))} />
        <Puce libelle="Sport" actif={vue === 'sport'} onPress={() => demanderSortie(() => setVue('sport'))} />
        <Puce libelle="Mes objectifs perso" actif={vue === 'perso'} onPress={() => demanderSortie(() => setVue('perso'))} />
      </Puces>
      {vue === 'quotidien' ? (
        // En aperçu, le coach peut aussi noter une journée pour son client (pendant une séance, par exemple).
        <Quotidien clientId={clientId} cibles parCoach={apercu} />
      ) : vue === 'sport' ? (
        <Sport clientId={clientId} proprietaire={!apercu} />
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
