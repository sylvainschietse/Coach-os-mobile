import {
  PACKS,
  packADecompter,
  type Abonnement,
  type PackSeances,
  type TypePack,
} from "@/domain/abonnements";
import { nouvelId } from "@/lib/identifiant";

import { supabase } from "./supabase";

export interface DepotAbonnements {
  lire(clientId: string): Promise<Abonnement>;
  /** Réservé au coach : la base refuse qu'un client change son propre abonnement. */
  changer(clientId: string, modif: Partial<Abonnement>): Promise<void>;
  packs(clientId: string): Promise<PackSeances[]>;
  ajouterPack(clientId: string, type: TypePack): Promise<void>;
  /** Décompte une séance faite avec le coach (+1) ou annule le dernier décompte (-1). */
  decompter(clientId: string, sens: 1 | -1): Promise<void>;
}

/** En démo, tout est ouvert et reste en mémoire. */
const memoire = {
  abonnements: new Map<string, Abonnement>(),
  packs: [] as PackSeances[],
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Annuler un décompte : sur le pack le plus récent déjà entamé. */
const aAnnuler = (packs: PackSeances[]) =>
  [...packs]
    .filter((p) => p.seancesFaites > 0)
    .sort((a, b) => b.acheteLe.localeCompare(a.acheteLe))[0];

const demo: DepotAbonnements = {
  async lire(clientId) {
    return (
      memoire.abonnements.get(clientId) ?? {
        accesAppli: true,
        optionNutrition: true,
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
    return memoire.packs.filter((p) => p.clientId === clientId);
  },
  async ajouterPack(clientId, type) {
    memoire.packs.push({
      id: nouvelId(),
      clientId,
      seancesTotal: PACKS[type].seances,
      seancesFaites: 0,
      prix: PACKS[type].prix,
      acheteLe: aujourdhui(),
    });
  },
  async decompter(clientId, sens) {
    const packs = await demo.packs(clientId);
    const p = sens === 1 ? packADecompter(packs) : aAnnuler(packs);
    if (p) p.seancesFaites += sens;
  },
};

type Ligne = {
  id: string;
  client_id: string;
  seances_total: number;
  seances_faites: number;
  prix: number | string | null;
  achete_le: string;
};
const versPack = (l: Ligne): PackSeances => ({
  id: l.id,
  clientId: l.client_id,
  seancesTotal: l.seances_total,
  seancesFaites: l.seances_faites,
  prix: l.prix === null ? undefined : Number(l.prix),
  acheteLe: l.achete_le,
});

function enLigne(db: NonNullable<typeof supabase>): DepotAbonnements {
  const depot: DepotAbonnements = {
    async lire(clientId) {
      const { data, error } = await db
        .from("clients")
        .select("acces_appli, option_nutrition")
        .eq("id", clientId)
        .maybeSingle();
      if (error)
        throw new Error(
          "Impossible de lire l’abonnement. Vérifie ta connexion.",
        );
      return {
        accesAppli: data?.acces_appli ?? false,
        optionNutrition: data?.option_nutrition ?? false,
      };
    },
    async changer(clientId, modif) {
      const champs: Record<string, boolean> = {};
      if (modif.accesAppli !== undefined) champs.acces_appli = modif.accesAppli;
      if (modif.optionNutrition !== undefined)
        champs.option_nutrition = modif.optionNutrition;
      const { error } = await db
        .from("clients")
        .update(champs)
        .eq("id", clientId);
      if (error)
        throw new Error("L’abonnement n’a pas pu être enregistré. Réessaie.");
    },
    async packs(clientId) {
      const { data, error } = await db
        .from("packs_seances")
        .select("id, client_id, seances_total, seances_faites, prix, achete_le")
        .eq("client_id", clientId)
        .order("achete_le");
      if (error)
        throw new Error(
          "Impossible de lire les séances. Vérifie ta connexion.",
        );
      return (data as Ligne[]).map(versPack);
    },
    async ajouterPack(clientId, type) {
      const { error } = await db
        .from("packs_seances")
        .insert({
          client_id: clientId,
          seances_total: PACKS[type].seances,
          prix: PACKS[type].prix,
        });
      if (error) throw new Error("Le pack n’a pas pu être ajouté. Réessaie.");
    },
    async decompter(clientId, sens) {
      const packs = await depot.packs(clientId);
      const p = sens === 1 ? packADecompter(packs) : aAnnuler(packs);
      if (!p) return;
      // On ne change la ligne que si personne ne l'a décomptée entre-temps.
      const { data, error } = await db
        .from("packs_seances")
        .update({ seances_faites: p.seancesFaites + sens })
        .eq("id", p.id)
        .eq("seances_faites", p.seancesFaites)
        .select("id");
      if (error || !data?.length)
        throw new Error("Le décompte n’a pas pu être enregistré. Réessaie.");
    },
  };
  return depot;
}

export const abonnements: DepotAbonnements = supabase
  ? enLigne(supabase)
  : demo;
