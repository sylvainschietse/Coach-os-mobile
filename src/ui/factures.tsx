// Factures : réglages d'en-tête du coach (Mon profil), numérotation et factures d'un client (fiche), « Mes factures » du client.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';

import { documents } from '@/data/documents';
import { factures, type Numerotation, type PaiementAFacturer } from '@/data/factures';
import { useSession } from '@/data/session';
import { lienEnvoi, normaliserEmail } from '@/domain/crm';
import { emailFacture, messageWhatsAppFacture, nomFichierFacture, nomFichierFacturesClient, prenomEmetteur } from '@/domain/factures-envoi';
import {
  COULEURS_FACTURE,
  erreursEntete,
  estCouleur,
  factureHtml,
  facturesHtml,
  facturesParClient,
  recapAnnuelHtml,
  nettoyerPrefixe,
  prochainNumero,
  type EnteteFacture,
  type Facture,
} from '@/domain/factures';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, SousTitre, Texte } from './composants';
import { couleurs, espace, polices } from './theme';

const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;
const dateFr = (j?: string) => (j ? j.split('-').reverse().join('/') : '');

type StyleFacture = {
  couleur?: string;
  logo?: string;
  iban?: string;
  bic?: string;
};

/** Web : la fenêtre d'impression du navigateur (« Enregistrer au format PDF »). */
function imprimerFacture(f: Facture, style: StyleFacture) {
  const cadre = document.createElement('iframe');
  Object.assign(cadre.style, {
    position: 'fixed',
    width: '0',
    height: '0',
    border: '0',
  });
  cadre.srcdoc = factureHtml(f, { ...style, police: BEBAS_NEUE_BASE64 });
  cadre.onload = () => {
    cadre.contentWindow?.print();
    setTimeout(() => cadre.remove(), 60000);
  };
  document.body.appendChild(cadre);
}

/** Téléphone : le PDF de la facture dans le cache, sous un nom lisible (« Facture YC253 - Angelo Callegaro - … .pdf »). */
async function pdfFacture(f: Facture, style: StyleFacture): Promise<File> {
  // A4 en points (72 par pouce).
  const { uri } = await Print.printToFileAsync({
    html: factureHtml(f, { ...style, police: BEBAS_NEUE_BASE64 }),
    width: 595,
    height: 842,
  });
  const cible = new File(Paths.cache, nomFichierFacture(f));
  if (cible.exists) cible.delete();
  await new File(uri).move(cible);
  return cible;
}

/** Web : fenêtre d'impression ; téléphone : PDF partagé (mail, WhatsApp, Fichiers). */
export async function ouvrirFacture(f: Facture, style: StyleFacture) {
  if (Platform.OS === 'web') return imprimerFacture(f, style);
  const pdf = await pdfFacture(f, style);
  await Sharing.shareAsync(pdf.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Facture ${f.numero}`,
    UTI: 'com.adobe.pdf',
  });
}

/** Enregistre le PDF sur l'appareil : Android demande le dossier, l'iPhone passe par « Enregistrer dans Fichiers ». */
async function telechargerSurAppareil(f: Facture, style: StyleFacture): Promise<string | undefined> {
  if (Platform.OS === 'web') {
    imprimerFacture(f, style);
    return undefined;
  }
  const pdf = await pdfFacture(f, style);
  if (Platform.OS !== 'android') {
    await Sharing.shareAsync(pdf.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Facture ${f.numero}`,
      UTI: 'com.adobe.pdf',
    });
    return undefined;
  }
  let dossier: Directory;
  try {
    dossier = await Directory.pickDirectoryAsync();
  } catch {
    return undefined; // Fenêtre fermée sans choisir de dossier.
  }
  const fichier = dossier.createFile(nomFichierFacture(f).replace(/\.pdf$/, ''), 'application/pdf');
  await fichier.write(await pdf.bytes());
  return `Facture enregistrée dans le dossier choisi.`;
}

/** Web : fenêtre d'impression d'un document HTML déjà prêt. */
function imprimerHtml(html: string) {
  const cadre = document.createElement('iframe');
  Object.assign(cadre.style, { position: 'fixed', width: '0', height: '0', border: '0' });
  cadre.srcdoc = html;
  cadre.onload = () => {
    cadre.contentWindow?.print();
    setTimeout(() => cadre.remove(), 60000);
  };
  document.body.appendChild(cadre);
}

/**
 * Enregistre un ou plusieurs PDF sur l'appareil. Android : un seul choix de dossier pour tous les fichiers ;
 * iPhone : le partage, fichier par fichier ; web : une seule fenêtre d'impression qui les réunit.
 */
async function enregistrerPdfs(fichiers: { nom: string; html: string }[]): Promise<string | undefined> {
  if (!fichiers.length) return 'Aucune facture pour le moment.';
  if (Platform.OS === 'web') {
    const corps = fichiers.map((x) => x.html.slice(x.html.indexOf('<body>') + 6, x.html.lastIndexOf('</body>'))).join('\n');
    const h = fichiers[0].html;
    imprimerHtml(h.slice(0, h.indexOf('<body>') + 6) + corps + '</body></html>');
    return undefined;
  }
  let dossier: Directory | undefined;
  if (Platform.OS === 'android') {
    try {
      dossier = await Directory.pickDirectoryAsync();
    } catch {
      return undefined; // Fenêtre fermée sans choisir de dossier.
    }
  }
  for (const x of fichiers) {
    const { uri } = await Print.printToFileAsync({ html: x.html, width: 595, height: 842 });
    const pdf = new File(Paths.cache, x.nom);
    if (pdf.exists) pdf.delete();
    await new File(uri).move(pdf);
    if (dossier) await dossier.createFile(x.nom.replace(/\.pdf$/, ''), 'application/pdf').write(await pdf.bytes());
    else await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', dialogTitle: x.nom, UTI: 'com.adobe.pdf' });
  }
  return fichiers.length > 1 ? `${fichiers.length} fichiers enregistrés dans le dossier choisi.` : dossier ? 'Fichier enregistré dans le dossier choisi.' : undefined;
}

/**
 * Sans client : « Récupérer toutes mes factures », un PDF par client. Avec un client : toutes ses factures,
 * de la première à la dernière, dans un seul PDF.
 */
export function BoutonToutesFactures({ clientId, nom }: { clientId?: string; nom?: string }) {
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const agir = async () => {
    setOccupe(true);
    setErreur(undefined);
    setRetour(undefined);
    try {
      const style = { ...(await factures.style()), police: BEBAS_NEUE_BASE64 };
      const liste = clientId ? await factures.liste(clientId) : await factures.toutes();
      const groupes = clientId ? [{ nom: nom || liste[0]?.destinataire.nom || 'Client', factures: liste }] : facturesParClient(liste);
      const fichiers = groupes
        .filter((g) => g.factures.length)
        .map((g) => ({ nom: nomFichierFacturesClient(g.nom), html: facturesHtml(g.factures, style, `Factures ${g.nom}`) }));
      const r = await enregistrerPdfs(fichiers);
      if (r) setRetour(r);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'PDF non créé');
    } finally {
      setOccupe(false);
    }
  };
  return (
    <View style={{ gap: 2, alignItems: 'flex-start' }}>
      <Bouton variante="secondaire" libelle={clientId ? 'Toutes ses factures (un seul PDF)' : 'Récupérer toutes mes factures'} chargement={occupe} onPress={agir} />
      {!clientId && (
        <Texte doux style={{ fontSize: 12 }}>
          Un PDF par client, avec toutes ses factures.
        </Texte>
      )}
      {retour && <Texte style={{ fontSize: 13, color: couleurs.vert }}>{retour}</Texte>}
      {erreur && <Texte style={{ fontSize: 13, color: couleurs.rouge }}>{erreur}</Texte>}
    </View>
  );
}

/** Récapitulatif des sommes réglées par le client sur une année civile (l'an dernier et l'année en cours). */
function BoutonsRecapAnnuel({ liste, nom }: { liste: Facture[]; nom: string }) {
  const [occupe, setOccupe] = useState<number>();
  const [retour, setRetour] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const cette = new Date().getFullYear();
  const annees = [cette - 1, cette].filter((a) => liste.some((f) => f.total > 0 && f.payeLe?.startsWith(`${a}-`)));
  if (!annees.length) return null;
  const agir = async (annee: number) => {
    setOccupe(annee);
    setErreur(undefined);
    setRetour(undefined);
    try {
      const style = { ...(await factures.style()), police: BEBAS_NEUE_BASE64 };
      const recent = [...liste].sort((a, b) => b.date.localeCompare(a.date))[0];
      const html = recapAnnuelHtml(liste, annee, { nom: recent?.destinataire.nom || nom, adresse: recent?.destinataire.adresse }, style);
      const r = await enregistrerPdfs([{ nom: `Récapitulatif ${annee} - ${nomFichierFacturesClient(nom).replace(/^Factures - /, '')}`, html }]);
      if (r) setRetour(r);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'PDF non créé');
    } finally {
      setOccupe(undefined);
    }
  };
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
        {annees.map((a) => (
          <Bouton key={a} variante="secondaire" libelle={`Récapitulatif ${a}`} chargement={occupe === a} onPress={() => agir(a)} />
        ))}
      </View>
      <Texte doux style={{ fontSize: 12 }}>
        Total réglé sur l’année civile, facture par facture. Ce n’est pas une attestation fiscale.
      </Texte>
      {retour && <Texte style={{ fontSize: 13, color: couleurs.vert }}>{retour}</Texte>}
      {erreur && <Texte style={{ fontSize: 13, color: couleurs.rouge }}>{erreur}</Texte>}
    </View>
  );
}

/** Contact du client à qui la facture est envoyée (fiche client). */
export interface DestinataireFacture {
  contactId: string;
  prenom: string;
  telephone?: string;
  email?: string;
}

/** sansEntete : sous le bouton « Facture … » de Paiements, qui dit déjà le numéro. */
function LigneFactureListe({ f, style, envoi, sansEntete }: { f: Facture; style: StyleFacture; envoi?: DestinataireFacture; sansEntete?: boolean }) {
  const { email } = useSession();
  const [erreur, setErreur] = useState<string>();
  const [retour, setRetour] = useState<string>();
  const [choix, setChoix] = useState(false);
  const [occupe, setOccupe] = useState<'documents' | 'appareil' | 'email' | 'whatsapp' | 'pdf'>();
  const agir = async (quoi: NonNullable<typeof occupe>, fn: () => Promise<string | undefined | void>) => {
    setErreur(undefined);
    setRetour(undefined);
    setOccupe(quoi);
    try {
      const r = await fn();
      if (r) setRetour(r);
      setChoix(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'PDF non créé');
    } finally {
      setOccupe(undefined);
    }
  };
  const signature = {
    prenom: prenomEmetteur(f.emetteur.nom),
    telephone: f.emetteur.telephone,
    email,
  };
  const messageWhatsApp = envoi ? messageWhatsAppFacture(f, envoi.prenom, signature) : '';
  const lienWhatsApp = envoi ? lienEnvoi('whatsapp', envoi, messageWhatsApp) : null;

  /**
   * Téléphone : comme le compte rendu, le PDF part par le partage du téléphone (WhatsApp, puis le contact).
   * Android ne transmet pas de texte avec un fichier : le message est copié, à coller en légende.
   * Sur ordinateur, WhatsApp Web s'ouvre sur la conversation avec le message, sans pièce jointe.
   */
  const envoyerWhatsApp = async () => {
    if (Platform.OS === 'web') {
      if (lienWhatsApp) await ouvrirLien(lienWhatsApp);
      return;
    }
    const pdf = await pdfFacture(f, style);
    await Clipboard.setStringAsync(messageWhatsApp);
    await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Facture ${f.numero}` });
    return 'Message copié : dans WhatsApp, appuie longuement sur la légende puis « Coller ».';
  };
  const mail = envoi ? emailFacture(f, envoi.prenom, signature) : undefined;
  const adresse = normaliserEmail(envoi?.email);

  /** Téléphone : l'e-mail part avec la facture jointe ; sur ordinateur, la messagerie s'ouvre et le PDF se joint à la main. */
  const envoyerEmail = async () => {
    if (!mail || !adresse) return;
    if (Platform.OS !== 'web' && (await MailComposer.isAvailableAsync())) {
      const pdf = await pdfFacture(f, style);
      await MailComposer.composeAsync({
        recipients: [adresse],
        subject: mail.sujet,
        body: mail.corps,
        attachments: [pdf.uri],
      });
      return;
    }
    await ouvrirLien(lienEnvoi('email', { email: adresse }, mail.corps, mail.sujet)!);
    return Platform.OS === 'web' ? 'Joins le PDF au message : « Sur cet appareil » l’enregistre d’abord.' : undefined;
  };

  const versDocuments = async () => {
    if (!envoi) return;
    const pdf = await pdfFacture(f, style);
    const donnees = await pdf.bytes();
    await documents.creer(
      {
        nom: nomFichierFacture(f).replace(/\.pdf$/, ''),
        contactId: envoi.contactId,
        type: 'Facture',
        date: f.date,
      },
      {
        nom: nomFichierFacture(f),
        type: 'application/pdf',
        taille: donnees.byteLength,
        donnees: donnees.slice().buffer,
      },
    );
    return `Facture ajoutée aux documents de ${envoi.prenom || 'ce client'}.`;
  };

  return (
    <View style={{ gap: espace(1) }}>
      {!sansEntete && (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: espace(3),
          flexWrap: 'wrap',
        }}
      >
        <View style={{ flex: 1, minWidth: 160 }}>
          <Texte style={{ fontWeight: '600' }}>
            {f.numero} · {f.objet}
          </Texte>
          <Texte doux style={{ fontSize: 13 }}>
            {dateFr(f.date)} · {f.total === 0 ? 'offert' : euros(f.total)}
            {f.total > 0 && !f.payeLe ? ' · à régler' : ''}
          </Texte>
        </View>
        {!envoi && (
          <Bouton variante="discret" libelle="Télécharger le PDF" chargement={occupe === 'pdf'} onPress={() => agir('pdf', () => ouvrirFacture(f, style))} />
        )}
      </View>
      )}
      {envoi && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
          <Bouton variante="discret" libelle={choix ? 'Télécharger ▴' : 'Télécharger ▾'} onPress={() => setChoix((c) => !c)} />
          {(Platform.OS !== 'web' || lienWhatsApp) && (
            <Bouton variante="discret" libelle="WhatsApp" chargement={occupe === 'whatsapp'} onPress={() => agir('whatsapp', envoyerWhatsApp)} />
          )}
          {adresse && <Bouton variante="discret" libelle="E-mail" chargement={occupe === 'email'} onPress={() => agir('email', envoyerEmail)} />}
        </View>
      )}
      {envoi && choix && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: espace(2),
            paddingLeft: espace(2),
          }}
        >
          {/* Sur ordinateur, le PDF naît dans la fenêtre d'impression : il ne peut pas partir tout seul dans les documents. */}
          {Platform.OS !== 'web' && (
            <Bouton variante="secondaire" libelle="Dans ses documents" chargement={occupe === 'documents'} onPress={() => agir('documents', versDocuments)} />
          )}
          <Bouton
            variante="secondaire"
            libelle="Sur cet appareil"
            chargement={occupe === 'appareil'}
            onPress={() => agir('appareil', () => telechargerSurAppareil(f, style))}
          />
        </View>
      )}
      {retour && <Texte style={{ fontSize: 13, color: couleurs.vert }}>{retour}</Texte>}
      {erreur && <Texte style={{ fontSize: 13, color: couleurs.rouge }}>{erreur}</Texte>}
    </View>
  );
}

/** Sur ordinateur, la facture passe par la fenêtre d'impression du navigateur. */
function AideWeb() {
  return Platform.OS === 'web' ? (
    <Texte doux style={{ fontSize: 13 }}>
      Dans la fenêtre qui s’ouvre, choisis « Enregistrer au format PDF » comme imprimante.
    </Texte>
  ) : null;
}

/**
 * Rubrique Paiements : la facture d'une ligne (l'ouvrir), ou la créer si la ligne est payée ou en attente et liée à un client.
 * Une séance seule (référence « seance:… ») se facture avec les autres séances du mois du client.
 */
export function BoutonFacture({
  facture,
  facturable,
  paiementId,
  reference,
  date,
  onCree,
  envoi,
  onOuvrirFiche,
}: {
  /** Client de la ligne : Télécharger, WhatsApp et E-mail, comme dans la fiche client. */
  envoi?: DestinataireFacture;
  /** Toucher une facture existante ouvre la fiche de la ligne (détail, dates, statut) au lieu du PDF. */
  onOuvrirFiche?: () => void;
  facture?: Facture;
  facturable: boolean;
  paiementId: string;
  reference?: string;
  date?: string;
  onCree: () => void;
}) {
  const seance = seanceDuMois(reference, date);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const style = useCharger(() => factures.style(), 'factures-style');
  if (!facture && !facturable) return null;
  const agir = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      if (facture && onOuvrirFiche) onOuvrirFiche();
      else if (facture) await ouvrirFacture(facture, style.donnee ?? {});
      else {
        if (seance) await factures.facturerMois(seance.clientId, seance.mois);
        else await factures.facturer(paiementId);
        onCree();
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Facture indisponible');
    } finally {
      setOccupe(false);
    }
  };
  return (
    <View style={{ gap: 2 }}>
      <Bouton variante="discret" libelle={facture ? `Facture ${facture.numero}${facture.payeLe || facture.total === 0 ? '' : ' · à régler'}` : seance ? 'Facturer le mois' : 'Créer la facture'} onPress={agir} chargement={occupe} />
      {erreur && <Texte style={{ fontSize: 12, color: couleurs.rouge }}>{erreur}</Texte>}
      {facture && envoi && <LigneFactureListe f={facture} style={style.donnee ?? {}} envoi={envoi} sansEntete />}
    </View>
  );
}

/**
 * En tête de la fiche d'une ligne de Paiements : sa facture (numéro, à régler ou réglée), le PDF et l'envoi.
 * Une facture pas encore réglée suit les corrections de la ligne une fois la fiche enregistrée.
 */
export function FactureDeLaFiche({ paiementId, envoi, modifie }: { paiementId: string; envoi?: DestinataireFacture; modifie: boolean }) {
  const liste = useCharger(() => factures.parPaiement(), `facture-fiche-${paiementId}`);
  const style = useCharger(() => factures.style(), 'factures-style');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const f = liste.donnee?.get(paiementId);
  if (!f) return null;
  // Facture du mois des séances une par une : elle couvre plusieurs lignes et ne suit pas les corrections.
  const groupee = f.paiementId !== paiementId;
  const voir = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      await ouvrirFacture(f, style.donnee ?? {});
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'PDF non créé');
    } finally {
      setOccupe(false);
    }
  };
  const aide = f.payeLe
    ? 'Facture réglée : elle garde son contenu, tes corrections ici ne la changent plus.'
    : groupee
      ? 'Facture du mois : elle regroupe plusieurs séances et ne suit pas les corrections de cette ligne.'
      : modifie
        ? 'Enregistre la fiche : la facture reprendra tes corrections, sous le même numéro.'
        : 'Corrige le détail, les dates ou le statut ci-dessous puis enregistre : la facture suit, sous le même numéro.';
  return (
    <View style={{ gap: espace(2), padding: espace(3), borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, marginBottom: espace(4) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Texte style={{ fontWeight: '600' }}>
            Facture {f.numero} · {f.objet}
          </Texte>
          <Texte doux style={{ fontSize: 13 }}>
            {dateFr(f.date)} · {f.total === 0 ? 'offert' : euros(f.total)}
            {f.total > 0 ? (f.payeLe ? ` · réglée le ${dateFr(f.payeLe)}` : ' · à régler') : ''}
          </Texte>
        </View>
        <Bouton variante="discret" libelle="Voir le PDF" chargement={occupe} onPress={voir} />
      </View>
      {envoi && <LigneFactureListe f={f} style={style.donnee ?? {}} envoi={envoi} sansEntete />}
      <Texte doux style={{ fontSize: 13 }}>
        {aide}
      </Texte>
      {erreur && <Texte style={{ fontSize: 13, color: couleurs.rouge }}>{erreur}</Texte>}
    </View>
  );
}

/** « seance:<rdv>:<client> » du 2026-11-05 → le client et le mois 2026-11. */
function seanceDuMois(reference?: string, date?: string) {
  const m = reference?.match(/^seance:[^:]+:([0-9a-f-]{36})$/);
  return m && date ? { clientId: m[1], mois: date.slice(0, 7) } : undefined;
}

// ---------- Client : « Mes factures » ----------

export function MesFactures({ clientId }: { clientId: string }) {
  const liste = useCharger(() => factures.liste(clientId), `factures-${clientId}`);
  const style = useCharger(() => factures.style(), 'factures-style');
  if (!liste.donnee?.length && !liste.erreur) return null;
  return (
    <Carte>
      <SousTitre>Mes factures</SousTitre>
      {liste.erreur && <Erreur message={liste.erreur} onReessayer={liste.recharger} />}
      {liste.donnee?.map((f) => <LigneFactureListe key={f.id} f={f} style={style.donnee ?? {}} />)}
      <AideWeb />
    </Carte>
  );
}

// ---------- Coach : factures d'un client ----------

export function FacturesClient({ clientId, prenom, nom, envoi }: { clientId: string; prenom: string; nom: string; envoi?: DestinataireFacture }) {
  const liste = useCharger(() => factures.liste(clientId), `factures-${clientId}`);
  const num = useCharger(() => factures.numerotation(clientId), `factures-num-${clientId}`);
  const aFacturer = useCharger(() => factures.aFacturer(clientId), `factures-a-${clientId}`);
  const style = useCharger(() => factures.style(), 'factures-style');
  const [enCours, setEnCours] = useState<string>();
  const [erreur, setErreur] = useState<string>();

  async function facturer(p: PaiementAFacturer) {
    setEnCours(p.id);
    setErreur(undefined);
    try {
      if (p.mois) await factures.facturerMois(clientId, p.mois);
      else await factures.facturer(p.id);
      liste.recharger();
      num.recharger();
      aFacturer.recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Facture non créée');
    } finally {
      setEnCours(undefined);
    }
  }

  return (
    <Carte>
      <SousTitre>Factures</SousTitre>
      <Texte doux style={{ fontSize: 13 }}>
        Chaque abonnement réglé (même offert), chaque pack payé et les séances de chaque mois reçoivent leur facture toute seule, à tes couleurs.
        Une facture pas encore payée part « à régler » : envoie-la comme demande de paiement. {prenom} la retrouve dans son compte.
      </Texte>
      {num.donnee && (
        <Numeroter
          key={`${num.donnee.prefixe}-${num.donnee.prochain}`}
          clientId={clientId}
          initial={num.donnee}
          prenom={prenom}
          nom={nom}
          onEnregistre={num.recharger}
        />
      )}
      {(liste.erreur || aFacturer.erreur) && <Erreur message={(liste.erreur || aFacturer.erreur)!} onReessayer={liste.recharger} />}
      {!liste.donnee && !liste.erreur && <Chargement />}
      {liste.donnee?.length === 0 && <Texte doux>Aucune facture pour le moment.</Texte>}
      {liste.donnee?.map((f) => <LigneFactureListe key={f.id} f={f} style={style.donnee ?? {}} envoi={envoi} />)}
      {!!liste.donnee?.length && Platform.OS !== 'web' && (
        <Texte doux style={{ fontSize: 12 }}>
          WhatsApp : la facture est jointe, tu choisis {prenom || 'le client'} dans la liste et tu colles le message déjà copié en légende.
        </Texte>
      )}
      {!!liste.donnee?.length && <AideWeb />}
      {(liste.donnee?.length ?? 0) > 1 && <BoutonToutesFactures clientId={clientId} nom={`${prenom} ${nom}`.trim()} />}
      {!!liste.donnee?.length && <BoutonsRecapAnnuel liste={liste.donnee} nom={`${prenom} ${nom}`.trim()} />}
      {!!aFacturer.donnee?.length && (
        <View style={{ gap: espace(2), marginTop: espace(2) }}>
          <Texte style={{ fontWeight: '600' }}>Sans facture pour le moment</Texte>
          {aFacturer.donnee.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), flexWrap: 'wrap' }}>
              <Texte style={{ flex: 1, minWidth: 160 }}>
                {p.titre} · {euros(p.montant)}
                {p.date ? ` · ${dateFr(p.date)}` : ''}
                {p.enAttente ? ' · en attente' : ''}
              </Texte>
              <Bouton variante="discret" libelle="Créer la facture" chargement={enCours === p.id} onPress={() => facturer(p)} />
            </View>
          ))}
        </View>
      )}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </Carte>
  );
}

function Numeroter({
  clientId,
  initial,
  prenom,
  nom,
  onEnregistre,
}: {
  clientId: string;
  initial: Numerotation;
  prenom: string;
  nom: string;
  onEnregistre: () => void;
}) {
  const [prefixe, setPrefixe] = useState(initial.prefixe ?? '');
  const [prochain, setProchain] = useState(String(initial.prochain));
  const [nomFacture, setNomFacture] = useState(initial.nomFacture ?? '');
  const [message, setMessage] = useState<{ ok: boolean; texte: string }>();
  const [ouvert, setOuvert] = useState(false);
  const n = Number(prochain);
  const modifie = prefixe !== (initial.prefixe ?? '') || n !== initial.prochain || nomFacture !== (initial.nomFacture ?? '');

  async function enregistrer() {
    try {
      await factures.changerNumerotation(clientId, { prefixe, prochain: n, nomFacture });
      setMessage({ ok: true, texte: 'Numérotation enregistrée.' });
      setOuvert(false);
      onEnregistre();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Non enregistré' });
    }
  }

  if (!ouvert)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2), flexWrap: 'wrap' }}>
        <Texte style={{ fontSize: 14 }}>
          Prochaine facture : <Texte style={{ fontSize: 14, fontWeight: '600' }}>{prochainNumero(initial.prefixe, initial.prochain, prenom, nom)}</Texte>
          {initial.nomFacture ? ` · au nom de ${initial.nomFacture}` : ''}
        </Texte>
        <Pressable accessibilityRole="button" onPress={() => setOuvert(true)}>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge }}>Modifier</Text>
        </Pressable>
        {message && <Texte style={{ fontSize: 13, color: message.ok ? couleurs.vert : couleurs.rouge }}>{message.texte}</Texte>}
      </View>
    );

  return (
    <View style={{ gap: espace(2) }}>
      <Texte doux style={{ fontSize: 13 }}>Reprends ta numérotation : les lettres de ce client et le numéro de sa prochaine facture.</Texte>
      <View style={{ flexDirection: 'row', gap: espace(3), flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 120 }}>
          <ChampTexte libelle="Lettres" valeur={prefixe} onChange={(v) => setPrefixe(nettoyerPrefixe(v))} placeholder="RT" />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <ChampTexte libelle="Prochain numéro" type="nombre" valeur={prochain} onChange={(v) => setProchain(v.replace(/\D/g, ''))} />
        </View>
      </View>
      <ChampTexte
        libelle="Facturé à (facultatif)"
        valeur={nomFacture}
        onChange={setNomFacture}
        placeholder={`${prenom} ${nom}`.trim()}
        aide="Une société ou un parent, si ce n’est pas le client lui-même."
      />
      <Texte doux style={{ fontSize: 13 }}>
        Prochaine facture : {prochainNumero(prefixe || undefined, n || 1, prenom, nom)}
      </Texte>
      <View style={{ flexDirection: 'row', gap: espace(2) }}>
        <View style={{ flex: 1 }}>
          <Bouton variante="secondaire" libelle="Enregistrer" onPress={enregistrer} desactive={!n || !modifie} />
        </View>
        <View style={{ flex: 1 }}>
          <Bouton variante="discret" libelle="Annuler" onPress={() => setOuvert(false)} />
        </View>
      </View>
      {message && <Texte style={{ fontSize: 13, color: message.ok ? couleurs.vert : couleurs.rouge }}>{message.texte}</Texte>}
    </View>
  );
}

// ---------- Coach : en-tête des factures (Mon profil) ----------

/** Logo réduit à 600 px de large, en PNG pour garder la transparence. */
async function preparerLogo(): Promise<string | undefined> {
  const choix = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const fichier = choix.canceled ? undefined : choix.assets[0];
  if (!fichier) return undefined;
  const largeur = Math.min(600, fichier.width);
  const rendu = await ImageManipulator.manipulate(fichier.uri).resize({ width: largeur }).renderAsync();
  const png = await rendu.saveAsync({ format: SaveFormat.PNG, base64: true });
  const valeur = `data:image/png;base64,${png.base64 ?? ''}`;
  if (valeur.length <= 400000) return valeur;
  const jpeg = await rendu.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  const v2 = `data:image/jpeg;base64,${jpeg.base64 ?? ''}`;
  if (v2.length <= 400000) return v2;
  throw new Error('Logo trop lourd : essaie une image plus simple.');
}

export function EnteteFactures() {
  const { donnee, erreur, recharger } = useCharger(() => factures.entete(), 'factures-entete');
  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
  if (!donnee) return <Chargement />;
  return <FormulaireEntete initial={donnee} />;
}

function FormulaireEntete({ initial }: { initial: EnteteFacture }) {
  const [e, setE] = useState(initial);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const modifier = (m: Partial<EnteteFacture>) => {
    setE({ ...e, ...m });
    setEnregistre(false);
  };

  async function choisirLogo() {
    setErreurs([]);
    try {
      const logo = await preparerLogo();
      if (logo) modifier({ logo });
    } catch (x) {
      setErreurs([x instanceof Error ? x.message : 'Image illisible']);
    }
  }

  async function enregistrer() {
    const liste = erreursEntete(e);
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await factures.enregistrerEntete(e);
      setEnregistre(true);
    } catch (x) {
      setErreurs([x instanceof Error ? x.message : 'Non enregistré']);
    } finally {
      setEnCours(false);
    }
  }

  const exemple: Facture = {
    id: 'apercu',
    numero: 'RT38',
    date: new Date().toISOString().slice(0, 10),
    objet: 'Abonnement Hybride complet',
    emetteur: { nom: e.nom || 'Ton nom', adresse: e.adresse, telephone: e.telephone, siret: e.siret.replace(/\s/g, ''), mentions: e.mentions },
    destinataire: { nom: 'Romain Tisseront', adresse: 'Route de Saint Bel\n69160 Tassin-la-Demi-Lune' },
    lignes: [
      { libelle: 'Abonnement Hybride complet', quantite: 1, prixUnitaire: 269, montant: 269 },
      { libelle: 'Remise · Merci d’être testeur', quantite: 1, prixUnitaire: -269, montant: -269 },
    ],
    total: 0,
    moyen: 'Stripe',
    payeLe: new Date().toISOString().slice(0, 10),
  };

  return (
    <View style={{ gap: espace(4), maxWidth: 560 }}>
      <Carte>
        <SousTitre>Mes factures</SousTitre>
        <Texte doux style={{ fontSize: 13 }}>
          Ces informations figurent en haut et en bas de chaque nouvelle facture. Une facture déjà émise ne change plus.
        </Texte>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(4), flexWrap: 'wrap' }}>
          {e.logo ? (
            <Image source={{ uri: e.logo }} style={{ width: 140, height: 60 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <Texte doux>Pas de logo</Texte>
          )}
          <View style={{ gap: espace(2) }}>
            <Bouton variante="discret" libelle={e.logo ? 'Changer le logo' : 'Ajouter un logo'} onPress={choisirLogo} />
            {e.logo && <Bouton variante="discret" libelle="Retirer le logo" onPress={() => modifier({ logo: undefined })} />}
          </View>
        </View>
        <Texte style={{ fontWeight: '600' }}>Couleur</Texte>
        <View style={{ flexDirection: 'row', gap: espace(3), flexWrap: 'wrap', alignItems: 'center' }}>
          {COULEURS_FACTURE.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Couleur ${c}`}
              onPress={() => modifier({ couleur: c })}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: c,
                borderWidth: 3,
                borderColor: e.couleur.toUpperCase() === c ? couleurs.noir : 'transparent',
              }}
            />
          ))}
          <View style={{ width: 130 }}>
            <ChampTexte libelle="Ou ta couleur" valeur={e.couleur} onChange={(couleur) => modifier({ couleur: couleur.trim() })} placeholder="#D71920" />
          </View>
          {estCouleur(e.couleur) && <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: e.couleur }} />}
        </View>
        <ChampTexte libelle="Nom sur la facture" valeur={e.nom} onChange={(nom) => modifier({ nom })} placeholder="SCHIETSE Sylvain" />
        <ChampTexte libelle="Adresse" valeur={e.adresse} onChange={(adresse) => modifier({ adresse })} multiligne placeholder={'N° et rue\nCode postal et ville'} />
        <ChampTexte libelle="Téléphone" valeur={e.telephone} onChange={(telephone) => modifier({ telephone })} />
        <ChampTexte libelle="SIRET" valeur={e.siret} onChange={(siret) => modifier({ siret })} type="nombre" />
        <ChampTexte
          libelle="Tarif de base d'une séance (€)"
          valeur={e.tarifBase}
          onChange={(tarifBase) => modifier({ tarifBase })}
          type="nombre"
          placeholder="60"
        />
        <Texte doux style={{ fontSize: 13 }}>Une séance moins chère apparaît au tarif de base, avec la remise en ligne séparée.</Texte>
        <ChampTexte libelle="IBAN (imprimé sur chaque facture)" valeur={e.iban} onChange={(iban) => modifier({ iban })} placeholder="FR76 3000 1007 9412 3456 7890 185" />
        <ChampTexte libelle="BIC (facultatif)" valeur={e.bic} onChange={(bic) => modifier({ bic })} placeholder="BNPAFRPP" />
        <ChampTexte libelle="Mentions en bas de facture" valeur={e.mentions} onChange={(mentions) => modifier({ mentions })} multiligne />
        {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
        <Bouton
          variante="discret"
          libelle="Voir un exemple"
          onPress={() => ouvrirFacture(exemple, { couleur: e.couleur, logo: e.logo, iban: e.iban, bic: e.bic }).catch((x) => setErreurs([x instanceof Error ? x.message : 'Aperçu impossible']))}
        />
        <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={enCours} />
        {enregistre && <Texte style={{ fontSize: 14, color: couleurs.vert }}>Réglages enregistrés.</Texte>}
      </Carte>
    </View>
  );
}
