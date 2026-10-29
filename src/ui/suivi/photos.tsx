// PhotoGallery.tsx d'origine (U10) : photos de progression privées par défaut, partage volontaire avec le coach,
// comparaison de deux dates pour un même angle. Le coach (fiche contact) ne voit que les photos partagées.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { suiviHebdo } from '@/data/suivi-hebdo';
import { ecrireJour, lireJour } from '@/domain/crm';
import { aujourdhuiParis } from '@/domain/entrainement';
import { imageValide, VUES, type VuePhoto } from '@/domain/suivi-hebdo';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Selecteur, TitreDisplay } from '../coque';
import { CaseACocher, Saisie } from '../crm/dossier';
import { Action, Confirmation, Etat, Ligne, ts } from '../entrainement/commun';
import { couleurs } from '../theme';

const OPTIONS_VUE = VUES.map((v) => ({ cle: v, libelle: v }));

export function Photos({ clientId, proprietaire }: { clientId: string; proprietaire: boolean }) {
  const { donnee: photos, erreur: erreurChargement, recharger } = useCharger(() => suiviHebdo.photos(clientId, proprietaire), `${clientId}:${proprietaire}`);
  const [vue, setVue] = useState<VuePhoto>('Face');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState('');
  const [supprimer, setSupprimer] = useState<string>();

  // Une nouvelle liste (rechargement) vide la comparaison, comme load() d'origine.
  const [liste, setListe] = useState(photos);
  if (liste !== photos) {
    setListe(photos);
    setA('');
    setB('');
    setImages({});
  }

  useEffect(() => {
    let actif = true;
    for (const id of [a, b].filter(Boolean))
      suiviHebdo.image(clientId, id, proprietaire).then(
        (image) => actif && setImages((v) => ({ ...v, [id]: image })),
        (e: unknown) => actif && setErreur(e instanceof Error ? e.message : 'Image indisponible'),
      );
    return () => {
      actif = false;
    };
  }, [a, b, clientId, proprietaire]);

  const agir = async (f: () => Promise<void>, defaut: string) => {
    setErreur('');
    try {
      await f();
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : defaut);
    }
  };

  const choix = (photos ?? []).filter((p) => p.vue === vue);
  const options = [{ cle: '', libelle: 'Choisir une date' }, ...choix.map((p) => ({ cle: p.id, libelle: `${p.date}${p.partage ? ' · partagée' : ' · privée'}` }))];

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <TitreDisplay taille={24} style={{ flexShrink: 1 }}>
          Photos de progression
        </TitreDisplay>
        <Action variante="contour" libelle="Actualiser" desactive={!photos && !erreurChargement} onPress={recharger} />
      </View>
      <View style={{ borderRadius: 12, backgroundColor: couleurs.discret, padding: 16 }}>
        <Text style={ts.texte}>
          Pour comparer : même endroit, même éclairage, mêmes vêtements ou sous-vêtements, même distance et hauteur du téléphone, et posture relâchée identique.
          Prenez face, profil et dos, idéalement au même moment de la journée avant l’entraînement.
        </Text>
      </View>
      {proprietaire ? (
        <AjoutPhoto clientId={clientId} onEnregistre={recharger} />
      ) : (
        <Text style={ts.doux}>Vue coach : les photos s’ajoutent depuis le compte du client. Vous voyez ici celles qu’il choisit de partager.</Text>
      )}
      <Etat erreur={erreur || erreurChargement || undefined} />
      {!photos && !erreurChargement ? (
        <Text style={ts.texte}>Chargement…</Text>
      ) : (
        photos && (
          <>
            <Text style={[ts.texte, { color: couleurs.texteDoux }]}>
              {proprietaire
                ? 'Vos photos sont privées, sauf celles que vous partagez volontairement avec votre coach.'
                : 'Seules les photos partagées par le client apparaissent ici.'}
            </Text>
            {photos.length > 0 && (
              <>
                <Selecteur
                  libelle="Angle de vue"
                  options={OPTIONS_VUE}
                  valeur={vue}
                  onChange={(v) => {
                    setVue(v);
                    setA('');
                    setB('');
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {(
                    [
                      [a, setA, 'Première photo'],
                      [b, setB, 'Deuxième photo'],
                    ] as const
                  ).map(([valeur, choisir, libelle]) => (
                    <View key={libelle} style={{ flex: 1, minWidth: 0, gap: 12 }}>
                      <Selecteur libelle={libelle} options={options} valeur={valeur} onChange={choisir} />
                      {!!valeur && (
                        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.discret, padding: 4 }}>
                          {images[valeur] ? (
                            <Image
                              source={{ uri: images[valeur] }}
                              accessibilityLabel={`${vue} du ${photos.find((p) => p.id === valeur)?.date}`}
                              style={{ width: '100%', aspectRatio: 3 / 4, maxHeight: 520 }}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={[ts.texte, { padding: 16 }]}>Chargement de la photo…</Text>
                          )}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={{ gap: 8 }}>
              {photos.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, padding: 12 }}>
                  <Text style={[ts.texte, { flexGrow: 1, flexShrink: 1 }]}>
                    {p.date} · {p.vue} · {p.partage ? 'Partagée avec le coach' : 'Privée'}
                  </Text>
                  {proprietaire && (
                    <Ligne>
                      <Action
                        variante="contour"
                        libelle={p.partage ? 'Rendre privée' : 'Partager avec le coach'}
                        onPress={() => agir(() => suiviHebdo.partagerPhoto(clientId, p.id, !p.partage), 'Modification impossible')}
                      />
                      <Action variante="contour" libelle="Supprimer" onPress={() => setSupprimer(p.id)} />
                    </Ligne>
                  )}
                </View>
              ))}
            </View>
            {!photos.length && (
              <View style={{ borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, padding: 24 }}>
                <Text style={[ts.texte, { textAlign: 'center' }]}>Aucune photo {proprietaire ? 'enregistrée' : 'partagée'}.</Text>
              </View>
            )}
          </>
        )
      )}
      <Text style={ts.doux}>
        Analyse IA non activée : une connexion OpenAI reste nécessaire. Aucune photo n’est envoyée à une IA. Une future comparaison décrira les changements visibles sans
        mesurer la masse grasse ou musculaire ni établir de diagnostic de posture.
      </Text>
      {supprimer && (
        <Confirmation
          titre="Supprimer définitivement cette photo ?"
          action="Supprimer"
          danger
          onFermer={() => setSupprimer(undefined)}
          onConfirmer={async () => {
            await suiviHebdo.supprimerPhoto(clientId, supprimer);
            recharger();
          }}
        />
      )}
    </View>
  );
}

/** PhotoAdd d'origine : photo réduite à 1200 px de côté, en JPEG de 350 000 caractères au plus. */
function AjoutPhoto({ clientId, onEnregistre }: { clientId: string; onEnregistre: () => void }) {
  const [date, setDate] = useState(() => ecrireJour(aujourdhuiParis()));
  const [vue, setVue] = useState<VuePhoto>('Face');
  const [partage, setPartage] = useState(false);
  const [image, setImage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [jeton, setJeton] = useState(nouvelId);
  const verrou = useRef(false);

  async function preparer(source: 'camera' | 'galerie') {
    setErreur('');
    try {
      if (source === 'camera') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) throw new Error('Autorisez l’appareil photo dans les réglages du téléphone, ou choisissez une photo.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const choisi = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const fichier = choisi.canceled ? undefined : choisi.assets[0];
      if (!fichier) return;
      setOccupe(true);
      setImage('');
      if (fichier.fileSize && fichier.fileSize > 20000000) throw new Error('Choisissez une photo JPEG, PNG ou WebP de moins de 20 Mo.');
      const cote = Math.max(fichier.width, fichier.height);
      const ratio = cote ? Math.min(1, 1200 / cote) : 1;
      let travail = ImageManipulator.manipulate(fichier.uri);
      if (ratio < 1) travail = travail.resize({ width: Math.round(fichier.width * ratio), height: Math.round(fichier.height * ratio) });
      const rendu = await travail.renderAsync();
      let valeur = '';
      for (const qualite of [0.85, 0.7, 0.55, 0.4, 0.25]) {
        const r = await rendu.saveAsync({ format: SaveFormat.JPEG, compress: qualite, base64: true });
        valeur = `data:image/jpeg;base64,${r.base64 ?? ''}`;
        if (valeur.length <= 350000) break;
      }
      if (valeur.length > 350000) throw new Error('Photo trop volumineuse : essayez une image plus petite.');
      if (!imageValide(valeur)) throw new Error('Photo illisible');
      setImage(valeur);
      setJeton(nouvelId());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Photo illisible');
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrer() {
    if (verrou.current) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    try {
      const jour = lireJour(date);
      if (!jour || jour > aujourdhuiParis()) throw new Error('Date invalide : écrivez-la au format jj/mm/aaaa, au plus tard aujourd’hui');
      await suiviHebdo.ajouterPhoto(clientId, { date: jour, vue, partage, image, envoiId: jeton });
      setImage('');
      setPartage(false);
      setJeton(nouvelId());
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  }

  return (
    <View style={[ts.carte, { padding: 16, borderRadius: 12 }]}>
      <Text accessibilityRole="header" style={ts.titre}>
        Ajouter une photo
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Saisie libelle="Date de la photo" placeholder="jj/mm/aaaa" valeur={date} onChange={setDate} desactive={occupe} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Selecteur libelle="Vue" options={OPTIONS_VUE} valeur={vue} onChange={setVue} />
        </View>
      </View>
      <Ligne>
        <Action variante="contour" libelle="Prendre une photo" desactive={occupe} onPress={() => preparer('camera')} />
        <Action variante="contour" libelle="Choisir une photo" desactive={occupe} onPress={() => preparer('galerie')} />
      </Ligne>
      {!!image && (
        <Image source={{ uri: image }} accessibilityLabel="Photo sélectionnée avant enregistrement" style={{ width: '100%', height: 256 }} resizeMode="contain" />
      )}
      <CaseACocher libelle="Partager cette photo avec mon coach" valeur={partage} onChange={setPartage} />
      <Text style={ts.doux}>Laissez décoché pour garder la photo privée dans votre espace. Vous pourrez modifier ce choix ensuite.</Text>
      <Etat erreur={erreur || undefined} />
      <Action libelle={occupe ? 'Traitement…' : 'Enregistrer la photo'} desactive={occupe || !image || !date.trim()} onPress={enregistrer} />
    </View>
  );
}
