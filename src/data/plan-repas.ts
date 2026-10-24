// Plan alimentaire de la semaine : démo sur l'appareil sans Supabase, sinon la table plans_repas (RLS).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { erreursPlan, type PlanRepas } from '@/domain/plan-repas';

import { supabase } from './supabase';

export interface DepotPlanRepas {
  plan(clientId: string, semaine: string): Promise<PlanRepas | null>;
  /** Lundis des semaines déjà planifiées pour ces clients, du plus récent au plus ancien. */
  semaines(clientIds: string[]): Promise<Record<string, string[]>>;
  /**
   * Enregistre le plan si personne ne l'a modifié depuis `p.version` (absent : plan encore jamais enregistré).
   * Renvoie le plan enregistré avec sa nouvelle version.
   */
  enregistrer(p: PlanRepas): Promise<PlanRepas>;
}

export const CONFLIT = 'Le plan a été modifié entre-temps. Actualisez avant de réessayer.';

function valider(p: PlanRepas) {
  const erreurs = erreursPlan(p);
  if (erreurs.length) throw new Error(erreurs[0]);
}

const CLE = 'coachos.demo.plans-repas';
async function lireDemo(): Promise<PlanRepas[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    return brut ? (JSON.parse(brut) as PlanRepas[]) : [];
  } catch {
    return [];
  }
}

const depotDemo: DepotPlanRepas = {
  async plan(clientId, semaine) {
    return (await lireDemo()).find((p) => p.clientId === clientId && p.semaine === semaine) ?? null;
  },
  async semaines(clientIds) {
    const tous = await lireDemo();
    return Object.fromEntries(clientIds.map((id) => [id, tous.filter((p) => p.clientId === id).map((p) => p.semaine).sort().reverse()]));
  },
  async enregistrer(p) {
    valider(p);
    const tous = await lireDemo();
    const actuel = tous.find((x) => x.clientId === p.clientId && x.semaine === p.semaine);
    if ((actuel?.version ?? undefined) !== (p.version ?? undefined)) throw new Error(CONFLIT);
    const enregistre: PlanRepas = { ...p, version: new Date().toISOString(), auteur: 'coach' };
    await AsyncStorage.setItem(CLE, JSON.stringify([...tous.filter((x) => x !== actuel), enregistre]));
    return enregistre;
  },
};

type Ligne = { client_id: string; semaine: string; jours: PlanRepas['jours']; version: string; auteur: PlanRepas['auteur'] };
const lire = (l: Ligne): PlanRepas => ({ clientId: l.client_id, semaine: l.semaine, jours: l.jours, version: l.version, auteur: l.auteur });

export function creerDepotPlanRepas(db: SupabaseClient): DepotPlanRepas {
  return {
    async plan(clientId, semaine) {
      const { data, error } = await db.from('plans_repas').select('*').eq('client_id', clientId).eq('semaine', semaine).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? lire(data as Ligne) : null;
    },
    async semaines(clientIds) {
      const resultat: Record<string, string[]> = Object.fromEntries(clientIds.map((id) => [id, []]));
      if (!clientIds.length) return resultat;
      const { data, error } = await db
        .from('plans_repas')
        .select('client_id, semaine')
        .in('client_id', clientIds)
        .order('semaine', { ascending: false });
      if (error) throw new Error(error.message);
      for (const l of data as { client_id: string; semaine: string }[]) resultat[l.client_id]?.push(l.semaine);
      return resultat;
    },
    async enregistrer(p) {
      valider(p);
      const version = new Date().toISOString();
      const ligne = { client_id: p.clientId, semaine: p.semaine, jours: p.jours, version, auteur: 'coach' as const };
      if (!p.version) {
        const { data, error } = await db.from('plans_repas').insert(ligne).select().single();
        // Clé déjà prise : quelqu'un a créé le plan de cette semaine entre-temps.
        if (error?.code === '23505') throw new Error(CONFLIT);
        if (error) throw new Error(error.message);
        return lire(data as Ligne);
      }
      const { data, error } = await db
        .from('plans_repas')
        .update(ligne)
        .eq('client_id', p.clientId)
        .eq('semaine', p.semaine)
        .eq('version', p.version)
        .select();
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error(CONFLIT);
      return lire(data[0] as Ligne);
    },
  };
}

export const plansRepas: DepotPlanRepas = supabase ? creerDepotPlanRepas(supabase) : depotDemo;
