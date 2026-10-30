// Espace coach repris de apps/coach-os/App.tsx : en-tête, cinq onglets, Tableau de bord = CRM à rubriques.
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Activity,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  RefreshCw,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { crm, ecouterCrm } from '@/data/crm';
import { useSession } from '@/data/session';
import type { Booster, Contact } from '@/domain/crm';
import { aEncaisser, encaissementsDuMois } from '@/domain/gestion';
import { useCharger, useRechargerSur } from '@/lib/useCharger';
import { useRetourAndroid } from '@/lib/retour-android';
import { NutritionCoach } from '@/ui/alimentation/nutrition-coach';
import {
  BandeauDemo,
  BoutonContour,
  BoutonIcone,
  CommutateurApercu,
  EnTete,
  EnTeteRubrique,
  MenuRubriques,
  OngletsCoach,
  Vide,
  type OngletDef,
} from '@/ui/coque';
import { Carte, Chargement, Erreur, Puce, Puces, Texte } from '@/ui/composants';
import { Bilans, EditeurBilan } from '@/ui/crm/bilans';
import { Boosters } from '@/ui/crm/boosters';
import { Automatisations } from '@/ui/crm/automatisations';
import { nomComplet } from '@/ui/crm/commun';
import { Contacts } from '@/ui/crm/contacts';
import { Documents, EditeurDocumentModale } from '@/ui/crm/documents';
import { EditeurBoosterModale } from '@/ui/crm/editeur-booster';
import { FicheContactModale, VOLETS_FICHE, type VoletFiche } from '@/ui/crm/fiche-contact';
import { EditeurGestion, Gestion, QUOI, type ASupprimer, type ModuleGestion } from '@/ui/crm/gestion';
import { ConfirmerSuppression } from '@/ui/crm/suppression';
import { VueEnsemble } from '@/ui/crm/vue-ensemble';
import { BilansCoach } from '@/ui/suivi/bilans-coach';
import { EspaceClient } from '@/ui/espace-client';
import { SeancesRealisees } from '@/ui/entrainement/bilan';
import { Bibliotheque } from '@/ui/entrainement/bibliotheque';
import { CyclesClients } from '@/ui/entrainement/cycles';
import { DetailProgramme } from '@/ui/entrainement/programme';
import { EditeurSeance } from '@/ui/entrainement/seance';
import { couleurs, espace, LARGEUR_COACH, LARGEUR_LG } from '@/ui/theme';

type Onglet = 'crm' | 'airtable' | 'suivis' | 'bilan' | 'hebdo' | 'nutrition';
const TOUS: Onglet[] = ['crm', 'airtable', 'suivis', 'bilan', 'hebdo', 'nutrition'];
/** Quatre onglets : « Clients » regroupe les cycles et les bilans de la semaine ; les séances réalisées sont dans la fiche. */
type OngletVisible = 'crm' | 'clients' | 'nutrition' | 'airtable';
const ONGLETS: OngletDef<OngletVisible>[] = [
  { cle: 'crm', libelle: 'Accueil' },
  { cle: 'clients', libelle: 'Clients' },
  // Ajout demandé par Sylvain (absent de Zite) : recettes, clients suivis et plans alimentaires.
  { cle: 'nutrition', libelle: 'Nutrition' },
  { cle: 'airtable', libelle: 'Programmes' },
];
const SUIVI_CLIENTS: { cle: Onglet; libelle: string }[] = [
  { cle: 'suivis', libelle: 'Cycles en cours' },
  { cle: 'hebdo', libelle: 'Bilans de la semaine' },
];
const visible = (o: Onglet): OngletVisible => (o === 'suivis' || o === 'bilan' || o === 'hebdo' ? 'clients' : o);

type Rubrique = 'Accueil' | 'Contacts' | 'Boosters' | 'Coachings' | 'Bilans' | 'Documents' | 'Taches' | 'Paiements' | 'Automations';
const RUBRIQUES: OngletDef<Rubrique>[] = [
  { cle: 'Accueil', libelle: 'Accueil', icone: LayoutDashboard },
  { cle: 'Contacts', libelle: 'Contacts', icone: Users },
  { cle: 'Boosters', libelle: 'Boosters', icone: CalendarCheck },
  { cle: 'Coachings', libelle: 'Coachings', icone: Activity },
  { cle: 'Bilans', libelle: 'Bilans complets', icone: Activity },
  { cle: 'Documents', libelle: 'Documents', icone: FileText },
  { cle: 'Taches', libelle: 'Tâches', icone: ListTodo },
  { cle: 'Paiements', libelle: 'Paiements', icone: Wallet },
  { cle: 'Automations', libelle: 'Automatisations', icone: Workflow },
];
/**
 * Automatisations, Coachings, Tâches et Bilans restent joignables par leur adresse : les tâches vivent dans « À faire »
 * de l'Accueil, les bilans complets dans le volet Documents de la fiche.
 */
const MENU_RUBRIQUES = RUBRIQUES.filter((r) => !['Automations', 'Coachings', 'Taches', 'Bilans'].includes(r.cle));

const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

export default function EspaceCoach() {
  const { profil, email, deconnecter } = useSession();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ onglet?: string; rubrique?: string; client?: string; programme?: string; seance?: string; apercu?: string } & ParamsDossier>();
  const onglet = TOUS.find((o) => o === params.onglet) ?? 'crm';
  const rubrique = RUBRIQUES.find((r) => r.cle === params.rubrique)?.cle ?? 'Accueil';
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const clients = useCharger(() => depot.clientsDuCoach(coachId), coachId);
  useFocusEffect(clients.recharger);
  useRetourAndroid(params);

  if (profil?.role !== 'coach') return <Redirect href="/" />;

  // L'onglet et la rubrique vivent dans l'adresse : Retour et rechargement gardent le contexte.
  const naviguer = (o: Onglet, r?: Rubrique, dossier?: string) =>
    router.setParams({ onglet: o, rubrique: o === 'crm' ? (r ?? rubrique) : undefined, client: undefined, dossier, programme: undefined, seance: undefined, ...FERME });

  // Depuis les suivis : la fiche du contact devenu client (coordonnées, abonnement, séances).
  const ouvrirFicheClient = async (clientId: string) => {
    const contact = (await crm.contacts()).find((c) => c.clientId === clientId);
    if (contact) router.setParams({ onglet: 'crm', rubrique: 'Contacts', contact: contact.id, volet: undefined, programme: undefined, seance: undefined });
    else router.push({ pathname: '/coach/client/[id]', params: { id: clientId } });
  };

  const enTete = (
    <EnTete
      largeur={LARGEUR_COACH}
      badge="Espace coach"
      email={email ?? (depot.mode === 'demo' ? 'Démonstration, sans compte' : '')}
      droite={
        <>
          {/* « Voir son appli » depuis la fiche : l'appli telle que ce client la voit, et le retour à l'espace coach. */}
          {params.apercu && <CommutateurApercu valeur="client" onChange={() => router.setParams({ apercu: undefined })} />}
          {/* Zite gérait la session hors de l'app : sans ce bouton, impossible de changer de compte. */}
          <BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />
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
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      {enTete}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: espace(4), paddingTop: width <= 640 ? 18.4 : width >= 640 ? 32 : 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: LARGEUR_COACH, alignSelf: 'center' }}>
          {depot.mode === 'demo' && (
            <View style={{ marginBottom: espace(4) }}>
              <BandeauDemo />
            </View>
          )}
          <OngletsCoach onglets={ONGLETS} valeur={visible(onglet)} onChange={(o) => naviguer(o === 'clients' ? 'suivis' : o)} />
          {visible(onglet) === 'clients' && (
            <View style={{ marginBottom: espace(4) }}>
              <Puces>
                {SUIVI_CLIENTS.map((o) => (
                  <Puce key={o.cle} libelle={o.libelle} actif={onglet === o.cle} onPress={() => naviguer(o.cle)} />
                ))}
              </Puces>
            </View>
          )}
          {onglet === 'crm' && (
            <Crm
              rubrique={rubrique}
              params={params}
              large={width >= LARGEUR_LG}
              onRubrique={(r, dossier) => naviguer('crm', r, dossier)}
              onCycles={() => naviguer('suivis')}
            />
          )}
          {onglet === 'airtable' &&
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
              <Bibliotheque coachId={coachId} onOuvrir={(id) => router.setParams({ programme: id })} />
            ))}
          {onglet === 'suivis' && (
            <CyclesClients
              coachId={coachId}
              onOuvrirProgramme={(id) => router.setParams({ onglet: 'airtable', programme: id, seance: undefined })}
              onOuvrirFiche={ouvrirFicheClient}
            />
          )}
          {onglet === 'bilan' && (
            <SeancesRealisees
              coachId={coachId}
              onOuvrirProgramme={(id) => router.setParams({ onglet: 'airtable', programme: id, seance: undefined })}
              onOuvrirSuivis={() => naviguer('suivis')}
            />
          )}
          {onglet === 'hebdo' && <BilansCoach />}
          {onglet === 'nutrition' && (
            <NutritionCoach coachId={coachId} clientId={params.client} onClient={(id) => router.setParams({ onglet: 'nutrition', client: id })} />
          )}
        </View>
      </ScrollView>
    </View>
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
  large,
  onRubrique,
  onCycles,
}: {
  rubrique: Rubrique;
  params: ParamsDossier;
  large: boolean;
  onRubrique: (r: Rubrique, dossier?: string) => void;
  onCycles: () => void;
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
      lienQuestionnaire,
    };
  }, []);
  const vue = useCharger(charger, 'vue-ensemble');
  useFocusEffect(vue.recharger);
  useRechargerSur(vue.recharger, ecouterCrm);
  const titre = RUBRIQUES.find((r) => r.cle === rubrique)!.libelle;

  const ouvrirContact = (id: string, volet?: VoletFiche) => router.setParams({ ...FERME, contact: id, volet });
  const ouvrirBooster = (b: Pick<Booster, 'id' | 'contactId'>) => router.setParams({ booster: b.id, bc: b.contactId });
  const nouveauBooster = (contactId?: string) => router.setParams({ booster: 'nouveau', bc: contactId });
  const volet = VOLETS_FICHE.find((v) => v === params.volet) ?? 'fiche';
  const supprimerGestion = (x: ASupprimer) =>
    setASupprimer({
      quoi: QUOI[x.module],
      nom: x.nom,
      contact: x.contact,
      action: () => (x.module === 'Coachings' ? crm.supprimerCoaching(x.id) : x.module === 'Taches' ? crm.supprimerTache(x.id) : crm.supprimerPaiement(x.id)),
    });

  return (
    <View style={{ flexDirection: large ? 'row' : 'column', gap: 24, alignItems: large ? 'flex-start' : 'stretch' }}>
      <MenuRubriques rubriques={MENU_RUBRIQUES} valeur={rubrique} onChange={(r) => onRubrique(r)} large={large} />
      <View style={{ flex: large ? 1 : undefined, minWidth: 0 }}>
        <EnTeteRubrique
          kicker="Gestion du coaching"
          titre={titre}
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
              onCycles={onCycles}
            />
          ) : (
            !vue.erreur && <Chargement />
          ))}
        {rubrique === 'Contacts' && (
          <Contacts
            onOuvrir={(id) => ouvrirContact(id)}
            onNouveau={() => router.setParams({ ...FERME, contact: 'nouveau' })}
            onPlanifierBooster={(id) => nouveauBooster(id)}
            onRubrique={(r, id) => onRubrique(r, id)}
          />
        )}
        {rubrique === 'Boosters' && (
          <Boosters
            contactId={params.dossier}
            onToutAfficher={() => onRubrique('Boosters')}
            onOuvrir={ouvrirBooster}
            onNouveau={() => nouveauBooster(params.dossier)}
            onSupprimer={(b) => setSuppression({ booster: b, contact: b.contact })}
            onDocuments={(id) => onRubrique('Documents', id)}
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
        {rubrique === 'Automations' && <Automatisations />}
      </View>

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
          id={params.contact === 'nouveau' ? undefined : params.contact}
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
