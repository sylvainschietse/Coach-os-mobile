// Espace coach : en-tête (cloche, messages, Mon profil), cinq onglets (barre du bas sur téléphone), plus aucun sous-menu.
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Activity,
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  ChartColumnIncreasing,
  Dumbbell,
  House,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MessageCircle,
  RefreshCw,
  Tag,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { crm, ecouterCrm } from '@/data/crm';
import { useSession } from '@/data/session';
import { questionnairesATraiter, type Booster, type Contact } from '@/domain/crm';
import { aEncaisser, encaissementsDuMois } from '@/domain/gestion';
import { useCharger, useRechargerSur } from '@/lib/useCharger';
import { useRetourAndroid } from '@/lib/retour-android';
import { AgendaCoach } from '@/ui/agenda/agenda-coach';
import { DefilementClavier } from '@/ui/clavier';
import { RecettesCoach } from '@/ui/alimentation/nutrition-coach';
import {
  BandeauDemo,
  BarreClient,
  BoutonContour,
  BoutonIcone,
  CommutateurApercu,
  EnTete,
  EnTeteRubrique,
  OngletsCoach,
  SousNav,
  Vide,
  type OngletDef,
} from '@/ui/coque';
import { Carte, Chargement, Erreur, Puce, Puces, Texte } from '@/ui/composants';
import { Bilans, EditeurBilan } from '@/ui/crm/bilans';
import { Boosters } from '@/ui/crm/boosters';
import { BoutonCloche } from '@/ui/notifications/cloche';
import { EspaceProfil, SECTIONS_PROFIL, type SectionProfil } from '@/ui/espace-profil';
import { BoutonMessages, useNonLus } from '@/ui/messagerie/conversation';
import { ConversationsCoach } from '@/ui/messagerie/conversations-coach';
import { messagerie } from '@/data/messagerie';
import { inscrireMessages } from '@/lib/rappels';
import { nomComplet } from '@/ui/crm/commun';
import { Contacts } from '@/ui/crm/contacts';
import { Documents, EditeurDocumentModale } from '@/ui/crm/documents';
import { EditeurBoosterModale } from '@/ui/crm/editeur-booster';
import { FicheContactModale, VOLETS_FICHE, type VoletFiche } from '@/ui/crm/fiche-contact';
import { EditeurGestion, Gestion, QUOI, type ASupprimer, type ModuleGestion } from '@/ui/crm/gestion';
import { ConfirmerSuppression } from '@/ui/crm/suppression';
import { BilanMois } from '@/ui/crm/bilan-mois';
import { ActiviteCoach } from '@/ui/crm/activite';
import { VueEnsemble } from '@/ui/crm/vue-ensemble';
import { BilansCoach } from '@/ui/suivi/bilans-coach';
import { EspaceClient } from '@/ui/espace-client';
import { SeancesRealisees } from '@/ui/entrainement/bilan';
import { Bibliotheque } from '@/ui/entrainement/bibliotheque';
import { Action } from '@/ui/entrainement/commun';
import { CyclesClients } from '@/ui/entrainement/cycles';
import { EntrainementClient } from '@/ui/entrainement/suivi-client';
import { DetailProgramme } from '@/ui/entrainement/programme';
import { EditeurSeance } from '@/ui/entrainement/seance';
import { couleurs, espace, LARGEUR_COACH, LARGEUR_LG, univers, type CleUnivers } from '@/ui/theme';
import { UniversPage } from '@/ui/univers';

type Onglet = 'crm' | 'agenda' | 'airtable' | 'activite' | 'suivis' | 'prospects' | 'boosters' | 'bilan' | 'hebdo' | 'nutrition' | 'profil';
const TOUS: Onglet[] = ['crm', 'agenda', 'airtable', 'activite', 'suivis', 'prospects', 'boosters', 'bilan', 'hebdo', 'nutrition', 'profil'];
/**
 * Cinq onglets, en bas sur téléphone : Aujourd'hui, Agenda, Clients (prospects, Boosters, clients actifs, bilans de la
 * semaine), Programmes (entraînement et recettes) et Activité (bilan du mois, paiements, documents sur une seule page).
 * Mon profil s'ouvre par le bouton de l'en-tête. Le suivi nutrition d'un client est dans sa fiche.
 */
type OngletVisible = 'crm' | 'agenda' | 'clients' | 'airtable' | 'activite';
const ONGLETS: OngletDef<OngletVisible>[] = [
  { cle: 'crm', libelle: 'Aujourd’hui', icone: House },
  { cle: 'agenda', libelle: 'Agenda', icone: CalendarDays },
  { cle: 'clients', libelle: 'Clients', icone: Users },
  { cle: 'airtable', libelle: 'Programmes', icone: Dumbbell },
  { cle: 'activite', libelle: 'Activité', icone: ChartColumnIncreasing },
];
/** Le client avance de gauche à droite : prospect, Booster, client actif ; les bilans de la semaine sont à relire. */
const SUIVI_CLIENTS: { cle: Onglet; libelle: string }[] = [
  { cle: 'prospects', libelle: 'Prospects' },
  { cle: 'boosters', libelle: 'Boosters' },
  { cle: 'suivis', libelle: 'Clients actifs' },
  { cle: 'hebdo', libelle: 'Bilans de la semaine' },
];
/** Programmes : la bibliothèque d'entraînement et celle des recettes, deux parties d'un même onglet. */
type Partie = 'entrainement' | 'recettes';
const PARTIES: OngletDef<Partie>[] = [
  { cle: 'entrainement', libelle: 'Entraînement' },
  { cle: 'recettes', libelle: 'Recettes' },
];
/** Mon profil s'ouvre par le bouton de l'en-tête : aucun onglet n'est alors surligné. L'ancien onglet Nutrition mène aux recettes. */
const visible = (o: Onglet): OngletVisible | 'profil' =>
  o === 'suivis' || o === 'prospects' || o === 'boosters' || o === 'bilan' || o === 'hebdo' ? 'clients' : o === 'nutrition' ? 'airtable' : o;
/** Anciennes rubriques de l'Accueil rangées dans Mon profil. */
const SECTION_DE_LA_RUBRIQUE: Partial<Record<Rubrique, SectionProfil>> = { Profil: 'infos', Offres: 'offres', Automations: 'relances' };
/** Prospects et Boosters ont quitté le menu de l'Accueil pour l'onglet Clients : leurs anciennes adresses y mènent. */
const RUBRIQUE_DE_L_ONGLET: Partial<Record<Onglet, Rubrique>> = { prospects: 'Contacts', boosters: 'Boosters', activite: 'Activite' };
/** Bilan du mois, Paiements et Documents sont réunis dans l'onglet Activité : leurs anciennes adresses y mènent. */
const DANS_ACTIVITE: Rubrique[] = ['Bilan', 'Paiements', 'Documents', 'Activite'];

/** Couleur de chaque onglet : rouge l'accueil et les programmes, bleu l'agenda, rouge et doré les clients, ambre l'argent. */
const UNIVERS_ONGLET: Record<OngletVisible | 'profil', CleUnivers> = {
  crm: 'rouge',
  agenda: 'bleu',
  clients: 'rougeDore',
  airtable: 'rouge',
  activite: 'ambre',
  profil: 'rougeDore',
};
/** Dans l'Accueil, les échanges passent en rouge et doré. */
const UNIVERS_RUBRIQUE: Partial<Record<Rubrique, CleUnivers>> = { Messages: 'rougeDore' };

type Rubrique =
  | 'Accueil'
  | 'Activite'
  | 'Bilan'
  | 'Messages'
  | 'Contacts'
  | 'Boosters'
  | 'Coachings'
  | 'Bilans'
  | 'Documents'
  | 'Taches'
  | 'Paiements'
  | 'Offres'
  | 'Automations'
  | 'Profil';
const RUBRIQUES: OngletDef<Rubrique>[] = [
  { cle: 'Accueil', libelle: 'Aujourd’hui', icone: LayoutDashboard },
  { cle: 'Activite', libelle: 'Mon activité', icone: ChartColumnIncreasing },
  { cle: 'Bilan', libelle: 'Bilan du mois', icone: ChartColumnIncreasing },
  { cle: 'Messages', libelle: 'Messages', icone: MessageCircle },
  { cle: 'Contacts', libelle: 'Contacts', icone: Users },
  { cle: 'Boosters', libelle: 'Boosters', icone: CalendarCheck },
  { cle: 'Coachings', libelle: 'Coachings', icone: Activity },
  { cle: 'Bilans', libelle: 'Bilans complets', icone: Activity },
  { cle: 'Documents', libelle: 'Documents', icone: FileText },
  { cle: 'Taches', libelle: 'Tâches', icone: ListTodo },
  { cle: 'Paiements', libelle: 'Paiements', icone: Wallet },
  { cle: 'Offres', libelle: 'Mes offres', icone: Tag },
  { cle: 'Automations', libelle: 'Automatisations', icone: Workflow },
  { cle: 'Profil', libelle: 'Mon profil', icone: UserRound },
];

const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

export default function EspaceCoach() {
  const { profil, email, deconnecter } = useSession();
  const { width } = useWindowDimensions();
  const large = width >= LARGEUR_LG;
  const params = useLocalSearchParams<{ onglet?: string; rubrique?: string; section?: string; partie?: string; client?: string; programme?: string; seance?: string; apercu?: string } & ParamsDossier>();
  const ongletDemande = TOUS.find((o) => o === params.onglet) ?? 'crm';
  const rubriqueDemandee = RUBRIQUES.find((r) => r.cle === params.rubrique)?.cle ?? 'Accueil';
  // Anciennes adresses (Accueil › Contacts ou Boosters) : ouvertes dans l'onglet Clients.
  const onglet: Onglet =
    ongletDemande === 'crm' && rubriqueDemandee === 'Contacts'
      ? 'prospects'
      : ongletDemande === 'crm' && rubriqueDemandee === 'Boosters'
        ? 'boosters'
        : ongletDemande === 'crm' && SECTION_DE_LA_RUBRIQUE[rubriqueDemandee]
          ? 'profil'
          : ongletDemande === 'crm' && DANS_ACTIVITE.includes(rubriqueDemandee)
            ? 'activite'
            : ongletDemande;
  // Mon profil : la liste de ses rubriques, ou la rubrique ouverte.
  const section: SectionProfil | undefined = SECTIONS_PROFIL.find((x) => x.cle === params.section)?.cle ?? SECTION_DE_LA_RUBRIQUE[rubriqueDemandee];
  const partie: Partie = onglet === 'nutrition' || params.partie === 'recettes' ? 'recettes' : 'entrainement';
  const rubrique = RUBRIQUE_DE_L_ONGLET[onglet] ?? rubriqueDemandee;
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const clients = useCharger(() => depot.clientsDuCoach(coachId), coachId);
  useFocusEffect(clients.recharger);
  useRetourAndroid(params);
  // Le téléphone du coach reçoit une notification quand un client écrit.
  useEffect(() => {
    if (coachId) void inscrireMessages(true);
  }, [coachId]);
  const nonLus = useNonLus(
    () => (coachId ? messagerie.conversations().then((l) => l.reduce((n, c) => n + c.nonLus, 0)) : Promise.resolve(0)),
    `non-lus-coach-${coachId}`,
  );

  if (profil?.role !== 'coach') return <Redirect href="/" />;

  // L'onglet et la rubrique vivent dans l'adresse : Retour et rechargement gardent le contexte.
  const naviguer = (o: Onglet, r?: Rubrique, dossier?: string) => {
    const vers: Onglet =
      o === 'crm' && r === 'Contacts' ? 'prospects' : o === 'crm' && r === 'Boosters' ? 'boosters' : o === 'crm' && r && DANS_ACTIVITE.includes(r) ? 'activite' : o;
    router.setParams({
      onglet: vers,
      rubrique: vers === 'crm' ? (r ?? 'Accueil') : undefined,
      section: undefined,
      partie: undefined,
      client: undefined,
      dossier,
      programme: undefined,
      seance: undefined,
      ...FERME,
    });
  };

  // Depuis les suivis : la fiche du contact devenu client (coordonnées, abonnement, séances).
  const ouvrirFicheClient = async (clientId: string) => {
    const contact = (await crm.contacts()).find((c) => c.clientId === clientId);
    if (contact) router.setParams({ contact: contact.id, volet: undefined, programme: undefined, seance: undefined });
    else router.push({ pathname: '/coach/client/[id]', params: { id: clientId } });
  };

  const cleUnivers: CleUnivers = params.apercu
    ? 'rouge'
    : visible(onglet) === 'crm'
      ? (UNIVERS_RUBRIQUE[rubrique] ?? 'rouge')
      : UNIVERS_ONGLET[visible(onglet)];

  const enTete = (
    <EnTete
      largeur={LARGEUR_COACH}
      univers={params.apercu ? undefined : univers[cleUnivers]}
      badge="Espace coach"
      onLogo={params.apercu ? undefined : () => naviguer('crm', 'Accueil')}
      email={email ?? (depot.mode === 'demo' ? 'Démonstration, sans compte' : '')}
      droite={
        <>
          {/* « Voir son appli » depuis la fiche : l'appli telle que ce client la voit, et le retour à l'espace coach. */}
          {params.apercu && <CommutateurApercu valeur="client" onChange={() => router.setParams({ apercu: undefined })} />}
          {!params.apercu && <BoutonCloche />}
          {!params.apercu && <BoutonMessages nonLus={nonLus} onPress={() => naviguer('crm', 'Messages')} />}
          {/* Zite gérait la session hors de l'app : sans ce bouton, impossible de changer de compte. */}
          {/* Mon profil : infos, facturation, offres, réglages de l'agenda, relances ; la déconnexion y est aussi. */}
          {!params.apercu && <BoutonIcone icone={UserRound} nom="Mon profil" onPress={() => router.setParams({ onglet: 'profil', rubrique: undefined, section: undefined, client: undefined, programme: undefined, seance: undefined, ...FERME })} />}
          {params.apercu && <BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />}
        </>
      }
    />
  );

  if (params.apercu) {
    const liste = clients.donnee ?? [];
    const choisi = liste.find((c) => c.id === params.apercu) ?? liste[0];
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        {enTete}
        {clients.erreur && <Erreur message={clients.erreur} onReessayer={clients.recharger} />}
        {!clients.donnee && !clients.erreur && <Chargement />}
        {clients.donnee && !choisi && (
          <View style={{ padding: espace(4) }}>
            <Vide titre="Aucun dossier client à prévisualiser" texte="Préparez d’abord l’accès d’un client depuis sa fiche contact." />
          </View>
        )}
        {choisi && (
          <EspaceClient
            key={choisi.id}
            clientId={choisi.id}
            prenom={choisi.prenom}
            apercu={{ clients: liste.map((c) => ({ id: c.id, prenom: `${c.prenom} ${c.nom}`.trim() })), onChoisir: (id) => router.setParams({ apercu: id }) }}
          />
        )}
      </View>
    );
  }

  return (
    <UniversPage cle={cleUnivers}>
    <View style={{ flex: 1, backgroundColor: couleurs.fond, backgroundImage: `linear-gradient(180deg, ${univers[cleUnivers].clair} 0%, ${couleurs.fond} 420px)` }}>
      {enTete}
      <DefilementClavier
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: espace(4), paddingTop: width <= 640 ? 18.4 : width >= 640 ? 32 : 24, paddingBottom: 48 }}
      >
        <View style={{ width: '100%', maxWidth: LARGEUR_COACH, alignSelf: 'center' }}>
          {depot.mode === 'demo' && (
            <View style={{ marginBottom: espace(4) }}>
              <BandeauDemo />
            </View>
          )}
          {/* Sur ordinateur, les cinq onglets restent en haut ; sur téléphone, ils sont dans la barre du bas. */}
          {large && <OngletsCoach onglets={ONGLETS} valeur={visible(onglet)} universDe={(o) => univers[UNIVERS_ONGLET[o]]} onChange={(o) => naviguer(o === 'clients' ? 'suivis' : o)} />}
          {visible(onglet) === 'clients' && (
            <View style={{ marginBottom: espace(4) }}>
              <Puces>
                {SUIVI_CLIENTS.map((o) => (
                  <Puce key={o.cle} libelle={o.libelle} actif={onglet === o.cle} onPress={() => naviguer(o.cle)} />
                ))}
              </Puces>
            </View>
          )}
          {(onglet === 'crm' || onglet === 'activite' || onglet === 'prospects' || onglet === 'boosters' || onglet === 'suivis') && (
            <Crm
              rubrique={rubrique}
              params={params}
              // Sous Clients actifs, seulement la fiche ouverte : la liste est celle des programmes de chaque client.
              mode={onglet === 'suivis' ? 'fenetres' : 'integre'}
              titreClients={onglet === 'prospects' || onglet === 'boosters'}
              onRubrique={(r, dossier) => naviguer('crm', r, dossier)}
              onCycles={() => naviguer('suivis')}
              onAgenda={() => naviguer('agenda')}
              onBilansSemaine={() => naviguer('hebdo')}
            />
          )}
          {onglet === 'agenda' && <AgendaCoach coachId={coachId} onReglages={() => router.setParams({ onglet: 'profil', section: 'agenda' })} />}
          {onglet === 'profil' && (
            <EspaceProfil section={section} onSection={(x) => router.setParams({ onglet: 'profil', rubrique: undefined, section: x })} onDeconnecter={deconnecter} />
          )}
          {(onglet === 'airtable' || onglet === 'nutrition') &&
            (params.seance ? (
              <EditeurSeance
                key={params.seance}
                coachId={coachId}
                id={params.seance}
                onRetour={() => router.setParams({ seance: undefined })}
              />
            ) : params.programme ? (
              <DetailProgramme
                key={params.programme}
                coachId={coachId}
                id={params.programme}
                onRetour={() => router.setParams({ programme: undefined })}
                onOuvrirSeance={(id) => router.setParams({ seance: id })}
              />
            ) : (
              <View style={{ gap: espace(4) }}>
                <SousNav nom="Bibliothèque" onglets={PARTIES} valeur={partie} onChange={(p) => router.setParams({ onglet: 'airtable', partie: p === 'recettes' ? 'recettes' : undefined })} />
                {partie === 'entrainement' ? <Bibliotheque coachId={coachId} onOuvrir={(id) => router.setParams({ programme: id })} /> : <RecettesCoach coachId={coachId} />}
              </View>
            ))}
          {onglet === 'suivis' &&
            (params.client ? (
              <View style={{ gap: espace(4) }}>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Action petit variante="fantome" icone={ArrowLeft} libelle="Retour aux clients" onPress={() => router.setParams({ client: undefined })} />
                </View>
                <EntrainementClient
                  key={params.client}
                  coachId={coachId}
                  clientId={params.client}
                  avecNom
                  onOuvrirProgramme={(id) => router.setParams({ onglet: 'airtable', programme: id, seance: undefined, client: undefined })}
                />
              </View>
            ) : (
              <View style={{ gap: espace(4) }}>
                {/* Client qui commence directement (abonnement à l'appli ou coaching en présence), sans Booster. */}
                <View style={{ alignSelf: 'flex-start' }}>
                  <Action petit icone={UserPlus} libelle="Nouveau client" onPress={() => router.setParams({ ...FERME, contact: 'nouveau-client' })} />
                </View>
                <CyclesClients
                coachId={coachId}
                onOuvrirProgramme={(id) => router.setParams({ onglet: 'airtable', programme: id, seance: undefined })}
                onOuvrirFiche={ouvrirFicheClient}
                onOuvrirEntrainement={(id) => router.setParams({ client: id })}
                />
              </View>
            ))}
          {onglet === 'bilan' && (
            <SeancesRealisees
              coachId={coachId}
              onOuvrirProgramme={(id) => router.setParams({ onglet: 'airtable', programme: id, seance: undefined })}
              onOuvrirSuivis={() => naviguer('suivis')}
            />
          )}
          {onglet === 'hebdo' && <BilansCoach />}
        </View>
      </DefilementClavier>
      {!large && (
        <BarreClient
          nom="Navigation de l’espace coach"
          onglets={ONGLETS}
          valeur={visible(onglet) === 'profil' ? ('' as OngletVisible) : (visible(onglet) as OngletVisible)}
          universDe={(o) => univers[UNIVERS_ONGLET[o]]}
          onChange={(o) => naviguer(o === 'clients' ? 'suivis' : o)}
        />
      )}
    </View>
    </UniversPage>
  );
}

/**
 * Fiche ou éditeur ouverts : dans l'adresse, pour que le rechargement rouvre le même dossier et que fermer
 * l'éditeur Booster ramène à la fiche d'où il a été ouvert.
 */
type ParamsDossier = {
  contact?: string;
  volet?: string;
  booster?: string;
  bc?: string;
  dossier?: string;
  doc?: string;
  coaching?: string;
  tache?: string;
  paiement?: string;
  bilan?: string;
};
const FERME = {
  contact: undefined,
  volet: undefined,
  booster: undefined,
  bc: undefined,
  doc: undefined,
  coaching: undefined,
  tache: undefined,
  paiement: undefined,
  bilan: undefined,
};
/** Paramètre d'adresse de l'éditeur de chaque rubrique. */
const PARAM_EDITEUR: Record<ModuleGestion, 'coaching' | 'tache' | 'paiement'> = { Coachings: 'coaching', Taches: 'tache', Paiements: 'paiement' };

function Crm({
  rubrique,
  params,
  mode,
  titreClients,
  onRubrique,
  onCycles,
  onAgenda,
  onBilansSemaine,
}: {
  rubrique: Rubrique;
  params: ParamsDossier;
  /** integre : la rubrique et ses fenêtres ; fenetres : fiches et éditeurs seuls (Clients actifs). */
  mode: 'integre' | 'fenetres';
  /** Prospects et Boosters, dans l'onglet Clients. */
  titreClients?: boolean;
  onRubrique: (r: Rubrique, dossier?: string) => void;
  onCycles: () => void;
  onAgenda: () => void;
  onBilansSemaine: () => void;
}) {
  const [maj, setMaj] = useState(() => new Date());
  const [suppression, setSuppression] = useState<{ booster: Booster; contact: Contact }>();
  const [aSupprimer, setASupprimer] = useState<{ quoi: string; nom: string; contact?: string; action: () => Promise<void> }>();
  const charger = useCallback(async () => {
    // Les abonnements du mois deviennent des lignes « En attente » avant de lire les paiements.
    await abonnements.preparerEcheances().catch(() => undefined);
    const [contacts, journee, boosters, carnet, lienQuestionnaire] = await Promise.all([
      crm.contacts(),
      crm.journee(),
      crm.boosters(),
      crm.carnet(),
      crm.lienQuestionnaire(),
    ]);
    setMaj(new Date());
    return {
      contacts,
      relances: journee.relances,
      boosters,
      encaissements: encaissementsDuMois(carnet, new Date()),
      aEncaisser: aEncaisser(carnet),
      carnet,
      lienQuestionnaire,
      questionnaires: questionnairesATraiter(carnet),
    };
  }, []);
  const vue = useCharger(charger, 'vue-ensemble');
  useFocusEffect(vue.recharger);
  useRechargerSur(vue.recharger, ecouterCrm);
  const titre = RUBRIQUES.find((r) => r.cle === rubrique)!.libelle;

  const ouvrirContact = (id: string, volet?: VoletFiche) => router.setParams({ ...FERME, contact: id, volet });
  const ouvrirBooster = (b: Pick<Booster, 'id' | 'contactId'>) => router.setParams({ booster: b.id, bc: b.contactId });
  const nouveauBooster = (contactId?: string) => router.setParams({ booster: 'nouveau', bc: contactId });
  const volet = VOLETS_FICHE.find((v) => v === params.volet);
  const supprimerGestion = (x: ASupprimer) =>
    setASupprimer({
      quoi: QUOI[x.module],
      nom: x.nom,
      contact: x.contact,
      action: () => (x.module === 'Coachings' ? crm.supprimerCoaching(x.id) : x.module === 'Taches' ? crm.supprimerTache(x.id) : crm.supprimerPaiement(x.id)),
    });

  return (
    <View style={{ gap: 24 }}>
      {mode !== 'fenetres' && (
      <View style={{ minWidth: 0 }}>
        <EnTeteRubrique
          kicker={titreClients ? 'Clients' : rubrique === 'Accueil' ? 'Espace coach' : 'Gestion du coaching'}
          titre={rubrique === 'Contacts' && titreClients ? 'Prospects' : titre}
          sousTitre={`Dernière actualisation · ${heure(maj)}`}
          action={<BoutonContour libelle="Actualiser" icone={RefreshCw} iconeAGauche onPress={vue.recharger} />}
        />
        {vue.erreur && rubrique === 'Accueil' && (
          <Carte style={{ borderColor: couleurs.rouge, marginBottom: espace(4) }}>
            <Texte>{vue.erreur}</Texte>
            <BoutonContour libelle="Réessayer" onPress={vue.recharger} />
          </Carte>
        )}
        {rubrique === 'Accueil' &&
          (vue.donnee ? (
            <VueEnsemble
              donnees={vue.donnee}
              onRubrique={onRubrique}
              onOuvrirTache={(id) => router.setParams({ ...FERME, tache: id })}
              onNouvelleTache={() => router.setParams({ ...FERME, tache: 'nouveau' })}
              onOuvrirContact={(id) => ouvrirContact(id)}
              onOuvrirBooster={ouvrirBooster}
              onPlanifierBooster={(id) => nouveauBooster(id)}
              onCycles={onCycles}
              onAgenda={onAgenda}
              onBilansSemaine={onBilansSemaine}
            />
          ) : (
            !vue.erreur && <Chargement />
          ))}
        {rubrique === 'Contacts' && (
          <Contacts
            prospects={titreClients}
            onOuvrir={(id) => ouvrirContact(id)}
            onNouveau={() => router.setParams({ ...FERME, contact: 'nouveau' })}
            onPlanifierBooster={(id) => nouveauBooster(id)}
            onOuvrirBooster={ouvrirBooster}
          />
        )}
        {rubrique === 'Boosters' && (
          <Boosters
            contactId={params.dossier}
            onToutAfficher={() => onRubrique('Boosters')}
            onOuvrir={ouvrirBooster}
            onNouveau={() => nouveauBooster(params.dossier)}
            onSupprimer={(b) => setSuppression({ booster: b, contact: b.contact })}
            onOuvrirContact={(id) => ouvrirContact(id)}
          />
        )}
        {rubrique === 'Documents' && (
          <Documents
            contactId={params.dossier}
            onToutAfficher={() => onRubrique('Documents')}
            onOuvrir={(id) => router.setParams({ ...FERME, doc: id })}
            onNouveau={() => router.setParams({ ...FERME, doc: 'nouveau' })}
          />
        )}
        {(rubrique === 'Coachings' || rubrique === 'Taches' || rubrique === 'Paiements') && (
          <Gestion
            key={rubrique}
            module={rubrique}
            contactId={params.dossier}
            onToutAfficher={() => onRubrique(rubrique)}
            onOuvrir={(id) => router.setParams({ ...FERME, [PARAM_EDITEUR[rubrique]]: id })}
            onNouveau={() => router.setParams({ ...FERME, [PARAM_EDITEUR[rubrique]]: 'nouveau' })}
            onSupprimer={supprimerGestion}
            onCycles={onCycles}
          />
        )}
        {rubrique === 'Bilans' && (
          <Bilans
            contactId={params.dossier}
            onToutAfficher={() => onRubrique('Bilans')}
            onOuvrir={(id) => router.setParams({ ...FERME, bilan: id })}
            onNouveau={() => router.setParams({ ...FERME, bilan: 'nouveau' })}
            onSupprimer={(x) => setASupprimer({ quoi: 'ce bilan', nom: x.nom, contact: x.contact, action: () => crm.supprimerBilan(x.id) })}
          />
        )}
        {rubrique === 'Bilan' && <BilanMois onPaiements={() => onRubrique('Paiements')} />}
        {/* Mon activité : bilan du mois, puis paiements, puis documents, sur une seule page. */}
        {rubrique === 'Activite' && (
          <ActiviteCoach
            bilan={<BilanMois onPaiements={() => undefined} />}
            paiements={
              <Gestion
                module="Paiements"
                contactId={params.dossier}
                onToutAfficher={() => onRubrique('Activite')}
                onOuvrir={(id) => router.setParams({ ...FERME, paiement: id })}
                onNouveau={() => router.setParams({ ...FERME, paiement: 'nouveau' })}
                onSupprimer={supprimerGestion}
                onCycles={onCycles}
              />
            }
            documents={
              <Documents
                contactId={params.dossier}
                onToutAfficher={() => onRubrique('Activite')}
                onOuvrir={(id) => router.setParams({ ...FERME, doc: id })}
                onNouveau={() => router.setParams({ ...FERME, doc: 'nouveau' })}
              />
            }
          />
        )}
        {rubrique === 'Messages' && <ConversationsCoach />}
      </View>
      )}

      {params.coaching || params.tache || params.paiement ? (
        <EditeurGestion
          key={`${params.coaching ?? ''}${params.tache ?? ''}${params.paiement ?? ''}`}
          module={params.coaching ? 'Coachings' : params.tache ? 'Taches' : 'Paiements'}
          id={[params.coaching, params.tache, params.paiement].find((x) => x && x !== 'nouveau')}
          contactId={params.dossier}
          onFermer={() => router.setParams({ coaching: undefined, tache: undefined, paiement: undefined })}
          onSupprimer={(x) => {
            router.setParams({ coaching: undefined, tache: undefined, paiement: undefined });
            supprimerGestion(x);
          }}
        />
      ) : params.bilan ? (
        <EditeurBilan
          key={params.bilan}
          id={params.bilan === 'nouveau' ? undefined : params.bilan}
          contactId={params.dossier ?? params.contact}
          onFermer={() => router.setParams({ bilan: undefined })}
        />
      ) : params.doc ? (
        <EditeurDocumentModale
          key={params.doc}
          id={params.doc === 'nouveau' ? undefined : params.doc}
          contactId={params.dossier ?? params.contact}
          onFermer={() => router.setParams({ doc: undefined })}
        />
      ) : params.booster ? (
        <EditeurBoosterModale
          key={`${params.booster}-${params.bc ?? ''}`}
          boosterId={params.booster === 'nouveau' ? undefined : params.booster}
          contactId={params.bc}
          onFermer={() => router.setParams({ booster: undefined, bc: undefined })}
          onSupprimer={(booster, contact) => setSuppression({ booster, contact })}
        />
      ) : params.contact ? (
        <FicheContactModale
          key={params.contact}
          id={params.contact === 'nouveau' || params.contact === 'nouveau-client' ? undefined : params.contact}
          nouveauClient={params.contact === 'nouveau-client'}
          volet={volet}
          onVolet={(v) => router.setParams({ volet: v })}
          onFermer={() => router.setParams(FERME)}
          onOuvrirAutre={(id) => ouvrirContact(id)}
          onBooster={ouvrirBooster}
          onNouveauBooster={(id) => nouveauBooster(id)}
          onSupprimerBooster={(booster, contact) => setSuppression({ booster, contact })}
          onDocument={(id) => router.setParams({ doc: id })}
          onBilan={(id) => router.setParams({ bilan: id })}
          onSupprimerBilan={(x) => setASupprimer({ quoi: 'ce bilan', nom: x.nom, contact: x.contact, action: () => crm.supprimerBilan(x.id) })}
          onVoirAppli={(clientId) => router.setParams({ apercu: clientId })}
        />
      ) : null}
      {aSupprimer && (
        <ConfirmerSuppression
          quoi={aSupprimer.quoi}
          nom={aSupprimer.nom}
          contact={aSupprimer.contact}
          onSupprimer={aSupprimer.action}
          onFermer={() => setASupprimer(undefined)}
        />
      )}
      {suppression && (
        <ConfirmerSuppression
          quoi="ce Booster"
          nom={suppression.booster.nom || 'Booster'}
          contact={nomComplet(suppression.contact)}
          onSupprimer={async () => {
            await crm.supprimerBooster(suppression.booster.id);
            if (params.booster === suppression.booster.id) router.setParams({ booster: undefined, bc: undefined });
          }}
          onFermer={() => setSuppression(undefined)}
        />
      )}
    </View>
  );
}
