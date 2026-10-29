// Accès aux activités sportives (courses, vélo…) envoyées par le téléphone du client depuis Health Connect.
// En démo, elles restent sur cet appareil ; quelques sorties d'exemple sont montrées pour Léa.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { erreursActivite, type Activite, type NouvelleActivite, type SourceActivite, type Sport } from '@/domain/activites';
import { nouvelId } from '@/lib/identifiant';

import { supabase } from './supabase';

export interface Activites {
  /** Activités du client, les plus récentes d'abord (le client, ou son coach). */
  liste(clientId: string, limite?: number): Promise<Activite[]>;
  /** Envoi par le client de ses activités ; renvoie le nombre ajouté ou mis à jour. */
  enregistrer(clientId: string, lot: NouvelleActivite[]): Promise<number>;
  retirer(clientId: string, id: string): Promise<void>;
}

const LOT = 200;
const valides = (lot: NouvelleActivite[]) => lot.filter((a) => erreursActivite(a).length === 0);

// ---------- Démo ----------

const CLE = 'coachos.demo.activites';
type Stockee = Activite & { retiree?: boolean };

const exemple = (n: number, sport: Sport, jours: number, dureeS: number, distanceM: number, deniveleM: number, fcMoy: number): Stockee => ({
  id: `demo-activite-${n}`,
  clientId: 'client-lea',
  source: 'health_connect',
  idExterne: `demo-${n}`,
  sport,
  titre: '',
  debut: new Date(new Date().setUTCHours(6, 30, 0, 0) - jours * 864e5).toISOString(),
  dureeS,
  distanceM,
  deniveleM,
  fcMoy,
  fcMax: fcMoy + 22,
  appareil: 'com.garmin.android.apps.connectmobile',
  importeeLe: new Date().toISOString(),
});
const EXEMPLES: Stockee[] = [
  exemple(1, 'course', 1, 3070, 10020, 85, 152),
  exemple(2, 'velo', 3, 5400, 40100, 420, 138),
  exemple(3, 'course', 5, 1950, 6040, 30, 160),
  exemple(4, 'course', 9, 5640, 16300, 210, 148),
];

async function lire(): Promise<Stockee[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (brut) return JSON.parse(brut) as Stockee[];
  } catch {
    // Stockage indisponible : on repart des exemples.
  }
  return EXEMPLES;
}
const sauver = (l: Stockee[]) => AsyncStorage.setItem(CLE, JSON.stringify(l));

export const activitesDemo: Activites = {
  async liste(clientId, limite = 100) {
    return (await lire())
      .filter((a) => a.clientId === clientId && !a.retiree)
      .sort((a, b) => b.debut.localeCompare(a.debut))
      .slice(0, limite);
  },
  async enregistrer(clientId, lot) {
    const l = await lire();
    let n = 0;
    for (const a of valides(lot)) {
      const i = l.findIndex((x) => x.clientId === clientId && x.source === a.source && x.idExterne === a.idExterne);
      if (i >= 0 && l[i].retiree) continue;
      const ligne: Stockee = { ...a, id: i >= 0 ? l[i].id : nouvelId(), clientId, importeeLe: new Date().toISOString() };
      if (i >= 0) l[i] = ligne;
      else l.push(ligne);
      n++;
    }
    await sauver(l);
    return n;
  },
  async retirer(clientId, id) {
    const l = await lire();
    await sauver(l.map((a) => (a.id === id && a.clientId === clientId ? { ...a, retiree: true } : a)));
  },
};

// ---------- Supabase ----------

type Ligne = {
  id: string;
  client_id: string;
  source: SourceActivite;
  id_externe: string;
  sport: Sport;
  titre: string;
  debut: string;
  duree_s: number;
  distance_m: number | null;
  denivele_m: number | null;
  fc_moy: number | null;
  fc_max: number | null;
  calories: number | null;
  appareil: string;
  importee_le: string;
};
const ouVide = (n: number | null) => (n === null ? undefined : n);
const versActivite = (l: Ligne): Activite => ({
  id: l.id,
  clientId: l.client_id,
  source: l.source,
  idExterne: l.id_externe,
  sport: l.sport,
  titre: l.titre,
  debut: l.debut,
  dureeS: l.duree_s,
  distanceM: ouVide(l.distance_m),
  deniveleM: ouVide(l.denivele_m),
  fcMoy: ouVide(l.fc_moy),
  fcMax: ouVide(l.fc_max),
  calories: ouVide(l.calories),
  appareil: l.appareil || undefined,
  importeeLe: l.importee_le,
});

function verifier<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export function creerActivitesSupabase(db: SupabaseClient): Activites {
  return {
    async liste(clientId, limite = 100) {
      const lignes = verifier(await db.from('activites_sport').select('*').eq('client_id', clientId).order('debut', { ascending: false }).limit(limite)) as Ligne[];
      return lignes.map(versActivite);
    },
    async enregistrer(_clientId, lot) {
      const ok = valides(lot);
      let n = 0;
      for (let i = 0; i < ok.length; i += LOT) n += verifier(await db.rpc('enregistrer_activites', { lot: ok.slice(i, i + LOT) })) as number;
      return n;
    },
    async retirer(_clientId, id) {
      verifier(await db.rpc('retirer_activite', { p_id: id }));
    },
  };
}

export const activites: Activites = supabase ? creerActivitesSupabase(supabase) : activitesDemo;
