// Espace client : barre du bas Aujourd'hui / Entraînement / Progrès / Nutrition, sans sous-onglets. « Mon compte » s'ouvre
// depuis l'avatar de l'en-tête. Progrès est une page de cartes : chacune ouvre sa rubrique, avec un retour.
// Sert aussi à l'aperçu « Vue client » du coach.
import { useFocusEffect } from 'expo-router';
import { Award, CalendarCheck, ChevronLeft, ChevronRight, Dumbbell, Flower2, Home, Moon, Ruler, Target, TrendingUp, Utensils, Watch, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { alimentation } from '@/data/alimentation';
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
import { BandeauDemo, BarreClient, Hero, useMargeBarre, Selecteur, type OngletDef } from './coque';
import { Carte, Texte } from './composants';
import { CarteBadges, CarteSerie, FeteBadges, MesBadges } from './motivation/badges';
import { TuilesDuJour } from './suivi/calories-jour';
import { MaJournee } from './suivi/ma-journee';
import { CarteCycleAccueil, MonCycle } from './suivi/mon-cycle';
import { BilanSemaine } from './suivi/bilan-semaine';
import { Mensurations } from './suivi/mensurations';
import { Objectifs } from './suivi/objectifs';
import { Photos } from './suivi/photos';
import { Quotidien } from './suivi/quotidien';
import { Records } from './suivi/records';
import { Sport } from './suivi/sport';
import { AjoutActiviteLibre } from './suivi/activite-libre';
import { couleurs, espace, LARGEUR_CLIENT, polices, univers, type CleUnivers } from './theme';
import { UniversPage } from './univers';

/** « moi » n'est plus dans la barre : c'est la page Mon compte, ouverte depuis l'avatar (ou un lien qui la demande). */
export type OngletClient = 'accueil' | 'programme' | 'suivi' | 'nutrition' | 'moi';
type RubriqueProgres = 'badges' | 'hebdo' | 'mesures' | 'pr' | 'quotidien' | 'cycle' | 'objectifs' | 'sport';

const ONGLETS: OngletDef<OngletClient>[] = [
  { cle: 'accueil', libelle: 'Aujourd’hui', icone: Home },
  { cle: 'programme', libelle: 'Entraînement', icone: Dumbbell },
  { cle: 'suivi', libelle: 'Progrès', icone: TrendingUp },
  { cle: 'nutrition', libelle: 'Nutrition', icone: Utensils },
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

/** Les cartes de Progrès, chacune dans sa couleur. */
const RUBRIQUES: { cle: Exclude<RubriqueProgres, 'badges'>; titre: string; detail: string; icone: LucideIcon; fond: string; encre: string; accent: string }[] = [
  { cle: 'hebdo', titre: 'Ma semaine', detail: 'Le bilan à remplir pour ton coach', icone: CalendarCheck, fond: '#2F4CC0', encre: '#FFFFFF', accent: '#C4D0FA' },
  { cle: 'mesures', titre: 'Mon corps', detail: 'Mesures, courbes et photos', icone: Ruler, fond: '#E2E8FF', encre: '#1A2D73', accent: '#2F4CC0' },
  { cle: 'pr', titre: 'Mes records', detail: 'Tes meilleures perfs', icone: Award, fond: '#FFF1CC', encre: '#5C3800', accent: '#8A5A00' },
  { cle: 'quotidien', titre: 'Ma journée', detail: 'Sommeil, eau, stress, énergie…', icone: Moon, fond: '#EFEAFF', encre: '#33236E', accent: '#6B4BC9' },
  { cle: 'objectifs', titre: 'Mes objectifs', detail: 'Tes défis perso, avec une date', icone: Target, fond: '#DDF3E5', encre: '#0F4D2A', accent: '#1B7A45' },
  { cle: 'cycle', titre: 'Mon cycle', detail: 'Prochaines règles, énergie et séances selon ta phase', icone: Flower2, fond: '#FFE6E7', encre: '#6E1013', accent: '#B3141A' },
  { cle: 'sport', titre: 'Synchroniser ma montre', detail: 'Pas, sommeil et sorties', icone: Watch, fond: '#1B1D24', encre: '#FFFFFF', accent: '#8FA8FF' },
];
const PLEINE_LARGEUR: RubriqueProgres[] = ['hebdo', 'cycle', 'sport'];
const TITRES: Record<RubriqueProgres, string> = {
  badges: 'Mes badges',
  hebdo: 'Ma semaine',
  mesures: 'Mon corps',
  pr: 'Mes records',
  quotidien: 'Ma journée',
  cycle: 'Mon cycle',
  objectifs: 'Mes objectifs',
  sport: 'Ma montre et mon sport',
};

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
  versCompte = 0,
  onOnglet,
  onDeconnecter,
}: {
  clientId: string;
  prenom: string;
  /** Aperçu coach : sélecteur de dossier explicite, ouverture des séances réservée au client. */
  apercu?: Apercu;
  ongletInitial?: OngletClient;
  /** Change à chaque toucher du logo : l'espace revient à l'accueil. */
  versAccueil?: number;
  /** Change à chaque toucher de l'avatar : Mon compte s'ouvre. */
  versCompte?: number;
  /** « Se déconnecter », en bas de Mon compte. */
  onDeconnecter?: () => void;
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
  const [compteVu, setCompteVu] = useState(versCompte);
  // L'onglet d'où l'on vient : « Retour » de Mon compte y ramène.
  const [avantCompte, setAvantCompte] = useState<OngletClient>('accueil');
  if (versCompte !== compteVu) {
    setCompteVu(versCompte);
    if (onglet !== 'moi') setAvantCompte(onglet);
    setOnglet('moi');
  }
  const [rubrique, setRubrique] = useState<RubriqueProgres | null>(null);
  const minuteurs = useMinuteurs();
  const margeBarre = useMargeBarre();
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);
  const abo = useCharger(() => abonnements.lire(clientId), `abo-${clientId}`);
  // « Mon cycle » est masqué pour un client dont le profil indique « homme ».
  const profilNutrition = useCharger(() => alimentation.profil(clientId).catch(() => null), `profil-nutrition-${clientId}`);

  const enHaut = useCallback(() => defilement.current?.scrollTo({ y: 0, animated: false }), []);
  useEffect(() => {
    if (accueilVu) enHaut();
  }, [accueilVu, enHaut]);
  const aller = (o: OngletClient) => {
    setOnglet(o);
    setRubrique(null);
    enHaut();
  };
  const ouvrir = (r: RubriqueProgres | null) =>
    demanderSortie(() => {
      setOnglet('suivi');
      setRubrique(r);
      enHaut();
    });
  useEffect(() => onOnglet?.(onglet), [onglet, onOnglet]);

  return (
    <UniversPage cle={UNIVERS_CLIENT[onglet]}>
    <View style={{ flex: 1, backgroundImage: `linear-gradient(180deg, ${universDe(onglet).clair} 0%, ${couleurs.fond} 420px)` }}>
      <DefilementClavier ref={defilement} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: espace(4), paddingTop: espace(5), paddingBottom: margeBarre + (minuteurs?.actif ? 112 : 0) }}>
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
              <Pressable accessibilityRole="button" onPress={() => demanderSortie(() => (setAvantCompte(onglet === 'moi' ? 'accueil' : onglet), setOnglet('moi'), enHaut()))} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: polices.texteMoyen, color: couleurs.rouge }}>Voir son compte (formule, factures, documents) ›</Text>
              </Pressable>
            </View>
          )}
          {(onglet === 'accueil' || onglet === 'programme') && (
            <>
              <EnAttente clientId={clientId} apercu={!!apercu} />
              {onglet === 'accueil' && !apercu && <FeteBadges clientId={clientId} />}
              <EntrainementClient
                key={`${clientId}:${onglet}`}
                clientId={clientId}
                prenom={prenom}
                apercu={!!apercu}
                vue={onglet}
                onRepos={(secondes, libelle) => minuteurs?.repos(secondes, libelle)}
                onHaut={enHaut}
                onProgramme={() => aller('programme')}
                milieu={
                  onglet === 'accueil' && (
                    <>
                      <CarteSerie clientId={clientId} onOuvrir={() => ouvrir('badges')} />
                      <TuilesDuJour clientId={clientId} onOuvrir={() => demanderSortie(() => aller('nutrition'))} />
                      <MaJournee clientId={clientId} onNoter={() => ouvrir('quotidien')} />
                      {!apercu && <CarteCycleAccueil clientId={clientId} onOuvrir={() => ouvrir('cycle')} />}
                      {!apercu && <CarteMessages clientId={clientId} />}
                    </>
                  )
                }
              />
              {onglet === 'accueil' && !apercu && <MesRendezVous clientId={clientId} />}
              {/* Un cours de RPM, une séance à lui : le client déclare ce qu'il a fait en dehors du programme. */}
              {onglet === 'accueil' && !apercu && <AjoutActiviteLibre clientId={clientId} />}
              {onglet === 'accueil' && <SeancesRestantes clientId={clientId} />}
            </>
          )}
          {onglet === 'suivi' && !rubrique && (
            <>
              <Hero kicker="Ma progression" titre="Mes progrès" sousTitre="Tes badges, ton corps, tes records et ton quotidien, semaine après semaine." />
              <CarteBadges clientId={clientId} onOuvrir={() => ouvrir('badges')} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                {RUBRIQUES.filter((r) => r.cle !== 'cycle' || profilNutrition.donnee?.sexe !== 'homme').map((r) => (
                  <View key={r.cle} style={{ width: PLEINE_LARGEUR.includes(r.cle) ? '100%' : '50%', padding: 6 }}>
                    <CarteRubrique {...r} large={PLEINE_LARGEUR.includes(r.cle)} onPress={() => ouvrir(r.cle)} />
                  </View>
                ))}
              </View>
            </>
          )}
          {onglet === 'suivi' && rubrique && (
            <>
              <Retour libelle="Mes progrès" onPress={() => ouvrir(null)} />
              <Text accessibilityRole="header" style={{ fontFamily: polices.titre, fontSize: 38, color: couleurs.texte, marginTop: -8 }}>
                {TITRES[rubrique]}
              </Text>
              {rubrique === 'badges' && <MesBadges key={clientId} clientId={clientId} />}
              {rubrique === 'hebdo' && <BilanSemaine key={clientId} clientId={clientId} apercu={!!apercu} />}
              {/* Les photos de progression accompagnent les mesures : une seule rubrique. */}
              {rubrique === 'mesures' && (
                <View style={{ gap: espace(6) }}>
                  <Mensurations key={clientId} clientId={clientId} />
                  <Photos key={`photos-${clientId}`} clientId={clientId} proprietaire={!apercu} />
                </View>
              )}
              {rubrique === 'pr' && <Records key={clientId} clientId={clientId} />}
              {/* En aperçu, le coach peut aussi noter une journée pour son client (pendant une séance, par exemple). */}
              {rubrique === 'quotidien' && <Quotidien key={clientId} clientId={clientId} cibles parCoach={!!apercu} />}
              {/* Données de santé : en aperçu, la coach ne voit que ce que la cliente partage. */}
              {rubrique === 'cycle' && <MonCycle key={clientId} clientId={clientId} apercu={!!apercu} />}
              {rubrique === 'objectifs' && <Objectifs key={clientId} clientId={clientId} apercu={!!apercu} />}
              {rubrique === 'sport' && <Sport key={clientId} clientId={clientId} proprietaire={!apercu} />}
            </>
          )}
          {onglet === 'nutrition' && abo.donnee && <NutritionProfil key={clientId} clientId={clientId} optionNutrition={abo.donnee.optionNutrition} />}
          {onglet === 'moi' && (
            <>
              <Retour libelle="Retour" onPress={() => aller(avantCompte)} />
              <MonCompte key={clientId} clientId={clientId} prenom={prenom} apercu={!!apercu} onOuvrirMontre={() => ouvrir('sport')} onOuvrirQuotidien={() => ouvrir('quotidien')} onDeconnecter={onDeconnecter} />
            </>
          )}
        </View>
      </DefilementClavier>
      <BarreClient onglets={ONGLETS} valeur={onglet} universDe={universDe} onChange={(o) => demanderSortie(() => aller(o))} />
    </View>
    </UniversPage>
  );
}

function CarteRubrique({
  titre,
  detail,
  icone: Icone,
  fond,
  encre,
  accent,
  large,
  onPress,
}: {
  titre: string;
  detail: string;
  icone: LucideIcon;
  fond: string;
  encre: string;
  accent: string;
  large?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titre} : ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: large ? 76 : 118,
        borderRadius: 22,
        padding: 16,
        gap: large ? 12 : 10,
        flexDirection: large ? 'row' : 'column',
        alignItems: large ? 'center' : 'flex-start',
        backgroundColor: fond,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: encre === '#FFFFFF' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.75)' }}>
        <Icone size={22} color={accent} />
      </View>
      <View style={{ flex: large ? 1 : undefined, gap: 2 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: encre }}>{titre}</Text>
        <Text style={{ fontFamily: polices.texte, fontSize: 13, color: encre, opacity: 0.8 }}>{detail}</Text>
      </View>
      {large && <ChevronRight size={20} color={accent} />}
    </Pressable>
  );
}

function Retour({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 }}>
      <ChevronLeft size={20} color={couleurs.texte} />
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>{libelle}</Text>
    </Pressable>
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
        {attente.donnee === 1 ? '1 séance attend' : `${attente.donnee} séances attendent`} le réseau. Elle sera envoyée à ton coach automatiquement, rien
        n’est perdu.
      </Texte>
    </Carte>
  );
}
