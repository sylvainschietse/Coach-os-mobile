// Réglages de la brochure des prix du coach (« Ma brochure ») : un jeu par coach, dans la table brochures.
import { lireReglagesBrochure, REGLAGES_BROCHURE, type ReglagesBrochure } from '@/domain/brochure';

import { supabase } from './supabase';

export interface DepotBrochure {
  lire(): Promise<ReglagesBrochure>;
  enregistrer(r: ReglagesBrochure): Promise<void>;
}

let memoire: ReglagesBrochure = REGLAGES_BROCHURE;

const demo: DepotBrochure = {
  async lire() {
    return memoire;
  },
  async enregistrer(r) {
    memoire = lireReglagesBrochure(r);
  },
};

function enLigne(db: NonNullable<typeof supabase>): DepotBrochure {
  return {
    async lire() {
      const { data, error } = await db.from('brochures').select('reglages').maybeSingle();
      // Table pas encore créée ou lecture impossible : la brochure de départ.
      if (error) return REGLAGES_BROCHURE;
      return lireReglagesBrochure(data?.reglages);
    },
    async enregistrer(r) {
      const { data: coach } = await db.rpc('mon_coach_id');
      const { error } = await db.from('brochures').upsert({ coach_id: coach, reglages: lireReglagesBrochure(r), maj_le: new Date().toISOString() });
      if (error) throw new Error('Ta brochure n’a pas pu être enregistrée. Réessaie.');
    },
  };
}

export const brochure: DepotBrochure = supabase ? enLigne(supabase) : demo;
