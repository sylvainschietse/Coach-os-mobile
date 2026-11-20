// Accès aux vidéos de mouvement : en démo sur l'appareil, ou dans Supabase (table videos_mouvement sous RLS
// et compartiment privé « videos-mouvement »). Les écrans ne parlent qu'à cette interface.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import * as regles from '@/domain/videos-mouvement';
import type { ContexteVideo, FichierVideo, VideoMouvement } from '@/domain/videos-mouvement';
import { nouvelId } from '@/lib/identifiant';

import { supabase } from './supabase';

/** Vidéo ou vocal prêt à partir : contenu (Blob sur le web, octets sur le téléphone) et adresse locale pour la démo. */
export type FichierMedia = FichierVideo & { donnees: Blob | ArrayBuffer; uri?: string };

export interface DepotVideos {
  /** Client : ses vidéos encore conservées. */
  mesVideos(clientId: string): Promise<VideoMouvement[]>;
  envoyer(c: ContexteVideo, f: FichierMedia, commentaire: string): Promise<VideoMouvement>;
  /** Le client retire une vidéo envoyée par erreur ; le coach peut aussi l'effacer. */
  retirer(v: VideoMouvement): Promise<void>;
  /** Coach : les vidéos d'un client. */
  videosClient(clientId: string): Promise<VideoMouvement[]>;
  marquerVue(id: string): Promise<void>;
  /** Texte et/ou vocal. Un nouveau vocal remplace l'ancien ; `vocal: null` le retire. */
  repondre(v: VideoMouvement, r: { texte: string; vocal?: FichierMedia | null }): Promise<VideoMouvement>;
  /** Lien de courte durée vers le fichier. */
  lien(chemin: string): Promise<string>;
  /** Coach : efface les vidéos et vocaux de plus de 30 jours. Renvoie le nombre de vidéos effacées. */
  purger(): Promise<number>;
}

const abonnes = new Set<() => void>();
export function ecouterVideos(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
const prevenir = () => abonnes.forEach((fn) => fn());

async function octets(d: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return d instanceof ArrayBuffer ? d : await d.arrayBuffer();
}

function controlerVideo(f: FichierMedia) {
  const refus = regles.verifierVideo(f);
  if (refus) throw new Error(refus);
}
function controlerVocal(f: FichierMedia) {
  const refus = regles.verifierVocal(f);
  if (refus) throw new Error(refus);
}

const texteReponse = (t: string) => t.trim().slice(0, regles.MAX_REPONSE) || undefined;

// ---------- Démo : tout reste sur cet appareil (la vidéo n'est pas recopiée, seule son adresse locale est gardée) ----------

const CLE = 'coachos.demo.videos-mouvement';
const cleUri = (chemin: string) => `coachos.demo.video-uri.${chemin}`;

async function lireDemo(): Promise<VideoMouvement[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLE)) ?? '[]') as VideoMouvement[];
  } catch {
    return [];
  }
}
async function ecrireDemo(v: VideoMouvement[]) {
  await AsyncStorage.setItem(CLE, JSON.stringify(v));
  prevenir();
}

export const videosDemo: DepotVideos = {
  async mesVideos(clientId) {
    const now = new Date();
    return (await lireDemo()).filter((v) => v.clientId === clientId && !regles.expiree(v, now));
  },
  async envoyer(c, f, commentaire) {
    controlerVideo(f);
    const v = regles.nouvelleVideo(nouvelId(), c, f, commentaire, new Date());
    if (f.uri) await AsyncStorage.setItem(cleUri(v.chemin), f.uri);
    await ecrireDemo([...(await lireDemo()), v]);
    return v;
  },
  async retirer(v) {
    await ecrireDemo((await lireDemo()).filter((x) => x.id !== v.id));
    await AsyncStorage.multiRemove([cleUri(v.chemin), ...(v.reponseAudio ? [cleUri(v.reponseAudio)] : [])]);
  },
  async videosClient(clientId) {
    return (await lireDemo()).filter((v) => v.clientId === clientId);
  },
  async marquerVue(id) {
    const tout = await lireDemo();
    if (!tout.some((v) => v.id === id && !v.vueLe)) return;
    await ecrireDemo(tout.map((v) => (v.id === id ? { ...v, vueLe: new Date().toISOString() } : v)));
  },
  async repondre(v, r) {
    const maintenant = new Date();
    let audio: Pick<VideoMouvement, 'reponseAudio' | 'reponseAudioType' | 'reponseAudioDureeS'> = {
      reponseAudio: v.reponseAudio,
      reponseAudioType: v.reponseAudioType,
      reponseAudioDureeS: v.reponseAudioDureeS,
    };
    if (r.vocal) {
      controlerVocal(r.vocal);
      const chemin = regles.cheminVocal(v.clientId, v.id, r.vocal.type, maintenant);
      if (r.vocal.uri) await AsyncStorage.setItem(cleUri(chemin), r.vocal.uri);
      audio = { reponseAudio: chemin, reponseAudioType: regles.typeSimple(r.vocal.type), reponseAudioDureeS: r.vocal.dureeS && Math.round(r.vocal.dureeS) };
    } else if (r.vocal === null) audio = {};
    const suivant: VideoMouvement = { ...v, ...audio, reponseTexte: texteReponse(r.texte), reponseLe: maintenant.toISOString(), vueLe: v.vueLe ?? maintenant.toISOString() };
    await ecrireDemo((await lireDemo()).map((x) => (x.id === v.id ? suivant : x)));
    return suivant;
  },
  async lien(chemin) {
    const uri = await AsyncStorage.getItem(cleUri(chemin));
    if (!uri) throw new Error('Cette vidéo n’est plus disponible sur cet appareil (démo).');
    return uri;
  },
  async purger() {
    const now = new Date();
    const tout = await lireDemo();
    const parties = tout.filter((v) => regles.expiree(v, now));
    if (!parties.length) return 0;
    await ecrireDemo(tout.filter((v) => !regles.expiree(v, now)));
    return parties.length;
  },
};

// ---------- Supabase ----------

const n = <T>(v: T | undefined) => (v === undefined ? null : v);
const u = <T>(v: T | null) => (v === null ? undefined : v);
const COMPARTIMENT = 'videos-mouvement';

const depuisLigne = (l: any): VideoMouvement => ({
  id: l.id, clientId: l.client_id, realisationId: u(l.realisation_id), seanceId: u(l.seance_id), ligneId: u(l.ligne_id), exerciceId: u(l.exercice_id),
  exerciceNom: l.exercice_nom, seanceTitre: u(l.seance_titre), chemin: l.chemin, typeFichier: l.type_fichier, taille: l.taille, dureeS: u(l.duree_s),
  commentaire: u(l.commentaire), creeLe: l.cree_le, expireLe: l.expire_le, vueLe: u(l.vue_le), reponseTexte: u(l.reponse_texte),
  reponseAudio: u(l.reponse_audio), reponseAudioType: u(l.reponse_audio_type), reponseAudioDureeS: u(l.reponse_audio_duree_s), reponseLe: u(l.reponse_le),
});

export function creerVideosSupabase(db: SupabaseClient): DepotVideos {
  const stock = () => db.storage.from(COMPARTIMENT);

  async function lister(clientId: string) {
    const { data, error } = await db.from('videos_mouvement').select('*').eq('client_id', clientId).order('cree_le', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(depuisLigne);
  }

  return {
    async mesVideos(clientId) {
      return lister(clientId);
    },
    async envoyer(c, f, commentaire) {
      controlerVideo(f);
      const v = regles.nouvelleVideo(nouvelId(), c, f, commentaire, new Date());
      const envoi = await stock().upload(v.chemin, await octets(f.donnees), { contentType: v.typeFichier, upsert: false });
      if (envoi.error) throw new Error(`Vidéo non envoyée : ${envoi.error.message}`);
      // coach_id, cree_le et expire_le sont fixés par la base.
      const { data, error } = await db
        .from('videos_mouvement')
        .insert({
          id: v.id, client_id: v.clientId, realisation_id: n(v.realisationId), seance_id: n(v.seanceId), ligne_id: n(v.ligneId),
          exercice_id: n(v.exerciceId), exercice_nom: v.exerciceNom, seance_titre: n(v.seanceTitre), chemin: v.chemin,
          type_fichier: v.typeFichier, taille: v.taille, duree_s: n(v.dureeS), commentaire: n(v.commentaire),
        })
        .select('*')
        .single();
      if (error) {
        await stock().remove([v.chemin]);
        throw new Error(error.message);
      }
      prevenir();
      return depuisLigne(data);
    },
    async retirer(v) {
      const { data, error } = await db.from('videos_mouvement').delete().eq('id', v.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Suppression non confirmée par le serveur.');
      await stock().remove([v.chemin, ...(v.reponseAudio ? [v.reponseAudio] : [])]);
      prevenir();
    },
    videosClient: lister,
    async marquerVue(id) {
      const { error } = await db.from('videos_mouvement').update({ vue_le: new Date().toISOString() }).eq('id', id).is('vue_le', null);
      if (error) throw new Error(error.message);
      prevenir();
    },
    async repondre(v, r) {
      const maintenant = new Date();
      const maj: Record<string, unknown> = { reponse_texte: n(texteReponse(r.texte)), reponse_le: maintenant.toISOString(), vue_le: v.vueLe ?? maintenant.toISOString() };
      let nouveau: string | undefined;
      if (r.vocal) {
        controlerVocal(r.vocal);
        nouveau = regles.cheminVocal(v.clientId, v.id, r.vocal.type, maintenant);
        const envoi = await stock().upload(nouveau, await octets(r.vocal.donnees), { contentType: regles.typeSimple(r.vocal.type), upsert: false });
        if (envoi.error) throw new Error(`Vocal non envoyé : ${envoi.error.message}`);
        Object.assign(maj, { reponse_audio: nouveau, reponse_audio_type: regles.typeSimple(r.vocal.type), reponse_audio_duree_s: r.vocal.dureeS ? Math.max(1, Math.round(r.vocal.dureeS)) : null });
      } else if (r.vocal === null) Object.assign(maj, { reponse_audio: null, reponse_audio_type: null, reponse_audio_duree_s: null });
      const { data, error } = await db.from('videos_mouvement').update(maj).eq('id', v.id).select('*');
      if (error || !data?.length) {
        if (nouveau) await stock().remove([nouveau]);
        throw new Error(error?.message ?? 'Réponse non enregistrée : cette vidéo a peut-être été effacée.');
      }
      // L'ancien vocal remplacé ou retiré ne sert plus.
      if (v.reponseAudio && (nouveau || r.vocal === null)) await stock().remove([v.reponseAudio]);
      prevenir();
      return depuisLigne(data[0]);
    },
    async lien(chemin) {
      const { data, error } = await stock().createSignedUrl(chemin, 600);
      if (error || !data) throw new Error('Ce fichier n’est plus accessible (effacé ou hors de ton compte).');
      return data.signedUrl;
    },
    async purger() {
      const { data, error } = await db.from('videos_mouvement').select('id, chemin, reponse_audio').lte('expire_le', new Date().toISOString()).limit(200);
      if (error) throw new Error(error.message);
      if (!data?.length) return 0;
      const fichiers = data.flatMap((l: any) => [l.chemin, ...(l.reponse_audio ? [l.reponse_audio] : [])]);
      const r = await stock().remove(fichiers);
      if (r.error) throw new Error(r.error.message);
      const suppr = await db.from('videos_mouvement').delete().in('id', data.map((l: any) => l.id));
      if (suppr.error) throw new Error(suppr.error.message);
      return data.length;
    },
  };
}

export const videos: DepotVideos = supabase ? creerVideosSupabase(supabase) : videosDemo;
