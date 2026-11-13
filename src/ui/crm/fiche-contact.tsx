// C03 — Fiche Contact reprise de RecordEditor (table Contacts) et ContactBoosters.tsx :
// modale `max-w-3xl`, initiales + coordonnées + statut, grille deux colonnes, pied collant (état du dossier, Fermer, Enregistrer).
// Fiche unique de la personne : Coordonnées, Abonnement et paiements (une fois cliente), Boosters, puis, une fois cliente, Programme, Suivi et Nutrition ; Documents
// (bilans complets compris) pour tous.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { useSession } from '@/data/session';
import {
  formaterTelephone,
  normaliserEmail,
  normaliserTelephone,
  OBJECTIFS,
  ORIGINES,
  PROCHAINES_ACTIONS,
  statutBooster,
  statutContact,
  STATUTS_CONTACT_PROPOSES,
  type Booster,
  type Contact,
  type Doublon,
  type FicheContact as Fiche,
  type SaisieContactFiche,
  type StatutContact,
} from '@/domain/crm';
import { ENTRETIEN, TESTS } from '@/domain/evaluation';
import { formaterMesure, lireMesure, TESTS_GOLF } from '@/domain/tests-golf';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { NutritionDuClient } from '../alimentation/nutrition-coach';
import { BoutonContour, SousNav, type OngletDef } from '../coque';
import { AbonnementClient } from '../abonnement';
import { FacturesClient } from '../factures';
import { ProgrammeClient } from '../fiche-client';
import { SuiviCoach } from '../suivi/suivi-coach';
import { Bilans } from './bilans';
import { Documents } from './documents';
import { Chargement, Erreur } from '../composants';
import { Confirmation } from '../entrainement/commun';
import { Conversation } from '../messagerie/conversation';
import { couleurs, espace, polices } from '../theme';
import { nomComplet } from './commun';
import { ParcoursContact } from './parcours';
import { ReponsesQuestionnaire } from './reponses-questionnaire';
import { Cellule, Choix, Grille, Initiales, Modale, PiedEditeur, Repliable, Saisie, Valeur } from './dossier';

export type VoletFiche = 'fiche' | 'paiements' | 'messages' | 'boosters' | 'programme' | 'suivi' | 'nutrition' | 'documents';
export const VOLETS_FICHE: VoletFiche[] = ['fiche', 'paiements', 'messages', 'boosters', 'programme', 'suivi', 'nutrition', 'documents'];
/**
 * Un client : son suivi d'abord, puis programme, nutrition, échanges (messages, bilans et documents), abonnement, et
 * ses coordonnées (avec ses Boosters) en dernier. Un prospect n'a pas encore d'espace client : coordonnées, Boosters, documents.
 */
const VOLETS_CLIENT: OngletDef<VoletFiche>[] = [
  { cle: 'suivi', libelle: 'Suivi' },
  { cle: 'programme', libelle: 'Programme' },
  { cle: 'nutrition', libelle: 'Nutrition' },
  { cle: 'messages', libelle: 'Échanges' },
  { cle: 'paiements', libelle: 'Abonnement' },
  { cle: 'fiche', libelle: 'Coordonnées' },
];
const VOLETS_PROSPECT: OngletDef<VoletFiche>[] = [
  { cle: 'fiche', libelle: 'Coordonnées' },
  { cle: 'boosters', libelle: 'Boosters' },
  { cle: 'documents', libelle: 'Documents' },
];

/** Le volet à montrer : par défaut le suivi d'un client, les coordonnées d'un prospect ; les anciens liens retombent sur le bon volet. */
export function voletAffiche(volet: VoletFiche | undefined, client: boolean): VoletFiche {
  if (!client) return volet && VOLETS_PROSPECT.some((v) => v.cle === volet) ? volet : 'fiche';
  if (volet === 'documents') return 'messages';
  if (volet === 'boosters') return 'fiche';
  return volet ?? 'suivi';
}

type Brouillon = Record<keyof Required<SaisieContactFiche>, string>;
const CLES: (keyof Brouillon)[] = [
  'nom',
  'prenom',
  'telephone',
  'email',
  'adresse',
  'statutCrm',
  'objectifPrincipal',
  'prochaineAction',
  'notes',
  'source',
  'offreVendue',
  'dateNaissance',
];

function brouillonDe(c?: Contact, statutDefaut: StatutContact = 'Nouveau Prospect'): Brouillon {
  return {
    nom: c?.nom ?? '',
    prenom: c?.prenom ?? '',
    telephone: formaterTelephone(c?.telephone),
    email: c?.email ?? '',
    adresse: c?.adresse ?? '',
    statutCrm: c ? statutContact(c) : statutDefaut,
    objectifPrincipal: c?.objectifPrincipal ?? '',
    prochaineAction: c?.prochaineAction ?? '',
    notes: c?.notes ?? '',
    source: c?.source ?? '',
    offreVendue: c?.offreVendue ?? '',
    dateNaissance: c?.dateNaissance ?? '',
  };
}

export function FicheContactModale({
  id,
  volet,
  onVolet,
  onFermer,
  onOuvrirAutre,
  onBooster,
  onNouveauBooster,
  onSupprimerBooster,
  nouveauClient,
  ...autres
}: {
  /** Absent : création d'un contact. */
  id?: string;
  /** Création d'un client qui commence directement (sans Booster) : statut « Client actif » d'emblée. */
  nouveauClient?: boolean;
  /** Absent : le volet par défaut (le suivi d'un client, les coordonnées d'un prospect). */
  volet?: VoletFiche;
  onVolet: (v: VoletFiche) => void;
  onFermer: () => void;
  /** Doublon trouvé à la création : ouvrir la fiche existante au lieu d'en créer une seconde. */
  onOuvrirAutre: (id: string) => void;
  onBooster: (b: Booster) => void;
  onNouveauBooster: (contactId: string) => void;
  onSupprimerBooster: (b: Booster, contact: Contact) => void;
} & ActionsFiche) {
  const charge = useCharger(() => (id ? crm.fiche(id) : Promise.resolve(null)), `fiche-${id ?? 'nouveau'}`);
  useRechargerSur(charge.recharger, ecouterCrm);
  const fiche = charge.donnee;

  if (id && !fiche)
    return (
      <Modale titre="Fiche client" onFermer={onFermer}>
        {charge.erreur ? <Erreur message={charge.erreur} onReessayer={charge.recharger} /> : <Chargement />}
      </Modale>
    );
  return (
    <Editeur
      key={fiche ? `${fiche.contact.id}` : 'nouveau'}
      fiche={fiche ?? undefined}
      volet={id ? voletAffiche(volet, !!fiche?.contact.clientId) : 'fiche'}
      onVolet={onVolet}
      onFermer={onFermer}
      onOuvrirAutre={onOuvrirAutre}
      onBooster={onBooster}
      onNouveauBooster={onNouveauBooster}
      onSupprimerBooster={onSupprimerBooster}
      nouveauClient={!id && nouveauClient}
      {...autres}
    />
  );
}

/** Ce que la fiche ouvre au-dessus d'elle : documents, bilans complets, et l'appli telle que le client la voit. */
export interface ActionsFiche {
  onDocument: (id: string | 'nouveau') => void;
  onBilan: (id: string | 'nouveau') => void;
  onSupprimerBilan: (x: { id: string; nom: string; contact?: string }) => void;
  onVoirAppli: (clientId: string) => void;
}

function Editeur({
  fiche,
  volet,
  onVolet,
  onFermer,
  onOuvrirAutre,
  onBooster,
  onNouveauBooster,
  onSupprimerBooster,
  onDocument,
  onBilan,
  onSupprimerBilan,
  onVoirAppli,
  nouveauClient,
}: {
  fiche?: Fiche;
  nouveauClient?: boolean;
  volet: VoletFiche;
  onVolet: (v: VoletFiche) => void;
  onFermer: () => void;
  onOuvrirAutre: (id: string) => void;
  onBooster: (b: Booster) => void;
  onNouveauBooster: (contactId: string) => void;
  onSupprimerBooster: (b: Booster, contact: Contact) => void;
} & ActionsFiche) {
  const contact = fiche?.contact;
  const { profil } = useSession();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const volets = contact?.clientId ? VOLETS_CLIENT : VOLETS_PROSPECT;
  const [initial, setInitial] = useState(() => brouillonDe(contact, nouveauClient ? 'Client actif' : undefined));
  const [brouillon, setBrouillon] = useState(initial);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [doublon, setDoublon] = useState<Doublon>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const [versionAbo, setVersionAbo] = useState(0);
  const modifies = CLES.filter((k) => brouillon[k] !== initial[k]);
  const modifie = modifies.length > 0;
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());
  const set = (k: keyof Brouillon) => (v: string | undefined) => setBrouillon((b) => ({ ...b, [k]: v ?? '' }));

  const telInvalide = !!brouillon.telephone.trim() && !normaliserTelephone(brouillon.telephone);
  const emailInvalide = !!brouillon.email.trim() && !normaliserEmail(brouillon.email);
  const coordonneeManquante = !normaliserTelephone(brouillon.telephone) && !normaliserEmail(brouillon.email);
  const peutEnregistrer =
    volet === 'fiche' && !occupe && !telInvalide && !emailInvalide && !coordonneeManquante && !!brouillon.prenom.trim() && (!contact || modifie);

  async function enregistrer() {
    setOccupe(true);
    setErreur(undefined);
    setDoublon(undefined);
    try {
      if (!contact) {
        const r = await crm.creerContact({
          ...versSaisie(brouillon, CLES, undefined),
          prenom: brouillon.prenom,
        });
        if ('doublon' in r) {
          setDoublon(r.doublon);
          return;
        }
        // Client direct : sa fiche s'ouvre pour choisir tout de suite son offre ou son pack (carte Abonnement).
        if (nouveauClient) onOuvrirAutre(r.contact.id);
        else onFermer();
        return;
      }
      await crm.modifierContact(contact.id, versSaisie(brouillon, modifies, contact));
      // Relu depuis la base par l'écouteur : le pied repasse à « Dossier à jour ».
      setInitial(brouillon);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
    } finally {
      setOccupe(false);
    }
  }

  const titre = contact ? nomComplet(contact) : nouveauClient ? 'Nouveau client' : 'Créer · Contacts';
  return (
    <Modale
      titre={titre}
      onFermer={() => demanderSortie(onFermer)}
      enTete={
        contact && (
          <>
            <View style={styles.identite}>
              <Initiales prenom={contact.prenom} nom={contact.nom} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text style={styles.coordonnees}>
                  {contact.email || 'Email à compléter'}
                  {contact.telephone ? ` · ${formaterTelephone(contact.telephone)}` : ''}
                </Text>
                <Text style={styles.statut}>
                  {statutContact(contact)}
                  {contact.statut === 'archive' ? ' · Archivé' : ''}
                </Text>
              </View>
            </View>
            <SousNav
              nom="Rubriques de la fiche client"
              onglets={volets}
              valeur={volet}
              onChange={(v) =>
                v !== volet &&
                demanderSortie(() => {
                  setBrouillon(initial);
                  onVolet(v);
                })
              }
            />
          </>
        )
      }
      pied={
        <View style={{ gap: espace(3) }}>
          {doublon && (
            <View style={styles.alerte}>
              <Text style={styles.alerteTexte}>
                {doublon.par === 'telephone' ? 'Ce numéro' : 'Cet e-mail'} est déjà celui de {nomComplet(doublon.contact)}
                {doublon.contact.statut === 'archive' ? ' (dossier archivé)' : ''}. Aucune nouvelle fiche n’a été créée.
              </Text>
              <BoutonContour
                libelle={`Ouvrir la fiche de ${doublon.contact.prenom || 'ce contact'}`}
                onPress={() => onOuvrirAutre(doublon.contact.id)}
              />
            </View>
          )}
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          <PiedEditeur
            modifie={modifie}
            enregistrement={occupe}
            peutEnregistrer={peutEnregistrer}
            onEnregistrer={enregistrer}
            onFermer={() => (sortie ? sortie() : demanderSortie(onFermer))}
            sortieDemandee={!!sortie}
            onRester={() => setSortie(null)}
          />
        </View>
      }
    >
      {volet === 'fiche' && contact && contact.statutCrm === 'Client actif' && contact.statut !== 'client' && (
        <ClientAConfirmer contactId={contact.id} prenom={contact.prenom} />
      )}
      {/* Le parcours d'abord : questionnaire, Booster, accès à l'appli, chacun avec son bouton. */}
      {volet === 'fiche' && fiche && (
        <ParcoursContact
          fiche={fiche}
          versionAbo={versionAbo}
          onPlanifierBooster={() => onNouveauBooster(fiche.contact.id)}
          onOuvrirBooster={onBooster}
          onVoirAppli={onVoirAppli}
        />
      )}
      {volet === 'fiche' && (
        <Coordonnees
          brouillon={brouillon}
          set={set}
          telInvalide={telInvalide}
          emailInvalide={emailInvalide}
          coordonneeManquante={coordonneeManquante && (!!contact || modifie)}
        />
      )}
      {volet === 'fiche' && contact?.statut === 'client' && <PasserEnVeille contactId={contact.id} prenom={contact.prenom} />}
      {/* Abonnement, packs et factures ont leur rubrique : « Coordonnées » reste court. */}
      {volet === 'paiements' && contact?.clientId && (
        <View>
          <AbonnementClient clientId={contact.clientId} prenom={contact.prenom} onChange={() => setVersionAbo((v) => v + 1)} />
          <View style={{ marginTop: espace(4) }}>
            <FacturesClient
              clientId={contact.clientId}
              prenom={contact.prenom}
              nom={contact.nom}
              envoi={{ contactId: contact.id, prenom: contact.prenom, telephone: contact.telephone, email: contact.email }}
            />
          </View>
        </View>
      )}
      {(volet === 'boosters' || (volet === 'fiche' && !!contact?.clientId)) && fiche && (
        <BoostersDuContact
          fiche={fiche}
          onBooster={onBooster}
          onNouveau={() => onNouveauBooster(fiche.contact.id)}
          onSupprimer={(b) => onSupprimerBooster(b, fiche.contact)}
        />
      )}
      {volet === 'programme' && contact?.clientId && <ProgrammeClient key={contact.clientId} clientId={contact.clientId} coachId={coachId} />}
      {volet === 'suivi' && contact?.clientId && <SuiviCoach key={contact.clientId} clientId={contact.clientId} prenom={contact.prenom} />}
      {volet === 'messages' && contact?.clientId && (
        <View style={{ marginTop: espace(4) }}>
          <Conversation key={contact.clientId} clientId={contact.clientId} moi="coach" nomAutre={contact.prenom} />
        </View>
      )}
      {/* Échanges : la conversation, puis les bilans complets et les documents partagés avec le client. */}
      {volet === 'nutrition' && contact && <NutritionContact contact={contact} />}
      {(volet === 'documents' || (volet === 'messages' && !!contact?.clientId)) && contact && (
        <View style={{ marginTop: espace(4), gap: espace(6) }}>
          <Bilans contactId={contact.id} onOuvrir={onBilan} onNouveau={() => onBilan('nouveau')} onSupprimer={onSupprimerBilan} />
          <Documents contactId={contact.id} onOuvrir={onDocument} onNouveau={() => onDocument('nouveau')} />
        </View>
      )}
    </Modale>
  );
}

/**
 * Dossiers marqués « Client actif » avant que ce statut ouvre la fiche client : ils n'étaient ni dans Clients actifs ni
 * proposés pour un rendez-vous. Un appui les y ajoute.
 */
function ClientAConfirmer({ contactId, prenom }: { contactId: string; prenom: string }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  async function confirmer() {
    setOccupe(true);
    setErreur(undefined);
    try {
      await crm.devenirClient(contactId);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout non confirmé');
    } finally {
      setOccupe(false);
    }
  }
  return (
    <View style={[styles.alerte, { marginTop: espace(4) }]}>
      <Text style={styles.alerteTexte}>
        {prenom || 'Ce contact'} est marqué « Client actif » mais n’est pas encore dans tes clients actifs : tu ne peux pas encore l’ajouter à un rendez-vous.
      </Text>
      <BoutonContour libelle={occupe ? 'Ajout…' : 'Ajouter à mes clients actifs'} onPress={confirmer} desactive={occupe} />
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
    </View>
  );
}

/** Client qui n'a finalement rien pris : il quitte les clients actifs et va dans Prospects › En veille. */
function PasserEnVeille({ contactId, prenom }: { contactId: string; prenom: string }) {
  const [confirmer, setConfirmer] = useState(false);
  const nom = prenom || 'Ce client';
  return (
    <View style={[styles.veille, { marginTop: espace(4) }]}>
      <Text style={styles.veilleTitre}>{nom} n’a finalement rien pris ?</Text>
      <Text style={styles.alerteTexte}>
        En veille, la fiche quitte tes clients actifs et va dans Prospects › En veille. Pour seulement retirer ses programmes, utilise « Arrêter le suivi » dans Clients actifs.
      </Text>
      <BoutonContour libelle="Passer en veille" onPress={() => setConfirmer(true)} />
      {confirmer && (
        <Confirmation
          titre={`Passer ${nom} en veille ?`}
          texte={`${nom} n’aura plus accès à l’appli et sortira de tes clients actifs. L’historique reste sur la fiche. Tu pourras revenir à « Client actif » depuis le statut.`}
          action="Passer en veille"
          onConfirmer={() => crm.passerEnVeille(contactId)}
          onFermer={() => setConfirmer(false)}
        />
      )}
    </View>
  );
}

/** Seuls les champs modifiés partent ; le statut égal à l'étape du parcours redevient automatique. */
function versSaisie(b: Brouillon, cles: (keyof Brouillon)[], contact: Contact | undefined): SaisieContactFiche {
  const saisie: SaisieContactFiche = {};
  for (const k of cles) {
    if (k === 'statutCrm') {
      const etape = contact ? statutContact({ ...contact, statutCrm: undefined }) : 'Nouveau Prospect';
      saisie.statutCrm = b.statutCrm && b.statutCrm !== etape ? (b.statutCrm as StatutContact) : undefined;
    } else saisie[k] = b[k];
  }
  return saisie;
}

function Coordonnees({
  brouillon: b,
  set,
  telInvalide,
  emailInvalide,
  coordonneeManquante,
}: {
  brouillon: Brouillon;
  set: (k: keyof Brouillon) => (v: string | undefined) => void;
  telInvalide: boolean;
  emailInvalide: boolean;
  coordonneeManquante: boolean;
}) {
  return (
    <Grille>
      <Cellule>
        <Saisie libelle="Nom" valeur={b.nom} onChange={set('nom')} />
      </Cellule>
      <Cellule>
        <Saisie libelle="Prénom" valeur={b.prenom} onChange={set('prenom')} erreur={!b.prenom.trim() ? 'Le prénom est nécessaire.' : undefined} />
      </Cellule>
      <Cellule>
        <Saisie
          libelle="Téléphone"
          type="telephone"
          valeur={b.telephone}
          onChange={set('telephone')}
          placeholder="06 12 34 56 78"
          erreur={telInvalide ? 'Numéro non reconnu' : coordonneeManquante ? 'Un téléphone ou un e-mail suffit.' : undefined}
        />
      </Cellule>
      <Cellule>
        <Saisie libelle="Email" type="email" valeur={b.email} onChange={set('email')} erreur={emailInvalide ? 'Adresse non reconnue' : undefined} />
      </Cellule>
      <Cellule>
        <Saisie libelle="Adresse postale" long valeur={b.adresse} onChange={set('adresse')} placeholder={'N° et rue\nCode postal et ville'} aide="Elle figurera sur ses factures." />
      </Cellule>
      <Cellule>
        <Choix libelle="Statut" choix={STATUTS_CONTACT_PROPOSES} vide={null} valeur={b.statutCrm} onChange={set('statutCrm')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Objectif principal" choix={OBJECTIFS} valeur={b.objectifPrincipal || undefined} onChange={set('objectifPrincipal')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Prochaine action" choix={PROCHAINES_ACTIONS} valeur={b.prochaineAction || undefined} onChange={set('prochaineAction')} />
      </Cellule>
      <Cellule pleine>
        <Saisie libelle="Notes" long valeur={b.notes} onChange={set('notes')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Origine" choix={ORIGINES} valeur={b.source || undefined} onChange={set('source')} />
      </Cellule>
      <Cellule>
        <Saisie libelle="Date de naissance" valeur={b.dateNaissance} onChange={set('dateNaissance')} placeholder="jj/mm/aaaa" />
      </Cellule>
    </Grille>
  );
}

const dateBooster = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const jour = (j: string | undefined) =>
  j
    ? new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : undefined;

function BoostersDuContact({
  fiche,
  onBooster,
  onNouveau,
  onSupprimer,
}: {
  fiche: Fiche;
  onBooster: (b: Booster) => void;
  onNouveau: () => void;
  onSupprimer: (b: Booster) => void;
}) {
  const { boosters, questionnaires } = fiche;
  return (
    <View style={styles.encadre}>
      <Text style={styles.encadreTitre}>Questionnaire et Boosters</Text>
      <Text style={styles.aide}>
        Retrouvez ici les informations enregistrées dans les Boosters de ce client : briefing issu du questionnaire, entretien, tests et conclusion.
      </Text>
      {questionnaires.map((q, i) => (
        <View key={q.id} style={styles.bloc}>
          <Repliable
            ouvert={i === 0 && !boosters.length}
            resume={`Questionnaire reçu le ${new Date(q.recuLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}${q.alertes.length ? ' · à vérifier' : ''}`}
          >
            <ReponsesQuestionnaire questionnaire={q} />
          </Repliable>
        </View>
      ))}
      {!boosters.length && (
        <Text style={styles.aide}>Aucun Booster pour l’instant.</Text>
      )}
      {boosters.map((b, i) => (
        <View key={b.id} style={styles.bloc}>
          <Repliable ouvert={i === 0} resume={`${b.nom || 'Booster'} · ${dateBooster(b.date)} · ${statutBooster(b)}`}>
            <LectureBooster booster={b} />
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: espace(2),
                marginTop: espace(5),
              }}
            >
              <BoutonContour libelle="Modifier ce Booster" onPress={() => onBooster(b)} />
              {b.statut === 'fait' && (
                <BoutonContour
                  libelle="Voir le compte rendu"
                  onPress={() =>
                    router.push({
                      pathname: '/coach/compte-rendu/[id]',
                      params: { id: b.id, contact: b.contactId },
                    })
                  }
                />
              )}
              <Text accessibilityRole="button" onPress={() => onSupprimer(b)} style={styles.supprimer}>
                Supprimer ce Booster
              </Text>
            </View>
          </Repliable>
        </View>
      ))}
      <View style={{ alignSelf: 'flex-start' }}>
        <BoutonContour libelle="Planifier un Booster" onPress={onNouveau} />
      </View>
    </View>
  );
}

/** Lecture d'un Booster dans la fiche : quatre sections d'origine, « Non renseigné » pour l'absence. */
export function LectureBooster({ booster: b }: { booster: Booster }) {
  const e = b.evaluation;
  const sections: {
    titre: string;
    valeurs: { libelle: string; valeur?: string; long?: boolean }[];
  }[] = [
    {
      titre: 'Questionnaire et briefing',
      valeurs: [
        { libelle: 'Résumé IA', valeur: b.resumeIa, long: true },
        {
          libelle: 'Points d’attention',
          valeur: b.pointsAttention,
          long: true,
        },
      ],
    },
    {
      titre: 'Entretien',
      valeurs: ENTRETIEN.map((q) => ({
        libelle: q.libelle,
        valeur: b.entretien?.[q.id],
        long: true,
      })),
    },
    {
      titre: 'Tests physiques',
      valeurs: [
        ...TESTS.flatMap((t) => [
          { libelle: t.libelle, valeur: e?.tests[t.id]?.resultat },
          {
            libelle: `${t.libelle} — observations`,
            valeur: e?.tests[t.id]?.observations.join(' · '),
          },
          ...(e?.tests[t.id]?.mesures?.length
            ? [{ libelle: `${t.libelle} — mesures vidéo`, valeur: e.tests[t.id]!.mesures!.map((m) => `${m.libelle} ${m.angle}°`).join(' · ') }]
            : []),
          ...(t.rpe
            ? [
                {
                  libelle: `${t.libelle} — RPE /10`,
                  valeur: e?.tests[t.id]?.rpe ? String(e.tests[t.id]!.rpe) : undefined,
                },
              ]
            : []),
        ]),
        { libelle: 'Douleur pendant les tests', valeur: e?.douleur },
        { libelle: 'Douleur / gêne — précision', valeur: e?.douleurPrecision },
        { libelle: 'Observations tests', valeur: e?.notes, long: true },
        ...(e?.golf?.actif
          ? TESTS_GOLF.map((t) => ({
              libelle: `Golf · ${t.libelle}`,
              valeur:
                t.champs
                  .flatMap((c) => {
                    const n = lireMesure(e.golf!.mesures[t.id]?.[c.cle]);
                    return n === undefined ? [] : [`${c.libelle} ${formaterMesure(n, c.unite)}`];
                  })
                  .join(' · ') || undefined,
            }))
          : []),
      ],
    },
    {
      titre: 'Priorités et conclusion',
      valeurs: [
        ...[0, 1, 2].map((i) => ({
          libelle: `Priorité ${i + 1}`,
          valeur: b.priorites[i],
        })),
        { libelle: 'Offre recommandée', valeur: b.offreRecommandee },
        { libelle: 'Résultat commercial', valeur: b.resultatCommercial },
        { libelle: 'Date de relance', valeur: jour(b.dateRelance) },
        {
          libelle: 'Plan d’action envoyé',
          valeur: b.planEnvoyeLe ? 'Oui' : 'Non',
        },
        { libelle: 'Notes internes', valeur: b.notesInternes, long: true },
      ],
    },
  ];
  return (
    <View style={{ gap: espace(5) }}>
      {sections.map((s) => (
        <View key={s.titre} style={{ gap: espace(2) }}>
          <Text style={styles.section}>{s.titre}</Text>
          <Grille>
            {s.valeurs.map((v) => (
              <Cellule key={v.libelle} pleine={v.long}>
                <Valeur libelle={v.libelle} valeur={v.valeur} />
              </Cellule>
            ))}
          </Grille>
        </View>
      ))}
    </View>
  );
}

function NutritionContact({ contact }: { contact: Contact }) {
  const { profil } = useSession();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  if (!contact.clientId)
    return (
      <Text style={styles.aide}>
        {contact.prenom || 'Ce contact'} n’a pas encore d’espace client. Crée son accès à l’appli dans « Coordonnées » (étape 3 du parcours) pour
        suivre sa nutrition.
      </Text>
    );
  return <NutritionDuClient clientId={contact.clientId} coachId={coachId} />;
}

const styles = StyleSheet.create({
  identite: { flexDirection: 'row', alignItems: 'center', gap: espace(3) },
  coordonnees: {
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texteDoux,
  },
  statut: {
    marginTop: 4,
    fontFamily: polices.texte,
    fontSize: 12,
    color: couleurs.rouge,
  },
  encadre: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 12,
    padding: 16,
    gap: espace(3),
  },
  encadreTitre: {
    fontFamily: polices.texteGras,
    fontSize: 16,
    color: couleurs.texte,
  },
  bloc: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 8,
    padding: 12,
  },
  section: {
    fontFamily: polices.texteGras,
    fontSize: 14,
    color: couleurs.rouge,
  },
  aide: {
    fontFamily: polices.texte,
    fontSize: 12,
    lineHeight: 18,
    color: couleurs.texteDoux,
  },
  supprimer: {
    minHeight: 44,
    paddingHorizontal: 12,
    textAlignVertical: 'center',
    lineHeight: 44,
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.rouge,
  },
  alerte: {
    backgroundColor: couleurs.orangeClair,
    borderRadius: 10,
    padding: espace(3),
    gap: espace(2),
  },
  alerteTexte: {
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texte,
  },
  erreur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
  veille: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, padding: espace(3), gap: espace(2), backgroundColor: couleurs.carte },
  veilleTitre: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
});
