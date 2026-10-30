// « Mon profil » du coach : prénom, numéro WhatsApp et photo, tels que ses clients les voient dans leur appli.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { erreursProfilCoach, profilCoach, type ProfilCoach } from '@/data/profil-coach';
import { formaterTelephone } from '@/domain/crm';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, SousTitre, Texte } from './composants';
import { couleurs, espace } from './theme';

/** Photo carrée de 400 px, assez légère pour être rangée avec le profil. */
async function preparerPhoto(): Promise<string | undefined> {
  const choix = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  const fichier = choix.canceled ? undefined : choix.assets[0];
  if (!fichier) return undefined;
  const cote = Math.min(fichier.width, fichier.height);
  let travail = ImageManipulator.manipulate(fichier.uri);
  if (fichier.width !== fichier.height)
    travail = travail.crop({ originX: (fichier.width - cote) / 2, originY: (fichier.height - cote) / 2, width: cote, height: cote });
  const rendu = await travail.resize({ width: 400, height: 400 }).renderAsync();
  for (const qualite of [0.8, 0.6, 0.4]) {
    const r = await rendu.saveAsync({ format: SaveFormat.JPEG, compress: qualite, base64: true });
    const valeur = `data:image/jpeg;base64,${r.base64 ?? ''}`;
    if (valeur.length <= 150000) return valeur;
  }
  throw new Error('Photo trop lourde : essaie une autre image.');
}

export function PhotoCoach({ photo, taille = 96 }: { photo?: string; taille?: number }) {
  return photo ? (
    <Image source={{ uri: photo }} style={{ width: taille, height: taille, borderRadius: taille / 2 }} accessibilityIgnoresInvertColors />
  ) : (
    <View
      style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleurs.discret, alignItems: 'center', justifyContent: 'center' }}
    >
      <UserRound size={taille * 0.45} color={couleurs.texteDoux} />
    </View>
  );
}

export function MonProfilCoach() {
  const { donnee, erreur, recharger } = useCharger(() => profilCoach.lire(), 'profil-coach');
  const [p, setP] = useState<ProfilCoach>();
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  useEffect(() => {
    if (donnee) setP({ ...donnee, telephone: donnee.telephone ? formaterTelephone(donnee.telephone) : '' });
  }, [donnee]);

  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
  if (!p) return <Chargement />;
  const modifier = (m: Partial<ProfilCoach>) => {
    setP({ ...p, ...m });
    setEnregistre(false);
  };

  async function choisirPhoto() {
    setErreurs([]);
    try {
      const photo = await preparerPhoto();
      if (photo) modifier({ photo });
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Photo illisible']);
    }
  }

  async function enregistrer() {
    const liste = erreursProfilCoach(p!);
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await profilCoach.enregistrer(p!);
      setEnregistre(true);
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Profil non enregistré']);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={{ gap: espace(4), maxWidth: 560 }}>
      <Carte>
        <SousTitre>Ce que tes clients voient</SousTitre>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(4), flexWrap: 'wrap' }}>
          <PhotoCoach photo={p.photo} />
          <View style={{ gap: espace(2) }}>
            <Bouton variante="discret" libelle={p.photo ? 'Changer la photo' : 'Ajouter une photo'} onPress={choisirPhoto} />
            {p.photo && <Bouton variante="discret" libelle="Retirer la photo" onPress={() => modifier({ photo: undefined })} />}
          </View>
        </View>
        <ChampTexte libelle="Prénom affiché" valeur={p.nom} onChange={(nom) => modifier({ nom })} />
        <ChampTexte libelle="Numéro WhatsApp" valeur={p.telephone ?? ''} onChange={(telephone) => modifier({ telephone })} />
        <Texte doux style={{ fontSize: 13 }}>
          Tes clients t’écrivent sur WhatsApp depuis leur appli (onglet Moi, option nutrition). Sans numéro, ces boutons n’apparaissent pas.
        </Texte>
        {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
        <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={enCours} />
        {enregistre && <Texte style={{ fontSize: 14, color: couleurs.vert }}>Profil enregistré.</Texte>}
      </Carte>
    </View>
  );
}
