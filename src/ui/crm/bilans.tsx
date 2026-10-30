// C06 Bilans coach repris de CRMWorkspace.tsx (BilanEditor) et saveBilan.ts : contact, date, poids, taille, tours de
// taille et de hanches, dix piliers notés 1–10 ou « Non évalué », synthèse et trois priorités, puis le PDF du bilan
// rangé dans Documents (type Bilan). Un bilan déjà envoyé n'est plus modifiable : on en crée un nouveau.
import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { depot } from '@/data';
import { depuisBase64, documents, ecouterDocuments, type Fichier } from '@/data/documents';
import { ecrireJour, jourLocal, lireJour, type Carnet } from '@/domain/crm';
import type { Document } from '@/domain/documents';
import type { Mensuration } from '@/domain/types';
import { bilanHtml, ecartPrecedent, PILIERS, type BilanCoach, type Pilier, type SaisieBilan } from '@/domain/gestion';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Selecteur, Vide } from '../coque';
import { Bouton, Chargement, Erreur } from '../composants';
import { choisirFichier, ouvrirFichier } from '../fichiers';
import { couleurs, espace, polices } from '../theme';
import { nomComplet } from './commun';
import { BoutonPrincipal, carteDossier } from './contacts';
import { Badge, CaseACocher, Cellule, Grille, Libelle, Modale, PiedEditeur, Recherche, Saisie, useBlocNomCarte } from './dossier';

const jourLong = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
const nomBilan = (b: BilanCoach, c: Carnet) => {
  const contact = c.contacts.find((x) => x.id === b.contactId);
  return `Bilan · ${contact ? nomComplet(contact) : 'Contact'} · ${new Date(b.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`;
};

async function chargerTout() {
  const [carnet, docs] = await Promise.all([crm.carnet(), documents.documents()]);
  return { carnet, docs: new Map(docs.map((d) => [d.id, d])) };
}

export function Bilans({
  contactId,
  onToutAfficher,
  onOuvrir,
  onNouveau,
  onSupprimer,
}: {
  contactId?: string;
  /** Absent dans la fiche : la liste y est déjà celle de ce contact. */
  onToutAfficher?: () => void;
  onOuvrir: (id: string) => void;
  onNouveau: () => void;
  onSupprimer: (x: { id: string; nom: string; contact?: string }) => void;
}) {
  const charge = useCharger(chargerTout, 'bilans');
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterCrm);
  useRechargerSur(charge.recharger, ecouterDocuments);
  const [recherche, setRecherche] = useState('');
  const dansFiche = !!contactId && !onToutAfficher;
  const [archives, setArchives] = useState(false);

  if (charge.erreur && !charge.donnee)
    return (
      <View style={{ gap: espace(3) }}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </View>
    );
  if (!charge.donnee) return <Chargement />;
  const { carnet, docs } = charge.donnee;
  const contacts = new Map(carnet.contacts.map((c) => [c.id, c]));
  const q = recherche.trim().toLowerCase();
  const visibles = carnet.bilans
    .filter((b) => archives || contacts.get(b.contactId)?.statut !== 'archive')
    .filter((b) => !contactId || b.contactId === contactId)
    .filter((b) => !q || `${nomBilan(b, carnet)} ${b.synthese}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  const filtre = contactId ? contacts.get(contactId) : undefined;

  return (
    <View style={{ gap: espace(4) }}>
      {/* Dans la fiche (pas de « Afficher tous ») : la liste du contact, sans recherche. */}
      {dansFiche ? (
        <View style={[styles.outils, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Bilans complets</Text>
          <BoutonPrincipal libelle="Nouveau bilan" onPress={onNouveau} />
        </View>
      ) : (
        <View style={styles.outils}>
          <Recherche valeur={recherche} onChange={setRecherche} />
          <BoutonPrincipal libelle="Nouveau bilan" onPress={onNouveau} />
        </View>
      )}
      {contactId && onToutAfficher && (
        <Text style={styles.filtre}>
          Dossier : {filtre ? nomComplet(filtre) : 'ce contact'}{' '}
          <Text accessibilityRole="button" onPress={onToutAfficher} style={{ textDecorationLine: 'underline' }}>
            Afficher tous
          </Text>
        </Text>
      )}
      {!dansFiche && <CaseACocher petite libelle="Inclure les dossiers archivés" valeur={archives} onChange={setArchives} />}
      <View style={{ gap: espace(3) }}>
        {visibles.map((b) => (
          <CarteBilan
            key={b.id}
            bilan={b}
            carnet={carnet}
            doc={b.documentId ? docs.get(b.documentId) : undefined}
            onOuvrir={() => onOuvrir(b.id)}
            onSupprimer={() => {
              const c = contacts.get(b.contactId);
              onSupprimer({ id: b.id, nom: nomBilan(b, carnet), contact: c ? nomComplet(c) : undefined });
            }}
          />
        ))}
        {!visibles.length && <Vide titre={dansFiche ? 'Aucun bilan complet pour ce contact.' : 'Aucun dossier pour ces filtres.'} />}
      </View>
    </View>
  );
}

function CarteBilan({ bilan: b, carnet, doc, onOuvrir, onSupprimer }: { bilan: BilanCoach; carnet: Carnet; doc?: Document; onOuvrir: () => void; onSupprimer: () => void }) {
  const blocNom = useBlocNomCarte();
  const contact = carnet.contacts.find((c) => c.id === b.contactId);
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string }>();
  async function agir(f: () => Promise<unknown>, ok?: string) {
    setOccupe(true);
    setRetour(undefined);
    try {
      await f();
      if (ok) setRetour({ ok: true, texte: ok });
    } catch (e) {
      setRetour({ ok: false, texte: e instanceof Error ? e.message : 'Action non confirmée' });
    } finally {
      setOccupe(false);
    }
  }
  return (
    <View style={carteDossier}>
      <View style={styles.entete}>
        <View style={[{ flexShrink: 1, minWidth: 0, flexBasis: 220, flexGrow: 1 }, blocNom]}>
          <Text style={styles.titre}>{nomBilan(b, carnet)}</Text>
          <Text style={styles.sous}>
            {contact ? nomComplet(contact) : 'Contact non lié'} · {jourLong(b.date)}
          </Text>
        </View>
        <View style={styles.ligne}>
          {contact?.statut === 'archive' && <Badge variante="secondaire" libelle="Archivé" />}
          <BoutonContour libelle="Ouvrir" onPress={onOuvrir} />
          <Text accessibilityRole="button" onPress={onSupprimer} style={styles.supprimer}>
            Supprimer
          </Text>
        </View>
      </View>
      <View style={styles.ligne}>
        {doc?.chemin ? (
          <BoutonContour
            libelle={`Ouvrir ${doc.nomFichier || 'le fichier'}`}
            icone={ArrowUpRight}
            onPress={() => agir(() => ouvrirFichier(() => documents.lien(doc.chemin!), doc.nomFichier || 'bilan.pdf'))}
          />
        ) : (
          <Text style={styles.raison}>PDF pas encore enregistré dans Documents</Text>
        )}
        {doc?.partageClient ? (
          <BoutonContour libelle="Retirer de l’espace client" desactive={occupe} onPress={() => agir(() => documents.partager(doc.id, false), 'Le client ne voit plus ce bilan.')} />
        ) : (
          <BoutonContour
            libelle="Partager dans l’espace client"
            desactive={occupe || !doc?.chemin}
            onPress={() => agir(() => documents.partager(doc!.id, true), 'Bilan partagé dans l’espace client.')}
          />
        )}
        <Badge variante={doc?.envoye ? 'primaire' : 'contour'} libelle={doc?.envoye ? 'Envoi confirmé' : 'Non envoyé'} />
      </View>
      {retour && <Text style={[styles.retour, !retour.ok && { color: couleurs.rouge }]}>{retour.texte}</Text>}
      {!!b.synthese && <Text style={styles.texte}>{b.synthese}</Text>}
      <View style={styles.ligne}>
        {(
          [
            ['poids', 'Poids', 'kg'],
            ['tourTaille', 'Tour de taille', 'cm'],
            ['tourHanches', 'Tour de hanches', 'cm'],
          ] as const
        ).map(([k, libelle, unite]) => {
          const v = b[k];
          if (v === undefined) return null;
          const ecart = ecartPrecedent(carnet, b, k);
          const f = (x: number) => String(x).replace('.', ',');
          return (
            <Text key={k} style={styles.mesure}>
              {libelle} : {f(v)} {unite}
              {ecart !== null && <Text style={styles.ecart}>{`  (${ecart > 0 ? '+' : ''}${f(ecart)} ${unite} depuis le bilan précédent)`}</Text>}
            </Text>
          );
        })}
      </View>
      <View style={styles.ligne}>
        {PILIERS.filter((p) => b.piliers[p] != null).map((p) => (
          <Text key={p} style={styles.pilier}>
            {p} {b.piliers[p]}/10
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---------- Éditeur ----------

type Brouillon = {
  contactId: string;
  date: string;
  poids: string;
  taille: string;
  tourTaille: string;
  tourHanches: string;
  piliers: Partial<Record<Pilier, string>>;
  synthese: string;
  priorites: string[];
};
const f = (v?: number) => (v === undefined ? '' : String(v).replace('.', ','));
/** Un nouveau bilan reprend les dernières mensurations du client, pour ne pas les saisir deux fois. */
function brouillonDe(b: BilanCoach | undefined, contactId?: string, mesures?: Mensuration[]): Brouillon {
  const derniere = (k: 'poidsKg' | 'tourTailleCm' | 'tourHanchesCm') => (b ? undefined : mesures?.find((m) => m[k] !== undefined)?.[k]);
  return {
    contactId: b?.contactId ?? contactId ?? '',
    date: ecrireJour(b?.date ?? jourLocal(new Date())),
    poids: f(b?.poids ?? derniere('poidsKg')),
    taille: f(b?.taille),
    tourTaille: f(b?.tourTaille ?? derniere('tourTailleCm')),
    tourHanches: f(b?.tourHanches ?? derniere('tourHanchesCm')),
    piliers: Object.fromEntries(PILIERS.map((p) => [p, b?.piliers[p] == null ? '' : String(b.piliers[p])])),
    synthese: b?.synthese ?? '',
    priorites: [0, 1, 2].map((i) => b?.priorites[i] ?? ''),
  };
}
function lireMesure(t: string): number | undefined | null {
  if (!t.trim()) return undefined;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n * 10) / 10 : null;
}

export function EditeurBilan({ id, contactId, onFermer }: { id?: string; contactId?: string; onFermer: () => void }) {
  const charge = useCharger(async () => {
    const tout = await chargerTout();
    const clientId = !id && contactId ? tout.carnet.contacts.find((c) => c.id === contactId)?.clientId : undefined;
    // Les mesures sont un plus : sans elles, le bilan s'ouvre vide comme avant.
    const mesures = clientId ? await depot.mensurations(clientId).catch(() => []) : [];
    return { ...tout, mesures: [...mesures].sort((a, b) => b.date.localeCompare(a.date)) };
  }, `bilan-${id ?? 'nouveau'}-${contactId ?? ''}`);
  if (charge.erreur && !charge.donnee)
    return (
      <Modale titre="Nouveau bilan" onFermer={onFermer}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </Modale>
    );
  if (!charge.donnee)
    return (
      <Modale titre="Nouveau bilan" onFermer={onFermer}>
        <Chargement />
      </Modale>
    );
  const bilan = id ? charge.donnee.carnet.bilans.find((b) => b.id === id) : undefined;
  if (id && !bilan)
    return (
      <Modale titre="Modifier le bilan" onFermer={onFermer}>
        <Vide titre="Bilan introuvable" texte="Il a peut-être été supprimé. Actualisez la liste." />
      </Modale>
    );
  return (
    <FormulaireBilan
      bilan={bilan}
      carnet={charge.donnee.carnet}
      doc={bilan?.documentId ? charge.donnee.docs.get(bilan.documentId) : undefined}
      contactId={contactId}
      mesures={charge.donnee.mesures}
      onFermer={onFermer}
    />
  );
}

function FormulaireBilan({
  bilan,
  carnet,
  doc,
  contactId,
  mesures: dernieresMesures,
  onFermer,
}: {
  bilan?: BilanCoach;
  carnet: Carnet;
  doc?: Document;
  contactId?: string;
  mesures: Mensuration[];
  onFermer: () => void;
}) {
  const [initial, setInitial] = useState(() => brouillonDe(bilan, contactId, dernieresMesures));
  const [b, setB] = useState(initial);
  const [id, setId] = useState(bilan?.id);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [retour, setRetour] = useState<string>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const modifie = JSON.stringify(b) !== JSON.stringify(initial);
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());
  const maj = (patch: Partial<Brouillon>) => setB((x) => ({ ...x, ...patch }));
  const envoye = !!doc?.envoye;

  const date = lireJour(b.date);
  const mesures = { poids: lireMesure(b.poids), taille: lireMesure(b.taille), tourTaille: lireMesure(b.tourTaille), tourHanches: lireMesure(b.tourHanches) };
  const erreurs: Record<string, string | undefined> = {
    date: !date ? 'Écrivez la date comme 30/10/2026' : undefined,
    ...Object.fromEntries(Object.entries(mesures).map(([k, v]) => [k, v === null ? 'Valeur entre 0 et 500' : undefined])),
  };
  const invalide = !b.contactId || Object.values(erreurs).some(Boolean);

  function saisie(): SaisieBilan {
    return {
      contactId: b.contactId,
      date: date!,
      poids: mesures.poids ?? undefined,
      taille: mesures.taille ?? undefined,
      tourTaille: mesures.tourTaille ?? undefined,
      tourHanches: mesures.tourHanches ?? undefined,
      piliers: Object.fromEntries(PILIERS.map((p) => [p, b.piliers[p] ? Number(b.piliers[p]) : null])),
      synthese: b.synthese,
      priorites: b.priorites,
    };
  }

  /** Téléphone : le PDF est créé ici. Web : le PDF imprimé depuis le navigateur est déposé ensuite. */
  async function enregistrerPdf(bilanId: string, fichier: Fichier) {
    const c = await crm.carnet();
    const x = c.bilans.find((y) => y.id === bilanId)!;
    const existant = x.documentId ? (await documents.documents()).find((d) => d.id === x.documentId) : undefined;
    const d = existant
      ? await documents.deposer(existant.id, fichier)
      : await documents.creer({ nom: nomBilan(x, c), contactId: x.contactId, type: 'Bilan', date: x.date }, fichier);
    if (!existant) await crm.lierDocumentBilan(bilanId, d.id);
    return d;
  }

  async function enregistrer() {
    setOccupe(true);
    setErreur(undefined);
    setRetour(undefined);
    let bilanId = id;
    try {
      if (bilanId) await crm.modifierBilan(bilanId, saisie(), envoye);
      else bilanId = await crm.creerBilan(saisie());
      setId(bilanId);
      setInitial(b);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Bilan non enregistré');
      setOccupe(false);
      return;
    }
    if (Platform.OS === 'web') {
      setRetour('Bilan enregistré. Imprimez-le en PDF puis déposez ce PDF dans Documents.');
      setOccupe(false);
      return;
    }
    try {
      const c = await crm.carnet();
      const x = c.bilans.find((y) => y.id === bilanId)!;
      const contact = c.contacts.find((y) => y.id === x.contactId);
      // A4 en points (72 par pouce).
      const { base64 } = await Print.printToFileAsync({ html: bilanHtml(x, contact ? nomComplet(contact) : 'Bilan', { police: BEBAS_NEUE_BASE64 }), width: 595, height: 842, base64: true });
      if (!base64) throw new Error('Le PDF n’a pas pu être créé.');
      const donnees = depuisBase64(base64);
      const d = await enregistrerPdf(bilanId, { nom: `bilan-${x.date}.pdf`, type: 'application/pdf', taille: donnees.byteLength, donnees });
      setRetour(`Bilan et PDF enregistrés (version ${d.version} dans Documents).`);
    } catch (e) {
      setErreur(`Bilan enregistré, mais le PDF ne l’est pas : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
    } finally {
      setOccupe(false);
    }
  }

  async function imprimer() {
    if (!id) return;
    const c = await crm.carnet();
    const x = c.bilans.find((y) => y.id === id)!;
    const contact = c.contacts.find((y) => y.id === x.contactId);
    const cadre = document.createElement('iframe');
    cadre.style.position = 'fixed';
    cadre.style.width = '0';
    cadre.style.height = '0';
    cadre.style.border = '0';
    cadre.srcdoc = bilanHtml(x, contact ? nomComplet(contact) : 'Bilan', { police: BEBAS_NEUE_BASE64 });
    cadre.onload = () => {
      cadre.contentWindow?.print();
      setTimeout(() => cadre.remove(), 60000);
    };
    document.body.appendChild(cadre);
  }

  async function deposer() {
    if (!id) return;
    setOccupe(true);
    setErreur(undefined);
    setRetour(undefined);
    try {
      const fichier = await choisirFichier();
      if (!fichier) return;
      if (fichier.type !== 'application/pdf') throw new Error('Déposez le bilan au format PDF.');
      const d = await enregistrerPdf(id, fichier);
      setRetour(`PDF enregistré (version ${d.version} dans Documents).`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le PDF n’a pas été enregistré.');
    } finally {
      setOccupe(false);
    }
  }

  const contacts = carnet.contacts.filter((c) => c.statut !== 'archive' || c.id === b.contactId);
  return (
    <Modale
      titre={bilan ? 'Modifier le bilan' : 'Nouveau bilan'}
      onFermer={() => demanderSortie(onFermer)}
      pied={
        <View style={{ gap: espace(3) }}>
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreurTexte}>
              {erreur}
            </Text>
          )}
          {retour && <Text style={styles.retour}>{retour}</Text>}
          {sortie ? (
            <PiedEditeur
              modifie
              enregistrement={false}
              peutEnregistrer={false}
              onEnregistrer={() => undefined}
              onFermer={() => sortie()}
              sortieDemandee
              onRester={() => setSortie(null)}
            />
          ) : (
            <View style={{ gap: espace(2) }}>
              <Bouton
                libelle={occupe ? (Platform.OS === 'web' ? 'Enregistrement…' : 'Création du PDF…') : Platform.OS === 'web' ? 'Enregistrer le bilan' : 'Enregistrer le bilan et son PDF'}
                onPress={enregistrer}
                chargement={occupe}
                desactive={occupe || invalide || envoye || (!!id && !modifie)}
              />
              {Platform.OS === 'web' && id && !modifie && (
                <View style={styles.ligne}>
                  <BoutonContour libelle="Imprimer ou enregistrer en PDF" onPress={imprimer} />
                  <BoutonContour libelle="Déposer le PDF dans Documents" desactive={occupe || envoye} onPress={deposer} />
                </View>
              )}
              <BoutonContour libelle="Fermer" onPress={() => demanderSortie(onFermer)} />
            </View>
          )}
        </View>
      }
    >
      {envoye && <Text style={styles.alerte}>Ce bilan a déjà été envoyé : créez un nouveau bilan pour conserver l’historique.</Text>}
      <Grille>
        <Cellule>
          <View style={{ gap: espace(2) }}>
            <Libelle>Contact</Libelle>
            <Selecteur
              libelle="Contact du bilan"
              sansLibelle
              options={[{ cle: '', libelle: 'Choisir…' }, ...contacts.map((c) => ({ cle: c.id, libelle: nomComplet(c) }))]}
              valeur={b.contactId}
              onChange={(v) => maj({ contactId: v })}
            />
          </View>
        </Cellule>
        <Cellule>
          <Saisie libelle="Date" valeur={b.date} onChange={(v) => maj({ date: v })} placeholder="jj/mm/aaaa" erreur={erreurs.date} />
        </Cellule>
        {(
          [
            ['poids', 'Poids (kg)'],
            ['taille', 'Taille (cm)'],
            ['tourTaille', 'Tour de taille (cm)'],
            ['tourHanches', 'Tour de hanches (cm)'],
          ] as const
        ).map(([k, l]) => (
          <Cellule key={k}>
            <Saisie libelle={l} type="nombre" valeur={b[k]} onChange={(v) => maj({ [k]: v })} erreur={erreurs[k]} />
          </Cellule>
        ))}
      </Grille>
      <Text style={styles.sousTitre}>Les dix piliers</Text>
      <Text style={styles.raison}>Score de coaching sur 10. Laissez « Non évalué » si vous n’avez pas évalué ce pilier.</Text>
      <Grille>
        {PILIERS.map((p) => (
          <Cellule key={p}>
            <View style={styles.pilierLigne}>
              <Text style={[styles.texte, { flexShrink: 1 }]}>{p}</Text>
              <View style={{ minWidth: 150 }}>
                <Selecteur
                  libelle={p}
                  sansLibelle
                  options={[{ cle: '', libelle: 'Non évalué' }, ...Array.from({ length: 10 }, (_, i) => ({ cle: String(i + 1), libelle: `${i + 1}/10` }))]}
                  valeur={b.piliers[p] ?? ''}
                  onChange={(v) => maj({ piliers: { ...b.piliers, [p]: v } })}
                />
              </View>
            </View>
          </Cellule>
        ))}
      </Grille>
      <Saisie libelle="Synthèse destinée au client" long valeur={b.synthese} onChange={(synthese) => maj({ synthese })} />
      {b.priorites.map((p, i) => (
        <Saisie
          key={i}
          libelle={`Priorité ${i + 1}`}
          valeur={p}
          max={500}
          onChange={(v) => maj({ priorites: b.priorites.map((x, j) => (i === j ? v : x)) })}
        />
      ))}
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
  supprimer: { paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rouge },
  raison: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  retour: { fontFamily: polices.texte, fontSize: 14, color: couleurs.vert },
  erreurTexte: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
  texte: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texte },
  mesure: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontFamily: polices.texte, fontSize: 12, color: couleurs.texte },
  ecart: { color: couleurs.texteDoux },
  pilier: { borderRadius: 999, backgroundColor: couleurs.discret, paddingHorizontal: 8, paddingVertical: 4, fontFamily: polices.texte, fontSize: 12, color: couleurs.texte },
  sousTitre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  pilierLigne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2), borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 8, padding: 12 },
  alerte: { borderRadius: 8, backgroundColor: '#FEF3C7', padding: 12, fontFamily: polices.texte, fontSize: 14, color: '#78350F' },
});
