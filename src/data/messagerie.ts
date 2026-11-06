// Accès à la messagerie : en démo sur l'appareil, ou dans Supabase (table messages sous RLS et compartiment
// privé « messagerie »). Le destinataire est prévenu sur son téléphone par la base elle-même (déclencheur
// notif_message), sans rien bloquer.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import * as regles from '@/domain/messagerie';
import type { Auteur, Conversation, Message } from '@/domain/messagerie';
import { typeSimple } from '@/domain/videos-mouvement';
import { nouvelId } from '@/lib/identifiant';

import { abonnements } from './abonnements';
import { CLIENTS_DEMO } from './demo';
import { supabase } from './supabase';
import { videos, type FichierMedia } from './videos-mouvement';

export type { FichierMedia };

export interface CompteVideos {
  envoyees: number;
  incluses: number;
}

export interface DepotMessagerie {
  /** Le fil d'un client, du plus ancien au plus récent. Le client ne voit que le sien. */
  fil(clientId: string): Promise<Message[]>;
  envoyer(clientId: string, auteur: Auteur, texte: string, piece?: FichierMedia): Promise<Message>;
  /** Marque comme lus les messages de l'autre personne. */
  marquerLus(clientId: string, moi: Auteur): Promise<void>;
  /** On retire un message envoyé par erreur (le sien uniquement). */
  retirer(m: Message): Promise<void>;
  /** Client : messages du coach pas encore lus. */
  nonLusClient(clientId: string): Promise<number>;
  /** Coach : un fil par client qui a l'appli, avec le dernier message. */
  conversations(): Promise<Conversation[]>;
  /** Lien de courte durée vers une pièce jointe. */
  lien(chemin: string): Promise<string>;
  /** Vidéos envoyées par le client ce mois-ci, face à celles incluses dans sa formule. */
  videosDuMois(clientId: string, qui: Auteur): Promise<CompteVideos>;
  /** Coach : efface les vidéos de plus de 30 jours. */
  purger(): Promise<number>;
}

const abonnes = new Set<() => void>();
export function ecouterMessages(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
export const prevenirMessages = () => abonnes.forEach((fn) => fn());

async function octets(d: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return d instanceof ArrayBuffer ? d : await d.arrayBuffer();
}

function controler(texte: string, piece?: FichierMedia) {
  const refus = regles.verifierEnvoi(texte, piece);
  if (refus) throw new Error(refus);
}

// ---------- Démo : tout reste sur cet appareil ----------

const CLE = 'coachos.demo.messagerie';
const cleUri = (chemin: string) => `coachos.demo.message-uri.${chemin}`;

async function lireDemo(): Promise<Message[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLE)) ?? '[]') as Message[];
  } catch {
    return [];
  }
}
async function ecrireDemo(m: Message[]) {
  await AsyncStorage.setItem(CLE, JSON.stringify(m));
  prevenirMessages();
}

export const messagerieDemo: DepotMessagerie = {
  async fil(clientId) {
    return regles.ordreFil((await lireDemo()).filter((m) => m.clientId === clientId));
  },
  async envoyer(clientId, auteur, texte, piece) {
    controler(texte, piece);
    const m = regles.nouveauMessage(nouvelId(), clientId, auteur, texte, piece, new Date());
    if (piece?.uri && m.pieceChemin) await AsyncStorage.setItem(cleUri(m.pieceChemin), piece.uri);
    await ecrireDemo([...(await lireDemo()), m]);
    return m;
  },
  async marquerLus(clientId, moi) {
    const tout = await lireDemo();
    if (!tout.some((m) => m.clientId === clientId && m.auteur !== moi && !m.luLe)) return;
    const maintenant = new Date().toISOString();
    await ecrireDemo(tout.map((m) => (m.clientId === clientId && m.auteur !== moi && !m.luLe ? { ...m, luLe: maintenant } : m)));
  },
  async retirer(m) {
    await ecrireDemo((await lireDemo()).filter((x) => x.id !== m.id));
    if (m.pieceChemin) await AsyncStorage.removeItem(cleUri(m.pieceChemin));
  },
  async nonLusClient(clientId) {
    return (await lireDemo()).filter((m) => m.clientId === clientId && m.auteur === 'coach' && !m.luLe).length;
  },
  async conversations() {
    const tout = await lireDemo();
    const ids = [...new Set(tout.map((m) => m.clientId))];
    return regles.ordreConversations(
      ids.map((clientId) => {
        const fil = regles.ordreFil(tout.filter((m) => m.clientId === clientId));
        const d = fil[fil.length - 1];
        const c = CLIENTS_DEMO.find((x) => x.id === clientId);
        return {
          clientId,
          prenom: c?.prenom ?? 'Client',
          nom: c?.nom ?? '',
          dernier: d && { texte: d.texte, pieceType: d.pieceType, auteur: d.auteur, le: d.creeLe },
          nonLus: fil.filter((m) => m.auteur === 'client' && !m.luLe).length,
        };
      }),
    );
  },
  async lien(chemin) {
    const uri = await AsyncStorage.getItem(cleUri(chemin));
    if (!uri) throw new Error('Ce fichier n’est plus disponible sur cet appareil (démo).');
    return uri;
  },
  async videosDuMois(clientId) {
    const maintenant = new Date();
    const [fil, mouvement, abo] = await Promise.all([messagerieDemo.fil(clientId), videos.mesVideos(clientId), abonnements.lire(clientId)]);
    return { envoyees: regles.videosEnvoyeesDuMois(fil, mouvement, maintenant), incluses: abo.videosMois ?? 0 };
  },
  async purger() {
    return 0;
  },
};

// ---------- Supabase ----------

const u = <T>(v: T | null) => (v === null ? undefined : v);
const COMPARTIMENT = 'messagerie';

const depuisLigne = (l: any): Message => ({
  id: l.id,
  clientId: l.client_id,
  auteur: l.auteur,
  texte: u(l.texte),
  pieceChemin: u(l.piece_chemin),
  pieceType: u(l.piece_type),
  pieceTaille: u(l.piece_taille),
  pieceDureeS: u(l.piece_duree_s),
  pieceExpiree: l.piece_expiree || undefined,
  creeLe: l.cree_le,
  luLe: u(l.lu_le),
});

export function creerMessagerieSupabase(db: SupabaseClient): DepotMessagerie {
  const stock = () => db.storage.from(COMPARTIMENT);

  return {
    async fil(clientId) {
      const { data, error } = await db.from('messages').select('*').eq('client_id', clientId).order('cree_le', { ascending: false }).limit(300);
      if (error) throw new Error('Impossible de charger les messages. Vérifie ta connexion.');
      return regles.ordreFil((data ?? []).map(depuisLigne));
    },
    async envoyer(clientId, auteur, texte, piece) {
      controler(texte, piece);
      const m = regles.nouveauMessage(nouvelId(), clientId, auteur, texte, piece, new Date());
      if (piece && m.pieceChemin) {
        const envoi = await stock().upload(m.pieceChemin, await octets(piece.donnees), { contentType: typeSimple(piece.type), upsert: false });
        if (envoi.error) throw new Error(`Fichier non envoyé : ${envoi.error.message}`);
      }
      // Le coach du client : la base le vérifie (règles d'insertion), on le lit pour remplir la ligne.
      const coachId = auteur === 'client' ? (await db.rpc('coach_de_mon_client')).data : (await db.rpc('mon_coach_id')).data;
      const { data, error } = await db
        .from('messages')
        .insert({
          id: m.id,
          coach_id: coachId,
          client_id: clientId,
          auteur,
          texte: m.texte ?? null,
          piece_chemin: m.pieceChemin ?? null,
          piece_type: m.pieceType ?? null,
          piece_taille: m.pieceTaille ?? null,
          piece_duree_s: m.pieceDureeS ?? null,
        })
        .select('*')
        .single();
      if (error) {
        if (m.pieceChemin) await stock().remove([m.pieceChemin]);
        throw new Error('Message non envoyé. Vérifie ta connexion et réessaie.');
      }
      prevenirMessages();
      return depuisLigne(data);
    },
    async marquerLus(clientId, moi) {
      const { error } = await db
        .from('messages')
        .update({ lu_le: new Date().toISOString() })
        .eq('client_id', clientId)
        .eq('auteur', moi === 'coach' ? 'client' : 'coach')
        .is('lu_le', null);
      if (error) return;
      prevenirMessages();
    },
    async retirer(m) {
      const { data, error } = await db.from('messages').delete().eq('id', m.id).select('id');
      if (error || !data?.length) throw new Error('Message non retiré. Réessaie dans un instant.');
      if (m.pieceChemin) await stock().remove([m.pieceChemin]);
      prevenirMessages();
    },
    async nonLusClient(clientId) {
      const { count, error } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('auteur', 'coach')
        .is('lu_le', null);
      if (error) return 0;
      return count ?? 0;
    },
    async conversations() {
      const { data, error } = await db.rpc('conversations_coach');
      if (error) throw new Error('Impossible de charger les messages. Vérifie ta connexion.');
      return regles.ordreConversations(
        ((data ?? []) as any[]).map((l) => ({
          clientId: l.client_id,
          prenom: l.prenom ?? '',
          nom: l.nom ?? '',
          dernier: l.dernier_le ? { texte: u(l.dernier_texte), pieceType: u(l.dernier_type), auteur: l.dernier_auteur, le: l.dernier_le } : undefined,
          nonLus: l.non_lus ?? 0,
        })),
      );
    },
    async lien(chemin) {
      const { data, error } = await stock().createSignedUrl(chemin, 600);
      if (error || !data) throw new Error('Ce fichier n’est plus accessible.');
      return data.signedUrl;
    },
    async videosDuMois(clientId, qui) {
      const maintenant = new Date();
      // Un jour de marge : le mois se compte à l'heure de Paris, le filtre exact est fait ensuite.
      const depuis = new Date(new Date(`${regles.debutMois(maintenant)}T00:00:00Z`).getTime() - 86_400_000).toISOString();
      const [m, v, incluses] = await Promise.all([
        db.from('messages').select('auteur, piece_type, cree_le').eq('client_id', clientId).eq('auteur', 'client').like('piece_type', 'video/%').gte('cree_le', depuis),
        db.from('videos_mouvement').select('cree_le').eq('client_id', clientId).gte('cree_le', depuis),
        qui === 'coach' ? abonnements.lire(clientId).then((a) => a.videosMois ?? 0) : db.rpc('mes_videos_mois').then((r) => (r.data as number | null) ?? 0),
      ]);
      if (m.error || v.error) throw new Error('Impossible de compter les vidéos du mois.');
      const messages = (m.data ?? []).map((l: any) => ({ auteur: l.auteur as Auteur, pieceType: l.piece_type as string, creeLe: l.cree_le as string }));
      const mouvement = (v.data ?? []).map((l: any) => ({ creeLe: l.cree_le as string }));
      return { envoyees: regles.videosEnvoyeesDuMois(messages, mouvement, maintenant), incluses };
    },
    async purger() {
      const limite = new Date(Date.now() - regles.CONSERVATION_VIDEOS_JOURS * 86_400_000).toISOString();
      const { data, error } = await db.from('messages').select('id, piece_chemin').like('piece_type', 'video/%').not('piece_chemin', 'is', null).lt('cree_le', limite).limit(200);
      if (error || !data?.length) return 0;
      const r = await stock().remove(data.map((l: any) => l.piece_chemin));
      if (r.error) return 0;
      await db.rpc('marquer_videos_expirees', { p_ids: data.map((l: any) => l.id) });
      return data.length;
    },
  };
}

export const messagerie: DepotMessagerie = supabase ? creerMessagerieSupabase(supabase) : messagerieDemo;
