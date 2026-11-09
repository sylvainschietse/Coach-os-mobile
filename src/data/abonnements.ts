import {
  mensualite,
  packADecompter,
  prixAbonnement,
  prixAvecRemise,
  remiseEnCours,
  TARIFS,
  type Abonnement,
  type PackSeances,
  type Remise,
  type StatutStripe,
  type PackAVendre,
} from '@/domain/abonnements';
import { jourLocal } from '@/domain/crm';
import { OFFRES_DEMO } from '@/domain/offres';
import { nouvelId } from '@/lib/identifiant';

import { CHAMPS_OFFRE, versOffre } from './offres';
import { supabase } from './supabase';

export interface DepotAbonnements {
  lire(clientId: string): Promise<Abonnement>;
  /** Réservé au coach : la base refuse qu'un client change son propre abonnement. */
  changer(clientId: string, modif: Partial<Abonnement>): Promise<void>;
  packs(clientId: string): Promise<PackSeances[]>;
  /** Décompte de tous les packs du coach, par identifiant de pack (pour la liste Paiements). */
  soldePacks(): Promise<Map<string, { total: number; faites: number }>>;
  /** prix : tarif négocié au cas par cas ; sinon le prix du pack. */
  /** Rend l'identifiant du pack créé (pour le partager aussitôt). */
  ajouterPack(clientId: string, pack: PackAVendre, prix?: number): Promise<string>;
  /** Pack partagé (couple, duo) : la séance faite par l'un ou l'autre se décompte une fois. */
  partagerPack(packId: string, clientId: string): Promise<void>;
  retirerPartage(packId: string, clientId: string): Promise<void>;
  /** Décompte une séance faite avec le coach (+1) ou annule le dernier décompte (-1). */
  decompter(clientId: string, sens: 1 | -1): Promise<void>;
  /** Pack ajouté par erreur : supprimé avec sa ligne de paiement encore « En attente ». */
  supprimerPack(packId: string): Promise<void>;
  /** Coach : crée la ligne « En attente » du mois pour chaque abonnement mensuel payé à la main, et crédite les séances de son offre. */
  preparerEcheances(): Promise<void>;
  /**
   * Coach : passe le client au paiement Stripe avec son offre et sa remise (l'argent arrive sur le compte Stripe du coach).
   * Offert à 100 % : l'abonnement démarre tout de suite, sans carte. Sinon : un lien de paiement à envoyer au client.
   */
  demarrerStripe(clientId: string): Promise<{ lien?: string; demarre: boolean }>;
  /** Coach : résilie le prélèvement Stripe à la fin du mois payé (l'accès reste ouvert jusque-là). */
  resilierStripe(clientId: string): Promise<void>;
  /** Client : page Stripe pour changer sa carte, voir ses factures ou résilier. */
  portailStripe(): Promise<string>;
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

/** En démo, tout est ouvert et reste en mémoire. */
const memoire = {
  abonnements: new Map<string, Abonnement>(),
  packs: [] as PackSeances[],
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Annuler un décompte : sur le pack le plus récent déjà entamé. */
const aAnnuler = (packs: PackSeances[]) => [...packs].filter((p) => p.seancesFaites > 0).sort((a, b) => b.acheteLe.localeCompare(a.acheteLe))[0];

const demo: DepotAbonnements = {
  async lire(clientId) {
    return (
      memoire.abonnements.get(clientId) ?? {
        accesAppli: true,
        optionNutrition: true,
        tarifSeance: TARIFS.seance,
        videosMois: 2,
        // Exemple de client testeur : l'offre complète, offerte par le coach.
        offre: OFFRES_DEMO[3],
        offrePrix: OFFRES_DEMO[3].prix,
        remise: { type: 'pourcent', valeur: 100, motif: 'Merci d’être testeur' },
        paiement: 'manuel',
      }
    );
  },
  async changer(clientId, modif) {
    memoire.abonnements.set(clientId, {
      ...(await demo.lire(clientId)),
      ...modif,
    });
  },
  async packs(clientId) {
    return memoire.packs.filter((p) => p.clientId === clientId || p.partageAvec?.some((x) => x.clientId === clientId));
  },
  async soldePacks() {
    return new Map(memoire.packs.map((p) => [p.id, { total: p.seancesTotal, faites: p.seancesFaites }]));
  },
  async ajouterPack(clientId, pack, prix) {
    const id = nouvelId();
    memoire.packs.push({
      id,
      clientId,
      seancesTotal: pack.seances,
      seancesFaites: 0,
      prix: prix ?? pack.prix,
      acheteLe: aujourdhui(),
    });
    return id;
  },
  async partagerPack(packId, clientId) {
    const p = memoire.packs.find((x) => x.id === packId);
    if (p && !p.partageAvec?.some((x) => x.clientId === clientId)) p.partageAvec = [...(p.partageAvec ?? []), { clientId, prenom: 'Client' }];
  },
  async retirerPartage(packId, clientId) {
    const p = memoire.packs.find((x) => x.id === packId);
    if (p) p.partageAvec = p.partageAvec?.filter((x) => x.clientId !== clientId);
  },
  async supprimerPack(packId) {
    memoire.packs = memoire.packs.filter((p) => p.id !== packId);
  },
  async decompter(clientId, sens) {
    const packs = await demo.packs(clientId);
    const p = sens === 1 ? packADecompter(packs) : aAnnuler(packs);
    if (p) p.seancesFaites += sens;
  },
  // En démo, les paiements restent ceux saisis à la main.
  async preparerEcheances() {},
  async demarrerStripe() {
    throw new Error('Le paiement par Stripe n’est pas disponible en démo.');
  },
  async resilierStripe() {
    throw new Error('Le paiement par Stripe n’est pas disponible en démo.');
  },
  async portailStripe() {
    throw new Error('Le paiement par Stripe n’est pas disponible en démo.');
  },
};

type LigneRemise = { remise_type?: string | null; remise_valeur?: number | string | null; remise_motif?: string | null; remise_jusqu_au?: string | null };
const versRemise = (l: LigneRemise): Remise | undefined =>
  (l.remise_type === 'pourcent' || l.remise_type === 'montant') && l.remise_valeur != null
    ? { type: l.remise_type, valeur: Number(l.remise_valeur), motif: l.remise_motif ?? undefined, jusquAu: l.remise_jusqu_au ?? undefined }
    : undefined;

type Ligne = {
  id: string;
  client_id: string;
  seances_total: number;
  seances_faites: number;
  prix: number | string | null;
  achete_le: string;
  clients?: { prenom: string } | null;
  packs_partages?: { client_id: string; clients: { prenom: string } | null }[];
};
const versPack = (l: Ligne, pour: string): PackSeances => ({
  id: l.id,
  clientId: l.client_id,
  seancesTotal: l.seances_total,
  seancesFaites: l.seances_faites,
  prix: l.prix === null ? undefined : Number(l.prix),
  acheteLe: l.achete_le,
  partageAvec: (l.packs_partages ?? []).filter((p) => p.client_id !== pour).map((p) => ({ clientId: p.client_id, prenom: p.clients?.prenom ?? '' })),
  titulaire: l.client_id !== pour ? { clientId: l.client_id, prenom: l.clients?.prenom ?? '' } : undefined,
});

function enLigne(db: NonNullable<typeof supabase>): DepotAbonnements {
  const depot: DepotAbonnements = {
    async lire(clientId) {
      const { data, error } = await db
        .from('clients')
        .select(
          `acces_appli, option_nutrition, tarif_seance, videos_mois, offre_prix, remise_type, remise_valeur, remise_motif, remise_jusqu_au, paiement, statut_stripe, prochaine_echeance, offres(${CHAMPS_OFFRE})`,
        )
        .eq('id', clientId)
        .maybeSingle();
      if (error) throw new Error('Impossible de lire l’abonnement. Vérifie ta connexion.');
      return {
        accesAppli: data?.acces_appli ?? false,
        optionNutrition: data?.option_nutrition ?? false,
        tarifSeance: data?.tarif_seance == null ? TARIFS.seance : Number(data.tarif_seance),
        videosMois: data?.videos_mois ?? 0,
        offre: data?.offres ? versOffre(data.offres as unknown as Parameters<typeof versOffre>[0]) : undefined,
        offrePrix: data?.offre_prix == null ? undefined : Number(data.offre_prix),
        remise: versRemise(data ?? {}),
        paiement: data?.paiement === 'stripe' ? 'stripe' : 'manuel',
        statutStripe: (data?.statut_stripe as StatutStripe | null) ?? undefined,
        prochaineEcheance: data?.prochaine_echeance ?? undefined,
      };
    },
    async changer(clientId, modif) {
      const champs: Record<string, boolean | number | string | null> = {};
      if (modif.tarifSeance !== undefined) champs.tarif_seance = modif.tarifSeance;
      if (modif.accesAppli !== undefined) champs.acces_appli = modif.accesAppli;
      if (modif.optionNutrition !== undefined) champs.option_nutrition = modif.optionNutrition;
      if (modif.videosMois !== undefined) champs.videos_mois = modif.videosMois;
      // « offre » et « remise » présentes mais vides : on les retire (réglage sur mesure, plus de remise).
      if ('offre' in modif) champs.offre_id = modif.offre?.id ?? null;
      if ('offrePrix' in modif) champs.offre_prix = modif.offrePrix ?? null;
      if ('remise' in modif) {
        champs.remise_type = modif.remise?.type ?? null;
        champs.remise_valeur = modif.remise?.valeur ?? null;
        champs.remise_motif = modif.remise?.motif ?? null;
        champs.remise_jusqu_au = modif.remise?.jusquAu ?? null;
      }
      if (modif.paiement !== undefined) champs.paiement = modif.paiement;
      const { error } = await db.from('clients').update(champs).eq('id', clientId);
      if (error) throw new Error('L’abonnement n’a pas pu être enregistré. Réessaie.');
    },
    async packs(clientId) {
      // Ses packs, et ceux d'une autre personne partagés avec lui.
      const partages = await db.from('packs_partages').select('pack_id').eq('client_id', clientId);
      if (partages.error) throw new Error('Impossible de lire les séances. Vérifie ta connexion.');
      const ids = (partages.data ?? []).map((p) => p.pack_id as string);
      const filtre = ids.length ? `client_id.eq.${clientId},id.in.(${ids.join(',')})` : `client_id.eq.${clientId}`;
      const { data, error } = await db
        .from('packs_seances')
        .select('id, client_id, seances_total, seances_faites, prix, achete_le, clients!packs_seances_client_id_fkey(prenom), packs_partages(client_id, clients!packs_partages_client_id_fkey(prenom))')
        .or(filtre)
        .order('achete_le');
      if (error) throw new Error('Impossible de lire les séances. Vérifie ta connexion.');
      return (data as unknown as Ligne[]).map((l) => versPack(l, clientId));
    },
    async soldePacks() {
      const { data, error } = await db.from('packs_seances').select('id, seances_total, seances_faites');
      if (error) throw new Error('Impossible de lire les séances. Vérifie ta connexion.');
      return new Map((data ?? []).map((p) => [p.id as string, { total: Number(p.seances_total), faites: Number(p.seances_faites) }]));
    },
    async partagerPack(packId, clientId) {
      const { error } = await db.from('packs_partages').insert({ pack_id: packId, client_id: clientId });
      if (error && error.code !== '23505') throw new Error('Le pack n’a pas pu être partagé. Réessaie.');
    },
    async retirerPartage(packId, clientId) {
      const { error } = await db.from('packs_partages').delete().eq('pack_id', packId).eq('client_id', clientId);
      if (error) throw new Error('Le partage n’a pas pu être retiré. Réessaie.');
    },
    async ajouterPack(clientId, pack, prix) {
      const montant = prix ?? pack.prix;
      const { data, error } = await db
        .from('packs_seances')
        .insert({ client_id: clientId, seances_total: pack.seances, prix: montant })
        .select('id')
        .single();
      if (error) throw new Error('Le pack n’a pas pu être ajouté. Réessaie.');
      // Le paiement se fait en dehors de l'appli : une ligne « En attente » que le coach passera à « Payé ».
      const { data: contact } = await db.from('contacts').select('id, prenom').eq('client_id', clientId).limit(1).maybeSingle();
      await db.from('paiements').insert({
        titre: `${pack.libelle}${contact?.prenom ? ` · ${contact.prenom}` : ''}`,
        contact_id: contact?.id ?? null,
        date: jourLocal(new Date()),
        montant,
        statut: 'En attente',
        reference: `pack:${data.id}`,
      });
      return data.id as string;
    },
    async supprimerPack(packId) {
      const { error } = await db.from('packs_seances').delete().eq('id', packId);
      if (error) throw new Error('Le pack n’a pas pu être supprimé. Réessaie.');
      await db.from('paiements').delete().eq('reference', `pack:${packId}`).eq('statut', 'En attente');
    },
    async decompter(clientId, sens) {
      const packs = await depot.packs(clientId);
      const p = sens === 1 ? packADecompter(packs) : aAnnuler(packs);
      if (!p) return;
      // On ne change la ligne que si personne ne l'a décomptée entre-temps.
      const { data, error } = await db
        .from('packs_seances')
        .update({ seances_faites: p.seancesFaites + sens })
        .eq('id', p.id)
        .eq('seances_faites', p.seancesFaites)
        .select('id');
      if (error || !data?.length) throw new Error('Le décompte n’a pas pu être enregistré. Réessaie.');
    },
    async preparerEcheances() {
      const jour = jourLocal(new Date());
      const mois = jour.slice(0, 7);
      const [clients, deja, ecartees] = await Promise.all([
        db
          .from('clients')
          .select(`id, prenom, option_nutrition, offre_prix, remise_type, remise_valeur, remise_motif, remise_jusqu_au, paiement, contacts(id), offres(${CHAMPS_OFFRE})`)
          .eq('acces_appli', true)
          .eq('actif', true),
        db.from('paiements').select('reference').like('reference', `abonnement:${mois}:%`),
        // Lignes du mois supprimées par le coach : elles ne reviennent pas.
        db.from('echeances_ecartees').select('reference').like('reference', `abonnement:${mois}:%`),
      ]);
      if (clients.error || deja.error || ecartees.error) return;
      const faites = new Set([...(deja.data ?? []), ...(ecartees.data ?? [])].map((p) => p.reference as string));
      type Fiche = LigneRemise & {
        id: string;
        prenom: string;
        option_nutrition: boolean;
        offre_prix: number | string | null;
        paiement: string;
        contacts: { id: string }[];
        offres: Parameters<typeof versOffre>[0] | null;
      };
      const fiches = (clients.data as unknown as Fiche[]).map((c) => ({ ...c, offre: c.offres ? versOffre(c.offres) : undefined }));
      const lignes = fiches
        // Stripe crée lui-même la ligne quand le prélèvement passe. Trimestre ou année payés à la main : le coach note le paiement lui-même.
        .filter((c) => c.paiement !== 'stripe' && (!c.offre || c.offre.periodicite === 'mois') && !faites.has(`abonnement:${mois}:${c.id}`))
        .map((c) => {
          const abo: Abonnement = {
            accesAppli: true,
            optionNutrition: c.option_nutrition,
            offre: c.offre,
            offrePrix: c.offre_prix == null ? undefined : Number(c.offre_prix),
            remise: versRemise(c),
          };
          const p = prixAvecRemise(prixAbonnement(abo), abo.remise, jour);
          const remise = remiseEnCours(abo.remise, jour) ? abo.remise : undefined;
          return {
            titre: `Abonnement ${mois.split('-').reverse().join('/')} · ${c.prenom}${p.offert ? ' · offert' : ''}`,
            contact_id: c.contacts[0]?.id ?? null,
            date: `${mois}-01`,
            montant: mensualite(abo, jour),
            // Offert : rien à encaisser, la ligne est réglée d'office.
            statut: p.offert ? 'Payé' : 'En attente',
            notes: remise ? `Prix ${p.prix} €, remise ${p.remise} €${remise.motif ? ` (${remise.motif})` : ''}` : null,
            reference: `abonnement:${mois}:${c.id}`,
          };
        })
        // Sans prix (sur mesure non chiffré) : rien à encaisser chaque mois.
        .filter((l) => l.montant > 0 || l.statut === 'Payé');
      // Une ligne à la fois : si un autre chargement l'a déjà créée, la base refuse le doublon et on passe à la suivante.
      for (const ligne of lignes) await db.from('paiements').insert(ligne);

      // Séances incluses dans une offre mensuelle payée à la main : créditées au début du mois. Côté Stripe, au prélèvement.
      for (const c of fiches) {
        if (!c.offre?.seances || c.offre.periodicite !== 'mois' || c.paiement === 'stripe') continue;
        // Déjà crédité ce mois-ci : la base refuse le doublon.
        await db.from('packs_seances').insert({ client_id: c.id, seances_total: c.offre.seances, prix: 0, achete_le: `${mois}-01`, reference: `offre:${mois}` });
      }
    },
    async demarrerStripe(clientId) {
      const { data, error } = await db.functions.invoke<{ lien?: string; demarre?: boolean; erreur?: string }>('abonnement-stripe', {
        body: { action: 'demarrer', clientId },
      });
      if (error || !data) throw await erreurFonction(error, 'Le paiement Stripe n’a pas pu être préparé. Réessaie.');
      return { lien: data.lien, demarre: !!data.demarre };
    },
    async resilierStripe(clientId) {
      const { error } = await db.functions.invoke('abonnement-stripe', { body: { action: 'resilier', clientId } });
      if (error) throw await erreurFonction(error, 'La résiliation n’a pas pu être enregistrée. Réessaie.');
    },
    async portailStripe() {
      const { data, error } = await db.functions.invoke<{ lien?: string }>('abonnement-stripe', { body: { action: 'portail' } });
      if (error || !data?.lien) throw await erreurFonction(error, 'La page de ton abonnement ne s’ouvre pas pour le moment. Réessaie.');
      return data.lien;
    },
  };
  return depot;
}

export const abonnements: DepotAbonnements = supabase ? enLigne(supabase) : demo;
