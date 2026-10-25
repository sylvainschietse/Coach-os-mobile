// C07 — Rubrique Documents reprise de CRMWorkspace.tsx : recherche, « Ajouter un document », filtre « Dossier : X »,
// cartes avec Ouvrir le fichier, « Partager dans l'espace client » et badge d'envoi. « Envoyer par e-mail » n'est actif
// que si un service d'envoi est renseigné ; « Envoi confirmé » n'apparaît que si Brevo ou Make confirme l'e-mail (lot 6).
import { useFocusEffect } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { automatisations, type ResultatEnvoi } from '@/data/automatisations';
import { crm, ecouterCrm } from '@/data/crm';
import { documents, ecouterDocuments, type Fichier } from '@/data/documents';
import { ecrireJour, jourLocal, lireJour, type BoosterDossier, type ContactResume } from '@/domain/crm';
import type { Coaching } from '@/domain/gestion';
import {
  filtrerDocuments,
  tailleLisible,
  TYPES_DOCUMENT,
  verifierFichier,
  type Document,
  type SaisieDocument,
  type TypeDocument,
} from '@/domain/documents';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Selecteur, Vide } from '../coque';
import { Chargement, Erreur } from '../composants';
import { choisirFichier, ouvrirFichier } from '../fichiers';
import { couleurs, espace, polices } from '../theme';
import { nomComplet } from './commun';
import { BoutonPrincipal, carteDossier } from './contacts';
import { Badge, BoutonPied, CaseACocher, Cellule, Choix, Grille, Libelle, Modale, PiedEditeur, Recherche, Saisie } from './dossier';
import { ConfirmerSuppression } from './suppression';

const jour = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR');

function useDonnees() {
  const charge = useCharger(
    async () => ({
      docs: await documents.documents(),
      contacts: await crm.contacts(),
      boosters: await crm.boosters(),
      coachings: (await crm.carnet()).coachings,
      make: await automatisations.make(),
    }),
    'documents',
  );
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterDocuments);
  useRechargerSur(charge.recharger, ecouterCrm);
  return charge;
}

export function Documents({
  contactId,
  onToutAfficher,
  onOuvrir,
  onNouveau,
}: {
  contactId?: string;
  onToutAfficher: () => void;
  onOuvrir: (id: string) => void;
  onNouveau: () => void;
}) {
  const charge = useDonnees();
  const [recherche, setRecherche] = useState('');
  const [suppression, setSuppression] = useState<Document>();

  if (charge.erreur && !charge.donnee)
    return (
      <View style={{ gap: espace(3) }}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </View>
    );
  if (!charge.donnee) return <Chargement />;
  const { docs, contacts, make } = charge.donnee;
  const visibles = filtrerDocuments(docs, contacts, recherche, contactId);
  const nom = (id?: string) => {
    const c = contacts.find((x) => x.id === id);
    return c ? nomComplet(c) : '';
  };

  return (
    <View style={{ gap: espace(4) }}>
      <View style={styles.outils}>
        <Recherche valeur={recherche} onChange={setRecherche} />
        <BoutonPrincipal libelle="Ajouter un document" onPress={onNouveau} />
      </View>
      {contactId && (
        <Text style={styles.filtre}>
          Dossier : {nom(contactId) || 'ce contact'}{' '}
          <Text accessibilityRole="button" onPress={onToutAfficher} style={{ textDecorationLine: 'underline' }}>
            Afficher tous
          </Text>
        </Text>
      )}
      <View style={{ gap: espace(3) }}>
        {visibles.map((d) => (
          <CarteDocument
            key={d.id}
            doc={d}
            contact={nom(d.contactId)}
            email={contacts.find((c) => c.id === d.contactId)?.email}
            make={make === 'configure'}
            onEnvoi={charge.recharger}
            onOuvrir={() => onOuvrir(d.id)} onSupprimer={() => setSuppression(d)} />
        ))}
        {!visibles.length && <Vide titre="Aucun dossier pour ces filtres." />}
      </View>
      {suppression && (
        <ConfirmerSuppression
          quoi="ce document"
          nom={suppression.nom}
          contact={nom(suppression.contactId) || undefined}
          onSupprimer={() => documents.supprimer(suppression.id)}
          onFermer={() => setSuppression(undefined)}
        />
      )}
    </View>
  );
}

function CarteDocument({
  doc: d,
  contact,
  email,
  make,
  onEnvoi,
  onOuvrir,
  onSupprimer,
}: {
  doc: Document;
  contact: string;
  email?: string;
  make: boolean;
  onEnvoi: () => void;
  onOuvrir: () => void;
  onSupprimer: () => void;
}) {
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string }>();
  const [envoi, setEnvoi] = useState<ResultatEnvoi>();
  // Rien ne part sans une confirmation qui montre le PDF exact et le destinataire.
  const [aConfirmer, setAConfirmer] = useState<{ relancer: boolean }>();

  async function envoyer(relancer = false) {
    setAConfirmer(undefined);
    setOccupe(true);
    setRetour(undefined);
    try {
      const r = await automatisations.envoyerCompteRendu(d.id, relancer);
      setEnvoi(r);
      // Seul un e-mail confirmé est une réussite ; une demande seulement reçue par Make reste « non confirmée ».
      setRetour({ ok: r.etat === 'envoye', texte: r.message });
      onEnvoi();
    } catch (e) {
      setRetour({ ok: false, texte: e instanceof Error ? e.message : 'Transmission non confirmée.' });
    } finally {
      setOccupe(false);
    }
  }

  async function agir(action: () => Promise<unknown>, succes?: string) {
    setOccupe(true);
    setRetour(undefined);
    try {
      await action();
      if (succes) setRetour({ ok: true, texte: succes });
    } catch (e) {
      setRetour({ ok: false, texte: e instanceof Error ? e.message : 'Action non confirmée' });
    } finally {
      setOccupe(false);
    }
  }

  return (
    <View style={carteDossier}>
      <View style={styles.entete}>
        <View style={{ flexShrink: 1, minWidth: 0, flexBasis: 220, flexGrow: 1 }}>
          <Text style={styles.titre}>{d.nom || 'Sans nom'}</Text>
          <Text style={styles.sous}>
            {[contact, jour(d.date)].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.detail}>{[d.type, d.chemin ? `version ${d.version}` : 'aucun fichier', tailleLisible(d.taille)].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={styles.ligne}>
          {d.partageClient && <Badge variante="secondaire" libelle="Dans l’espace client" />}
          <BoutonContour libelle="Ouvrir" onPress={onOuvrir} />
          <Text accessibilityRole="button" onPress={onSupprimer} style={styles.supprimer}>
            Supprimer
          </Text>
        </View>
      </View>
      <View style={styles.ligne}>
        {d.chemin && (
          <BoutonContour
            libelle={`Ouvrir ${d.nomFichier || 'le fichier'}`}
            icone={ArrowUpRight}
            onPress={() => agir(() => ouvrirFichier(() => documents.lien(d.chemin!), d.nomFichier || 'document.pdf'))}
          />
        )}
        {d.partageClient ? (
          <BoutonContour
            libelle="Retirer de l’espace client"
            desactive={occupe}
            onPress={() => agir(() => documents.partager(d.id, false), 'Le client ne voit plus ce document.')}
          />
        ) : (
          <BoutonContour
            libelle="Partager dans l’espace client"
            desactive={occupe || !d.chemin || !d.contactId}
            onPress={() => agir(() => documents.partager(d.id, true), 'Document partagé dans l’espace client.')}
          />
        )}
        <Badge variante={d.envoye ? 'primaire' : 'contour'} libelle={d.envoye ? 'Envoi confirmé' : 'Non envoyé'} />
        <View>
          <BoutonContour
            libelle={make ? 'Envoyer par e-mail' : 'Envoi à raccorder'}
            desactive={occupe || !make || d.envoye || !d.chemin || !!aConfirmer}
            onPress={() => setAConfirmer({ relancer: false })}
          />
          {!make && <Text style={styles.raison}>Envoi automatique non raccordé</Text>}
        </View>
        {make && !d.envoye && (envoi?.etat === 'echec' || envoi?.etat === 'bloque') && (
          <BoutonContour libelle="Relancer après vérification" desactive={occupe || !!aConfirmer} onPress={() => setAConfirmer({ relancer: true })} />
        )}
      </View>
      {aConfirmer && (
        <View style={styles.confirmation}>
          <Text style={styles.titre}>Vérifier avant l’envoi</Text>
          <Text style={styles.detail}>
            {`${d.nomFichier || d.nom || 'Le document'} · version ${d.version} sera envoyé à ${email || 'l’e-mail du contact'}${contact ? ` (${contact})` : ''}.`}
          </Text>
          <Text style={styles.detail}>Ouvre le PDF pour le relire : c’est exactement ce fichier qui partira en pièce jointe.</Text>
          <View style={styles.ligne}>
            <BoutonContour
              libelle="Ouvrir le PDF"
              icone={ArrowUpRight}
              onPress={() => agir(() => ouvrirFichier(() => documents.lien(d.chemin!), d.nomFichier || 'document.pdf'))}
            />
            <BoutonContour libelle="Confirmer l’envoi" desactive={occupe || !email} onPress={() => envoyer(aConfirmer.relancer)} />
            <BoutonContour libelle="Annuler" desactive={occupe} onPress={() => setAConfirmer(undefined)} />
          </View>
          {!email && <Text style={[styles.detail, { color: couleurs.rouge }]}>Ajoutez d’abord l’e-mail du contact.</Text>}
        </View>
      )}
      {retour && <Text style={[styles.retour, !retour.ok && { color: couleurs.rouge }]}>{retour.texte}</Text>}
    </View>
  );
}

interface Brouillon {
  nom: string;
  contactId: string;
  boosterId: string;
  coachingId: string;
  type: string;
  date: string;
  envoye: boolean;
  commentaires: string;
}

const brouillonDe = (d: Document | undefined, contactId?: string): Brouillon => ({
  nom: d?.nom ?? '',
  contactId: d?.contactId ?? contactId ?? '',
  boosterId: d?.boosterId ?? '',
  coachingId: d?.coachingId ?? '',
  type: d?.type ?? '',
  date: ecrireJour(d?.date ?? jourLocal(new Date())),
  envoye: d?.envoye ?? false,
  commentaires: d?.commentaires ?? '',
});

/** Éditeur RecordEditor de la table Documents : champs de Champs-CRM.json. */
export function EditeurDocumentModale({ id, contactId, onFermer }: { id?: string; contactId?: string; onFermer: () => void }) {
  const charge = useDonnees();
  if (charge.erreur && !charge.donnee)
    return (
      <Modale titre="Document" onFermer={onFermer}>
        <Erreur message={charge.erreur} />
      </Modale>
    );
  if (!charge.donnee)
    return (
      <Modale titre="Document" onFermer={onFermer}>
        <Chargement />
      </Modale>
    );
  const doc = id ? charge.donnee.docs.find((d) => d.id === id) : undefined;
  if (id && !doc)
    return (
      <Modale titre="Document" onFermer={onFermer}>
        <Erreur message="Ce document n’existe plus." />
      </Modale>
    );
  return (
    <Editeur
      key={`${doc?.id ?? 'nouveau'}-${doc?.modifieLe ?? ''}`}
      doc={doc}
      contactId={contactId}
      contacts={charge.donnee.contacts}
      boosters={charge.donnee.boosters}
      coachings={charge.donnee.coachings}
      onFermer={onFermer}
    />
  );
}

function Editeur({
  doc,
  contactId,
  contacts,
  boosters,
  coachings,
  onFermer,
}: {
  doc?: Document;
  contactId?: string;
  contacts: ContactResume[];
  boosters: BoosterDossier[];
  coachings: Coaching[];
  onFermer: () => void;
}) {
  const [initial] = useState(() => brouillonDe(doc, contactId));
  const [b, setB] = useState(initial);
  const [fichier, setFichier] = useState<Fichier>();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const [suppression, setSuppression] = useState(false);
  const maj = (patch: Partial<Brouillon>) => setB((x) => ({ ...x, ...patch }));
  const modifie = JSON.stringify(b) !== JSON.stringify(initial) || !!fichier;
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());

  const date = lireJour(b.date);
  const erreurs = {
    nom: !b.nom.trim() ? 'Donnez un nom au document.' : undefined,
    contact: !b.contactId ? 'Choisissez un contact' : undefined,
    date: !date ? 'Écrivez la date comme 24/10/2026' : undefined,
  };
  const invalide = Object.values(erreurs).some(Boolean);
  const boostersDuContact = boosters.filter((x) => x.contactId === b.contactId);
  const coachingsDuContact = coachings.filter((x) => x.contactId === b.contactId);

  async function choisir() {
    setErreur(undefined);
    try {
      const f = await choisirFichier();
      if (!f) return;
      const refus = verifierFichier(f);
      if (refus) return setErreur(refus);
      setFichier(f);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible');
    }
  }

  async function enregistrer() {
    setOccupe(true);
    setErreur(undefined);
    const saisie: SaisieDocument = {
      nom: b.nom,
      contactId: b.contactId || null,
      boosterId: b.boosterId || null,
      coachingId: b.coachingId || null,
      type: (b.type || 'Autre') as TypeDocument,
      date,
      envoye: b.envoye,
      commentaires: b.commentaires,
    };
    try {
      if (!doc) {
        await documents.creer(saisie, fichier);
        onFermer();
        return;
      }
      await documents.modifier(doc.id, saisie);
      if (fichier) await documents.deposer(doc.id, fichier);
      // L'éditeur se recharge sur la version enregistrée (clé = date de modification).
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
      setOccupe(false);
    }
  }

  const contact = contacts.find((c) => c.id === b.contactId);
  return (
    <Modale
      titre={doc ? 'Modifier · Documents' : 'Créer · Documents'}
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
            peutEnregistrer={!occupe && !invalide && (!doc || modifie)}
            onEnregistrer={enregistrer}
            onFermer={() => (sortie ? sortie() : demanderSortie(onFermer))}
            sortieDemandee={!!sortie}
            onRester={() => setSortie(null)}
            gauche={doc ? <BoutonPied danger libelle="Supprimer" desactive={occupe} onPress={() => demanderSortie(() => setSuppression(true))} /> : undefined}
          />
        </View>
      }
    >
      <Grille>
        <Cellule>
          <Saisie libelle="Document" valeur={b.nom} onChange={(nom) => maj({ nom })} erreur={b.nom !== initial.nom ? erreurs.nom : undefined} />
        </Cellule>
        <Cellule>
          <View style={{ gap: espace(2) }}>
            <Libelle>Contact</Libelle>
            <Selecteur
              libelle="Contact"
              sansLibelle
              options={[{ cle: '', libelle: 'Choisir…' }, ...contacts.map((c) => ({ cle: c.id, libelle: nomComplet(c) }))]}
              valeur={b.contactId}
              onChange={(id) => maj({ contactId: id, boosterId: '', coachingId: '' })}
            />
            {erreurs.contact && <Text style={styles.erreur}>{erreurs.contact}</Text>}
          </View>
        </Cellule>
        <Cellule>
          <View style={{ gap: espace(2) }}>
            <Libelle>Booster</Libelle>
            <Selecteur
              libelle="Booster"
              sansLibelle
              options={[{ cle: '', libelle: 'Non renseigné' }, ...boostersDuContact.map((x) => ({ cle: x.id, libelle: x.nom || 'Booster' }))]}
              valeur={b.boosterId}
              onChange={(boosterId) => maj({ boosterId })}
            />
          </View>
        </Cellule>
        <Cellule>
          <View style={{ gap: espace(2) }}>
            <Libelle>Coaching</Libelle>
            <Selecteur
              libelle="Coaching"
              sansLibelle
              options={[{ cle: '', libelle: 'Non renseigné' }, ...coachingsDuContact.map((x) => ({ cle: x.id, libelle: x.nom }))]}
              valeur={b.coachingId}
              onChange={(coachingId) => maj({ coachingId })}
            />
          </View>
        </Cellule>
        <Cellule>
          <Choix libelle="Type" choix={TYPES_DOCUMENT} valeur={b.type || undefined} onChange={(type) => maj({ type: type ?? '' })} />
        </Cellule>
        <Cellule>
          <Saisie libelle="Date" valeur={b.date} onChange={(d) => maj({ date: d })} placeholder="24/10/2026" erreur={erreurs.date} />
        </Cellule>
        <Cellule>
          <View style={{ gap: espace(2) }}>
            <Libelle>Version</Libelle>
            <Text style={styles.valeur}>{doc?.chemin ? `v${doc.version}` : 'Aucun fichier déposé'}</Text>
          </View>
        </Cellule>
        <Cellule pleine>
          <View style={{ gap: espace(2) }}>
            <Libelle>Fichier</Libelle>
            {doc?.chemin && (
              <View style={styles.ligne}>
                <BoutonContour
                  libelle={`Ouvrir ${doc.nomFichier || 'le fichier'}`}
                  icone={ArrowUpRight}
                  onPress={() => ouvrirFichier(() => documents.lien(doc.chemin!), doc.nomFichier || 'document.pdf').catch((e) => setErreur(e.message))}
                />
                <Text style={styles.detail}>{tailleLisible(doc.taille)}</Text>
              </View>
            )}
            <View style={styles.ligne}>
              <BoutonContour libelle={doc?.chemin ? 'Déposer une nouvelle version' : 'Choisir un fichier'} onPress={choisir} />
              {fichier && (
                <Text style={styles.detail}>
                  {fichier.nom} · {tailleLisible(fichier.taille)}
                  {doc?.chemin ? ` · deviendra la version ${doc.version + 1}` : ''}
                </Text>
              )}
            </View>
            <Text style={styles.detail}>PDF ou image, 10 Mo au plus. Une nouvelle version remplace celle que voit le client ; les précédentes restent conservées.</Text>
          </View>
        </Cellule>
        <Cellule>
          <CaseACocher libelle="Envoyé" valeur={b.envoye} onChange={(envoye) => maj({ envoye })} />
        </Cellule>
        <Cellule pleine>
          <Saisie
            libelle="Commentaires"
            long
            valeur={b.commentaires}
            onChange={(commentaires) => maj({ commentaires })}
            aide="Notes internes : jamais visibles dans l’espace client."
          />
        </Cellule>
      </Grille>
      {doc?.partageClient && <Text style={styles.detail}>Ce document est visible dans l’espace client de {contact ? nomComplet(contact) : 'ce contact'}.</Text>}
      {suppression && doc && (
        <ConfirmerSuppression
          quoi="ce document"
          nom={doc.nom}
          contact={contact ? nomComplet(contact) : undefined}
          onSupprimer={async () => {
            await documents.supprimer(doc.id);
            onFermer();
          }}
          onFermer={() => setSuppression(false)}
        />
      )}
    </Modale>
  );
}

const styles = StyleSheet.create({
  confirmation: { gap: espace(2), padding: espace(3), borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12 },
  outils: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(3), alignItems: 'flex-start' },
  filtre: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  entete: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: espace(3) },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  sous: { marginTop: 4, fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux },
  detail: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux, flexShrink: 1 },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espace(2) },
  supprimer: { paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rouge },
  raison: { marginTop: 2, fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux },
  retour: { fontFamily: polices.texte, fontSize: 13, color: couleurs.vert },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  valeur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte, lineHeight: 44 },
});
