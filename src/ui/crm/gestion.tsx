// Rubriques Coachings, Tâches et Paiements reprises de CRMWorkspace.tsx (liste filtrable, cartes, RecordEditor) :
// recherche, filtre de statut, « Inclure les dossiers archivés », filtre « Dossier : X », Ouvrir et Supprimer.
import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { ecrireJour, jourLocal, lienEnvoi, lireJour, MODELES, type Carnet, type Contact } from '@/domain/crm';
import {
  FORMULES,
  montantLisible,
  MOYENS_PAIEMENT,
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
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Selecteur, Vide } from '../coque';
import { Chargement, Erreur } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { nomComplet } from './commun';
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
type Ligne = { id: string; titre: string; contactId?: string; date?: string; statut?: string; montant?: number; ouverte?: boolean; recherche: string };

function lignes(c: Carnet, module: ModuleGestion): Ligne[] {
  if (module === 'Coachings')
    return c.coachings.map((x) => ({ id: x.id, titre: x.nom, contactId: x.contactId, statut: x.statut, recherche: `${x.nom} ${x.objectif ?? ''}` }));
  if (module === 'Paiements')
    return c.paiements.map((x) => ({ id: x.id, titre: x.titre, contactId: x.contactId, date: x.date, statut: x.statut, montant: x.montant, recherche: x.titre }));
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
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterCrm);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<string>();
  const [archives, setArchives] = useState(false);
  const [occupe, setOccupe] = useState<string>();
  const [erreur, setErreur] = useState<string>();

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
        {visibles.map((l) => {
          const contact = l.contactId ? contacts.get(l.contactId) : undefined;
          return (
            <View key={l.id} style={carteDossier}>
              <View style={styles.entete}>
                <View style={[{ flexShrink: 1, minWidth: 0, flexBasis: 220, flexGrow: 1 }, blocNom]}>
                  <Text style={styles.titre}>{l.titre || 'Sans nom'}</Text>
                  <Text style={styles.sous}>
                    {nomContact(l.contactId)}
                    {module !== 'Coachings' ? ` · ${jourCourt(l.date)}` : ''}
                  </Text>
                </View>
                <View style={styles.ligne}>
                  {contact?.statut === 'archive' && <Badge variante="secondaire" libelle="Archivé" />}
                  {l.statut && <Badge libelle={l.statut} />}
                  {module === 'Paiements' && <Text style={styles.montant}>{montantLisible(l.montant)}</Text>}
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
              {module === 'Taches' && (l.ouverte || contact?.telephone) && (
                <View style={styles.ligne}>
                  {l.ouverte && <BoutonContour libelle={occupe === l.id ? 'Enregistrement…' : 'Terminer'} desactive={!!occupe} onPress={() => terminer(l.id)} />}
                  {contact?.telephone && <RelanceWhatsApp contact={contact} />}
                </View>
              )}
            </View>
          );
        })}
        {!visibles.length && <Vide titre="Aucun dossier pour ces filtres." />}
      </View>
    </View>
  );
}

/** Ouvre WhatsApp avec un début de message : rien n'est marqué comme envoyé. */
function RelanceWhatsApp({ contact }: { contact: Contact }) {
  const lien = lienEnvoi('whatsapp', contact, `Bonjour ${contact.prenom}, `);
  if (!lien) return null;
  return (
    <Text accessibilityRole="link" onPress={() => ouvrirLien(lien).catch(() => undefined)} style={styles.lien}>
      Relancer sur WhatsApp
    </Text>
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

const styles = StyleSheet.create({
  outils: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(3), alignItems: 'flex-start' },
  filtre: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  entete: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: espace(3) },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  sous: { marginTop: 4, fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espace(2) },
  montant: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  supprimer: { paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rouge },
  lien: { paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texte, fontSize: 12, color: couleurs.texte, textDecorationLine: 'underline' },
  erreur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
  aide: { marginTop: 4, fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
});
