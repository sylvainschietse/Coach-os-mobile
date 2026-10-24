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
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { depot } from '@/data';
import { crm, ecouterCrm } from '@/data/crm';
import { useSession } from '@/data/session';
import type { Booster, Contact } from '@/domain/crm';
import type { ClientResume } from '@/domain/types';
import { useCharger, useRechargerSur } from '@/lib/useCharger';
import { NutritionCoach } from '@/ui/alimentation/nutrition-coach';
import {
  BandeauDemo,
  BoutonContour,
  BoutonIcone,
  CommutateurApercu,
  EnTete,
  EnTeteRubrique,
  MenuRubriques,
  NonRepris,
  OngletsCoach,
  Vide,
  type OngletDef,
} from '@/ui/coque';
import { Carte, Chargement, Erreur, Pastille, SousTitre, Texte } from '@/ui/composants';
import { Boosters } from '@/ui/crm/boosters';
import { nomComplet } from '@/ui/crm/commun';
import { Contacts } from '@/ui/crm/contacts';
import { Documents, EditeurDocumentModale } from '@/ui/crm/documents';
import { EditeurBoosterModale } from '@/ui/crm/editeur-booster';
import { FicheContactModale, type VoletFiche } from '@/ui/crm/fiche-contact';
import { ConfirmerSuppression } from '@/ui/crm/suppression';
import { VueEnsemble } from '@/ui/crm/vue-ensemble';
import { EspaceClient } from '@/ui/espace-client';
import { Modeles } from '@/ui/programmes/modeles';
import { couleurs, espace, LARGEUR_COACH, LARGEUR_LG } from '@/ui/theme';

type Onglet = 'crm' | 'airtable' | 'suivis' | 'bilan' | 'hebdo' | 'nutrition';
const ONGLETS: OngletDef<Onglet>[] = [
  { cle: 'crm', libelle: 'Tableau de bord' },
  { cle: 'airtable', libelle: 'Programmes' },
  { cle: 'suivis', libelle: 'Cycles clients' },
  { cle: 'bilan', libelle: 'Séances réalisées' },
  { cle: 'hebdo', libelle: 'Bilans hebdo' },
  // Ajout demandé par Sylvain (absent de Zite) : recettes, clients suivis et plans alimentaires.
  { cle: 'nutrition', libelle: 'Nutrition' },
];

type Rubrique = 'Accueil' | 'Contacts' | 'Boosters' | 'Coachings' | 'Bilans' | 'Documents' | 'Taches' | 'Paiements' | 'Automations';
const RUBRIQUES: OngletDef<Rubrique>[] = [
  { cle: 'Accueil', libelle: 'Vue d’ensemble', icone: LayoutDashboard },
  { cle: 'Contacts', libelle: 'Contacts', icone: Users },
  { cle: 'Boosters', libelle: 'Boosters', icone: CalendarCheck },
  { cle: 'Coachings', libelle: 'Coachings', icone: Activity },
  { cle: 'Bilans', libelle: 'Bilans', icone: Activity },
  { cle: 'Documents', libelle: 'Documents', icone: FileText },
  { cle: 'Taches', libelle: 'Tâches', icone: ListTodo },
  { cle: 'Paiements', libelle: 'Paiements', icone: Wallet },
  { cle: 'Automations', libelle: 'Automatisations', icone: Workflow },
];
const LOT: Partial<Record<Rubrique, number>> = { Coachings: 2, Bilans: 4, Taches: 2, Paiements: 2, Automations: 6 };

const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const quand = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

export default function EspaceCoach() {
  const { profil, email, deconnecter } = useSession();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ onglet?: string; rubrique?: string; client?: string } & ParamsDossier>();
  const onglet = ONGLETS.find((o) => o.cle === params.onglet)?.cle ?? 'crm';
  const rubrique = RUBRIQUES.find((r) => r.cle === params.rubrique)?.cle ?? 'Accueil';
  const [apercu, setApercu] = useState<'coach' | 'client'>('coach');
  const [apercuClient, setApercuClient] = useState<string>();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const clients = useCharger(() => depot.clientsDuCoach(coachId), coachId);
  useFocusEffect(clients.recharger);

  if (profil?.role !== 'coach') return <Redirect href="/" />;

  // L'onglet et la rubrique vivent dans l'adresse : Retour et rechargement gardent le contexte.
  const naviguer = (o: Onglet, r?: Rubrique, dossier?: string) =>
    router.setParams({ onglet: o, rubrique: o === 'crm' ? (r ?? rubrique) : undefined, client: undefined, dossier, ...FERME });
  const ouvrirClient = (c: ClientResume) => router.push({ pathname: '/coach/client/[id]', params: { id: c.id, prenom: c.prenom } });

  const enTete = (
    <EnTete
      largeur={LARGEUR_COACH}
      badge="Espace coach"
      email={email ?? (depot.mode === 'demo' ? 'Démonstration, sans compte' : '')}
      droite={
        <>
          <CommutateurApercu valeur={apercu} onChange={setApercu} />
          {/* Zite gérait la session hors de l'app : sans ce bouton, impossible de changer de compte. */}
          <BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />
        </>
      }
    />
  );

  if (apercu === 'client') {
    const liste = clients.donnee ?? [];
    const choisi = liste.find((c) => c.id === apercuClient) ?? liste[0];
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        {enTete}
        {clients.erreur && <Erreur message={clients.erreur} />}
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
            apercu={{ clients: liste.map((c) => ({ id: c.id, prenom: `${c.prenom} ${c.nom}`.trim() })), onChoisir: setApercuClient }}
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
          <OngletsCoach onglets={ONGLETS} valeur={onglet} onChange={(o) => naviguer(o)} />
          {onglet === 'crm' && (
            <Crm
              rubrique={rubrique}
              params={params}
              large={width >= LARGEUR_LG}
              onRubrique={(r, dossier) => naviguer('crm', r, dossier)}
              onCycles={() => naviguer('suivis')}
            />
          )}
          {onglet === 'airtable' && (
            <Modeles coachId={coachId} />
          )}
          {onglet === 'suivis' && (
            <View style={{ gap: espace(3) }}>
              <EnTeteRubrique kicker="Suivi des clients" titre="Cycles clients" sousTitre="Planification des cycles : lot 3. En attendant, chaque dossier ouvre le suivi existant." />
              {clients.erreur && <Erreur message={clients.erreur} />}
              {!clients.donnee && !clients.erreur && <Chargement />}
              {clients.donnee?.length === 0 && <Vide titre="Aucun client" texte="Un contact devient client depuis sa fiche." />}
              {clients.donnee?.map((c) => (
                <Pressable key={c.id} onPress={() => ouvrirClient(c)}>
                  <Carte>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2) }}>
                      <SousTitre>
                        {c.prenom} {c.nom}
                      </SousTitre>
                      {c.derniereSeance && <Pastille libelle={quand(c.derniereSeance.fin)} couleur={couleurs.vert} />}
                    </View>
                    <Texte doux style={{ fontSize: 14 }}>
                      {c.derniereSeance ? `Dernière séance : ${c.derniereSeance.titre}` : 'Pas encore de séance réalisée'}
                    </Texte>
                  </Carte>
                </Pressable>
              ))}
            </View>
          )}
          {onglet === 'bilan' && <NonRepris ecran="Séances réalisées" lot={3} detail="Les séances de chaque client restent visibles dans Cycles clients." />}
          {onglet === 'hebdo' && <NonRepris ecran="Bilans hebdo" lot={4} />}
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
type ParamsDossier = { contact?: string; volet?: string; booster?: string; bc?: string; dossier?: string; doc?: string };
const FERME = { contact: undefined, volet: undefined, booster: undefined, bc: undefined, doc: undefined };

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
  const charger = useCallback(async () => {
    const [contacts, journee, boosters] = await Promise.all([crm.contacts(), crm.journee(), crm.boosters()]);
    setMaj(new Date());
    return { contacts, relances: journee.relances, boosters };
  }, []);
  const vue = useCharger(charger, 'vue-ensemble');
  useFocusEffect(vue.recharger);
  useRechargerSur(vue.recharger, ecouterCrm);
  const titre = RUBRIQUES.find((r) => r.cle === rubrique)!.libelle;

  const ouvrirContact = (id: string, volet?: VoletFiche) => router.setParams({ ...FERME, contact: id, volet });
  const ouvrirBooster = (b: Pick<Booster, 'id' | 'contactId'>) => router.setParams({ booster: b.id, bc: b.contactId });
  const nouveauBooster = (contactId?: string) => router.setParams({ booster: 'nouveau', bc: contactId });
  const volet = (['fiche', 'boosters', 'nutrition', 'photos'] as const).find((v) => v === params.volet) ?? 'fiche';

  return (
    <View style={{ flexDirection: large ? 'row' : 'column', gap: 24, alignItems: large ? 'flex-start' : 'stretch' }}>
      <MenuRubriques rubriques={RUBRIQUES} valeur={rubrique} onChange={(r) => onRubrique(r)} large={large} />
      <View style={{ flex: large ? 1 : undefined, minWidth: 0 }}>
        <EnTeteRubrique
          kicker="Gestion du coaching"
          titre={titre}
          sousTitre={`Dernière actualisation · ${heure(maj)}`}
          action={<BoutonContour libelle="Actualiser" icone={RefreshCw} iconeAGauche onPress={vue.recharger} />}
        />
        {vue.erreur && (
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
              onOuvrirContact={ouvrirContact}
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
        {LOT[rubrique] && <NonRepris ecran={titre} lot={LOT[rubrique]!} />}
      </View>

      {params.doc ? (
        <EditeurDocumentModale
          key={params.doc}
          id={params.doc === 'nouveau' ? undefined : params.doc}
          contactId={params.dossier}
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
        />
      ) : null}
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
