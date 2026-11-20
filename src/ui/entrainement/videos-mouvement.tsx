// Vidéos de mouvement. Côté client, dans la séance : « Filmer mon mouvement » (60 s au plus, compressée en 720p)
// ou choisir une vidéo de la galerie, l'envoyer au coach, puis retrouver sa réponse écrite ou vocale sous l'exercice.
// Côté coach, dans l'Entraînement du client : la vidéo à côté des séries, du ressenti et du commentaire de la séance,
// et une réponse par écrit et/ou par un vocal. Tout est effacé 30 jours après l'envoi.
import { titreClient } from '@/domain/entrainement';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Mic, Pause, Play, RefreshCw, Square, Trash2, Video, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { videos, type FichierMedia } from '@/data/videos-mouvement';
import { texteSerie, type RealisationLue } from '@/domain/entrainement-etat';
import type { Valeurs } from '@/domain/types';
import {
  aReponse,
  contexteSeance,
  DUREE_MAX_S,
  DUREE_MAX_VOCAL_S,
  dureeLisible,
  joursRestants,
  MAX_COMMENTAIRE,
  MAX_REPONSE,
  ordreCoach,
  QUALITE_ENREGISTREMENT,
  statutVideo,
  typeVideo,
  verifierVideo,
  type ContexteVideo,
  type VideoMouvement,
} from '@/domain/videos-mouvement';
import { messageErreur } from '@/lib/useCharger';

import { couleurs, polices } from '../theme';
import { Action, Ligne, ts } from './commun';

/** « 27,5 kg × 12 », « 8 reps » (sans charge), sinon durée, distance… */
export const serieLisible = (v: Valeurs) =>
  v.charge === undefined && v.repetitions !== undefined && Object.keys(v).length === 1 ? `${v.repetitions} reps` : texteSerie(v).replace(/\./g, ',');

/** « 3 nov. » */
const jourMois = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;

/** Contenu d'un fichier local : Blob sur le web, octets sur le téléphone. */
export async function lireLocal(uri: string, type: string, dureeS?: number, blob?: Blob): Promise<FichierMedia> {
  if (Platform.OS === 'web') {
    const b = blob ?? (await (await fetch(uri)).blob());
    return { type: b.type || type, taille: b.size, dureeS, donnees: b, uri };
  }
  const f = new File(uri);
  const donnees = await f.arrayBuffer();
  return { type, taille: f.size || donnees.byteLength, dureeS, donnees, uri };
}

/** iPhone en mode silencieux : le son des vidéos et des vocaux reste audible. */
async function modeLecture() {
  if (Platform.OS === 'web') return;
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
}

// ---------- Lecteurs ----------

function Video916({ uri, largeur }: { uri: string; largeur: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      style={{ width: largeur, height: Math.round((largeur * 16) / 9), borderRadius: 10, backgroundColor: couleurs.noir }}
    />
  );
}

/** Bouton « Voir la vidéo » puis lecteur : le lien signé n'est demandé qu'au moment de regarder. */
export function LecteurVideo({
  chemin,
  dureeS,
  largeur = 200,
  onVue,
  lien = videos.lien,
}: {
  chemin: string;
  dureeS?: number;
  largeur?: number;
  onVue?: () => void;
  /** Autre compartiment (messagerie) : d'où vient le lien signé. */
  lien?: (chemin: string) => Promise<string>;
}) {
  const [uri, setUri] = useState<string>();
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const ouvrir = async () => {
    setCharge(true);
    setErreur('');
    try {
      await modeLecture();
      setUri(await lien(chemin));
      onVue?.();
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setCharge(false);
  };
  if (uri) return <Video916 uri={uri} largeur={largeur} />;
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Voir la vidéo${dureeS ? `, ${dureeS} secondes` : ''}`}
        onPress={ouvrir}
        disabled={charge}
        style={({ pressed }) => [styles.vignette, { width: largeur, height: Math.round((largeur * 16) / 9), opacity: pressed || charge ? 0.75 : 1 }]}
      >
        <View style={styles.rondLecture}>
          <Play size={24} color="#FFFFFF" fill="#FFFFFF" />
        </View>
        <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: '#FFFFFF' }}>
          {charge ? 'Chargement…' : `Voir la vidéo${dureeS ? ` · ${dureeLisible(dureeS)}` : ''}`}
        </Text>
      </Pressable>
      {!!erreur && <Text style={[ts.erreur, { maxWidth: largeur }]}>{erreur}</Text>}
    </View>
  );
}

function LecteurAudioPret({ uri, libelle, dureeS }: { uri: string; libelle: string; dureeS?: number }) {
  const player = useAudioPlayer(uri);
  const statut = useAudioPlayerStatus(player);
  const demarre = useRef(false);
  useEffect(() => {
    if (statut.isLoaded && !demarre.current) {
      demarre.current = true;
      player.play();
    }
  }, [statut.isLoaded, player]);
  const fini = statut.didJustFinish || (statut.duration > 0 && statut.currentTime >= statut.duration - 0.05);
  const basculer = () => {
    if (statut.playing) player.pause();
    else {
      if (fini) player.seekTo(0);
      player.play();
    }
  };
  const total = statut.duration > 0 ? statut.duration : dureeS;
  return (
    <BoutonAudio
      libelle={libelle}
      enLecture={statut.playing}
      detail={`${dureeLisible(Math.floor(statut.currentTime))}${total ? ` / ${dureeLisible(Math.round(total))}` : ''}`}
      onPress={basculer}
    />
  );
}

function BoutonAudio({ libelle, enLecture, detail, onPress, charge }: { libelle: string; enLecture?: boolean; detail?: string; onPress: () => void; charge?: boolean }) {
  const Icone = enLecture ? Pause : Play;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${enLecture ? 'Mettre en pause' : 'Écouter'} : ${libelle}`}
      onPress={onPress}
      disabled={charge}
      style={({ pressed }) => [styles.audio, { opacity: pressed || charge ? 0.75 : 1 }]}
    >
      <View style={styles.rondAudio}>
        <Icone size={14} color="#FFFFFF" fill="#FFFFFF" />
      </View>
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte }}>{charge ? 'Chargement…' : libelle}</Text>
      {!!detail && <Text style={ts.mono}>{detail}</Text>}
    </Pressable>
  );
}

/** Vocal stocké (chemin) ou tout juste enregistré (uri locale). */
export function LecteurVocal({
  chemin,
  uri: locale,
  dureeS,
  libelle = 'Vocal du coach',
  lien = videos.lien,
}: {
  chemin?: string;
  uri?: string;
  dureeS?: number;
  libelle?: string;
  lien?: (chemin: string) => Promise<string>;
}) {
  const [uri, setUri] = useState(locale);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  if (locale && uri !== locale) setUri(locale);
  if (uri) return <LecteurAudioPret key={uri} uri={uri} libelle={libelle} dureeS={dureeS} />;
  return (
    <View style={{ gap: 4 }}>
      <BoutonAudio
        libelle={libelle}
        detail={dureeS ? dureeLisible(dureeS) : undefined}
        charge={charge}
        onPress={async () => {
          if (!chemin) return;
          setCharge(true);
          setErreur('');
          try {
            await modeLecture();
            setUri(await lien(chemin));
          } catch (e) {
            setErreur(messageErreur(e));
          }
          setCharge(false);
        }}
      />
      {!!erreur && <Text style={ts.erreur}>{erreur}</Text>}
    </View>
  );
}

// ---------- Enregistrement d'un vocal (coach) ----------

export type Vocal = { fichier: FichierMedia; uri: string };

export function EnregistreurVocal({ valeur, desactive, onChange }: { valeur: Vocal | null; desactive?: boolean; onChange: (v: Vocal | null) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const etat = useAudioRecorderState(recorder, 250);
  const [erreur, setErreur] = useState('');
  const [fin, setFin] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  const duree = etat.durationMillis / 1000;
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const demarrer = async () => {
    setErreur('');
    try {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) throw new Error('Autorise le micro pour enregistrer un vocal.');
      if (Platform.OS !== 'web') await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      // Arrêt automatique à la durée maximale.
      minuterie.current = setTimeout(() => void arreter(DUREE_MAX_VOCAL_S), DUREE_MAX_VOCAL_S * 1000);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };

  const arreter = async (forcee?: number) => {
    clearTimeout(minuterie.current);
    if (fin) return;
    setFin(true);
    const dureeS = forcee ?? recorder.getStatus().durationMillis / 1000;
    try {
      await recorder.stop();
      if (Platform.OS !== 'web') await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error('Le vocal n’a pas été enregistré.');
      const fichier = await lireLocal(uri, Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', Math.max(1, Math.round(dureeS)));
      onChange({ fichier: { ...fichier, type: fichier.type.split(';')[0] }, uri });
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setFin(false);
  };

  if (etat.isRecording)
    return (
      <View style={{ gap: 6 }}>
        <Ligne>
          <View style={styles.enregistrement} accessibilityLiveRegion="polite">
            <View style={styles.pointRouge} />
            <Text style={[ts.mono, { color: couleurs.rouge }]}>
              {dureeLisible(Math.floor(duree))} / {dureeLisible(DUREE_MAX_VOCAL_S)}
            </Text>
          </View>
          <Action petit icone={Square} libelle="Arrêter" onPress={() => void arreter()} chargement={fin} />
        </Ligne>
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      {valeur ? (
        <Ligne>
          <LecteurVocal uri={valeur.uri} dureeS={valeur.fichier.dureeS} libelle="Ton vocal" />
          <Action petit variante="fantome" icone={Trash2} libelle="Effacer" desactive={desactive} onPress={() => onChange(null)} />
        </Ligne>
      ) : (
        <Ligne>
          <Action petit variante="contour" icone={Mic} libelle="Enregistrer un vocal" desactive={desactive} onPress={demarrer} />
        </Ligne>
      )}
      {!!erreur && <Text style={ts.erreur}>{erreur}</Text>}
    </View>
  );
}

// ---------- Client : filmer dans l'appli ----------

export function Camera({ visible, onFermer, onFilmee }: { visible: boolean; onFermer: () => void; onFilmee: (f: FichierMedia) => void }) {
  const camera = useRef<CameraView>(null);
  const [permCam, demanderCam] = useCameraPermissions();
  const [permMicro, demanderMicro] = useMicrophonePermissions();
  const [face, setFace] = useState<'back' | 'front'>('back');
  const [pret, setPret] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [ecoule, setEcoule] = useState(0);
  const [erreur, setErreur] = useState('');
  const debut = useRef(0);

  useEffect(() => {
    if (!visible) return;
    if (permCam && !permCam.granted && permCam.canAskAgain) void demanderCam();
    if (permMicro && !permMicro.granted && permMicro.canAskAgain) void demanderMicro();
  }, [visible, permCam, permMicro, demanderCam, demanderMicro]);

  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setEcoule((Date.now() - debut.current) / 1000), 250);
    return () => clearInterval(t);
  }, [enCours]);

  const filmer = async () => {
    if (!camera.current || enCours) return;
    setErreur('');
    setEnCours(true);
    setEcoule(0);
    debut.current = Date.now();
    try {
      const r = await camera.current.recordAsync({ maxDuration: DUREE_MAX_S, codec: Platform.OS === 'ios' ? 'avc1' : undefined });
      const dureeS = Math.min(DUREE_MAX_S, Math.max(1, Math.round((Date.now() - debut.current) / 1000)));
      setEnCours(false);
      if (!r?.uri) throw new Error('La vidéo n’a pas été enregistrée.');
      onFilmee(await lireLocal(r.uri, typeVideo(null, r.uri), dureeS));
    } catch (e) {
      setEnCours(false);
      setErreur(messageErreur(e));
    }
  };

  const fermer = () => {
    if (enCours) camera.current?.stopRecording();
    onFermer();
  };

  const refuse = permCam && !permCam.granted && !permCam.canAskAgain;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={fermer} supportedOrientations={['portrait']}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permCam?.granted ? (
          <CameraView
            ref={camera}
            style={{ flex: 1 }}
            mode="video"
            facing={face}
            mute={!permMicro?.granted}
            videoQuality={QUALITE_ENREGISTREMENT.videoQuality}
            videoBitrate={QUALITE_ENREGISTREMENT.videoBitrate}
            onCameraReady={() => setPret(true)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <Text style={[ts.texte, { color: '#FFFFFF', textAlign: 'center' }]}>
              {refuse ? 'L’appareil photo est refusé pour CoachGo. Autorise-le dans les réglages du téléphone.' : 'Autorise l’appareil photo pour filmer ton mouvement.'}
            </Text>
            {!refuse && <Action libelle="Autoriser" onPress={() => void demanderCam()} />}
          </View>
        )}
        <View style={styles.barreCamera}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={fermer} hitSlop={10} style={styles.boutonRondCamera}>
            <X size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={enCours ? 'Arrêter la vidéo' : 'Filmer'}
            disabled={!pret || !permCam?.granted}
            onPress={() => (enCours ? camera.current?.stopRecording() : void filmer())}
            style={[styles.declencheur, (!pret || !permCam?.granted) && { opacity: 0.4 }]}
          >
            <View style={enCours ? styles.declencheurStop : styles.declencheurRond} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer de caméra"
            disabled={enCours}
            onPress={() => setFace(face === 'back' ? 'front' : 'back')}
            hitSlop={10}
            style={[styles.boutonRondCamera, enCours && { opacity: 0.4 }]}
          >
            <RefreshCw size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.bandeauCamera} pointerEvents="none">
          <Text style={{ fontFamily: polices.chiffres, fontSize: 16, color: '#FFFFFF' }}>
            {enCours ? `● ${dureeLisible(Math.floor(ecoule))} / ${dureeLisible(DUREE_MAX_S)}` : `Une série, ${DUREE_MAX_S} s au plus`}
          </Text>
          {!permMicro?.granted && permCam?.granted && <Text style={[ts.doux, { color: '#FFFFFF' }]}>Sans le micro, la vidéo sera muette.</Text>}
          {!!erreur && <Text style={[ts.doux, { color: '#FFB4B4' }]}>{erreur}</Text>}
        </View>
      </View>
    </Modal>
  );
}

export async function choisirDansGalerie(): Promise<FichierMedia | null> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: Platform.OS === 'ios',
    videoMaxDuration: DUREE_MAX_S,
    // iOS recompresse la vidéo choisie ; Android la garde telle quelle (refusée au-delà de 25 Mo).
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    quality: 0.7,
  });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const dureeS = a.duration ? a.duration / 1000 : undefined;
  const type = typeVideo(a.mimeType ?? a.file?.type, a.fileName ?? a.uri);
  // Contrôle avant de lire le fichier : inutile de charger 200 Mo pour les refuser.
  if (a.fileSize) {
    const refus = verifierVideo({ type, taille: a.fileSize, dureeS });
    if (refus) throw new Error(refus);
  }
  return lireLocal(a.uri, type, dureeS, Platform.OS === 'web' ? a.file : undefined);
}

// ---------- Client : sous chaque exercice de la séance ----------

export function VideosExercice({ contexte, videos: liste, onChange }: { contexte: ContexteVideo; videos: VideoMouvement[]; onChange: () => void }) {
  const [camera, setCamera] = useState(false);
  const [pret, setPret] = useState<FichierMedia | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok'>('repos');
  const [erreur, setErreur] = useState('');
  const [toutes, setToutes] = useState(false);
  const maintenant = new Date();
  const visibles = toutes ? liste : liste.slice(0, 1);

  const preparer = (f: FichierMedia | null) => {
    if (!f) return;
    const refus = verifierVideo(f);
    if (refus) return setErreur(refus);
    setErreur('');
    setEtat('repos');
    setPret(f);
  };

  const envoyer = async () => {
    if (!pret) return;
    setEtat('envoi');
    setErreur('');
    try {
      await videos.envoyer(contexte, pret, commentaire);
      setPret(null);
      setCommentaire('');
      setEtat('ok');
      onChange();
    } catch (e) {
      setErreur(messageErreur(e));
      setEtat('repos');
    }
  };

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {pret ? (
        <View style={styles.encadre}>
          <Text style={ts.titreChamp}>
            Vidéo prête{pret.dureeS ? ` · ${dureeLisible(Math.round(pret.dureeS))}` : ''} · {mo(pret.taille)}
          </Text>
          <TextInput
            multiline
            maxLength={MAX_COMMENTAIRE}
            value={commentaire}
            onChangeText={setCommentaire}
            accessibilityLabel="Question pour le coach"
            placeholder="Une question pour le coach ? (facultatif) Ex. : mon dos s’arrondit-il ?"
            placeholderTextColor={couleurs.suggestion}
            style={styles.saisie}
          />
          <Ligne>
            <Action petit icone={Video} libelle={etat === 'envoi' ? 'Envoi…' : 'Envoyer au coach'} chargement={etat === 'envoi'} onPress={envoyer} />
            <Action petit variante="fantome" libelle="Annuler" desactive={etat === 'envoi'} onPress={() => setPret(null)} />
          </Ligne>
          <Text style={ts.doux}>Seul ton coach la voit. Elle est effacée automatiquement au bout de 30 jours.</Text>
        </View>
      ) : (
        <Ligne>
          {Platform.OS !== 'web' && <Action petit variante="contour" icone={Video} libelle="Filmer mon mouvement" onPress={() => setCamera(true)} />}
          <Action
            petit
            variante={Platform.OS === 'web' ? 'contour' : 'fantome'}
            icone={Platform.OS === 'web' ? Video : undefined}
            libelle={Platform.OS === 'web' ? 'Envoyer une vidéo au coach' : 'Depuis la galerie'}
            onPress={async () => {
              setErreur('');
              try {
                preparer(await choisirDansGalerie());
              } catch (e) {
                setErreur(messageErreur(e));
              }
            }}
          />
        </Ligne>
      )}
      {etat === 'ok' && <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.vert }}>Vidéo envoyée au coach.</Text>}
      {!!erreur && (
        <Text accessibilityRole="alert" style={[ts.erreur, { fontSize: 12 }]}>
          {erreur}
        </Text>
      )}
      {visibles.map((v) => (
        <VideoEnvoyee key={v.id} v={v} maintenant={maintenant} onChange={onChange} />
      ))}
      {liste.length > 1 && (
        <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
          <Action petit variante="fantome" libelle={toutes ? 'Voir moins' : `Voir les ${liste.length} vidéos de cet exercice`} onPress={() => setToutes(!toutes)} />
        </View>
      )}
      {Platform.OS !== 'web' && <Camera visible={camera} onFermer={() => setCamera(false)} onFilmee={(f) => (setCamera(false), preparer(f))} />}
    </View>
  );
}

function VideoEnvoyee({ v, maintenant, onChange }: { v: VideoMouvement; maintenant: Date; onChange: () => void }) {
  const [voir, setVoir] = useState(false);
  const [retrait, setRetrait] = useState(false);
  const [erreur, setErreur] = useState('');
  const statut = statutVideo(v);
  const restant = joursRestants(v, maintenant);
  return (
    <View style={styles.encadre}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Video size={14} color={couleurs.texteDoux} />
        <Text style={ts.titreChamp}>Vidéo du {jourMois(v.creeLe)}</Text>
        <Statut statut={statut} />
      </View>
      {!!v.commentaire && <Text style={ts.doux}>Ta question : {v.commentaire}</Text>}
      {aReponse(v) && (
        <View style={{ gap: 6, borderLeftWidth: 3, borderLeftColor: couleurs.vert, paddingLeft: 10 }}>
          <Text style={[ts.titreChamp, { color: couleurs.vert }]}>Réponse du coach</Text>
          {!!v.reponseTexte && <Text style={ts.texte}>{v.reponseTexte}</Text>}
          {!!v.reponseAudio && <LecteurVocal chemin={v.reponseAudio} dureeS={v.reponseAudioDureeS} />}
        </View>
      )}
      <Ligne>
        <Action petit variante="fantome" icone={Play} libelle={voir ? 'Masquer la vidéo' : 'Revoir'} onPress={() => setVoir(!voir)} />
        {statut === 'nouvelle' && (
          <Action
            petit
            variante="fantome"
            icone={Trash2}
            libelle="Retirer"
            chargement={retrait}
            onPress={async () => {
              setRetrait(true);
              setErreur('');
              try {
                await videos.retirer(v);
                onChange();
              } catch (e) {
                setErreur(messageErreur(e));
              }
              setRetrait(false);
            }}
          />
        )}
      </Ligne>
      {voir && <LecteurVideo chemin={v.chemin} dureeS={v.dureeS} largeur={180} />}
      {!!erreur && <Text style={ts.erreur}>{erreur}</Text>}
      <Text style={ts.doux}>Effacée {restant <= 0 ? 'aujourd’hui' : restant === 1 ? 'demain' : `dans ${restant} jours`}.</Text>
    </View>
  );
}

const STATUTS = {
  nouvelle: { libelle: 'En attente du coach', couleur: '#B45309', fond: '#FFF4DE' },
  vue: { libelle: 'Vue par le coach', couleur: couleurs.bleu, fond: '#E8EFFD' },
  repondue: { libelle: 'Répondue', couleur: couleurs.vert, fond: couleurs.vertClair },
} as const;

function Statut({ statut, coach }: { statut: keyof typeof STATUTS; coach?: boolean }) {
  const s = STATUTS[statut];
  const libelle = coach ? (statut === 'nouvelle' ? 'Nouvelle' : statut === 'vue' ? 'Vue, sans réponse' : 'Répondue') : s.libelle;
  return (
    <View style={{ backgroundColor: s.fond, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 11, color: s.couleur }}>{libelle}</Text>
    </View>
  );
}

// ---------- Coach : carte de l'Entraînement du client ----------

export function VideosMouvementCoach({ videos: liste, realisations, onChange }: { videos: VideoMouvement[]; realisations: RealisationLue[]; onChange: () => void }) {
  const maintenant = new Date();
  const ordre = ordreCoach(liste, maintenant);
  const attente = ordre.filter((v) => !aReponse(v)).length;
  const [toutes, setToutes] = useState(false);
  const visibles = toutes ? ordre : ordre.slice(0, 3);
  return (
    <View style={ts.carte}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={ts.titreSection}>Vidéos de mouvement</Text>
        {attente > 0 && (
          <View style={{ backgroundColor: couleurs.rouge, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 }}>
            <Text style={{ fontFamily: polices.texteGras, fontSize: 11, color: '#FFFFFF' }}>{attente} à regarder</Text>
          </View>
        )}
      </View>
      {ordre.length === 0 ? (
        <Text style={ts.doux}>
          Aucune vidéo pour l’instant. Le client peut en envoyer une depuis sa séance, sous chaque exercice (« Filmer mon mouvement »). Elles sont effacées 30 jours après
          l’envoi.
        </Text>
      ) : (
        visibles.map((v) => <CarteVideoCoach key={v.id} v={v} realisations={realisations} maintenant={maintenant} onChange={onChange} />)
      )}
      {ordre.length > 3 && (
        <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
          <Action petit variante="fantome" libelle={toutes ? 'Voir moins' : `Voir les ${ordre.length} vidéos`} onPress={() => setToutes(!toutes)} />
        </View>
      )}
    </View>
  );
}

function CarteVideoCoach({ v, realisations, maintenant, onChange }: { v: VideoMouvement; realisations: RealisationLue[]; maintenant: Date; onChange: () => void }) {
  const ctx = contexteSeance(v, realisations);
  const [edition, setEdition] = useState(!aReponse(v));
  const [texte, setTexte] = useState(v.reponseTexte ?? '');
  const [vocal, setVocal] = useState<Vocal | null>(null);
  const [retirerVocal, setRetirerVocal] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const restant = joursRestants(v, maintenant);
  const vide = !texte.trim() && !vocal && (retirerVocal || !v.reponseAudio);

  const envoyer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await videos.repondre(v, { texte, vocal: vocal ? vocal.fichier : retirerVocal ? null : undefined });
      setVocal(null);
      setRetirerVocal(false);
      setEdition(false);
      onChange();
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setEnvoi(false);
  };

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={[ts.titre, { flexShrink: 1 }]}>{v.exerciceNom}</Text>
        <Statut statut={statutVideo(v)} coach />
      </View>
      <Text style={ts.doux}>
        Envoyée le {jourMois(v.creeLe)}
        {v.seanceTitre ? ` · ${titreClient(v.seanceTitre)}` : ''} · effacée {restant <= 1 ? (restant === 0 ? 'aujourd’hui' : 'demain') : `dans ${restant} jours`}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <LecteurVideo chemin={v.chemin} dureeS={v.dureeS} largeur={200} onVue={() => !v.vueLe && videos.marquerVue(v.id).catch(() => undefined)} />
        <View style={{ flexGrow: 1, flexBasis: 260, minWidth: 0, gap: 10 }}>
          {!!v.commentaire && (
            <View style={{ backgroundColor: couleurs.fond, borderRadius: 10, padding: 10, gap: 2 }}>
              <Text style={ts.titreChamp}>Question du client</Text>
              <Text style={ts.texte}>{v.commentaire}</Text>
            </View>
          )}
          {ctx ? (
            <View style={{ gap: 6 }}>
              <Text style={ts.titreChamp}>Séries de cette séance</Text>
              {ctx.series.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ctx.series.map((s, i) => (
                    <View key={s.id} style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={ts.mono}>
                        {i + 1}. {serieLisible(s.valeurs)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={ts.doux}>Pas de série saisie pour cet exercice.</Text>
              )}
              {ctx.realisation.note !== undefined && (
                <Text style={ts.texte}>
                  <Text style={{ fontFamily: polices.texteGras }}>Ressenti : </Text>
                  {ctx.realisation.note}/10
                </Text>
              )}
              {!!ctx.realisation.commentaire?.trim() && (
                <Text style={ts.texte}>
                  <Text style={{ fontFamily: polices.texteGras }}>Commentaire de séance : </Text>
                  {ctx.realisation.commentaire}
                </Text>
              )}
            </View>
          ) : (
            <Text style={ts.doux}>
              {v.realisationId ? 'La séance n’a pas encore été enregistrée par le client : ses séries apparaîtront ici.' : 'Vidéo envoyée hors séance.'}
            </Text>
          )}

          {edition ? (
            <View style={{ gap: 8 }}>
              <Text style={ts.titreChamp}>Ta réponse</Text>
              <TextInput
                multiline
                maxLength={MAX_REPONSE}
                value={texte}
                onChangeText={setTexte}
                editable={!envoi}
                accessibilityLabel={`Réponse écrite pour ${v.exerciceNom}`}
                placeholder="Ex. : bon gainage, descends 2 cm plus bas et garde les coudes à 45°."
                placeholderTextColor={couleurs.suggestion}
                style={[styles.saisie, { minHeight: 72 }]}
              />
              {v.reponseAudio && !vocal && !retirerVocal ? (
                <Ligne>
                  <LecteurVocal chemin={v.reponseAudio} dureeS={v.reponseAudioDureeS} libelle="Vocal envoyé" />
                  <Action petit variante="fantome" icone={Trash2} libelle="Retirer le vocal" onPress={() => setRetirerVocal(true)} />
                </Ligne>
              ) : (
                <EnregistreurVocal valeur={vocal} desactive={envoi} onChange={setVocal} />
              )}
              <Ligne>
                <Action petit libelle={aReponse(v) ? 'Mettre à jour la réponse' : 'Envoyer la réponse'} chargement={envoi} desactive={vide} onPress={envoyer} />
                {aReponse(v) && (
                  <Action
                    petit
                    variante="fantome"
                    libelle="Annuler"
                    desactive={envoi}
                    onPress={() => {
                      setEdition(false);
                      setTexte(v.reponseTexte ?? '');
                      setVocal(null);
                      setRetirerVocal(false);
                    }}
                  />
                )}
              </Ligne>
            </View>
          ) : (
            <View style={{ gap: 6, borderLeftWidth: 3, borderLeftColor: couleurs.vert, paddingLeft: 10 }}>
              <Text style={[ts.titreChamp, { color: couleurs.vert }]}>Ta réponse{v.reponseLe ? ` du ${jourMois(v.reponseLe)}` : ''}</Text>
              {!!v.reponseTexte && <Text style={ts.texte}>{v.reponseTexte}</Text>}
              {!!v.reponseAudio && <LecteurVocal chemin={v.reponseAudio} dureeS={v.reponseAudioDureeS} libelle="Ton vocal" />}
              <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
                <Action petit variante="fantome" libelle="Modifier" onPress={() => setEdition(true)} />
              </View>
            </View>
          )}
          {!!erreur && (
            <Text accessibilityRole="alert" style={ts.erreur}>
              {erreur}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: { borderRadius: 10, backgroundColor: couleurs.secondaire, alignItems: 'center', justifyContent: 'center', gap: 8 },
  rondLecture: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 12,
    minHeight: 36,
  },
  rondAudio: { width: 28, height: 28, borderRadius: 14, backgroundColor: couleurs.rouge, alignItems: 'center', justifyContent: 'center' },
  enregistrement: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  pointRouge: { width: 10, height: 10, borderRadius: 5, backgroundColor: couleurs.rouge },
  encadre: { backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, padding: 10, gap: 6 },
  saisie: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: 8,
    backgroundColor: couleurs.carte,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
    fontFamily: polices.texte,
    fontSize: 16,
    color: couleurs.texte,
  },
  barreCamera: { position: 'absolute', left: 0, right: 0, bottom: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  boutonRondCamera: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  declencheur: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  declencheurRond: { width: 58, height: 58, borderRadius: 29, backgroundColor: couleurs.rougeMarque },
  declencheurStop: { width: 30, height: 30, borderRadius: 6, backgroundColor: couleurs.rougeMarque },
  bandeauCamera: { position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', gap: 4, paddingHorizontal: 16 },
});
