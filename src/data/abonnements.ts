import { mensualite, PACKS, packADecompter, TARIFS, type Abonnement, type PackSeances, type TypePack } from '@/domain/abonnements';
import { jourLocal } from '@/domain/crm';
import { nouvelId } from '@/lib/identifiant';

import { supabase } from './supabase';

export interface DepotAbonnements {
  lire(clientId: string): Promise<Abonnement>;
  /** Réservé au coach : la base refuse qu'un client change son propre abonnement. */
  changer(clientId: string, modif: Partial<Abonnement>): Promise<void>;
  packs(clientId: string): Promise<PackSeances[]>;
  /** prix : tarif négocié au cas par cas ; sinon le prix du pack. */
  ajouterPack(clientId: string, type: TypePack, prix?: number): Promise<void>;
  /** Pack partagé (couple, duo) : la séance faite par l'un ou l'autre se décompte une fois. */
  partagerPack(packId: string, clientId: string): Promise<void>;
  retirerPartage(packId: string, clientId: string): Promise<void>;
  /** Décompte une séance faite avec le coach (+1) ou annule le dernier décompte (-1). */
  decompter(clientId: string, sens: 1 | -1): Promise<void>;
  /** Pack ajouté par erreur : supprimé avec sa ligne de paiement encore « En attente ». */
  supprimerPack(packId: string): Promise<void>;
  /** Coach : crée la ligne « En attente » du mois pour chaque abonnement appli qui n'en a pas encore. */
  preparerEcheances(): Promise<void>;
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
  async ajouterPack(clientId, type, prix) {
    memoire.packs.push({
      id: nouvelId(),
      clientId,
      seancesTotal: PACKS[type].seances,
      seancesFaites: 0,
      prix: prix ?? PACKS[type].prix,
      acheteLe: aujourdhui(),
    });
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
};

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
      const { data, error } = await db.from('clients').select('acces_appli, option_nutrition, tarif_seance, videos_mois').eq('id', clientId).maybeSingle();
      if (error) throw new Error('Impossible de lire l’abonnement. Vérifie ta connexion.');
      return {
        accesAppli: data?.acces_appli ?? false,
        optionNutrition: data?.option_nutrition ?? false,
        tarifSeance: data?.tarif_seance == null ? TARIFS.seance : Number(data.tarif_seance),
        videosMois: data?.videos_mois ?? 0,
      };
    },
    async changer(clientId, modif) {
      const champs: Record<string, boolean | number> = {};
      if (modif.tarifSeance !== undefined) champs.tarif_seance = modif.tarifSeance;
      if (modif.accesAppli !== undefined) champs.acces_appli = modif.accesAppli;
      if (modif.optionNutrition !== undefined) champs.option_nutrition = modif.optionNutrition;
      if (modif.videosMois !== undefined) champs.videos_mois = modif.videosMois;
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
        .select('id, client_id, seances_total, seances_faites, prix, achete_le, clients(prenom), packs_partages(client_id, clients(prenom))')
        .or(filtre)
        .order('achete_le');
      if (error) throw new Error('Impossible de lire les séances. Vérifie ta connexion.');
      return (data as unknown as Ligne[]).map((l) => versPack(l, clientId));
    },
    async partagerPack(packId, clientId) {
      const { error } = await db.from('packs_partages').insert({ pack_id: packId, client_id: clientId });
      if (error && error.code !== '23505') throw new Error('Le pack n’a pas pu être partagé. Réessaie.');
    },
    async retirerPartage(packId, clientId) {
      const { error } = await db.from('packs_partages').delete().eq('pack_id', packId).eq('client_id', clientId);
      if (error) throw new Error('Le partage n’a pas pu être retiré. Réessaie.');
    },
    async ajouterPack(clientId, type, prix) {
      const montant = prix ?? PACKS[type].prix;
      const { data, error } = await db
        .from('packs_seances')
        .insert({ client_id: clientId, seances_total: PACKS[type].seances, prix: montant })
        .select('id')
        .single();
      if (error) throw new Error('Le pack n’a pas pu être ajouté. Réessaie.');
      // Le paiement se fait en dehors de l'appli : une ligne « En attente » que le coach passera à « Payé ».
      const { data: contact } = await db.from('contacts').select('id, prenom').eq('client_id', clientId).limit(1).maybeSingle();
      await db.from('paiements').insert({
        titre: `${PACKS[type].libelle}${contact?.prenom ? ` · ${contact.prenom}` : ''}`,
        contact_id: contact?.id ?? null,
        date: jourLocal(new Date()),
        montant,
        statut: 'En attente',
        reference: `pack:${data.id}`,
      });
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
      const mois = jourLocal(new Date()).slice(0, 7);
      const [clients, deja, ecartees] = await Promise.all([
        db.from('clients').select('id, prenom, option_nutrition, contacts(id)').eq('acces_appli', true).eq('actif', true),
        db.from('paiements').select('reference').like('reference', `abonnement:${mois}:%`),
        // Lignes du mois supprimées par le coach : elles ne reviennent pas.
        db.from('echeances_ecartees').select('reference').like('reference', `abonnement:${mois}:%`),
      ]);
      if (clients.error || deja.error || ecartees.error) return;
      const faites = new Set([...(deja.data ?? []), ...(ecartees.data ?? [])].map((p) => p.reference as string));
      const lignes = (clients.data as { id: string; prenom: string; option_nutrition: boolean; contacts: { id: string }[] }[])
        .filter((c) => !faites.has(`abonnement:${mois}:${c.id}`))
        .map((c) => ({
          titre: `Abonnement ${mois.split('-').reverse().join('/')} · ${c.prenom}`,
          contact_id: c.contacts[0]?.id ?? null,
          date: `${mois}-01`,
          montant: mensualite({ accesAppli: true, optionNutrition: c.option_nutrition }),
          statut: 'En attente',
          reference: `abonnement:${mois}:${c.id}`,
        }));
      // Une ligne à la fois : si un autre chargement l'a déjà créée, la base refuse le doublon et on passe à la suivante.
      for (const ligne of lignes) await db.from('paiements').insert(ligne);
    },
  };
  return depot;
}

export const abonnements: DepotAbonnements = supabase ? enLigne(supabase) : demo;
