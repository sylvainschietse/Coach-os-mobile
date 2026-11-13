// Mes relances : réglages du coach (textes, relances coupées, relances à lui) dans la table reglages_relances, et
// création, à l'ouverture de l'Accueil, des relances du coach arrivées aujourd'hui. Table absente : réglages de départ,
// et l'enregistrement le dit.
import { aujourdhuiParis, jourParis } from '@/domain/entrainement';
import { lireReglagesRelances, noterCreees, REGLAGES_RELANCES, relancesACreer, type ReglagesRelances, type Situation } from '@/domain/relances-coach';

import { abonnements } from './abonnements';
import { agenda } from './agenda';
import { crm } from './crm';
import { entrainement } from './entrainement';
import { supabase } from './supabase';

export interface DepotRelancesCoach {
  lire(): Promise<ReglagesRelances>;
  enregistrer(r: ReglagesRelances): Promise<void>;
}

let memoire: ReglagesRelances = REGLAGES_RELANCES;
const abonnes = new Set<() => void>();
export function ecouterRelancesCoach(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}

const demo: DepotRelancesCoach = {
  async lire() {
    return memoire;
  },
  async enregistrer(r) {
    memoire = lireReglagesRelances(r);
  },
};

function enLigne(db: NonNullable<typeof supabase>): DepotRelancesCoach {
  return {
    async lire() {
      const { data, error } = await db.from('reglages_relances').select('reglages').maybeSingle();
      if (error) return REGLAGES_RELANCES;
      return lireReglagesRelances(data?.reglages);
    },
    async enregistrer(r) {
      const { data: coach } = await db.rpc('mon_coach_id');
      const { error } = await db.from('reglages_relances').upsert({ coach_id: coach, reglages: lireReglagesRelances(r), maj_le: new Date().toISOString() });
      if (error)
        throw new Error(
          error.code === '42P01' || /reglages_relances/.test(error.message)
            ? 'Tes relances ne sont pas encore activées sur le serveur : la base doit d’abord être mise à jour.'
            : 'Tes relances n’ont pas pu être enregistrées. Réessaie.',
        );
    },
  };
}

const base: DepotRelancesCoach = supabase ? enLigne(supabase) : demo;

export const relancesCoach = {
  lire: () => base.lire(),
  async enregistrer(r: ReglagesRelances) {
    await base.enregistrer(r);
    abonnes.forEach((fn) => fn());
  },
  /** Crée dans « À faire » les relances du coach arrivées aujourd'hui. Une seule préparation à la fois. */
  preparer(coach: string): Promise<number> {
    if (!enCours) enCours = preparer(coach).finally(() => (enCours = null));
    return enCours;
  },
};
let enCours: Promise<number> | null = null;

async function preparer(coach: string): Promise<number> {
  const reglages = await base.lire();
  const actives = reglages.perso.filter((p) => p.active);
  if (!actives.length) return 0;
  const besoin = (...types: string[]) => actives.some((p) => types.includes(p.declencheur.type));
  const jour = aujourdhuiParis();
  const carnet = await crm.carnet();
  const contacts = carnet.contacts.filter((c) => c.statut !== 'archive');
  const clients = contacts.filter((c) => c.clientId);

  // Rendez-vous de la semaine passée à la semaine prochaine, par client.
  const rdvs = new Map<string, string[]>();
  if (besoin('avant_rdv', 'apres_rdv')) {
    const liste = await agenda.rendezVous(`${jourDecale(jour, -40)}T00:00:00Z`, `${jourDecale(jour, 40)}T23:59:59Z`).catch(() => []);
    for (const r of liste)
      if (!['annule', 'annule_tard', 'refuse'].includes(r.statut))
        for (const p of r.participants) rdvs.set(p.clientId, [...(rdvs.get(p.clientId) ?? []), r.debut]);
  }
  const parClient = await Promise.all(
    clients.map(async (c) => {
      const id = c.clientId!;
      const [resultats, packs] = await Promise.all([
        besoin('sans_seance') ? entrainement.resultats(id).catch(() => null) : null,
        besoin('fin_pack') ? abonnements.packs(id).catch(() => []) : [],
      ]);
      const derniere = resultats?.realisations.map((r) => jourParis(r.fin)).sort().at(-1);
      return { id, derniere, packs: packs.map((p) => ({ id: p.id, restantes: p.seancesTotal - p.seancesFaites })) };
    }),
  );
  const situations: Situation[] = contacts.map((c) => {
    const x = parClient.find((p) => p.id === c.clientId);
    return {
      contact: c,
      derniereSeance: x?.derniere,
      rdvs: c.clientId ? rdvs.get(c.clientId) : undefined,
      packs: x?.packs,
      attentes: carnet.paiements.filter((p) => p.contactId === c.id && p.statut === 'En attente' && p.date).map((p) => ({ id: p.id, date: p.date! })),
    };
  });
  const nouvelles = relancesACreer(reglages, situations, jour, coach);
  if (!nouvelles.length) return 0;
  // D'abord noter ce qui va être créé : si la note échoue, rien n'est créé (jamais deux fois la même relance).
  await base.enregistrer(noterCreees(reglages, nouvelles.map((n) => n.cle), jour));
  await crm.ajouterRelancesPerso(nouvelles.map((n) => ({ contactId: n.contactId, echeance: jour, titre: n.titre, note: n.note })));
  return nouvelles.length;
}

const jourDecale = (j: string, n: number) => new Date(Date.parse(`${j}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
