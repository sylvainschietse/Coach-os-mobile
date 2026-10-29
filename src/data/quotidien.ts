// Accès aux suivis du quotidien : relevés par jour et réglages (suivi actif, cible).
// En démo, tout reste sur l'appareil, avec un mois de relevés fictifs pour Léa.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { aujourdhuiParis } from '@/domain/entrainement';
import { decalerJour, estIndicateur, type Indicateur, type Releve, type Reglage } from '@/domain/quotidien';

import { supabase } from './supabase';

export interface DepotQuotidien {
  /** Relevés depuis `depuis` (AAAA-MM-JJ) inclus. */
  releves(clientId: string, depuis: string): Promise<Releve[]>;
  /** Valeur undefined : efface le relevé du jour. */
  enregistrerReleves(clientId: string, jour: string, valeurs: Partial<Record<Indicateur, number | undefined>>, source?: Releve['source']): Promise<void>;
  reglages(clientId: string): Promise<Reglage[]>;
  enregistrerReglage(r: Reglage): Promise<void>;
}

// ---------- Démo ----------

const CLE = 'coachos.demo.quotidien';
interface Etat {
  releves: Releve[];
  reglages: Reglage[];
}

/** Un mois de relevés plausibles pour Léa, recalculé chaque jour pour finir aujourd'hui. */
function exemple(): Etat {
  const fin = aujourdhuiParis();
  const releves: Releve[] = [];
  for (let i = 0; i < 30; i++) {
    const jour = decalerJour(fin, -29 + i);
    const vague = Math.sin(i / 3);
    const ajouter = (indicateur: Indicateur, valeur: number) => releves.push({ clientId: 'client-lea', jour, indicateur, valeur, source: 'saisie' });
    if (i % 9 === 4) continue; // Quelques jours sans saisie : un jour vide n'est pas un zéro.
    ajouter('pas', Math.round((6500 + i * 90 + vague * 1800) / 10) * 10);
    ajouter('eau', Math.round((1.2 + i * 0.015 + vague * 0.3) * 4) / 4);
    ajouter('sommeil', Math.round((6.8 + vague * 0.8) * 2) / 2);
    ajouter('sommeil_qualite', Math.max(1, Math.min(5, Math.round(3.4 + vague))));
    ajouter('energie', Math.max(1, Math.min(5, Math.round(3.2 + i / 30 + vague * 0.8))));
    ajouter('stress', Math.max(1, Math.min(5, Math.round(3 - i / 25 - vague * 0.7))));
    ajouter('activite', Math.max(0, Math.round((20 + i * 0.6 + vague * 15) / 5) * 5));
    ajouter('fruits_legumes', Math.max(0, Math.round(3.5 + vague * 1.2 + i / 20)));
    ajouter('cigarettes', Math.max(0, Math.round(10 - i / 4 + vague)));
  }
  return {
    releves,
    reglages: [
      { clientId: 'client-lea', indicateur: 'cigarettes', actif: true, cible: 5, modifiePar: 'coach' },
      { clientId: 'client-lea', indicateur: 'pas', actif: true, cible: 8000, modifiePar: 'coach' },
    ],
  };
}

async function lire(): Promise<Etat> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (brut) return JSON.parse(brut) as Etat;
  } catch {
    // Stockage indisponible : on repart de l'exemple.
  }
  return exemple();
}
const sauver = (e: Etat) => AsyncStorage.setItem(CLE, JSON.stringify(e));

export const quotidienDemo: DepotQuotidien = {
  async releves(clientId, depuis) {
    return (await lire()).releves.filter((r) => r.clientId === clientId && r.jour >= depuis);
  },
  async enregistrerReleves(clientId, jour, valeurs, source = 'saisie') {
    const e = await lire();
    let releves = e.releves;
    for (const [cle, valeur] of Object.entries(valeurs)) {
      if (!estIndicateur(cle)) continue;
      releves = releves.filter((r) => !(r.clientId === clientId && r.jour === jour && r.indicateur === cle));
      if (valeur !== undefined) releves.push({ clientId, jour, indicateur: cle, valeur, source });
    }
    await sauver({ ...e, releves });
  },
  async reglages(clientId) {
    return (await lire()).reglages.filter((r) => r.clientId === clientId);
  },
  async enregistrerReglage(r) {
    const e = await lire();
    await sauver({ ...e, reglages: [...e.reglages.filter((x) => !(x.clientId === r.clientId && x.indicateur === r.indicateur)), r] });
  },
};

// ---------- Supabase ----------

/** Table absente : la mise à jour de la base n'a pas encore été passée. */
const PAS_ACTIVE = 'Les suivis du quotidien ne sont pas encore activés sur le serveur. Votre coach doit passer la mise à jour de la base.';
function verifier<T>({ data, error }: { data: T; error: { message: string; code?: string } | null }): T {
  if (error) throw new Error(error.code === 'PGRST205' || error.code === '42P01' || /could not find the table/i.test(error.message) ? PAS_ACTIVE : error.message);
  return data;
}

type LigneReleve = { client_id: string; jour: string; indicateur: string; valeur: number | string; source: Releve['source'] };
type LigneReglage = { client_id: string; indicateur: string; actif: boolean; cible: number | string | null; modifie_par: 'client' | 'coach' };

function creerDepotSupabase(db: SupabaseClient): DepotQuotidien {
  return {
    async releves(clientId, depuis) {
      const lignes = verifier(
        await db.from('suivis_quotidiens').select('client_id, jour, indicateur, valeur, source').eq('client_id', clientId).gte('jour', depuis).order('jour'),
      ) as LigneReleve[];
      return lignes.flatMap((l) =>
        estIndicateur(l.indicateur) ? [{ clientId: l.client_id, jour: l.jour, indicateur: l.indicateur, valeur: Number(l.valeur), source: l.source }] : [],
      );
    },
    async enregistrerReleves(clientId, jour, valeurs, source = 'saisie') {
      const entrees = Object.entries(valeurs).filter(([cle]) => estIndicateur(cle));
      const a_ecrire = entrees.filter(([, v]) => v !== undefined).map(([indicateur, valeur]) => ({ client_id: clientId, jour, indicateur, valeur, source, modifie_le: new Date().toISOString() }));
      const a_effacer = entrees.filter(([, v]) => v === undefined).map(([cle]) => cle);
      if (a_ecrire.length) verifier(await db.from('suivis_quotidiens').upsert(a_ecrire));
      if (a_effacer.length) verifier(await db.from('suivis_quotidiens').delete().eq('client_id', clientId).eq('jour', jour).in('indicateur', a_effacer));
    },
    async reglages(clientId) {
      const lignes = verifier(await db.from('reglages_quotidiens').select('client_id, indicateur, actif, cible, modifie_par').eq('client_id', clientId)) as LigneReglage[];
      return lignes.flatMap((l) =>
        estIndicateur(l.indicateur)
          ? [{ clientId: l.client_id, indicateur: l.indicateur, actif: l.actif, cible: l.cible === null ? undefined : Number(l.cible), modifiePar: l.modifie_par }]
          : [],
      );
    },
    async enregistrerReglage(r) {
      verifier(
        await db.from('reglages_quotidiens').upsert({
          client_id: r.clientId,
          indicateur: r.indicateur,
          actif: r.actif,
          cible: r.cible ?? null,
          modifie_par: r.modifiePar ?? 'client',
          modifie_le: new Date().toISOString(),
        }),
      );
    },
  };
}

export const quotidien: DepotQuotidien = supabase ? creerDepotSupabase(supabase) : quotidienDemo;
