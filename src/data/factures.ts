// Factures : en-tête du coach, numérotation de chaque client, factures émises (lecture seule) et émission d'un bouton.
// Les prélèvements Stripe sont facturés d'office par la base ; ici, le coach facture un paiement encaissé autrement.
import { COULEUR_FACTURE, erreursEntete, MENTIONS_FACTURE, nettoyerPrefixe, type EnteteFacture, type Facture, type LigneFacture } from '@/domain/factures';

import { supabase } from './supabase';

export interface Numerotation {
  prefixe?: string;
  prochain: number;
  /** À qui la facture est adressée, si ce n'est pas le client lui-même. */
  nomFacture?: string;
}

export interface PaiementAFacturer {
  id: string;
  titre: string;
  date?: string;
  montant: number;
  moyen?: string;
}

type LigneBase = Record<string, unknown>;

const versFacture = (l: LigneBase): Facture => ({
  id: l.id as string,
  clientId: (l.client_id as string | null) ?? undefined,
  paiementId: (l.paiement_id as string | null) ?? undefined,
  numero: l.numero as string,
  date: l.date as string,
  objet: l.objet as string,
  emetteur: l.emetteur as Facture['emetteur'],
  destinataire: l.destinataire as Facture['destinataire'],
  lignes: ((l.lignes as Record<string, number | string>[]) ?? []).map(
    (x): LigneFacture => ({ libelle: String(x.libelle), quantite: Number(x.quantite), prixUnitaire: Number(x.prix_unitaire), montant: Number(x.montant) }),
  ),
  total: Number(l.total),
  moyen: (l.moyen as string | null) ?? undefined,
  payeLe: (l.paye_le as string | null) ?? undefined,
});

// ---------- Démo : tout reste en mémoire le temps de la visite ----------
let enteteDemo: EnteteFacture = {
  nom: 'SCHIETSE Sylvain',
  adresse: '1763 rue Edouard Herriot\n01480 Jassans-Riottier',
  telephone: '06 48 64 08 45',
  siret: '51896650200016',
  mentions: MENTIONS_FACTURE,
  couleur: COULEUR_FACTURE,
};
const numerotationsDemo = new Map<string, Numerotation>();
const facturesDemo: Facture[] = [];
function factureDemo(clientId: string): Facture {
  return {
    id: `demo-${clientId}`,
    clientId,
    numero: 'F1',
    date: new Date().toISOString().slice(0, 10),
    objet: `Abonnement ${new Date().toISOString().slice(0, 7).split('-').reverse().join('/')}`,
    emetteur: { nom: enteteDemo.nom, adresse: enteteDemo.adresse, telephone: enteteDemo.telephone, siret: enteteDemo.siret, mentions: enteteDemo.mentions },
    destinataire: { nom: 'Client de démonstration' },
    lignes: [
      { libelle: 'Abonnement Hybride complet', quantite: 1, prixUnitaire: 269, montant: 269 },
      { libelle: 'Remise · Merci d’être testeur', quantite: 1, prixUnitaire: -269, montant: -269 },
    ],
    total: 0,
    moyen: 'Stripe',
    payeLe: new Date().toISOString().slice(0, 10),
  };
}

async function monCoach() {
  return (await supabase!.rpc('mon_coach_id')).data as string;
}

export const factures = {
  /** Coach : son en-tête de facture. */
  async entete(): Promise<EnteteFacture> {
    if (!supabase) return enteteDemo;
    const { data, error } = await supabase
      .from('coachs')
      .select('nom, telephone, facture_nom, facture_adresse, facture_telephone, facture_siret, facture_mentions, facture_couleur, facture_logo')
      .eq('id', await monCoach())
      .single();
    if (error || !data) throw new Error('Impossible de charger tes réglages de facture.');
    return {
      nom: data.facture_nom ?? '',
      adresse: data.facture_adresse ?? '',
      telephone: data.facture_telephone ?? '',
      siret: data.facture_siret ?? '',
      mentions: data.facture_mentions ?? MENTIONS_FACTURE,
      couleur: data.facture_couleur ?? COULEUR_FACTURE,
      logo: data.facture_logo ?? undefined,
    };
  },

  async enregistrerEntete(e: EnteteFacture): Promise<void> {
    const erreurs = erreursEntete(e);
    if (erreurs.length) throw new Error(erreurs.join('\n'));
    const propre = (s: string) => s.trim() || null;
    const ligne = {
      facture_nom: propre(e.nom),
      facture_adresse: propre(e.adresse),
      facture_telephone: propre(e.telephone),
      facture_siret: e.siret.replace(/\s/g, '') || null,
      facture_mentions: e.mentions.trim(),
      facture_couleur: e.couleur.toUpperCase(),
      facture_logo: e.logo ?? null,
    };
    if (!supabase) {
      enteteDemo = { ...e, couleur: ligne.facture_couleur };
      return;
    }
    const { error } = await supabase.from('coachs').update(ligne).eq('id', await monCoach());
    if (error) throw new Error('Réglages non enregistrés, réessaie dans un instant.');
  },

  /** Couleur et logo du coach, pour afficher une facture (coach ou client). */
  async style(): Promise<{ couleur: string; logo?: string }> {
    if (!supabase) return { couleur: enteteDemo.couleur, logo: enteteDemo.logo };
    const { data: coach } = await supabase.rpc('mon_coach_id');
    const { data: duClient } = coach ? { data: null } : await supabase.rpc('coach_de_mon_client');
    const id = (coach ?? duClient) as string | null;
    if (!id) return { couleur: COULEUR_FACTURE };
    const { data } = await supabase.from('coachs').select('facture_couleur, facture_logo').eq('id', id).maybeSingle();
    return { couleur: data?.facture_couleur ?? COULEUR_FACTURE, logo: data?.facture_logo ?? undefined };
  },

  /** Factures d'un client (coach), ou les siennes (client). Les plus récentes d'abord. */
  async liste(clientId: string): Promise<Facture[]> {
    if (!supabase) {
      const liste = facturesDemo.filter((f) => f.clientId === clientId);
      return liste.length ? liste : [factureDemo(clientId)];
    }
    const { data, error } = await supabase.from('factures').select('*').eq('client_id', clientId).order('date', { ascending: false }).order('cree_le', { ascending: false });
    if (error) throw new Error('Impossible de charger les factures pour le moment.');
    return (data ?? []).map(versFacture);
  },

  /** Coach : toutes ses factures, rangées par paiement (rubrique Paiements). */
  async parPaiement(): Promise<Map<string, Facture>> {
    if (!supabase) return new Map(facturesDemo.filter((f) => f.paiementId).map((f) => [f.paiementId!, f]));
    const { data, error } = await supabase.from('factures').select('*').not('paiement_id', 'is', null);
    if (error) throw new Error('Impossible de charger les factures pour le moment.');
    return new Map((data ?? []).map((l) => [l.paiement_id as string, versFacture(l)]));
  },

  async numerotation(clientId: string): Promise<Numerotation> {
    if (!supabase) return numerotationsDemo.get(clientId) ?? { prochain: 2 };
    const { data, error } = await supabase.from('clients').select('facture_prefixe, facture_prochain, facture_nom').eq('id', clientId).single();
    if (error || !data) throw new Error('Impossible de charger la numérotation.');
    return { prefixe: data.facture_prefixe ?? undefined, prochain: data.facture_prochain, nomFacture: data.facture_nom ?? undefined };
  },

  async changerNumerotation(clientId: string, n: Numerotation): Promise<void> {
    const prefixe = nettoyerPrefixe(n.prefixe ?? '');
    if (!Number.isInteger(n.prochain) || n.prochain < 1) throw new Error('Le prochain numéro doit être un nombre entier, à partir de 1.');
    if (!supabase) {
      numerotationsDemo.set(clientId, { prefixe: prefixe || undefined, prochain: n.prochain, nomFacture: n.nomFacture?.trim() || undefined });
      return;
    }
    const { error } = await supabase
      .from('clients')
      .update({ facture_prefixe: prefixe || null, facture_prochain: n.prochain, facture_nom: n.nomFacture?.trim() || null })
      .eq('id', clientId);
    if (error) throw new Error('Numérotation non enregistrée, réessaie dans un instant.');
  },

  /** Paiements « Payé » de ce client qui n'ont pas encore de facture. */
  async aFacturer(clientId: string): Promise<PaiementAFacturer[]> {
    if (!supabase) return [];
    const { data: contacts } = await supabase.from('contacts').select('id').eq('client_id', clientId);
    const ids = (contacts ?? []).map((c) => c.id as string);
    let requete = supabase.from('paiements').select('id, titre, date, montant, moyen').eq('statut', 'Payé').not('montant', 'is', null);
    requete = ids.length ? requete.or(`contact_id.in.(${ids.join(',')}),reference.like.*:${clientId}`) : requete.like('reference', `%:${clientId}`);
    const [{ data: paiements, error }, { data: deja }] = await Promise.all([
      requete.order('date', { ascending: false }).limit(50),
      supabase.from('factures').select('paiement_id').eq('client_id', clientId),
    ]);
    if (error) throw new Error('Impossible de charger les paiements.');
    const factures = new Set((deja ?? []).map((f) => f.paiement_id as string));
    return (paiements ?? [])
      .filter((p) => !factures.has(p.id as string))
      .map((p) => ({ id: p.id as string, titre: p.titre as string, date: (p.date as string | null) ?? undefined, montant: Number(p.montant), moyen: (p.moyen as string | null) ?? undefined }));
  },

  /** Coach : émet la facture d'un paiement encaissé (prend le prochain numéro du client). */
  async facturer(paiementId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('facturer_paiement', { p_paiement: paiementId });
    if (error) throw new Error(error.message || 'Facture non créée, réessaie dans un instant.');
  },
};
