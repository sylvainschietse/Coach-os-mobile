// Espace client : barre du bas Accueil / Programme / Suivi / Nutrition / Moi, sous-rubriques Suivi et Nutrition. Sert aussi à l'aperçu « Vue client » du coach.
import { useFocusEffect } from 'expo-router';
import { Dumbbell, Home, TrendingUp, User, Utensils } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { envoyerEnAttente } from '@/data/file-envoi';
import { demanderSortie } from '@/lib/brouillon';
import { useCharger } from '@/lib/useCharger';

import { SeancesRestantes } from './abonnement';
import { DefilementClavier } from './clavier';
import { MesRendezVous } from './agenda/mes-rendez-vous';
import { EntrainementClient } from './entrainement/espace-entrainement';
import { useMinuteurs } from './entrainement/minuteurs';
import { CarteMessages } from './messagerie/conversation';
import { MonCompte } from './mon-compte';
import { NutritionProfil } from './nutrition/nutrition';
import { BandeauDemo, BarreClient, Hero, Selecteur, SousNav, type OngletDef } from './coque';
import { Carte, Puce, Puces, Texte } from './composants';
import { BilanSemaine } from './suivi/bilan-semaine';
import { Mensurations } from './suivi/mensurations';
import { MesSeances } from './suivi/mes-seances';
import { Objectifs } from './suivi/objectifs';
import { Photos } from './suivi/photos';
import { Quotidien } from './suivi/quotidien';
import { Records } from './suivi/records';
import { Sport } from './suivi/sport';
import { AjoutActiviteLibre } from './suivi/activite-libre';
import { couleurs, espace, LARGEUR_CLIENT, polices, univers, type CleUnivers } from './theme';
import { UniversPage } from './univers';

export type OngletClient = 'accueil' | 'programme' | 'suivi' | 'nutrition' | 'moi';
type RubriqueSuivi = 'seances' | 'hebdo' | 'mesures' | 'pr' | 'activite';

const ONGLETS: OngletDef<OngletClient>[] = [
  { cle: 'accueil', libelle: 'Accueil', icone: Home },
  { cle: 'programme', libelle: 'Programme', icone: Dumbbell },
  { cle: 'suivi', libelle: 'Suivi', icone: TrendingUp },
  { cle: 'nutrition', libelle: 'Nutrition', icone: Utensils },
  { cle: 'moi', libelle: 'Moi', icone: User },
];
/** La couleur de chaque onglet : rouge pour l'entraînement, bleu pour le suivi, vert pour la nutrition, rouge et doré pour soi. */
export const UNIVERS_CLIENT: Record<OngletClient, CleUnivers> = {
  accueil: 'rouge',
  programme: 'rouge',
  suivi: 'bleu',
  nutrition: 'vert',
  moi: 'rougeDore',
};
const universDe = (o: OngletClient) => univers[UNIVERS_CLIENT[o]];

const SUIVI: OngletDef<RubriqueSuivi>[] = [
  { cle: 'seances', libelle: 'Mes séances' },
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
  versAccueil = 0,
  onOnglet,
}: {
  clientId: string;
  prenom: string;
  /** Aperçu coach : sélecteur de dossier explicite, ouverture des séances réservée au client. */
  apercu?: Apercu;
  ongletInitial?: OngletClient;
  /** Change à chaque toucher du logo : l'espace revient à l'accueil. */
  versAccueil?: number;
  /** L'en-tête de l'écran prend la couleur de l'onglet ouvert. */
  onOnglet?: (o: OngletClient) => void;
}) {
  const [onglet, setOnglet] = useState<OngletClient>(ongletInitial);
  // Une notification touchée (« repas à noter », « bilan ») ouvre l'onglet qu'elle annonce.
  const [initialVu, setInitialVu] = useState(ongletInitial);
  if (ongletInitial !== initialVu) {
    setInitialVu(ongletInitial);
    setOnglet(ongletInitial);
  }
  const [accueilVu, setAccueilVu] = useState(versAccueil);
  if (versAccueil !== accueilVu) {
    setAccueilVu(versAccueil);
    setOnglet('accueil');
  }
  const [suivi, setSuivi] = useState<RubriqueSuivi>('seances');
  const minuteurs = useMinuteurs();
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);
  const abo = useCharger(() => abonnements.lire(clientId), `abo-${clientId}`);

  const enHaut = useCallback(() => defilement.current?.scrollTo({ y: 0, animated: false }), []);
  useEffect(() => {
    if (accueilVu) enHaut();
  }, [accueilVu, enHaut]);
  const aller = (o: OngletClient) => {
    setOnglet(o);
    enHaut();
  };
  useEffect(() => onOnglet?.(onglet), [onglet, onOnglet]);

  return (
    <UniversPage cle={UNIVERS_CLIENT[onglet]}>
    <View style={{ flex: 1, backgroundImage: `linear-gradient(180deg, ${universDe(onglet).clair} 0%, ${couleurs.fond} 420px)` }}>
      <DefilementClavier ref={defilement} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: espace(4), paddingTop: espace(5), paddingBottom: minuteurs?.actif ? 240 : 128 }}>
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
              {onglet === 'accueil' && !apercu && <CarteMessages clientId={clientId} />}
              {onglet === 'accueil' && !apercu && <MesRendezVous clientId={clientId} />}
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
              {/* Un cours de RPM, une séance à lui : le client déclare ce qu'il a fait en dehors du programme. */}
              {onglet === 'accueil' && !apercu && <AjoutActiviteLibre clientId={clientId} />}
              {onglet === 'accueil' && <SeancesRestantes clientId={clientId} />}
            </>
          )}
          {onglet === 'suivi' && (
            <>
              <Hero kicker="Ma progression" titre="Mon suivi" sousTitre="Tes séances, tes mesures et tes records, semaine après semaine." />
              <SousNav nom="Rubriques du suivi" grille="suivi" onglets={SUIVI} valeur={suivi} onChange={(r) => demanderSortie(() => setSuivi(r))} />
              {/* Le tableau semaine par semaine et « Ajouter une séance » : tout ce que le client a fait, au même endroit. */}
              {suivi === 'seances' && <MesSeances key={clientId} clientId={clientId} apercu={!!apercu} />}
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
      </DefilementClavier>
      <BarreClient onglets={ONGLETS} valeur={onglet} universDe={universDe} onChange={(o) => demanderSortie(() => aller(o))} />
    </View>
    </UniversPage>
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
