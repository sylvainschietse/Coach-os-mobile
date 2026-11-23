// Accès au suivi du cycle menstruel : choix de la cliente (activé, partage), réglages, règles notées, notes du jour.
// La coach passe par vueCoach, qui ne rend que ce que la cliente partage (rien par défaut).
// En démo, tout reste sur l'appareil, avec quatre cycles fictifs pour Léa (partage « tout » pour montrer la vue coach).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  estSymptome,
  filtrerPourCoach,
  reglagesParDefaut,
  type ChoixCycle,
  type NoteCycle,
  type PartageCycle,
  type Regles,
  type ReglagesCycle,
} from '@/domain/cycle-menstruel';
import { aujourdhuiParis } from '@/domain/entrainement';
import { decalerJour } from '@/domain/quotidien';

import { supabase } from './supabase';

export interface DonneesCycle {
  /** Null : jamais activé. */
  choix: ChoixCycle | null;
  reglages: ReglagesCycle;
  regles: Regles[];
  notes: NoteCycle[];
}

export interface VueCoachCycle {
  partage: Exclude<PartageCycle, 'rien'>;
  reglages: ReglagesCycle;
  /** « phase » : le dernier début seulement ; « tout » : l'historique. */
  regles: Regles[];
  notes: NoteCycle[];
}

export interface DepotCycle {
  /** Ce que la cliente connectée voit de son propre suivi. */
  mesDonnees(clientId: string): Promise<DonneesCycle>;
  /** Activer, couper ou changer le partage : gardé avec les autres accords de la cliente. */
  choisir(clientId: string, actif: boolean, partage: PartageCycle): Promise<ChoixCycle>;
  enregistrerReglages(r: ReglagesCycle): Promise<void>;
  /** Ajoute ou corrige des règles (même début : on remplace). */
  noterRegles(r: Regles): Promise<void>;
  supprimerRegles(clientId: string, debut: string): Promise<void>;
  /** Sans symptôme ni note : la note du jour est effacée. */
  enregistrerNote(n: NoteCycle): Promise<void>;
  /** Efface tout le suivi et coupe le partage. */
  effacerTout(clientId: string): Promise<void>;
  /** Pour la coach : null si la cliente ne partage rien (ou n'utilise pas le suivi). */
  vueCoach(clientId: string): Promise<VueCoachCycle | null>;
}

const noteVide = (n: NoteCycle) => !n.symptomes.length && !n.note?.trim();

// ---------- Démo ----------

const CLE = 'coachos.demo.cycle';
interface Etat {
  choix: Record<string, ChoixCycle>;
  reglages: ReglagesCycle[];
  regles: Regles[];
  notes: NoteCycle[];
}

/** Quatre cycles de Léa (29, 29 et 28 jours), recalculés chaque jour pour que le cycle en cours en soit au jour 10. */
function exemple(): Etat {
  const j = aujourdhuiParis();
  const debuts = [-95, -67, -38, -9].map((n) => decalerJour(j, n));
  return {
    choix: { 'client-lea': { actif: true, partage: 'tout', le: `${decalerJour(j, -100)}T09:00:00.000Z` } },
    reglages: [{ clientId: 'client-lea', dureeCycle: 29, dureeRegles: 5, sansPrevision: false }],
    regles: debuts.map((debut) => ({ clientId: 'client-lea', debut, fin: decalerJour(debut, 4) })),
    notes: [
      { clientId: 'client-lea', jour: decalerJour(j, -9), symptomes: ['crampes', 'fatigue'] },
      { clientId: 'client-lea', jour: decalerJour(j, -8), symptomes: ['crampes'], note: 'Séance allégée, ça allait mieux après.' },
      { clientId: 'client-lea', jour: decalerJour(j, -12), symptomes: ['ballonnements', 'fringales'] },
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

export const cycleDemo: DepotCycle = {
  async mesDonnees(clientId) {
    const e = await lire();
    return {
      choix: e.choix[clientId] ?? null,
      reglages: e.reglages.find((r) => r.clientId === clientId) ?? reglagesParDefaut(clientId),
      regles: e.regles.filter((r) => r.clientId === clientId),
      notes: e.notes.filter((n) => n.clientId === clientId),
    };
  },
  async choisir(clientId, actif, partage) {
    const e = await lire();
    const c: ChoixCycle = { actif, partage: actif ? partage : 'rien', le: new Date().toISOString() };
    await sauver({ ...e, choix: { ...e.choix, [clientId]: c } });
    return c;
  },
  async enregistrerReglages(r) {
    const e = await lire();
    await sauver({ ...e, reglages: [...e.reglages.filter((x) => x.clientId !== r.clientId), r] });
  },
  async noterRegles(r) {
    const e = await lire();
    await sauver({ ...e, regles: [...e.regles.filter((x) => !(x.clientId === r.clientId && x.debut === r.debut)), r] });
  },
  async supprimerRegles(clientId, debut) {
    const e = await lire();
    await sauver({ ...e, regles: e.regles.filter((x) => !(x.clientId === clientId && x.debut === debut)) });
  },
  async enregistrerNote(n) {
    const e = await lire();
    const notes = e.notes.filter((x) => !(x.clientId === n.clientId && x.jour === n.jour));
    await sauver({ ...e, notes: noteVide(n) ? notes : [...notes, n] });
  },
  async effacerTout(clientId) {
    const e = await lire();
    await sauver({
      choix: { ...e.choix, [clientId]: { actif: false, partage: 'rien', le: new Date().toISOString() } },
      reglages: e.reglages.filter((x) => x.clientId !== clientId),
      regles: e.regles.filter((x) => x.clientId !== clientId),
      notes: e.notes.filter((x) => x.clientId !== clientId),
    });
  },
  async vueCoach(clientId) {
    const d = await cycleDemo.mesDonnees(clientId);
    const v = filtrerPourCoach(d.choix, d);
    return v && v.partage !== 'rien' ? { partage: v.partage, reglages: d.reglages, regles: v.regles, notes: v.notes } : null;
  },
};

// ---------- Supabase ----------

/** Tables absentes : la mise à jour de la base n'a pas encore été passée. */
const PAS_ACTIVE = 'Le suivi du cycle n’est pas encore activé sur le serveur. Ta coach doit passer la mise à jour de la base.';
function verifier<T>({ data, error }: { data: T; error: { message: string; code?: string } | null }): T {
  if (error)
    throw new Error(
      error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01' || error.code === '42883' || /could not find the (table|function)/i.test(error.message)
        ? PAS_ACTIVE
        : error.message,
    );
  return data;
}

type LigneReglages = { client_id: string; duree_cycle: number; duree_regles: number; sans_prevision: boolean };
type LigneRegles = { client_id: string; debut: string; fin: string | null };
type LigneNote = { client_id: string; jour: string; symptomes: string[]; note: string | null };
type LigneChoix = { suivi_cycle?: boolean | null; partage_cycle?: string | null; accepte_le?: string | null } | null;

const lireReglages = (clientId: string, l: LigneReglages | null): ReglagesCycle =>
  l ? { clientId, dureeCycle: l.duree_cycle, dureeRegles: l.duree_regles, sansPrevision: l.sans_prevision } : reglagesParDefaut(clientId);
const lireRegles = (l: LigneRegles): Regles => ({ clientId: l.client_id, debut: l.debut, fin: l.fin ?? undefined });
const lireNote = (l: LigneNote): NoteCycle => ({ clientId: l.client_id, jour: l.jour, symptomes: (l.symptomes ?? []).filter(estSymptome), note: l.note ?? undefined });
const estPartage = (p: unknown): p is PartageCycle => p === 'rien' || p === 'phase' || p === 'tout';
function lireChoix(l: LigneChoix): ChoixCycle | null {
  if (!l?.accepte_le || l.suivi_cycle === undefined || l.suivi_cycle === null) return null;
  return { actif: l.suivi_cycle, partage: estPartage(l.partage_cycle) ? l.partage_cycle : 'rien', le: l.accepte_le };
}

function creerDepotSupabase(db: SupabaseClient): DepotCycle {
  const reglages = async (clientId: string) =>
    lireReglages(
      clientId,
      verifier(await db.from('cycle_reglages').select('client_id, duree_cycle, duree_regles, sans_prevision').eq('client_id', clientId).maybeSingle()) as LigneReglages | null,
    );
  return {
    async mesDonnees(clientId) {
      const [choix, r, regles, notes] = await Promise.all([
        db.rpc('mon_consentement').then((x) => lireChoix(verifier(x) as LigneChoix)),
        reglages(clientId),
        db.from('cycle_regles').select('client_id, debut, fin').eq('client_id', clientId).order('debut').then((x) => (verifier(x) as LigneRegles[]).map(lireRegles)),
        db
          .from('cycle_notes')
          .select('client_id, jour, symptomes, note')
          .eq('client_id', clientId)
          .order('jour')
          .then((x) => (verifier(x) as LigneNote[]).map(lireNote)),
      ]);
      return { choix, reglages: r, regles, notes };
    },
    async choisir(_clientId, actif, partage) {
      const c = lireChoix(verifier(await db.rpc('enregistrer_choix_cycle', { p_actif: actif, p_partage: partage })) as LigneChoix);
      if (!c) throw new Error('Ton choix n’a pas pu être enregistré. Réessaie.');
      return c;
    },
    async enregistrerReglages(r) {
      verifier(
        await db.from('cycle_reglages').upsert({
          client_id: r.clientId,
          duree_cycle: r.dureeCycle,
          duree_regles: r.dureeRegles,
          sans_prevision: r.sansPrevision,
          modifie_le: new Date().toISOString(),
        }),
      );
    },
    async noterRegles(r) {
      verifier(await db.from('cycle_regles').upsert({ client_id: r.clientId, debut: r.debut, fin: r.fin ?? null }));
    },
    async supprimerRegles(clientId, debut) {
      verifier(await db.from('cycle_regles').delete().eq('client_id', clientId).eq('debut', debut));
    },
    async enregistrerNote(n) {
      if (noteVide(n)) verifier(await db.from('cycle_notes').delete().eq('client_id', n.clientId).eq('jour', n.jour));
      else verifier(await db.from('cycle_notes').upsert({ client_id: n.clientId, jour: n.jour, symptomes: n.symptomes, note: n.note?.trim() || null }));
    },
    async effacerTout() {
      verifier(await db.rpc('effacer_mon_cycle'));
    },
    async vueCoach(clientId) {
      const lignes = verifier(await db.rpc('cycle_vue_coach', { p_client: clientId })) as { partage: string; dernier_debut: string | null; dernier_fin: string | null }[];
      const v = lignes?.[0];
      if (!v || (v.partage !== 'phase' && v.partage !== 'tout')) return null;
      const r = await reglages(clientId);
      if (v.partage === 'phase')
        return { partage: 'phase', reglages: r, regles: v.dernier_debut ? [{ clientId, debut: v.dernier_debut, fin: v.dernier_fin ?? undefined }] : [], notes: [] };
      const [regles, notes] = await Promise.all([
        db.from('cycle_regles').select('client_id, debut, fin').eq('client_id', clientId).order('debut').then((x) => (verifier(x) as LigneRegles[]).map(lireRegles)),
        db
          .from('cycle_notes')
          .select('client_id, jour, symptomes, note')
          .eq('client_id', clientId)
          .order('jour')
          .then((x) => (verifier(x) as LigneNote[]).map(lireNote)),
      ]);
      return { partage: 'tout', reglages: r, regles, notes };
    },
  };
}

export const cycle: DepotCycle = supabase ? creerDepotSupabase(supabase) : cycleDemo;
