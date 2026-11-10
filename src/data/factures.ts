// Factures : en-tête du coach, numérotation de chaque client, factures émises (lecture seule) et émission d'un bouton.
// Les prélèvements, mois et séances du mois sont facturés d'office par la base ; ici, le coach facture une ligne d'un bouton.
import { COULEUR_FACTURE, erreursEntete, MENTIONS_FACTURE, nettoyerIban, nettoyerPrefixe, type EnteteFacture, type Facture, type LigneFacture } from '@/domain/factures';

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
  /** Pas encore réglé : la facture partira « à régler ». */
  enAttente?: boolean;
  /** Séances une par une de ce mois (AAAA-MM), facturées ensemble. */
  mois?: string;
  seances?: number;
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
    (x): LigneFacture => ({
      libelle: String(x.libelle),
      quantite: Number(x.quantite),
      prixUnitaire: Number(x.prix_unitaire),
      montant: Number(x.montant),
      ...(x.prix_base != null ? { prixBase: Number(x.prix_base), remisePct: Number(x.remise_pct) } : {}),
    }),
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
  tarifBase: '60',
  iban: '',
  bic: '',
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
      .select('nom, telephone, facture_nom, facture_adresse, facture_telephone, facture_siret, facture_mentions, facture_couleur, facture_logo, facture_iban, facture_bic, facture_tarif_base')
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
      tarifBase: String(data.facture_tarif_base ?? 60),
      iban: data.facture_iban ?? '',
      bic: data.facture_bic ?? '',
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
      facture_tarif_base: Number(e.tarifBase.replace(',', '.')),
      facture_iban: nettoyerIban(e.iban) || null,
      facture_bic: nettoyerIban(e.bic) || null,
    };
    if (!supabase) {
      enteteDemo = { ...e, couleur: ligne.facture_couleur };
      return;
    }
    const { error } = await supabase.from('coachs').update(ligne).eq('id', await monCoach());
    if (error) throw new Error('Réglages non enregistrés, réessaie dans un instant.');
  },

  /** Couleur, logo et coordonnées bancaires du coach, pour afficher une facture (coach ou client). */
  async style(): Promise<{ couleur: string; logo?: string; iban?: string; bic?: string }> {
    if (!supabase) return { couleur: enteteDemo.couleur, logo: enteteDemo.logo, iban: enteteDemo.iban || undefined, bic: enteteDemo.bic || undefined };
    const { data: coach } = await supabase.rpc('mon_coach_id');
    const { data: duClient } = coach ? { data: null } : await supabase.rpc('coach_de_mon_client');
    const id = (coach ?? duClient) as string | null;
    if (!id) return { couleur: COULEUR_FACTURE };
    const { data } = await supabase.from('coachs').select('facture_couleur, facture_logo, facture_iban, facture_bic').eq('id', id).maybeSingle();
    return {
      couleur: data?.facture_couleur ?? COULEUR_FACTURE,
      logo: data?.facture_logo ?? undefined,
      iban: data?.facture_iban ?? undefined,
      bic: data?.facture_bic ?? undefined,
    };
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

  /** Coach : toutes ses factures, tous clients confondus, des plus anciennes aux plus récentes. */
  async toutes(): Promise<Facture[]> {
    if (!supabase) return facturesDemo;
    const { data, error } = await supabase.from('factures').select('*').order('date', { ascending: true }).order('cree_le', { ascending: true });
    if (error) throw new Error('Impossible de charger les factures pour le moment.');
    return (data ?? []).map(versFacture);
  },

  /** Coach : toutes ses factures, rangées par paiement (rubrique Paiements). */
  async parPaiement(): Promise<Map<string, Facture>> {
    if (!supabase) return new Map(facturesDemo.filter((f) => f.paiementId).map((f) => [f.paiementId!, f]));
    // Une facture du mois couvre plusieurs séances : chaque ligne de paiement pointe vers sa facture.
    const { data, error } = await supabase.from('factures_paiements').select('paiement_id, factures(*)');
    if (error) throw new Error('Impossible de charger les factures pour le moment.');
    return new Map(
      (data ?? []).filter((l) => l.factures).map((l) => [l.paiement_id as string, versFacture(l.factures as unknown as LigneBase)]),
    );
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

  /**
   * Lignes de ce client sans facture : paiements payés ou en attente, et séances une par une regroupées par mois
   * (elles se facturent ensemble, d'une seule facture du mois).
   */
  async aFacturer(clientId: string): Promise<PaiementAFacturer[]> {
    if (!supabase) return [];
    const { data: contacts } = await supabase.from('contacts').select('id').eq('client_id', clientId);
    const ids = (contacts ?? []).map((c) => c.id as string);
    let requete = supabase.from('paiements').select('id, titre, date, montant, moyen, statut, reference').in('statut', ['Payé', 'En attente']).not('montant', 'is', null);
    requete = ids.length ? requete.or(`contact_id.in.(${ids.join(',')}),reference.like.*:${clientId}`) : requete.like('reference', `%:${clientId}`);
    const { data: paiements, error } = await requete.order('date', { ascending: false }).limit(200);
    if (error) throw new Error('Impossible de charger les paiements.');
    const tous = paiements ?? [];
    const { data: deja } = tous.length
      ? await supabase.from('factures_paiements').select('paiement_id').in('paiement_id', tous.map((p) => p.id as string))
      : { data: [] };
    const factures = new Set((deja ?? []).map((f) => f.paiement_id as string));
    const libres = tous.filter((p) => !factures.has(p.id as string));
    const lignes: PaiementAFacturer[] = [];
    const mois = new Map<string, PaiementAFacturer>();
    for (const p of libres) {
      const date = (p.date as string | null) ?? undefined;
      if (String(p.reference ?? '').startsWith('seance:') && date) {
        const m = date.slice(0, 7);
        const g = mois.get(m) ?? { id: `mois-${m}`, titre: '', montant: 0, mois: m, seances: 0, enAttente: false };
        g.montant += Number(p.montant);
        g.seances = (g.seances ?? 0) + 1;
        g.enAttente = g.enAttente || p.statut !== 'Payé';
        mois.set(m, g);
        continue;
      }
      lignes.push({
        id: p.id as string,
        titre: p.titre as string,
        date,
        montant: Number(p.montant),
        moyen: (p.moyen as string | null) ?? undefined,
        enAttente: p.statut !== 'Payé',
      });
    }
    for (const g of mois.values()) {
      const [a, n] = g.mois!.split('-').map(Number);
      const nom = new Date(a, n - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      g.titre = `Séances de ${nom} (${g.seances})`;
      lignes.push(g);
    }
    return lignes;
  },

  /** Coach : facture du mois (AAAA-MM) qui regroupe les séances du client pas encore facturées. */
  async facturerMois(clientId: string, mois: string): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('facturer_mois', { p_client: clientId, p_mois: mois });
    if (error) throw new Error(error.message || 'Facture non créée, réessaie dans un instant.');
    if (!data) throw new Error('Toutes les séances de ce mois sont déjà facturées.');
  },

  /** Coach : émet la facture d'un paiement payé ou en attente (prend le prochain numéro du client). */
  async facturer(paiementId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('facturer_paiement', { p_paiement: paiementId });
    if (error) throw new Error(error.message || 'Facture non créée, réessaie dans un instant.');
  },
};
