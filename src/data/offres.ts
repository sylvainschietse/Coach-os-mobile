// Offres du coach et paiement en ligne (Stripe Connect) : le coach crée ses offres, ouvre son compte Stripe,
// et ses clients le paient directement, depuis l'appli ou par le lien partageable de l'offre.
import { OFFRES_DEMO, type Offre, type Periodicite, type SaisieOffre, type ModeleOffre } from '@/domain/offres';
import { nouvelId } from '@/lib/identifiant';

import { supabase } from './supabase';

export interface EtatStripe {
  /** Le coach a commencé à ouvrir son compte Stripe. */
  compte: boolean;
  /** Stripe a validé le compte : les clients peuvent payer. */
  pret: boolean;
  /** Dossier envoyé, Stripe vérifie encore. */
  enAttente?: boolean;
}

/** Ce que la page publique d'une offre affiche, sans compte. */
export interface OffrePublique {
  offre: Omit<Offre, 'modele' | 'active' | 'ordre' | 'enLigne'>;
  coach: { nom: string; photo: string | null };
  /** Le coach peut encaisser en ligne. */
  paiement: boolean;
}

export interface DepotOffres {
  /** Coach : toutes ses offres ; client : les offres proposées par son coach. */
  lister(): Promise<Offre[]>;
  enregistrer(offre: SaisieOffre, id?: string): Promise<string>;
  /** Range les offres dans cet ordre (la première de la liste passe en tête de la brochure). */
  ordonner(ids: string[]): Promise<void>;
  /** Supprime l'offre, ou la retire de la vente si des clients l'ont (ils la gardent, à leur prix). */
  retirer(id: string): Promise<'supprimee' | 'retiree'>;
  /** Met le prix à jour sur le compte Stripe du coach (fait aussi au premier paiement). */
  publier(id: string): Promise<void>;
  etatStripe(): Promise<EtatStripe>;
  /** Page Stripe pour ouvrir (ou terminer d'ouvrir) le compte du coach. */
  connecterStripe(): Promise<string>;
  /** Tableau de bord Stripe du coach : virements, factures, remboursements. */
  tableauStripe(): Promise<string>;
  /** Page de paiement de l'offre : pour le client connecté, ou pour la personne qui a reçu le lien. */
  payer(offreId: string): Promise<string>;
  voir(offreId: string): Promise<OffrePublique>;
  /** Client : passe tout de suite à une offre plus chère ; renvoie la différence payée au prorata. */
  changer(offreId: string): Promise<{ paye: number }>;
}

/** Message d'erreur renvoyé par la fonction serveur, sinon un message général. */
async function erreurFonction(error: unknown, defaut: string) {
  const ctx = (error as { context?: Response } | null)?.context;
  try {
    const corps = ctx ? await ctx.json() : undefined;
    if (corps?.erreur) return new Error(corps.erreur);
  } catch {
    /* corps illisible */
  }
  return new Error(defaut);
}

const memoire = { offres: [...OFFRES_DEMO] };
const SANS_STRIPE = 'Le paiement en ligne n’est pas disponible en démo.';

const demo: DepotOffres = {
  async lister() {
    return [...memoire.offres].sort((a, b) => a.ordre - b.ordre);
  },
  async enregistrer(offre, id) {
    if (offre.conseil) memoire.offres = memoire.offres.map((o) => ({ ...o, conseil: false }));
    if (id) {
      memoire.offres = memoire.offres.map((o) => (o.id === id ? { ...o, ...offre } : o));
      return id;
    }
    const cree: Offre = { ...offre, id: nouvelId(), ordre: Math.max(0, ...memoire.offres.map((o) => o.ordre)) + 1, enLigne: false };
    memoire.offres.push(cree);
    return cree.id;
  },
  async ordonner(ids) {
    memoire.offres = memoire.offres.map((o) => (ids.includes(o.id) ? { ...o, ordre: ids.indexOf(o.id) + 1 } : o));
  },
  async retirer(id) {
    memoire.offres = memoire.offres.filter((o) => o.id !== id);
    return 'supprimee';
  },
  async publier() {},
  async etatStripe() {
    return { compte: false, pret: false };
  },
  async connecterStripe() {
    throw new Error(SANS_STRIPE);
  },
  async tableauStripe() {
    throw new Error(SANS_STRIPE);
  },
  async payer() {
    throw new Error(SANS_STRIPE);
  },
  async changer() {
    throw new Error(SANS_STRIPE);
  },
  async voir(offreId) {
    const o = memoire.offres.find((x) => x.id === offreId);
    if (!o) throw new Error('Offre introuvable.');
    return { offre: o, coach: { nom: 'Sylvain', photo: null }, paiement: false };
  },
};

type Ligne = {
  id: string;
  modele: string;
  nom: string;
  accroche: string | null;
  prix: number | string;
  periodicite: string;
  acces_appli: boolean;
  nutrition: boolean;
  messagerie: boolean;
  videos_mois: number;
  seances: number;
  essai_jours: number;
  active: boolean;
  conseil: boolean | null;
  ordre: number;
  stripe_prix: string | null;
  stripe_prix_cle: string | null;
};
export const CHAMPS_OFFRE =
  'id, modele, nom, accroche, prix, periodicite, acces_appli, nutrition, messagerie, videos_mois, seances, essai_jours, active, conseil, ordre, stripe_prix, stripe_prix_cle';

export function versOffre(l: Ligne): Offre {
  const prix = Number(l.prix);
  return {
    id: l.id,
    modele: l.modele as ModeleOffre,
    nom: l.nom,
    accroche: l.accroche ?? undefined,
    prix,
    periodicite: l.periodicite as Periodicite,
    accesAppli: l.acces_appli,
    nutrition: l.nutrition,
    messagerie: l.messagerie,
    videosMois: l.videos_mois,
    seances: l.seances,
    essaiJours: l.essai_jours,
    active: l.active,
    conseil: !!l.conseil,
    ordre: l.ordre,
    // Même clé que tarifStripe() côté serveur : le prix en ligne correspond au prix affiché.
    enLigne: !!l.stripe_prix && l.stripe_prix_cle === `${Math.round(prix * 100)}_${l.periodicite}`,
  };
}

const versLigne = (o: SaisieOffre) => ({
  modele: o.modele,
  nom: o.nom,
  accroche: o.accroche ?? null,
  prix: o.prix,
  periodicite: o.periodicite,
  acces_appli: o.accesAppli,
  nutrition: o.nutrition,
  messagerie: o.messagerie,
  videos_mois: o.videosMois,
  seances: o.seances,
  essai_jours: o.essaiJours,
  active: o.active,
  conseil: o.active && o.conseil,
});

function enLigne(db: NonNullable<typeof supabase>): DepotOffres {
  async function appeler<T>(corps: Record<string, unknown>, defaut: string) {
    const { data, error } = await db.functions.invoke<T & { erreur?: string }>('abonnement-stripe', { body: corps });
    if (error || !data) throw await erreurFonction(error, defaut);
    return data;
  }
  return {
    async lister() {
      const { data, error } = await db.from('offres').select(CHAMPS_OFFRE).order('ordre').order('cree_le');
      if (error) throw new Error('Impossible de lire les offres. Vérifie ta connexion.');
      return (data as Ligne[]).map(versOffre);
    },
    async enregistrer(offre, id) {
      // Une seule offre conseillée : les autres du coach perdent le badge (la règle d'accès limite au coach).
      if (offre.conseil && offre.active) {
        const { error } = await db.from('offres').update({ conseil: false }).eq('conseil', true);
        if (error) throw new Error('L’offre n’a pas pu être enregistrée. Réessaie.');
      }
      if (id) {
        const { error } = await db.from('offres').update(versLigne(offre)).eq('id', id);
        if (error) throw new Error('L’offre n’a pas pu être enregistrée. Réessaie.');
        return id;
      }
      const { data: dernieres } = await db.from('offres').select('ordre').order('ordre', { ascending: false }).limit(1);
      const ordre = ((dernieres?.[0]?.ordre as number | undefined) ?? 0) + 1;
      const { data, error } = await db
        .from('offres')
        .insert({ ...versLigne(offre), ordre })
        .select('id')
        .single();
      if (error) throw new Error('L’offre n’a pas pu être créée. Réessaie.');
      return data.id as string;
    },
    async ordonner(ids) {
      const resultats = await Promise.all(ids.map((id, i) => db.from('offres').update({ ordre: i + 1 }).eq('id', id)));
      if (resultats.some((r) => r.error)) throw new Error('Le nouvel ordre n’a pas pu être enregistré. Réessaie.');
    },
    async retirer(id) {
      const { count } = await db.from('clients').select('id', { count: 'exact', head: true }).eq('offre_id', id);
      if (count) {
        const { error } = await db.from('offres').update({ active: false }).eq('id', id);
        if (error) throw new Error('L’offre n’a pas pu être retirée. Réessaie.');
        return 'retiree';
      }
      const { error } = await db.from('offres').delete().eq('id', id);
      if (error) throw new Error('L’offre n’a pas pu être supprimée. Réessaie.');
      return 'supprimee';
    },
    async publier(id) {
      await appeler({ action: 'publier', offreId: id }, 'L’offre n’a pas pu être mise en ligne. Réessaie.');
    },
    async etatStripe() {
      const d = await appeler<EtatStripe>({ action: 'compte' }, 'Impossible de joindre Stripe pour le moment.');
      return { compte: !!d.compte, pret: !!d.pret, enAttente: !!d.enAttente };
    },
    async connecterStripe() {
      const d = await appeler<{ lien?: string }>({ action: 'connecter' }, 'La page Stripe ne s’ouvre pas pour le moment. Réessaie.');
      if (!d.lien) throw new Error('La page Stripe ne s’ouvre pas pour le moment. Réessaie.');
      return d.lien;
    },
    async tableauStripe() {
      const d = await appeler<{ lien?: string }>({ action: 'tableau' }, 'Ton tableau de bord Stripe ne s’ouvre pas pour le moment. Réessaie.');
      if (!d.lien) throw new Error('Ton tableau de bord Stripe ne s’ouvre pas pour le moment. Réessaie.');
      return d.lien;
    },
    async payer(offreId) {
      const d = await appeler<{ lien?: string }>({ action: 'payer', offreId }, 'La page de paiement ne s’ouvre pas pour le moment. Réessaie.');
      if (!d.lien) throw new Error('La page de paiement ne s’ouvre pas pour le moment. Réessaie.');
      return d.lien;
    },
    async changer(offreId) {
      const d = await appeler<{ paye?: number }>({ action: 'changer', offreId }, 'Le changement d’offre n’a pas pu se faire. Réessaie.');
      return { paye: Number(d.paye ?? 0) };
    },
    async voir(offreId) {
      return appeler<OffrePublique>({ action: 'voir', offreId }, 'Cette offre ne s’affiche pas pour le moment.');
    },
  };
}

export const offres: DepotOffres = supabase ? enLigne(supabase) : demo;
