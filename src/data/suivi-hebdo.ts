// Accès aux données du lot 4 : bilans hebdomadaires, objectifs et photos de progression.
// En démo, tout reste dans ce navigateur ou ce téléphone et suit les mêmes règles que les fonctions SQL.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { aujourdhuiParis } from '@/domain/entrainement';
import {
  appliquerObjectif,
  erreurReponses,
  finSemaine,
  imageValide,
  semaineValide,
  syntheseAutomatique,
  trierBilansCoach,
  type ActionObjectif,
  type BilanHebdo,
  type Objectif,
  type Photo,
  type ReponsesBilan,
  type VuePhoto,
} from '@/domain/suivi-hebdo';

import { CLIENTS_DEMO } from './demo';
import { entrainement } from './entrainement';
import { supabase } from './supabase';

export interface NouvellePhoto {
  date: string;
  vue: VuePhoto;
  partage: boolean;
  image: string;
  envoiId: string;
}

export interface SuiviHebdo {
  bilansClient(clientId: string): Promise<BilanHebdo[]>;
  enregistrerBilan(clientId: string, semaine: string, envoiId: string, reponses: ReponsesBilan): Promise<'enregistre' | 'doublon'>;
  bilansCoach(): Promise<BilanHebdo[]>;
  repondreBilan(id: string, message: string, priorite: string, envoyeLe: string): Promise<void>;
  objectifs(clientId: string): Promise<Objectif[]>;
  enregistrerObjectif(clientId: string, envoiId: string, action: ActionObjectif, id?: string): Promise<void>;
  /** Le client voit toutes ses photos, le coach seulement celles que le client partage. */
  photos(clientId: string, proprietaire: boolean): Promise<Photo[]>;
  image(clientId: string, id: string, proprietaire: boolean): Promise<string>;
  ajouterPhoto(clientId: string, p: NouvellePhoto): Promise<void>;
  partagerPhoto(clientId: string, id: string, partage: boolean): Promise<void>;
  supprimerPhoto(clientId: string, id: string): Promise<void>;
}

// ---------- Démo ----------

const CLE = 'coachos.demo.suivi-hebdo';
type PhotoStockee = Photo & { image: string; envoiId: string };
interface Etat {
  bilans: (BilanHebdo & { envoiId: string })[];
  objectifs: Objectif[];
  photos: PhotoStockee[];
}

async function lire(): Promise<Etat> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (brut) return JSON.parse(brut) as Etat;
  } catch {
    // Stockage indisponible : on repart de zéro.
  }
  return { bilans: [], objectifs: [], photos: [] };
}
const sauver = (e: Etat) => AsyncStorage.setItem(CLE, JSON.stringify(e));
const nomDemo = (clientId: string) => {
  const c = CLIENTS_DEMO.find((x) => x.id === clientId);
  return c ? `${c.prenom} ${c.nom}` : 'Client';
};
const sansEnvoi = ({ envoiId: _e, ...b }: Etat['bilans'][number]): BilanHebdo => b;

/** Objectif du programme du cycle de la semaine (targetForWeek d'origine), en démo à partir du cycle actif. */
async function cibleDemo(clientId: string, semaine: string) {
  try {
    const e = await entrainement.espaceClient(clientId);
    const c = e.cycle;
    if (!c || c.debut > finSemaine(semaine) || c.fin < semaine) return null;
    const n = e.programme?.seancesParSemaine;
    return n && Number.isInteger(n) && n >= 1 && n <= 14 ? n : null;
  } catch {
    return null;
  }
}

export const suiviHebdoDemo: SuiviHebdo = {
  async bilansClient(clientId) {
    return (await lire()).bilans
      .filter((b) => b.clientId === clientId)
      .map(sansEnvoi)
      .sort((a, b) => b.semaine.localeCompare(a.semaine));
  },

  async enregistrerBilan(clientId, semaine, envoiId, reponses) {
    const e = await lire();
    if (!semaineValide(semaine)) throw new Error('Semaine invalide ou future');
    const erreur = erreurReponses(reponses);
    if (erreur) throw new Error(erreur);
    const miens = e.bilans.filter((b) => b.clientId === clientId);
    if (miens.some((b) => b.envoiId === envoiId)) return 'doublon';
    const ancien = miens.find((b) => b.semaine === semaine);
    if (ancien?.reponduLe && ancien.sourceRetour === 'Coach') throw new Error('Votre coach a déjà répondu à ce bilan. Il reste conservé dans votre historique.');
    const prec = miens.filter((b) => b.semaine < semaine).sort((a, b) => b.semaine.localeCompare(a.semaine))[0];
    const auto = syntheseAutomatique(reponses, prec ? { semaine: prec.semaine, reponses: prec.reponses } : null, await cibleDemo(clientId, semaine));
    const maintenant = new Date().toISOString();
    const b = {
      id: ancien?.id ?? envoiId,
      clientId,
      nom: nomDemo(clientId),
      semaine,
      reponses,
      envoyeLe: maintenant,
      envoiId,
      ...auto,
      reponduLe: maintenant,
    };
    await sauver({ ...e, bilans: [...e.bilans.filter((x) => x !== ancien), b] });
    return 'enregistre';
  },

  async bilansCoach() {
    return trierBilansCoach((await lire()).bilans.map(sansEnvoi));
  },

  async repondreBilan(id, message, priorite, envoyeLe) {
    const e = await lire();
    const b = e.bilans.find((x) => x.id === id);
    if (!b) throw new Error('Bilan introuvable');
    if (b.envoyeLe !== envoyeLe) throw new Error('Le client a modifié son bilan. Actualisez avant de répondre.');
    if (!message.trim() || message.trim().length > 4000 || !priorite.trim() || priorite.trim().length > 1000) throw new Error('Renseignez le message et la priorité');
    const suite = { ...b, retourCoach: message.trim(), priorite: priorite.trim(), sourceRetour: 'Coach' as const, aRevoir: false, reponduLe: new Date().toISOString() };
    await sauver({ ...e, bilans: e.bilans.map((x) => (x.id === id ? suite : x)) });
  },

  async objectifs(clientId) {
    return (await lire()).objectifs.filter((o) => o.clientId === clientId).sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  },

  async enregistrerObjectif(clientId, envoiId, action, id) {
    const e = await lire();
    await sauver({ ...e, objectifs: appliquerObjectif(e.objectifs, clientId, envoiId, action, id) });
  },

  async photos(clientId, proprietaire) {
    return (await lire()).photos
      .filter((p) => p.clientId === clientId && (proprietaire || p.partage))
      .map(({ image: _i, envoiId: _e, ...p }) => p)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  async image(clientId, id, proprietaire) {
    const p = (await lire()).photos.find((x) => x.id === id && x.clientId === clientId && (proprietaire || x.partage));
    if (!p) throw new Error('Photo indisponible ou non partagée');
    return p.image;
  },

  async ajouterPhoto(clientId, p) {
    const e = await lire();
    if (e.photos.some((x) => x.clientId === clientId && x.envoiId === p.envoiId)) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || p.date > aujourdhuiParis() || !imageValide(p.image)) throw new Error('Photo JPEG ou date invalide');
    try {
      await sauver({ ...e, photos: [...e.photos, { id: p.envoiId, clientId, date: p.date, vue: p.vue, partage: p.partage, image: p.image, envoiId: p.envoiId }] });
    } catch {
      throw new Error('Stockage de démonstration plein : supprimez une photo avant d’en ajouter une autre.');
    }
  },

  async partagerPhoto(clientId, id, partage) {
    const e = await lire();
    if (!e.photos.some((p) => p.id === id && p.clientId === clientId)) throw new Error('Photo hors de votre dossier');
    await sauver({ ...e, photos: e.photos.map((p) => (p.id === id ? { ...p, partage } : p)) });
  },

  async supprimerPhoto(clientId, id) {
    const e = await lire();
    if (!e.photos.some((p) => p.id === id && p.clientId === clientId)) throw new Error('Photo hors de votre dossier');
    await sauver({ ...e, photos: e.photos.filter((p) => p.id !== id) });
  },
};

// ---------- Supabase ----------

function verifier<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

type BilanBase = {
  id: string;
  client_id: string;
  semaine: string;
  reponses: ReponsesBilan;
  envoye_le: string;
  retour_coach: string;
  priorite: string;
  repondu_le: string | null;
  source_retour: 'Automatique' | 'Coach' | null;
  a_revoir: boolean;
  clients?: { prenom: string; nom: string } | null;
};
const versBilan = (b: BilanBase): BilanHebdo => ({
  id: b.id,
  clientId: b.client_id,
  nom: b.clients ? `${b.clients.prenom} ${b.clients.nom}`.trim() : '',
  semaine: b.semaine,
  reponses: b.reponses,
  envoyeLe: b.envoye_le,
  retourCoach: b.repondu_le ? b.retour_coach : '',
  priorite: b.repondu_le ? b.priorite : '',
  reponduLe: b.repondu_le ?? '',
  sourceRetour: b.repondu_le ? (b.source_retour ?? 'Coach') : '',
  aRevoir: b.a_revoir,
});
const BILAN = 'id, client_id, semaine, reponses, envoye_le, retour_coach, priorite, repondu_le, source_retour, a_revoir, clients(prenom, nom)';

type ObjectifBase = {
  id: string;
  client_id: string;
  titre: string;
  unite: Objectif['unite'];
  depart: number;
  cible: number;
  echeance: string | null;
  historique: Objectif['historique'];
  cree_le: string;
  modifie_le: string;
  atteint_le: string | null;
  archive: boolean;
};
const versObjectif = (o: ObjectifBase): Objectif => ({
  id: o.id,
  clientId: o.client_id,
  titre: o.titre,
  unite: o.unite,
  depart: Number(o.depart),
  cible: Number(o.cible),
  echeance: o.echeance ?? '',
  historique: o.historique.map((h) => ({ ...h, valeur: Number(h.valeur) })),
  creeLe: o.cree_le,
  modifieLe: o.modifie_le,
  atteintLe: o.atteint_le ?? '',
  archive: o.archive,
});

export function creerSuiviHebdoSupabase(db: SupabaseClient): SuiviHebdo {
  return {
    async bilansClient(clientId) {
      return (verifier(await db.from('bilans_hebdo').select(BILAN).eq('client_id', clientId).order('semaine', { ascending: false })) as unknown as BilanBase[]).map(versBilan);
    },
    async enregistrerBilan(_clientId, semaine, envoiId, reponses) {
      const r = verifier(await db.rpc('enregistrer_bilan', { b: { semaine, envoiId, reponses } })) as string;
      return r === 'doublon' ? 'doublon' : 'enregistre';
    },
    async bilansCoach() {
      return trierBilansCoach((verifier(await db.from('bilans_hebdo').select(BILAN).order('semaine', { ascending: false }).limit(500)) as unknown as BilanBase[]).map(versBilan));
    },
    async repondreBilan(id, message, priorite, envoyeLe) {
      verifier(await db.rpc('repondre_bilan', { p_id: id, p_message: message, p_priorite: priorite, p_envoye_le: envoyeLe }));
    },
    async objectifs(clientId) {
      return (verifier(await db.from('objectifs').select('*').eq('client_id', clientId).order('cree_le', { ascending: false })) as ObjectifBase[]).map(versObjectif);
    },
    async enregistrerObjectif(_clientId, envoiId, a, id) {
      const o =
        a.action === 'creer'
          ? { action: 'creer', envoiId, objectif: a.objectif }
          : { action: a.action, envoiId, id, version: a.version, ...(a.action === 'progresser' ? { valeur: a.valeur } : {}) };
      verifier(await db.rpc('enregistrer_objectif', { o }));
    },
    async photos(clientId) {
      const lignes = verifier(await db.from('photos_clients').select('id, client_id, date_photo, vue, partage').eq('client_id', clientId)) as {
        id: string;
        client_id: string;
        date_photo: string;
        vue: VuePhoto;
        partage: boolean;
      }[];
      return lignes.map((p) => ({ id: p.id, clientId: p.client_id, date: p.date_photo, vue: p.vue, partage: p.partage })).sort((a, b) => b.date.localeCompare(a.date));
    },
    async image(clientId, id) {
      const r = verifier(await db.from('photos_clients').select('image').eq('id', id).eq('client_id', clientId).maybeSingle()) as { image: string } | null;
      if (!r) throw new Error('Photo indisponible ou non partagée');
      return r.image;
    },
    async ajouterPhoto(_clientId, p) {
      verifier(
        await db
          .from('photos_clients')
          .upsert({ date_photo: p.date, vue: p.vue, partage: p.partage, image: p.image, envoi_id: p.envoiId }, { onConflict: 'client_id,envoi_id', ignoreDuplicates: true }),
      );
    },
    async partagerPhoto(_clientId, id, partage) {
      verifier(await db.from('photos_clients').update({ partage }).eq('id', id));
    },
    async supprimerPhoto(_clientId, id) {
      verifier(await db.from('photos_clients').delete().eq('id', id));
    },
  };
}

export const suiviHebdo: SuiviHebdo = supabase ? creerSuiviHebdoSupabase(supabase) : suiviHebdoDemo;
