// C08 · État observable des flux externes : réponses Tally reçues, envois de comptes rendus par Make.
// Le raccordement Make n'est jamais supposé : la fonction Edge dit seulement si le webhook est renseigné.
// En démo, rien n'est raccordé : l'écran le dit, et aucun envoi n'est simulé.
import type { SupabaseClient } from '@supabase/supabase-js';

import { crm } from './crm';
import { supabase } from './supabase';

export type EtatJournal = 'erreur' | 'en_cours' | 'transmis' | 'envoye' | 'echec' | 'bloque';

export interface EntreeJournal {
  id: string;
  flux: 'questionnaire' | 'compte_rendu';
  cle: string;
  etat: EtatJournal;
  contactId?: string;
  documentId?: string;
  version?: number;
  detail?: string;
  tentatives: number;
  majLe: string;
}

export interface EtatAutomatisations {
  /** 'configure' : webhook Make renseigné ; 'manquant' : non renseigné ; 'inconnu' : fonction absente ou injoignable. */
  make: 'configure' | 'manquant' | 'inconnu';
  /** Réponses reçues par le webhook Tally (pas par le formulaire de l'app). */
  tally: { recues: number; derniere?: string };
  /** Questionnaires dont le rapprochement a laissé une différence à vérifier. */
  aRapprocher: number;
  journal: EntreeJournal[];
  /** Explication quand le journal n'a pas pu être lu (migration non appliquée…). */
  avertissement?: string;
  /** Adresse à coller dans Tally (Intégrations → Webhooks) ; absente en démo. */
  webhookTally?: string;
}

export interface ResultatEnvoi {
  etat: EtatJournal;
  message: string;
}

export interface DepotAutomatisations {
  etat(): Promise<EtatAutomatisations>;
  make(): Promise<EtatAutomatisations['make']>;
  /** Transmet le PDF courant du document au scénario Make. `relancer` seulement après échec ou blocage. */
  envoyerCompteRendu(documentId: string, relancer?: boolean): Promise<ResultatEnvoi>;
}

async function questionnaires() {
  const c = await crm.carnet();
  const tally = c.questionnaires.filter((q) => (q.reponses._envoi ?? '').startsWith('tally:')).sort((a, b) => b.recuLe.localeCompare(a.recuLe));
  return { tally: { recues: tally.length, derniere: tally[0]?.recuLe }, aRapprocher: c.questionnaires.filter((q) => q.alertes.length > 0).length };
}

const demo: DepotAutomatisations = {
  make: async () => 'manquant',
  async etat() {
    return { make: 'manquant', ...(await questionnaires()), journal: [] };
  },
  async envoyerCompteRendu() {
    throw new Error('Make n’est pas raccordé en démo : rien n’a été envoyé.');
  },
};

async function messageErreur(error: unknown, defaut: string) {
  const corps = await (error as { context?: Response }).context?.json?.().catch(() => null);
  return { corps, message: corps?.message ?? corps?.erreur ?? defaut };
}

function creerSupabase(db: SupabaseClient): DepotAutomatisations {
  async function make(): Promise<EtatAutomatisations['make']> {
    const { data, error } = await db.functions.invoke<{ configure: boolean }>('envoyer-compte-rendu', { body: { verifier: true } });
    return error ? 'inconnu' : data?.configure ? 'configure' : 'manquant';
  }
  return {
    make,
    async etat() {
      const [etatMake, journal, q, lien] = await Promise.all([
        make(),
        db.from('journal_automatisations').select('*').order('maj_le', { ascending: false }).limit(50),
        questionnaires(),
        crm.lienQuestionnaire(),
      ]);
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      return {
        make: etatMake,
        ...q,
        journal: (journal.data ?? []).map((l: any) => ({
          id: l.id, flux: l.flux, cle: l.cle, etat: l.etat, contactId: l.contact_id ?? undefined, documentId: l.document_id ?? undefined,
          version: l.version ?? undefined, detail: l.detail ?? undefined, tentatives: l.tentatives, majLe: l.maj_le,
        })),
        avertissement: journal.error ? 'Journal des automatisations indisponible : la mise à jour de la base du lot 6 n’est pas encore appliquée.' : undefined,
        webhookTally: url && lien ? `${url}/functions/v1/tally?coach=${encodeURIComponent(lien)}` : undefined,
      };
    },
    async envoyerCompteRendu(documentId, relancer) {
      const { data, error } = await db.functions.invoke<ResultatEnvoi>('envoyer-compte-rendu', { body: { documentId, relancer } });
      if (error) {
        const { corps, message } = await messageErreur(error, 'Transmission non confirmée. Vérifiez Make avant de relancer.');
        // Refus motivé (déjà envoyé, déjà transmis, bloqué…) : un état, pas une réussite.
        if (corps?.etat) return { etat: corps.etat, message };
        throw new Error(message);
      }
      return data!;
    },
  };
}

export const automatisations: DepotAutomatisations = supabase ? creerSupabase(supabase) : demo;
