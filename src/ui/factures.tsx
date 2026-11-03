// Factures : réglages d'en-tête du coach (Mon profil), numérotation et factures d'un client (fiche), « Mes factures » du client.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';

import { factures, type Numerotation } from '@/data/factures';
import {
  COULEURS_FACTURE,
  erreursEntete,
  estCouleur,
  factureHtml,
  nettoyerPrefixe,
  prochainNumero,
  type EnteteFacture,
  type Facture,
} from '@/domain/factures';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, SousTitre, Texte } from './composants';
import { couleurs, espace } from './theme';

const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;
const dateFr = (j?: string) => (j ? j.split('-').reverse().join('/') : '');

/** Web : fenêtre d'impression (« Enregistrer au format PDF ») ; téléphone : PDF partagé (mail, WhatsApp, Fichiers). */
export async function ouvrirFacture(f: Facture, style: { couleur?: string; logo?: string }) {
  const html = factureHtml(f, { ...style, police: BEBAS_NEUE_BASE64 });
  if (Platform.OS === 'web') {
    const cadre = document.createElement('iframe');
    Object.assign(cadre.style, { position: 'fixed', width: '0', height: '0', border: '0' });
    cadre.srcdoc = html;
    cadre.onload = () => {
      cadre.contentWindow?.print();
      setTimeout(() => cadre.remove(), 60000);
    };
    document.body.appendChild(cadre);
    return;
  }
  // A4 en points (72 par pouce).
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Facture ${f.numero}`, UTI: 'com.adobe.pdf' });
}

function LigneFactureListe({ f, style }: { f: Facture; style: { couleur?: string; logo?: string } }) {
  const [erreur, setErreur] = useState<string>();
  return (
    <View style={{ gap: espace(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Texte style={{ fontWeight: '600' }}>
            {f.numero} · {f.objet}
          </Texte>
          <Texte doux style={{ fontSize: 13 }}>
            {dateFr(f.date)} · {f.total === 0 ? 'offert' : euros(f.total)}
          </Texte>
        </View>
        <Bouton
          variante="contour"
          libelle="Télécharger le PDF"
          onPress={() => ouvrirFacture(f, style).catch((e) => setErreur(e instanceof Error ? e.message : 'PDF non créé'))}
        />
      </View>
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

export function FacturesClient({ clientId, prenom, nom }: { clientId: string; prenom: string; nom: string }) {
  const liste = useCharger(() => factures.liste(clientId), `factures-${clientId}`);
  const num = useCharger(() => factures.numerotation(clientId), `factures-num-${clientId}`);
  const aFacturer = useCharger(() => factures.aFacturer(clientId), `factures-a-${clientId}`);
  const style = useCharger(() => factures.style(), 'factures-style');
  const [enCours, setEnCours] = useState<string>();
  const [erreur, setErreur] = useState<string>();

  async function facturer(id: string) {
    setEnCours(id);
    setErreur(undefined);
    try {
      await factures.facturer(id);
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
        Chaque prélèvement Stripe réussi reçoit sa facture tout seul, à tes couleurs (réglages dans Mon profil). {prenom} la retrouve dans son compte.
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
      {liste.donnee?.map((f) => <LigneFactureListe key={f.id} f={f} style={style.donnee ?? {}} />)}
      {!!liste.donnee?.length && <AideWeb />}
      {!!aFacturer.donnee?.length && (
        <View style={{ gap: espace(2), marginTop: espace(2) }}>
          <Texte style={{ fontWeight: '600' }}>Paiements encaissés sans facture</Texte>
          {aFacturer.donnee.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), flexWrap: 'wrap' }}>
              <Texte style={{ flex: 1, minWidth: 160 }}>
                {p.titre} · {euros(p.montant)}
                {p.date ? ` · ${dateFr(p.date)}` : ''}
              </Texte>
              <Bouton variante="discret" libelle="Créer la facture" chargement={enCours === p.id} onPress={() => facturer(p.id)} />
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
  const n = Number(prochain);
  const modifie = prefixe !== (initial.prefixe ?? '') || n !== initial.prochain || nomFacture !== (initial.nomFacture ?? '');

  async function enregistrer() {
    try {
      await factures.changerNumerotation(clientId, { prefixe, prochain: n, nomFacture });
      setMessage({ ok: true, texte: 'Numérotation enregistrée.' });
      onEnregistre();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Non enregistré' });
    }
  }

  return (
    <View style={{ gap: espace(2) }}>
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
      {modifie && <Bouton variante="secondaire" libelle="Enregistrer la numérotation" onPress={enregistrer} desactive={!n} />}
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
        <ChampTexte libelle="Mentions en bas de facture" valeur={e.mentions} onChange={(mentions) => modifier({ mentions })} multiligne />
        {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
        <Bouton
          variante="contour"
          libelle="Voir un exemple"
          onPress={() => ouvrirFacture(exemple, { couleur: e.couleur, logo: e.logo }).catch((x) => setErreurs([x instanceof Error ? x.message : 'Aperçu impossible']))}
        />
        <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={enCours} />
        {enregistre && <Texte style={{ fontSize: 14, color: couleurs.vert }}>Réglages enregistrés.</Texte>}
      </Carte>
    </View>
  );
}
