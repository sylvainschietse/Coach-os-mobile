// Rubriques Coachings, Tâches et Paiements reprises de CRMWorkspace.tsx (liste filtrable, cartes, RecordEditor) :
// recherche, filtre de statut, « Inclure les dossiers archivés », filtre « Dossier : X », Ouvrir et Supprimer.
import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { abonnements } from '@/data/abonnements';
import { crm, ecouterCrm } from '@/data/crm';
import { factures } from '@/data/factures';
import { ecrireJour, jourLocal, lireJour, MODELES, rediger, type Carnet, type Contact, type Relance } from '@/domain/crm';
import {
  FORMULES,
  ecrireSeances,
  estJourMois,
  jourMois,
  lireSeances,
  moisDe,
  moisLisible,
  nombreSeances,
  titreSeances,
  totalSeances,
  type GroupeSeances,
  montantLisible,
  MOYENS_PAIEMENT,
  parClient,
  PRIORITES_TACHE,
  statutTache,
  STATUTS_COACHING,
  STATUTS_PAIEMENT,
  STATUTS_TACHE,
  tacheOuverte,
  type Formule,
  type MoyenPaiement,
  type PrioriteTache,
  type StatutCoaching,
  type StatutPaiement,
  type StatutTache,
} from '@/domain/gestion';
import type { Facture } from '@/domain/factures';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Selecteur, Vide } from '../coque';
import { Chargement, Erreur } from '../composants';
import { BoutonFacture, BoutonToutesFactures, FactureDeLaFiche } from '../factures';
import { couleurs, espace, polices } from '../theme';
import { adresseQuestionnaire, EnvoiMessage, nomComplet, useCoachNom } from './commun';
import { BoutonPrincipal, carteDossier } from './contacts';
import { Badge, BoutonPied, CaseACocher, Cellule, Choix, Grille, Libelle, Modale, PiedEditeur, Recherche, Saisie, useBlocNomCarte } from './dossier';

export type ModuleGestion = 'Coachings' | 'Taches' | 'Paiements';
export type ASupprimer = { module: ModuleGestion; id: string; nom: string; contact?: string };

const NOUVEAU: Record<ModuleGestion, string> = { Coachings: 'Nouveau coaching', Taches: 'Nouvelle tâche', Paiements: 'Nouveau paiement' };
const STATUTS: Record<ModuleGestion, readonly string[]> = { Coachings: STATUTS_COACHING, Taches: STATUTS_TACHE, Paiements: STATUTS_PAIEMENT };
export const QUOI: Record<ModuleGestion, string> = { Coachings: 'ce coaching', Taches: 'cette tâche', Paiements: 'ce paiement' };

const jourCourt = (j?: string) =>
  j ? new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }) : '—';

/** Une ligne de liste, quelle que soit la rubrique. */
type Ligne = { id: string; titre: string; contactId?: string; date?: string; statut?: string; montant?: number; reference?: string; ouverte?: boolean; recherche: string };

function lignes(c: Carnet, module: ModuleGestion): Ligne[] {
  if (module === 'Coachings')
    return c.coachings.map((x) => ({ id: x.id, titre: x.nom, contactId: x.contactId, statut: x.statut, recherche: `${x.nom} ${x.objectif ?? ''}` }));
  if (module === 'Paiements')
    return c.paiements.map((x) => ({ id: x.id, titre: x.titre, contactId: x.contactId, date: x.date, statut: x.statut, montant: x.montant, reference: x.reference, recherche: x.titre }));
  return c.relances.map((r) => {
    const titre = r.titre || r.note || MODELES[r.modele].libelle;
    return { id: r.id, titre, contactId: r.contactId, date: r.echeance, statut: statutTache(r), ouverte: tacheOuverte(r), recherche: `${titre} ${r.note ?? ''}` };
  });
}

export function Gestion({
  module,
  contactId,
  onToutAfficher,
  onOuvrir,
  onNouveau,
  onSupprimer,
  onCycles,
}: {
  module: ModuleGestion;
  /** Filtre « Dossier : X » venu d'une fiche. */
  contactId?: string;
  onToutAfficher: () => void;
  onOuvrir: (id: string) => void;
  onNouveau: () => void;
  onSupprimer: (x: ASupprimer) => void;
  onCycles: () => void;
}) {
  const blocNom = useBlocNomCarte();
  const charge = useCharger(() => crm.carnet(), `gestion-${module}`);
  const lesFactures = useCharger(() => (module === 'Paiements' ? factures.parPaiement() : Promise.resolve(new Map<string, Facture>())), `factures-paiements-${module}`);
  const lesPacks = useCharger(
    () => (module === 'Paiements' ? abonnements.soldePacks() : Promise.resolve(new Map<string, { total: number; faites: number }>())),
    `packs-paiements-${module}`,
  );
  useRechargerSur(lesPacks.recharger, ecouterCrm);
  const { donnee: lienQuestionnaire } = useCharger(() => crm.lienQuestionnaire(), 'lien-questionnaire');
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterCrm);
  useRechargerSur(lesFactures.recharger, ecouterCrm);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<string>();
  const [archives, setArchives] = useState(false);
  const [occupe, setOccupe] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  // Paiements : un mois à la fois, puis par client (repliés).
  const [moisChoisi, setMoisChoisi] = useState<string>();
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  if (charge.erreur && !charge.donnee)
    return (
      <View style={{ gap: espace(3) }}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </View>
    );
  if (!charge.donnee) return <Chargement />;
  const carnet = charge.donnee;
  const contacts = new Map(carnet.contacts.map((c) => [c.id, c]));
  const nomContact = (id?: string) => (id && contacts.get(id) ? nomComplet(contacts.get(id)!) : 'Contact non lié');
  const q = recherche.trim().toLowerCase();
  const visibles = lignes(carnet, module)
    // Comme à l'origine : une ligne sans contact reste visible, celle d'un dossier archivé seulement sur demande.
    .filter((l) => archives || !l.contactId || contacts.get(l.contactId)?.statut !== 'archive')
    .filter((l) => !contactId || l.contactId === contactId)
    .filter((l) => !statut || l.statut === statut)
    .filter((l) => !q || `${l.recherche} ${nomContact(l.contactId)}`.toLowerCase().includes(q))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  // Paiements : mois présents, du plus récent au plus ancien ; par défaut le plus récent.
  const moisListe = [...new Set(visibles.map((l) => moisDe(l.date)))].sort((a, b) => (a === 'sans-date' ? 1 : b === 'sans-date' ? -1 : b.localeCompare(a)));
  const mois = moisChoisi && moisListe.includes(moisChoisi) ? moisChoisi : (moisListe[0] ?? '');
  const iMois = moisListe.indexOf(mois);
  const groupes = module === 'Paiements' ? parClient(visibles.filter((l) => moisDe(l.date) === mois), nomContact) : [];

  const carte = (l: Ligne) => {
          const contact = l.contactId ? contacts.get(l.contactId) : undefined;
          const pack = l.reference?.startsWith('pack:') ? lesPacks.donnee?.get(l.reference.slice(5)) : undefined;
          return (
            <View key={l.id} style={carteDossier}>
              <View style={styles.entete}>
                <View style={[{ flexShrink: 1, minWidth: 0, flexBasis: 220, flexGrow: 1 }, blocNom]}>
                  <Text style={styles.titre}>{l.titre || 'Sans nom'}</Text>
                  <Text style={styles.sous}>
                    {nomContact(l.contactId)}
                    {module !== 'Coachings' ? ` · ${jourCourt(l.date)}` : ''}
                  </Text>
                  {module === 'Paiements' && pack && (
                    <Text style={[styles.sous, { color: couleurs.texte }]}>
                      {pack.total - pack.faites} séance{pack.total - pack.faites > 1 ? 's' : ''} restante{pack.total - pack.faites > 1 ? 's' : ''} sur {pack.total}
                    </Text>
                  )}
                </View>
                <View style={styles.ligne}>
                  {contact?.statut === 'archive' && <Badge variante="secondaire" libelle="Archivé" />}
                  {l.statut && <Badge libelle={l.statut} />}
                  {module === 'Paiements' && <Text style={styles.montant}>{montantLisible(l.montant)}</Text>}
                  {module === 'Paiements' && (
                    <BoutonFacture
                      facture={lesFactures.donnee?.get(l.id)}
                      facturable={(l.statut === 'Payé' || l.statut === 'En attente') && l.montant !== undefined && l.montant !== null && !!contact?.clientId}
                      paiementId={l.id}
                      reference={l.reference}
                      date={l.date}
                      onCree={lesFactures.recharger}
                      onOuvrirFiche={() => onOuvrir(l.id)}
                      envoi={contact ? { contactId: contact.id, prenom: contact.prenom, telephone: contact.telephone, email: contact.email } : undefined}
                    />
                  )}
                  <BoutonContour libelle="Ouvrir" onPress={() => onOuvrir(l.id)} />
                  <Text
                    accessibilityRole="button"
                    onPress={() => onSupprimer({ module, id: l.id, nom: l.titre || 'Sans nom', contact: contact ? nomComplet(contact) : undefined })}
                    style={styles.supprimer}
                  >
                    Supprimer
                  </Text>
                </View>
              </View>
              {module === 'Coachings' && (
                <View style={styles.ligne}>
                  <BoutonContour libelle="Gérer les cycles" onPress={onCycles} />
                </View>
              )}
              {module === 'Taches' && (l.ouverte || contact) && (
                <View style={styles.ligne}>
                  {l.ouverte && <BoutonContour libelle={occupe === l.id ? 'Enregistrement…' : 'Terminer'} desactive={!!occupe} onPress={() => terminer(l.id)} />}
                  {contact && <RelanceMessage contact={contact} relance={carnet.relances.find((r) => r.id === l.id)} lien={lienQuestionnaire} />}
                </View>
              )}
            </View>
          );
        };

  async function terminer(id: string) {
    setOccupe(id);
    setErreur(undefined);
    try {
      await crm.terminerTache(id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action non confirmée');
    } finally {
      setOccupe(undefined);
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <View style={styles.outils}>
        <Recherche valeur={recherche} onChange={setRecherche} />
        <View style={{ minWidth: 180 }}>
          <Choix libelle="Filtrer le statut" sansLibelle vide="Tous les statuts" choix={STATUTS[module]} valeur={statut} onChange={setStatut} />
        </View>
        <BoutonPrincipal libelle={NOUVEAU[module]} onPress={onNouveau} />
      </View>
      {contactId && (
        <Text style={styles.filtre}>
          Dossier : {nomContact(contactId)}{' '}
          <Text accessibilityRole="button" onPress={onToutAfficher} style={{ textDecorationLine: 'underline' }}>
            Afficher tous
          </Text>
        </Text>
      )}
      <CaseACocher petite libelle="Inclure les dossiers archivés" valeur={archives} onChange={setArchives} />
      {erreur && (
        <Text accessibilityRole="alert" style={styles.erreur}>
          {erreur}
        </Text>
      )}
      <View style={{ gap: espace(3) }}>
        {module === 'Paiements' ? (
          <>
            {/* Un PDF par client, toutes ses factures dedans (archives, comptable). */}
            {!contactId && <BoutonToutesFactures />}
            {moisListe.length > 0 && (
              <View style={styles.mois}>
                <BoutonContour libelle="‹" desactive={iMois >= moisListe.length - 1} onPress={() => setMoisChoisi(moisListe[iMois + 1])} />
                <Text style={styles.moisTitre}>{mois === 'sans-date' ? 'Sans date' : moisLisible(mois)}</Text>
                <BoutonContour libelle="›" desactive={iMois <= 0} onPress={() => setMoisChoisi(moisListe[iMois - 1])} />
                <Text style={styles.sous}>
                  {montantLisible(groupes.reduce((t, g) => t + g.total, 0))}
                  {groupes.some((g) => g.enAttente) ? ` · ${montantLisible(groupes.reduce((t, g) => t + g.enAttente, 0))} en attente` : ''}
                </Text>
              </View>
            )}
            {groupes.map((g) => {
              const ouvert = ouverts.has(g.cle) || !!contactId || groupes.length === 1;
              return (
                <View key={g.cle || 'sans-contact'} style={{ gap: espace(2) }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: ouvert }}
                    onPress={() =>
                      setOuverts((o) => {
                        const n = new Set(o);
                        if (n.has(g.cle)) n.delete(g.cle);
                        else n.add(g.cle);
                        return n;
                      })
                    }
                    style={[carteDossier, styles.groupe]}
                  >
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.titre}>
                        {ouvert ? '▾' : '▸'} {g.nom}
                      </Text>
                      <Text style={styles.sous}>
                        {g.lignes.length} {g.lignes.length > 1 ? 'lignes' : 'ligne'}
                        {g.enAttente ? ` · ${montantLisible(g.enAttente)} en attente` : ''}
                      </Text>
                    </View>
                    <Text style={styles.montant}>{montantLisible(g.total)}</Text>
                  </Pressable>
                  {ouvert && <View style={{ gap: espace(2) }}>{g.lignes.map(carte)}</View>}
                </View>
              );
            })}
          </>
        ) : (
          visibles.map(carte)
        )}
        {!visibles.length && <Vide titre="Aucun dossier pour ces filtres." />}
      </View>
    </View>
  );
}

/**
 * Le message de la relance (questionnaire, rappel du Booster…) et non plus un simple « Bonjour X, » :
 * on l'affiche, puis il part par SMS, WhatsApp ou e-mail. Rien n'est marqué comme envoyé.
 */
function RelanceMessage({ contact, relance, lien }: { contact: Contact; relance?: Relance; lien: string | null | undefined }) {
  const coach = useCoachNom();
  const [ouvert, setOuvert] = useState(false);
  if (!relance) return null;
  const message =
    relance.modele === 'tache'
      ? `Bonjour ${contact.prenom}, `
      : rediger(relance.modele, contact, { coach, lienQuestionnaire: adresseQuestionnaire(lien) });
  if (!ouvert)
    return (
      <Text accessibilityRole="button" onPress={() => setOuvert(true)} style={styles.lien}>
        Écrire à {contact.prenom || 'ce contact'}
      </Text>
    );
  return (
    <View style={{ flexBasis: '100%' }}>
      <EnvoiMessage contact={contact} message={message} />
    </View>
  );
}

// ---------- Éditeur (RecordEditor d'origine) ----------

type Brouillon = Record<string, string>;

const CHAMPS: Record<ModuleGestion, string[]> = {
  Coachings: ['nom', 'contactId', 'boosterId', 'dateDebut', 'dateFinPrevue', 'statut', 'formule', 'objectif', 'commentaires'],
  Taches: ['titre', 'contactId', 'boosterId', 'coachingId', 'responsable', 'echeance', 'priorite', 'statut', 'notes'],
  Paiements: ['titre', 'contactId', 'coachingId', 'date', 'montant', 'moyen', 'statut', 'reference', 'notes'],
};
const DATES = ['dateDebut', 'dateFinPrevue', 'echeance', 'date'];

function brouillonDe(c: Carnet, module: ModuleGestion, id: string | undefined, contactId: string | undefined): Brouillon {
  const vide = Object.fromEntries(CHAMPS[module].map((k) => [k, ''])) as Brouillon;
  if (module === 'Coachings') {
    const x = c.coachings.find((y) => y.id === id);
    if (!x) return { ...vide, contactId: contactId ?? '' };
    return { ...vide, ...ch(x), dateDebut: ecrireJour(x.dateDebut), dateFinPrevue: ecrireJour(x.dateFinPrevue) };
  }
  if (module === 'Paiements') {
    const x = c.paiements.find((y) => y.id === id);
    if (!x) return { ...vide, contactId: contactId ?? '' };
    return { ...vide, ...ch(x), date: ecrireJour(x.date), montant: x.montant === undefined ? '' : String(x.montant).replace('.', ',') };
  }
  const r = c.relances.find((y) => y.id === id);
  if (!r) return { ...vide, contactId: contactId ?? '', echeance: ecrireJour(jourLocal(new Date())), statut: 'À faire' };
  return {
    ...vide,
    ...ch(r),
    titre: r.titre ?? (r.modele === 'tache' ? '' : MODELES[r.modele].libelle),
    echeance: ecrireJour(r.echeance),
    statut: statutTache(r),
    notes: r.note ?? '',
  };
}

/** Champs texte d'un objet, sans les valeurs absentes. */
const ch = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)]));
const opt = (v: string) => (v.trim() ? v.trim() : undefined);

function lireMontant(t: string): number | undefined | null {
  if (!t.trim()) return undefined;
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function EditeurGestion({
  module,
  id,
  contactId,
  onFermer,
  onSupprimer,
}: {
  module: ModuleGestion;
  id?: string;
  contactId?: string;
  onFermer: () => void;
  onSupprimer: (x: ASupprimer) => void;
}) {
  const charge = useCharger(() => crm.carnet(), `editeur-${module}-${id ?? 'nouveau'}`);
  if (charge.erreur && !charge.donnee)
    return (
      <Modale titre={NOUVEAU[module]} onFermer={onFermer}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </Modale>
    );
  if (!charge.donnee)
    return (
      <Modale titre={NOUVEAU[module]} onFermer={onFermer}>
        <Chargement />
      </Modale>
    );
  if (id && !lignes(charge.donnee, module).some((l) => l.id === id))
    return (
      <Modale titre={NOUVEAU[module]} onFermer={onFermer}>
        <Vide titre="Élément introuvable" texte="Il a peut-être été supprimé. Actualisez la liste." />
      </Modale>
    );
  return <Formulaire module={module} id={id} carnet={charge.donnee} contactId={contactId} onFermer={onFermer} onSupprimer={onSupprimer} />;
}

const LIBELLE_MODULE: Record<ModuleGestion, string> = { Coachings: 'Coachings', Taches: 'Tâches', Paiements: 'Paiements' };

function Formulaire({
  module,
  id,
  carnet,
  contactId,
  onFermer,
  onSupprimer,
}: {
  module: ModuleGestion;
  id?: string;
  carnet: Carnet;
  contactId?: string;
  onFermer: () => void;
  onSupprimer: (x: ASupprimer) => void;
}) {
  const [initial] = useState(() => brouillonDe(carnet, module, id, contactId));
  const [b, setB] = useState(initial);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const modifie = Object.keys(b).some((k) => b[k] !== initial[k]);
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());
  const maj = (patch: Brouillon) => setB((x) => ({ ...x, ...patch }));

  const erreurs: Record<string, string | undefined> = {};
  for (const k of DATES) if (k in b && b[k].trim() && !lireJour(b[k])) erreurs[k] = 'Écrivez la date comme 30/10/2026';
  if (module === 'Paiements' && lireMontant(b.montant) === null) erreurs.montant = 'Montant en euros, par exemple 150 ou 49,90';
  if (module === 'Taches' && !b.echeance.trim()) erreurs.echeance = 'L’échéance est nécessaire.';
  const invalide = Object.values(erreurs).some(Boolean);

  const contacts = carnet.contacts.filter((c) => c.statut !== 'archive' || c.id === b.contactId);
  const boosters = carnet.boosters.filter((x) => x.contactId === b.contactId);
  const coachings = carnet.coachings.filter((x) => !b.contactId || x.contactId === b.contactId);
  const jour = (k: string) => (b[k].trim() ? lireJour(b[k]) : undefined);

  async function enregistrer() {
    setOccupe(true);
    setErreur(undefined);
    try {
      if (module === 'Coachings') {
        const s = {
          nom: b.nom,
          contactId: b.contactId,
          boosterId: opt(b.boosterId),
          dateDebut: jour('dateDebut'),
          dateFinPrevue: jour('dateFinPrevue'),
          statut: opt(b.statut) as StatutCoaching | undefined,
          formule: opt(b.formule) as Formule | undefined,
          objectif: b.objectif,
          commentaires: b.commentaires,
        };
        if (id) await crm.modifierCoaching(id, s);
        else await crm.creerCoaching(s);
      } else if (module === 'Paiements') {
        const s = {
          titre: b.titre,
          contactId: opt(b.contactId),
          coachingId: opt(b.coachingId),
          date: jour('date'),
          montant: lireMontant(b.montant) ?? undefined,
          moyen: opt(b.moyen) as MoyenPaiement | undefined,
          statut: opt(b.statut) as StatutPaiement | undefined,
          reference: b.reference,
          notes: b.notes,
        };
        if (id) await crm.modifierPaiement(id, s);
        else await crm.creerPaiement(s);
      } else {
        const s = {
          titre: b.titre,
          contactId: b.contactId,
          boosterId: opt(b.boosterId),
          coachingId: opt(b.coachingId),
          responsable: b.responsable,
          echeance: jour('echeance')!,
          priorite: opt(b.priorite) as PrioriteTache | undefined,
          statut: (opt(b.statut) ?? 'À faire') as StatutTache,
          notes: b.notes,
        };
        if (id) await crm.modifierTache(id, s);
        else await crm.creerTache(s);
      }
      // Comme RecordEditor : l'éditeur se ferme une fois l'enregistrement confirmé.
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
    } finally {
      setOccupe(false);
    }
  }

  const choixContact = (requis: boolean) => (
    <View style={{ gap: espace(2) }}>
      <Libelle>Contact</Libelle>
      <Selecteur
        libelle="Contact"
        sansLibelle
        options={[{ cle: '', libelle: 'Choisir…' }, ...contacts.map((c) => ({ cle: c.id, libelle: nomComplet(c) }))]}
        valeur={b.contactId}
        onChange={(v) =>
          maj({
            contactId: v,
            // Un Booster ou un coaching d'un autre contact n'a plus de sens.
            boosterId: carnet.boosters.some((x) => x.id === b.boosterId && x.contactId === v) ? b.boosterId : '',
            ...('coachingId' in b ? { coachingId: carnet.coachings.some((x) => x.id === b.coachingId && x.contactId === v) ? b.coachingId : '' } : {}),
          })
        }
      />
      {requis && !b.contactId && <Text style={styles.aide}>Choisissez le contact.</Text>}
    </View>
  );
  const lien = (cle: 'boosterId' | 'coachingId', libelle: string, options: { id: string; nom?: string; date?: string }[]) => (
    <View style={{ gap: espace(2) }}>
      <Libelle>{libelle}</Libelle>
      <Selecteur
        libelle={libelle}
        sansLibelle
        options={[{ cle: '', libelle: 'Choisir…' }, ...options.map((o) => ({ cle: o.id, libelle: o.nom || (o.date ? `Booster du ${jourCourt(o.date.slice(0, 10))}` : 'Sans nom') }))]}
        valeur={b[cle]}
        onChange={(v) => maj({ [cle]: v })}
      />
    </View>
  );
  const date = (cle: string, libelle: string) => (
    <Saisie libelle={libelle} valeur={b[cle]} onChange={(v) => maj({ [cle]: v })} placeholder="jj/mm/aaaa" erreur={erreurs[cle]} />
  );

  const titre = `${id ? 'Modifier' : 'Créer'} · ${LIBELLE_MODULE[module]}`;
  return (
    <Modale
      titre={titre}
      onFermer={() => demanderSortie(onFermer)}
      pied={
        <View style={{ gap: espace(3) }}>
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          <PiedEditeur
            modifie={modifie}
            enregistrement={occupe}
            peutEnregistrer={!occupe && !invalide && (!id || modifie)}
            onEnregistrer={enregistrer}
            onFermer={() => (sortie ? sortie() : demanderSortie(onFermer))}
            sortieDemandee={!!sortie}
            onRester={() => setSortie(null)}
            gauche={
              id ? (
                <BoutonPied
                  danger
                  libelle="Supprimer"
                  desactive={occupe}
                  onPress={() =>
                    demanderSortie(() =>
                      onSupprimer({
                        module,
                        id,
                        nom: initial.nom || initial.titre || 'Sans nom',
                        contact: carnet.contacts.find((c) => c.id === initial.contactId) && nomComplet(carnet.contacts.find((c) => c.id === initial.contactId)!),
                      }),
                    )
                  }
                />
              ) : undefined
            }
          />
        </View>
      }
    >
      {module === 'Coachings' && (
        <Grille>
          <Cellule>
            <Saisie libelle="Coaching" valeur={b.nom} onChange={(nom) => maj({ nom })} />
          </Cellule>
          <Cellule>{choixContact(true)}</Cellule>
          <Cellule>{lien('boosterId', 'Booster d’origine', boosters)}</Cellule>
          <Cellule>{date('dateDebut', 'Date de début')}</Cellule>
          <Cellule>{date('dateFinPrevue', 'Date de fin prévue')}</Cellule>
          <Cellule>
            <Choix libelle="Statut" choix={STATUTS_COACHING} valeur={opt(b.statut)} onChange={(v) => maj({ statut: v ?? '' })} />
          </Cellule>
          <Cellule>
            <Choix libelle="Formule" choix={FORMULES} valeur={opt(b.formule)} onChange={(v) => maj({ formule: v ?? '' })} />
            <Text style={styles.aide}>L’offre choisie ne constitue pas un paiement.</Text>
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Objectif principal" long valeur={b.objectif} onChange={(objectif) => maj({ objectif })} />
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Commentaires" long valeur={b.commentaires} onChange={(commentaires) => maj({ commentaires })} />
          </Cellule>
        </Grille>
      )}
      {module === 'Taches' && (
        <Grille>
          <Cellule>
            <Saisie libelle="Tâche" valeur={b.titre} onChange={(titre) => maj({ titre })} />
          </Cellule>
          <Cellule>{choixContact(true)}</Cellule>
          <Cellule>{lien('boosterId', 'Booster', boosters)}</Cellule>
          <Cellule>{lien('coachingId', 'Coaching', coachings)}</Cellule>
          <Cellule>
            <Saisie libelle="Responsable" valeur={b.responsable} onChange={(responsable) => maj({ responsable })} />
          </Cellule>
          <Cellule>{date('echeance', 'Échéance')}</Cellule>
          <Cellule>
            <Choix libelle="Priorité" choix={PRIORITES_TACHE} valeur={opt(b.priorite)} onChange={(v) => maj({ priorite: v ?? '' })} />
          </Cellule>
          <Cellule>
            <Choix libelle="Statut" vide={null} choix={STATUTS_TACHE} valeur={opt(b.statut)} onChange={(v) => maj({ statut: v ?? 'À faire' })} />
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Notes" long valeur={b.notes} onChange={(notes) => maj({ notes })} />
          </Cellule>
        </Grille>
      )}
      {module === 'Paiements' && id && (
        <FactureDeLaFiche
          paiementId={id}
          modifie={modifie}
          envoi={(() => {
            const c = carnet.contacts.find((x) => x.id === initial.contactId);
            return c ? { contactId: c.id, prenom: c.prenom, telephone: c.telephone, email: c.email } : undefined;
          })()}
        />
      )}
      {module === 'Paiements' && lireSeances(initial.notes) && (
        <DetailSeances
          notes={initial.notes}
          onChange={(notes, total, n) => maj({ notes, montant: String(total).replace('.', ','), titre: titreSeances(b.titre, n) })}
        />
      )}
      {module === 'Paiements' && (
        <Grille>
          <Cellule>
            <Saisie libelle="Paiement" valeur={b.titre} onChange={(titre) => maj({ titre })} />
          </Cellule>
          <Cellule>{choixContact(false)}</Cellule>
          <Cellule>{lien('coachingId', 'Coaching', coachings)}</Cellule>
          <Cellule>{date('date', 'Date')}</Cellule>
          <Cellule>
            <Saisie libelle="Montant (€)" type="nombre" valeur={b.montant} onChange={(montant) => maj({ montant })} erreur={erreurs.montant} />
          </Cellule>
          <Cellule>
            <Choix libelle="Moyen de paiement" choix={MOYENS_PAIEMENT} valeur={opt(b.moyen)} onChange={(v) => maj({ moyen: v ?? '' })} />
            {b.moyen === 'Stripe' && <Text style={styles.aide}>Choisir Stripe n’encaisse rien : c’est le moyen déclaré, pas un paiement en ligne.</Text>}
          </Cellule>
          <Cellule>
            <Choix libelle="Statut" choix={STATUTS_PAIEMENT} valeur={opt(b.statut)} onChange={(v) => maj({ statut: v ?? '' })} />
          </Cellule>
          <Cellule>
            <Saisie libelle="Référence Stripe" valeur={b.reference} onChange={(reference) => maj({ reference })} />
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Notes" long valeur={b.notes} onChange={(notes) => maj({ notes })} />
          </Cellule>
        </Grille>
      )}
    </Modale>
  );
}

/**
 * Détail d'une ligne de séances du mois : chaque groupe (seul, avec un autre client) avec son prix
 * et ses dates. Retirer ou ajouter une date recalcule le montant, le titre et les notes lues par la facture.
 */
function DetailSeances({ notes, onChange }: { notes: string; onChange: (notes: string, total: number, n: number) => void }) {
  const [groupes, setGroupes] = useState<GroupeSeances[]>(() => lireSeances(notes) ?? []);
  const [saisies, setSaisies] = useState<string[]>(() => groupes.map(() => ''));
  const [prix, setPrix] = useState<string[]>(() => groupes.map((g) => String(g.prix).replace('.', ',')));
  const changer = (g: GroupeSeances[]) => {
    setGroupes(g);
    onChange(ecrireSeances(g), totalSeances(g), nombreSeances(g));
  };
  const ajouter = (i: number) => {
    const t = saisies[i] ?? '';
    if (!estJourMois(t)) return;
    changer(groupes.map((g, k) => (k === i ? { ...g, dates: [...new Set([...g.dates, jourMois(t)])] } : g)));
    setSaisies((s) => s.map((x, k) => (k === i ? '' : x)));
  };
  return (
    <View style={[carteDossier, { gap: espace(3), marginBottom: espace(4) }]}>
      <Text style={styles.titre}>
        Détail : {nombreSeances(groupes)} séance{nombreSeances(groupes) > 1 ? 's' : ''} · {montantLisible(totalSeances(groupes))}
      </Text>
      {groupes.map((g, i) => (
        <View key={i} style={{ gap: espace(2) }}>
          <View style={styles.ligne}>
            <Text style={[styles.montant, { flexShrink: 1 }]}>{g.libelle || 'Séances'}</Text>
            <View style={{ width: 150 }}>
              <Saisie
                libelle="Prix par séance (€)"
                type="nombre"
                valeur={prix[i] ?? ''}
                onChange={(v) => {
                  setPrix((p) => p.map((x, k) => (k === i ? v : x)));
                  const n = Number(v.replace(',', '.'));
                  if (v.trim() && Number.isFinite(n) && n >= 0) changer(groupes.map((x, k) => (k === i ? { ...x, prix: n } : x)));
                }}
              />
            </View>
          </View>
          <View style={styles.ligne}>
            {g.dates.map((d) => (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`Retirer la séance du ${d}`}
                onPress={() => changer(groupes.map((x, k) => (k === i ? { ...x, dates: x.dates.filter((y) => y !== d) } : x)))}
                style={styles.puce}
              >
                <Text style={styles.puceTexte}>{d} ✕</Text>
              </Pressable>
            ))}
            {!g.dates.length && <Text style={styles.aide}>Aucune séance.</Text>}
          </View>
          <View style={[styles.ligne, { alignItems: 'flex-end' }]}>
            <View style={{ width: 170 }}>
              <Saisie
                libelle="Ajouter une date (JJ/MM)"
                valeur={saisies[i] ?? ''}
                onChange={(v) => setSaisies((s) => s.map((x, k) => (k === i ? v : x)))}
                erreur={saisies[i]?.trim() && !estJourMois(saisies[i]!) ? 'Par exemple 22/10' : undefined}
              />
            </View>
            <BoutonContour libelle="Ajouter" desactive={!estJourMois(saisies[i] ?? '')} onPress={() => ajouter(i)} />
          </View>
        </View>
      ))}
      <Text style={styles.aide}>Touche une date pour la retirer. Pour changer une date, retire-la puis ajoute la bonne. Le montant se recalcule tout seul, et la facture suit si elle n’est pas encore réglée.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  puce: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  outils: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(3), alignItems: 'flex-start' },
  filtre: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  entete: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: espace(3) },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  sous: { marginTop: 4, fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espace(2) },
  montant: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  mois: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espace(2) },
  moisTitre: { fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte, minWidth: 150, textAlign: 'center' },
  groupe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(3) },
  supprimer: { paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rouge },
  lien: { paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texte, fontSize: 12, color: couleurs.texte, textDecorationLine: 'underline' },
  erreur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
  aide: { marginTop: 4, fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
});
