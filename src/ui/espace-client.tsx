// Espace client repris de coach-os-espace-client/App.tsx : barre du bas Programme / Séances / Suivi /
// Nutrition / Documents, sous-rubriques Suivi et Nutrition. Sert aussi à l'aperçu « Vue client » du coach.
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpRight, Dumbbell, FileText, History, Lock, RefreshCw, TrendingUp, Utensils } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { depot } from '@/data';
import { envoyerEnAttente } from '@/data/file-envoi';
import { useCharger } from '@/lib/useCharger';

import { JournalRepas } from './alimentation/journal-repas';
import { PlanSemaine } from './alimentation/plan-semaine';
import { ProfilNutritionCarte } from './alimentation/profil';
import { RecettesClient } from './alimentation/recettes';
import { BandeauDemo, BarreClient, BoutonContour, EnTeteRubrique, Hero, NonRepris, Selecteur, SousNav, Vide, type OngletDef } from './coque';
import { Carte, Chargement, Erreur, Pastille, SousTitre, Texte } from './composants';
import { Mensurations } from './suivi/mensurations';
import { JournalNutritionVue, PlanNutritionCarte } from './suivi/nutrition';
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

const datePrevue = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

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
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);

  const aller = (o: OngletClient) => {
    setOnglet(o);
    defilement.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={defilement} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: espace(4), paddingTop: espace(5), paddingBottom: 128 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center', gap: espace(5) }}>
          {depot.mode === 'demo' && <BandeauDemo />}
          {apercu && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(195,24,30,0.2)', backgroundColor: 'rgba(195,24,30,0.05)', padding: 16, gap: 8 }}>
              <Text style={{ fontSize: 14, fontFamily: polices.texteGras, color: couleurs.texte }}>Aperçu coach — dossier client</Text>
              <Selecteur
                libelle="Choisir le client à consulter"
                options={apercu.clients.map((c) => ({ cle: c.id, libelle: c.prenom }))}
                valeur={clientId}
                onChange={apercu.onChoisir}
              />
            </View>
          )}
          {onglet === 'programme' && <Programme clientId={clientId} prenom={prenom} apercu={!!apercu} onAller={(o) => {
            if (o === 'suivi') setSuivi('hebdo');
            aller(o);
          }} />}
          {onglet === 'historique' && <NonRepris ecran="Séances (historique)" lot={3} />}
          {onglet === 'suivi' && (
            <>
              <SousNav nom="Rubriques du suivi" grille="suivi" onglets={SUIVI} valeur={suivi} onChange={setSuivi} />
              {suivi === 'hebdo' && <NonRepris ecran="Bilan semaine" lot={4} />}
              {suivi === 'mesures' && <Mensurations key={clientId} clientId={clientId} />}
              {suivi === 'pr' && <Records key={clientId} clientId={clientId} />}
              {suivi === 'objectifs' && <NonRepris ecran="Objectifs" lot={4} />}
              {suivi === 'photos' && <NonRepris ecran="Photos" lot={4} />}
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
            <>
              <EnTeteRubrique kicker="Mon suivi" titre="Mes documents" sousTitre="Vos bilans et comptes rendus partagés par votre coach." />
              <NonRepris ecran="Mes documents" lot={2} detail="Les comptes rendus partagés y seront listés avec le bouton Ouvrir le PDF." />
            </>
          )}
        </View>
      </ScrollView>
      <BarreClient onglets={ONGLETS} valeur={onglet} onChange={aller} />
    </View>
  );
}

function Programme({ clientId, prenom, apercu, onAller }: { clientId: string; prenom: string; apercu: boolean; onAller: (o: OngletClient) => void }) {
  const { donnee: seances, erreur, recharger } = useCharger(() => depot.seancesDuClient(clientId), clientId);
  const attente = useCharger(() => (apercu ? Promise.resolve(0) : envoyerEnAttente()), `attente-${clientId}`);
  useFocusEffect(recharger);
  useFocusEffect(attente.recharger);

  return (
    <>
      <Hero
        kicker="Votre entraînement"
        titre={`Bonjour, ${prenom.trim().split(/\s+/)[0]}`}
        sousTitre="Votre prochaine séance commence ici."
        droite={<BoutonContour nom="Actualiser mon programme" icone={RefreshCw} onPress={recharger} />}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
          <BoutonContour libelle="Mon bilan de la semaine" icone={ArrowUpRight} onPress={() => onAller('suivi')} />
          <BoutonContour libelle="Ma nutrition" icone={ArrowUpRight} onPress={() => onAller('nutrition')} />
        </View>
      </Hero>
      {!!attente.donnee && (
        <Carte style={{ borderColor: couleurs.rouge }}>
          <Texte>
            {attente.donnee === 1 ? '1 séance attend' : `${attente.donnee} séances attendent`} le réseau. Elle sera envoyée à votre coach
            automatiquement, rien n’est perdu.
          </Texte>
        </Carte>
      )}
      {erreur && <Erreur message={erreur} />}
      {!seances && !erreur && <Chargement />}
      {seances?.length === 0 && (
        <Vide titre="Votre programme se prépare" texte="Votre coach activera votre prochain cycle ici. Vous pourrez alors consulter vos séances." />
      )}
      {!!seances?.length && (
        <View style={{ gap: espace(3) }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: espace(2) }}>
              <Text style={{ fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte }}>Mes séances au programme</Text>
              <Text style={{ fontSize: 12, fontFamily: polices.texte, color: couleurs.texteDoux }}>
                {seances.length} séance{seances.length > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <Lock size={12} color={couleurs.texteDoux} />
              <Text style={{ fontSize: 12, fontFamily: polices.texte, color: couleurs.texteDoux }}>
                {apercu ? 'Aperçu : seul le client peut ouvrir et noter une séance.' : 'Suivez les consignes, puis notez ce que vous avez réalisé.'}
              </Text>
            </View>
          </View>
          {seances.map((s) => (
            <Pressable key={s.id} disabled={apercu} onPress={() => router.push(`/client/seance/${s.id}`)}>
              <Carte>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2) }}>
                  <View style={{ flexShrink: 1 }}>
                    <SousTitre>{s.titre}</SousTitre>
                  </View>
                  {s.derniereRealisation ? <Pastille libelle="Faite" couleur={couleurs.vert} /> : <Pastille libelle="À faire" couleur={couleurs.rouge} />}
                </View>
                <Texte doux style={{ fontSize: 14 }}>
                  {s.datePrevue && !s.derniereRealisation ? `Prévue ${datePrevue(s.datePrevue)} · ` : ''}
                  {s.nbExercices} exercices
                  {s.derniereRealisation ? ` · dernière fois ${dateCourte(s.derniereRealisation)}` : ''}
                </Texte>
              </Carte>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}
