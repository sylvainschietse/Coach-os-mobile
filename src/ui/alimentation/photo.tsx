import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { alimentation, type EstimationPhoto } from '@/data/alimentation';
import { consentements } from '@/data/consentement';
import { useSession } from '@/data/session';
import { additionner, macrosPour } from '@/domain/alimentation';
import { lireNombre } from '@/domain/suivi';
import type { Ingredient } from '@/domain/types';

import { Bouton, Chargement, ChampTexte, Erreur, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { LigneMacros } from './commun';

type Ligne = EstimationPhoto['aliments'][number] & { quantite: string };

const CONFIANCE = { haute: 'sûr', moyenne: 'à vérifier', basse: 'incertain' } as const;

/**
 * Photo du repas : Claude estime les aliments et les quantités, le client corrige avant d'enregistrer.
 * L'image est réduite sur le téléphone, envoyée une fois pour l'analyse, et n'est pas gardée.
 */
export function PhotoRepas({
  onValider,
  onFermer,
  libelleValider = 'Ajouter au repas',
}: {
  onValider: (aliments: Omit<Ingredient, 'contient'>[]) => void;
  onFermer: () => void;
  libelleValider?: string;
}) {
  const [apercu, setApercu] = useState<string>();
  const [lignes, setLignes] = useState<Ligne[]>();
  const [remarque, setRemarque] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const accordIa = useAccordIa();

  async function prendre(source: 'camera' | 'galerie') {
    setErreur(undefined);
    try {
      if (source === 'camera') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) return setErreur('Autorise l’appareil photo dans les réglages du téléphone, ou choisis une photo.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
      const choix = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (choix.canceled || !choix.assets[0]) return;
      setEnCours(true);
      setLignes(undefined);
      // 1024 px de large suffisent pour reconnaître une assiette, et l'envoi reste léger.
      const image = await ImageManipulator.manipulate(choix.assets[0].uri).resize({ width: 1024 }).renderAsync();
      const reduite = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
      setApercu(reduite.uri);
      const estimation = await alimentation.analyserPhoto(reduite.base64!, 'image/jpeg');
      setLignes(estimation.aliments.map((a) => ({ ...a, quantite: String(a.quantiteG) })));
      setRemarque(estimation.remarque);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Analyse impossible');
    } finally {
      setEnCours(false);
    }
  }

  const valides = (lignes ?? []).flatMap((l) => {
    const q = lireNombre(l.quantite);
    return q && q > 0 ? [{ nom: l.nom, quantiteG: q, kcal: l.kcal, proteines: l.proteines, glucides: l.glucides, lipides: l.lipides }] : [];
  });

  if (accordIa.refuse) {
    return (
      <View style={{ gap: espace(3) }}>
        <Texte doux style={{ fontSize: 14 }}>
          L’analyse des photos de repas est désactivée. Pour l’utiliser, ta photo sera envoyée à Claude (Anthropic, États-Unis), qui estime les
          aliments et les quantités ; elle n’est pas gardée. Tu peux couper cet accord à tout moment dans « Mes données ».
        </Texte>
        <Bouton variante="secondaire" libelle="J’accepte l’analyse de mes photos par l’IA" onPress={accordIa.accepter} chargement={accordIa.envoi} />
        {accordIa.erreur && <Erreur message={accordIa.erreur} />}
        <Bouton variante="discret" libelle="Fermer" onPress={onFermer} />
      </View>
    );
  }

  return (
    <View style={{ gap: espace(3) }}>
      {!lignes && !enCours && (
        <>
          <Texte doux style={{ fontSize: 14 }}>
            Prends ton assiette en photo, de haut, en entier. L’estimation des quantités reste approximative : corrige-la si tu as pesé.
          </Texte>
          <Bouton variante="secondaire" libelle="Prendre une photo" onPress={() => prendre('camera')} />
          <Bouton variante="discret" libelle="Choisir dans mes photos" onPress={() => prendre('galerie')} />
        </>
      )}
      {apercu && <Image source={{ uri: apercu }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" />}
      {enCours && (
        <>
          <Chargement />
          <Texte doux style={{ fontSize: 14, textAlign: 'center' }}>Analyse de ton assiette…</Texte>
        </>
      )}
      {erreur && <Erreur message={erreur} />}
      {lignes && (
        <>
          {lignes.length === 0 && <Texte>Aucun aliment reconnu sur cette photo.</Texte>}
          {lignes.map((l, i) => (
            <View key={i} style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(1) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
                <Texte style={{ fontSize: 15, flex: 1 }}>
                  {l.nom} <Texte doux style={{ fontSize: 13 }}>({CONFIANCE[l.confiance]})</Texte>
                </Texte>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setLignes(lignes.filter((_, j) => j !== i))}>
                  <Texte doux style={{ fontSize: 13 }}>Retirer</Texte>
                </Pressable>
              </View>
              <ChampTexte
                libelle="Quantité (g)"
                type="nombre"
                valeur={l.quantite}
                onChange={(t) => setLignes(lignes.map((x, j) => (j === i ? { ...x, quantite: t } : x)))}
              />
            </View>
          ))}
          {remarque && <Texte doux style={{ fontSize: 13 }}>{remarque}</Texte>}
          {valides.length > 0 && (
            <>
              <Texte style={{ fontSize: 14 }}>Total estimé :</Texte>
              <LigneMacros m={additionner(valides.map((v) => macrosPour(v, v.quantiteG)))} />
            </>
          )}
          <Bouton libelle={libelleValider} onPress={() => onValider(valides)} desactive={valides.length === 0} />
          <Bouton variante="discret" libelle="Reprendre une photo" onPress={() => (setLignes(undefined), setApercu(undefined))} />
        </>
      )}
      <Bouton variante="discret" libelle="Annuler" onPress={onFermer} />
    </View>
  );
}

/** RGPD : un client n'envoie une photo à l'IA qu'avec son accord (le coach, lui, analyse ses propres photos). */
function useAccordIa() {
  const { profil } = useSession();
  const clientId = profil?.role === 'client' ? profil.clientId : undefined;
  const [refuse, setRefuse] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();

  useEffect(() => {
    if (clientId) consentements.lire(clientId).then((c) => setRefuse(!c?.analyseIa), () => undefined);
  }, [clientId]);

  async function accepter() {
    if (!clientId) return;
    setEnvoi(true);
    setErreur(undefined);
    try {
      setRefuse(!(await consentements.accepter(clientId, true)).analyseIa);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ton accord n’a pas pu être enregistré. Réessaie.');
    } finally {
      setEnvoi(false);
    }
  }

  return { refuse, envoi, erreur, accepter };
}
