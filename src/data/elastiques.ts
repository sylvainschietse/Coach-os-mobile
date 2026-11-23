// Mes élastiques : la force de chaque couleur et les couleurs que le coach a, dans la table reglages_elastiques.
// Table absente (base pas encore mise à jour) : réglages de départ, et l'enregistrement le dit.
import { lireReglagesElastiques, REGLAGES_ELASTIQUES, type ReglagesElastiques } from '@/domain/elastiques';

import { supabase } from './supabase';

export interface DepotElastiques {
  lire(): Promise<ReglagesElastiques>;
  enregistrer(r: ReglagesElastiques): Promise<void>;
}

let memoire: ReglagesElastiques = REGLAGES_ELASTIQUES;

const demo: DepotElastiques = {
  async lire() {
    return memoire;
  },
  async enregistrer(r) {
    memoire = lireReglagesElastiques(r);
  },
};

function enLigne(db: NonNullable<typeof supabase>): DepotElastiques {
  return {
    async lire() {
      const { data, error } = await db.from('reglages_elastiques').select('reglages').maybeSingle();
      if (error) return REGLAGES_ELASTIQUES;
      return lireReglagesElastiques(data?.reglages);
    },
    async enregistrer(r) {
      const { data: coach } = await db.rpc('mon_coach_id');
      const { error } = await db.from('reglages_elastiques').upsert({ coach_id: coach, reglages: lireReglagesElastiques(r), maj_le: new Date().toISOString() });
      if (error)
        throw new Error(
          error.code === '42P01' || /reglages_elastiques/.test(error.message)
            ? 'Tes élastiques ne sont pas encore activés sur le serveur : la base doit d’abord être mise à jour.'
            : 'Tes élastiques n’ont pas pu être enregistrés. Réessaie.',
        );
    },
  };
}

export const elastiques: DepotElastiques = supabase ? enLigne(supabase) : demo;
