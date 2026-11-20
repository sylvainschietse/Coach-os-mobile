// Messagerie coach-client : le fil d'un client, avec texte, photos, vidéos et vocaux.
// Côté client : les horaires de réponse du coach en haut, et ses vidéos corrigées du mois.
// Côté coach : le même fil dans la fiche du client, avec le décompte des vidéos à facturer.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Camera as IconeCamera, Clock, ImageIcon, MessageCircle, Send, Trash2, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { messagerie, ecouterMessages, type CompteVideos, type FichierMedia } from '@/data/messagerie';
import { HORAIRES_PAR_DEFAUT } from '@/data/profil-coach';
import { bilanVideos, TARIFS } from '@/domain/abonnements';
import { genrePiece, heureMessage, MAX_TEXTE, verifierPiece, type Auteur, type Message } from '@/domain/messagerie';
import { dureeLisible } from '@/domain/videos-mouvement';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { ZoneClavier } from '../clavier';
import { Action, Ligne, ts } from '../entrainement/commun';
import { Camera, choisirDansGalerie, EnregistreurVocal, LecteurVideo, LecteurVocal, lireLocal, type Vocal } from '../entrainement/videos-mouvement';
import { couleurs, espace, polices } from '../theme';

/** Relève du fil tant qu'il est ouvert : les nouveaux messages arrivent sans recharger l'écran. */
const RELEVE_MS = 15_000;
const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`;

/** Photo choisie ou prise, réduite à 1600 px en JPEG : quelques centaines de Ko. */
async function preparerPhoto(source: 'camera' | 'galerie'): Promise<FichierMedia | null> {
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new Error('Autorise l’appareil photo dans les réglages du téléphone, ou choisis une photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const choix = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const f = choix.canceled ? undefined : choix.assets[0];
  if (!f) return null;
  const cote = Math.max(f.width, f.height);
  const ratio = cote ? Math.min(1, 1600 / cote) : 1;
  let travail = ImageManipulator.manipulate(f.uri);
  if (ratio < 1) travail = travail.resize({ width: Math.round(f.width * ratio), height: Math.round(f.height * ratio) });
  const rendu = await (await travail.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
  return lireLocal(rendu.uri, 'image/jpeg');
}

/** Vidéos corrigées du mois : combien restent (client), combien sont à facturer (coach). */
export function CompteurVideos({ compte, moi }: { compte: CompteVideos; moi: Auteur }) {
  const b = bilanVideos(compte.envoyees, compte.incluses);
  if (!b.envoyees && !b.incluses) return null;
  const texte =
    moi === 'client'
      ? b.incluses
        ? b.restantes
          ? `Vidéos corrigées ce mois-ci : ${b.envoyees} sur ${b.incluses} incluses. Il t’en reste ${b.restantes}.`
          : `Tu as utilisé tes ${b.incluses} vidéo${b.incluses > 1 ? 's' : ''} corrigée${b.incluses > 1 ? 's' : ''} du mois.${b.enPlus ? ` ${b.enPlus} en plus, à ${euros(TARIFS.video)} l’unité.` : ` Les suivantes sont à ${euros(TARIFS.video)} l’unité.`}`
        : `Vidéos corrigées ce mois-ci : ${b.envoyees}. Ta formule n’en inclut pas : ${euros(TARIFS.video)} la vidéo.`
      : `Vidéos du mois : ${b.envoyees} sur ${b.incluses} incluse${b.incluses > 1 ? 's' : ''}.${b.enPlus ? ` ${b.enPlus} en plus : ${euros(b.aFacturer)} à facturer.` : ''}`;
  return (
    <View style={[styles.bandeau, b.enPlus > 0 && moi === 'coach' && { borderColor: couleurs.orange, backgroundColor: couleurs.orangeClair }]}>
      <Video size={16} color={b.enPlus > 0 && moi === 'coach' ? couleurs.orange : couleurs.texteDoux} />
      <Text style={[ts.doux, { flex: 1, fontSize: 13, color: couleurs.texte }]}>{texte}</Text>
    </View>
  );
}

function PhotoMessage({ chemin }: { chemin: string }) {
  const lien = useCharger(() => messagerie.lien(chemin), `photo-${chemin}`);
  const [taille, setTaille] = useState({ l: 220, h: 220 });
  if (lien.erreur) return <Text style={ts.erreur}>{lien.erreur}</Text>;
  if (!lien.donnee)
    return (
      <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={couleurs.texteDoux} />
      </View>
    );
  return (
    <Image
      source={{ uri: lien.donnee }}
      accessibilityLabel="Photo envoyée"
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source ?? {};
        if (width && height) setTaille({ l: 220, h: Math.min(320, Math.round((220 * height) / width)) });
      }}
      style={[styles.photo, { width: taille.l, height: taille.h }]}
      resizeMode="cover"
    />
  );
}

function Bulle({ m, moi, maintenant, dernierLu, onRetirer }: { m: Message; moi: Auteur; maintenant: Date; dernierLu: boolean; onRetirer: () => void }) {
  const mien = m.auteur === moi;
  const [actions, setActions] = useState(false);
  const genre = genrePiece(m.pieceType);
  return (
    <View style={{ alignItems: mien ? 'flex-end' : 'flex-start', gap: 2 }}>
      <Pressable
        onLongPress={mien ? () => setActions(!actions) : undefined}
        accessibilityHint={mien ? 'Appui long pour retirer ce message' : undefined}
        style={[styles.bulle, mien ? styles.bulleMienne : styles.bulleAutre]}
      >
        {m.pieceChemin && genre === 'photo' && <PhotoMessage chemin={m.pieceChemin} />}
        {m.pieceChemin && genre === 'video' && <LecteurVideo chemin={m.pieceChemin} dureeS={m.pieceDureeS} largeur={180} lien={messagerie.lien} />}
        {m.pieceChemin && genre === 'vocal' && (
          <LecteurVocal chemin={m.pieceChemin} dureeS={m.pieceDureeS} libelle={mien ? 'Ton vocal' : 'Message vocal'} lien={messagerie.lien} />
        )}
        {m.pieceExpiree && <Text style={[styles.texteBulle, { fontStyle: 'italic', opacity: 0.75 }, mien && { color: '#FFFFFF' }]}>Vidéo effacée après 30 jours</Text>}
        {!!m.texte && (
          <Text selectable style={[styles.texteBulle, mien && { color: '#FFFFFF' }]}>
            {m.texte}
          </Text>
        )}
      </Pressable>
      <Text style={styles.heure}>
        {heureMessage(m.creeLe, maintenant)}
        {mien && dernierLu && m.luLe ? ' · Lu' : ''}
      </Text>
      {actions && (
        <Ligne>
          <Action petit variante="fantome" icone={Trash2} libelle="Retirer ce message" onPress={onRetirer} />
          <Action petit variante="fantome" libelle="Annuler" onPress={() => setActions(false)} />
        </Ligne>
      )}
    </View>
  );
}

type Piece = { fichier: FichierMedia; apercu: string };

function Saisie({ clientId, moi, onEnvoye }: { clientId: string; moi: Auteur; onEnvoye: () => void }) {
  const [texte, setTexte] = useState('');
  const [piece, setPiece] = useState<Piece | null>(null);
  const [vocal, setVocal] = useState<Vocal | null>(null);
  const [camera, setCamera] = useState(false);
  const [menu, setMenu] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const joindre = (f: FichierMedia | null) => {
    setMenu(false);
    if (!f) return;
    const refus = verifierPiece(f);
    if (refus) return setErreur(refus);
    setErreur('');
    setVocal(null);
    setPiece({ fichier: f, apercu: f.uri ?? '' });
  };
  const essayer = async (action: () => Promise<FichierMedia | null>) => {
    setErreur('');
    try {
      joindre(await action());
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };

  const fichier = vocal?.fichier ?? piece?.fichier;
  const envoyer = async () => {
    if (envoi || (!texte.trim() && !fichier)) return;
    setEnvoi(true);
    setErreur('');
    try {
      await messagerie.envoyer(clientId, moi, texte, fichier);
      setTexte('');
      setPiece(null);
      setVocal(null);
      onEnvoye();
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setEnvoi(false);
  };

  const genre = genrePiece(piece?.fichier.type);
  return (
    <View style={styles.saisieZone}>
      {piece && (
        <View style={styles.pieceJointe}>
          {genre === 'photo' && !!piece.apercu ? (
            <Image source={{ uri: piece.apercu }} style={{ width: 48, height: 48, borderRadius: 8 }} accessibilityLabel="Photo jointe" />
          ) : (
            <Video size={20} color={couleurs.texte} />
          )}
          <Text style={[ts.doux, { flex: 1 }]}>
            {genre === 'photo' ? 'Photo jointe' : `Vidéo jointe${piece.fichier.dureeS ? ` · ${dureeLisible(Math.round(piece.fichier.dureeS))}` : ''}`}
            {moi === 'client' && genre === 'video' ? ' · comptée dans tes vidéos corrigées du mois' : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retirer la pièce jointe" onPress={() => setPiece(null)} hitSlop={8}>
            <X size={18} color={couleurs.texteDoux} />
          </Pressable>
        </View>
      )}
      {!piece && <EnregistreurVocal valeur={vocal} desactive={envoi} onChange={setVocal} />}
      {menu && (
        <View style={styles.menu}>
          {Platform.OS !== 'web' && <Action petit variante="contour" icone={IconeCamera} libelle="Prendre une photo" onPress={() => essayer(() => preparerPhoto('camera'))} />}
          <Action petit variante="contour" icone={ImageIcon} libelle="Choisir une photo" onPress={() => essayer(() => preparerPhoto('galerie'))} />
          {Platform.OS !== 'web' && (
            <Action
              petit
              variante="contour"
              icone={Video}
              libelle="Filmer une vidéo"
              onPress={() => {
                setMenu(false);
                setCamera(true);
              }}
            />
          )}
          <Action petit variante="contour" icone={Video} libelle="Choisir une vidéo" onPress={() => essayer(choisirDansGalerie)} />
        </View>
      )}
      <View style={styles.saisieLigne}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={menu ? 'Fermer les pièces jointes' : 'Joindre une photo ou une vidéo'}
          onPress={() => setMenu(!menu)}
          disabled={envoi || !!vocal}
          style={[styles.rond, { backgroundColor: couleurs.discret }, (envoi || !!vocal) && { opacity: 0.4 }]}
        >
          {menu ? <X size={20} color={couleurs.texte} /> : <ImageIcon size={20} color={couleurs.texte} />}
        </Pressable>
        <TextInput
          multiline
          value={texte}
          onChangeText={setTexte}
          maxLength={MAX_TEXTE}
          accessibilityLabel="Ton message"
          placeholder={moi === 'client' ? 'Écris à ton coach…' : 'Écris à ton client…'}
          placeholderTextColor={couleurs.suggestion}
          style={styles.champ}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          onPress={envoyer}
          disabled={envoi || (!texte.trim() && !fichier)}
          style={[styles.rond, { backgroundColor: couleurs.rouge }, (envoi || (!texte.trim() && !fichier)) && { opacity: 0.4 }]}
        >
          {envoi ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
      {!!erreur && (
        <Text accessibilityRole="alert" style={[ts.erreur, { fontSize: 13 }]}>
          {erreur}
        </Text>
      )}
      {Platform.OS !== 'web' && <Camera visible={camera} onFermer={() => setCamera(false)} onFilmee={(f) => (setCamera(false), joindre(f))} />}
    </View>
  );
}

/**
 * Le fil d'un client. `pleinEcran` : écran dédié (le fil défile, la saisie reste en bas) ;
 * sinon le fil s'insère dans une page qui défile déjà (fiche du client côté coach).
 */
export function Conversation({ clientId, moi, nomAutre, horaires, pleinEcran }: { clientId: string; moi: Auteur; nomAutre: string; horaires?: string; pleinEcran?: boolean }) {
  const fil = useCharger(() => messagerie.fil(clientId), `fil-${clientId}`);
  const videos = useCharger(() => messagerie.videosDuMois(clientId, moi), `videos-mois-${clientId}`);
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);
  const { recharger } = fil;
  const rechargerVideos = videos.recharger;
  const rechargerTout = useCallback(() => {
    recharger();
    rechargerVideos();
  }, [recharger, rechargerVideos]);

  useEffect(() => ecouterMessages(recharger), [recharger]);
  // Relève régulière tant que l'appli est au premier plan.
  useEffect(() => {
    const t = setInterval(() => AppState.currentState === 'active' && recharger(), RELEVE_MS);
    const s = AppState.addEventListener('change', (e) => e === 'active' && recharger());
    return () => {
      clearInterval(t);
      s.remove();
    };
  }, [recharger]);
  // Ce qui est affiché est lu.
  const aLire = (fil.donnee ?? []).some((m) => m.auteur !== moi && !m.luLe);
  useEffect(() => {
    if (aLire) void messagerie.marquerLus(clientId, moi);
  }, [aLire, clientId, moi]);

  const maintenant = new Date();
  const liste = fil.donnee ?? [];
  const dernierMien = [...liste].reverse().find((m) => m.auteur === moi);
  const retirer = async (m: Message) => {
    try {
      await messagerie.retirer(m);
      rechargerTout();
    } catch {
      // Le message reste affiché : rien n'a été retiré.
    }
  };

  const enTete = (
    <View style={{ gap: espace(2) }}>
      {moi === 'client' && (
        <View style={styles.bandeau}>
          <Clock size={16} color={couleurs.texteDoux} />
          <Text style={[ts.doux, { flex: 1, fontSize: 13, color: couleurs.texte }]}>{horaires?.trim() || HORAIRES_PAR_DEFAUT}</Text>
        </View>
      )}
      {videos.donnee && <CompteurVideos compte={videos.donnee} moi={moi} />}
    </View>
  );

  const corps: ReactNode = fil.erreur ? (
    <View style={{ gap: 8 }}>
      <Text style={ts.erreur}>{fil.erreur}</Text>
      <Action petit variante="contour" libelle="Réessayer" onPress={recharger} />
    </View>
  ) : !fil.donnee ? (
    <ActivityIndicator color={couleurs.texteDoux} style={{ marginVertical: 24 }} />
  ) : liste.length === 0 ? (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: espace(6) }}>
      <MessageCircle size={28} color={couleurs.texteDoux} />
      <Text style={[ts.doux, { textAlign: 'center' }]}>
        {moi === 'client'
          ? `Pose ta question à ${nomAutre}, envoie une photo de ton repas ou une vidéo de ton mouvement.`
          : `Aucun message avec ${nomAutre} pour l’instant.`}
      </Text>
    </View>
  ) : (
    <View style={{ gap: espace(3) }}>
      {liste.map((m) => (
        <Bulle key={m.id} m={m} moi={moi} maintenant={maintenant} dernierLu={m.id === dernierMien?.id} onRetirer={() => retirer(m)} />
      ))}
    </View>
  );

  const saisie = <Saisie clientId={clientId} moi={moi} onEnvoye={rechargerTout} />;

  if (!pleinEcran)
    return (
      <View style={{ gap: espace(4) }}>
        {enTete}
        {corps}
        {saisie}
      </View>
    );
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ZoneClavier style={{ flex: 1 }}>
      <ScrollView
        ref={defilement}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: espace(4), gap: espace(4), width: '100%', maxWidth: 640, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => defilement.current?.scrollToEnd({ animated: false })}
      >
        {enTete}
        {corps}
      </ScrollView>
      <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>{saisie}</View>
      </ZoneClavier>
    </KeyboardAvoidingView>
  );
}

/** Bouton de l'en-tête : bulle avec le nombre de messages non lus. */
export function BoutonMessages({ nonLus, onPress }: { nonLus: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nonLus ? `Messages, ${nonLus} non lu${nonLus > 1 ? 's' : ''}` : 'Messages'}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.boutonEntete, pressed && { opacity: 0.7 }]}
    >
      <MessageCircle size={20} color="#FFFFFF" />
      {nonLus > 0 && (
        <View style={styles.pastille}>
          <Text style={styles.pastilleTexte}>{nonLus > 9 ? '9+' : nonLus}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Nombre de messages non lus, relu au retour sur l'appli, à chaque changement et toutes les 30 s. */
export function useNonLus(lire: () => Promise<number>, cle: string) {
  const n = useCharger(lire, cle);
  const { recharger } = n;
  useEffect(() => ecouterMessages(recharger), [recharger]);
  useEffect(() => {
    const t = setInterval(() => AppState.currentState === 'active' && recharger(), 30_000);
    const s = AppState.addEventListener('change', (e) => e === 'active' && recharger());
    return () => {
      clearInterval(t);
      s.remove();
    };
  }, [recharger]);
  return n.donnee ?? 0;
}

/** Client : bouton Messages de l'en-tête. */
export function BoutonMessagesClient({ clientId }: { clientId: string }) {
  const nonLus = useNonLus(() => messagerie.nonLusClient(clientId), `non-lus-${clientId}`);
  return <BoutonMessages nonLus={nonLus} onPress={() => router.push('/client/messages')} />;
}

/** Client, sur l'accueil : l'accès à la messagerie, avec les messages non lus du coach. */
export function CarteMessages({ clientId }: { clientId: string }) {
  const nonLus = useNonLus(() => messagerie.nonLusClient(clientId), `non-lus-${clientId}`);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/client/messages')}
      style={({ pressed }) => [styles.carte, nonLus > 0 && { borderColor: couleurs.rouge }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.rond, { backgroundColor: nonLus ? couleurs.rouge : couleurs.discret }]}>
        <MessageCircle size={20} color={nonLus ? '#FFFFFF' : couleurs.texte} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte }}>
          {nonLus ? `${nonLus} nouveau${nonLus > 1 ? 'x' : ''} message${nonLus > 1 ? 's' : ''} de ton coach` : 'Écrire à mon coach'}
        </Text>
        <Text style={ts.doux}>Questions, photos de repas, vidéos de tes mouvements.</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bulle: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, gap: 6 },
  bulleMienne: { backgroundColor: couleurs.rouge, borderBottomRightRadius: 4 },
  bulleAutre: { backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.bordure, borderBottomLeftRadius: 4 },
  texteBulle: { fontFamily: polices.texte, fontSize: 15, lineHeight: 21, color: couleurs.texte },
  heure: { fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux, marginHorizontal: 4 },
  photo: { width: 220, height: 220, borderRadius: 10, backgroundColor: couleurs.discret },
  saisieZone: { gap: 8, borderTopWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.fond, padding: espace(3) },
  saisieLigne: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  champ: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: 22,
    backgroundColor: couleurs.carte,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: polices.texte,
    fontSize: 15,
    color: couleurs.texte,
  },
  rond: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pieceJointe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
    borderRadius: 12,
    padding: 8,
  },
  boutonEntete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pastille: {
    position: 'absolute',
    top: 3,
    right: 1,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: couleurs.rougeMarque,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#18191D',
  },
  pastilleTexte: { fontFamily: polices.texteGras, fontSize: 10, color: '#FFFFFF' },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
    borderRadius: 18,
    padding: 14,
  },
});
