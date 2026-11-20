// Agenda : rendez-vous du coach, réponses du client (dans l'appli ou par le lien du mail), réglages.
// Statuts et comptage (pack, paiement à l'unité) passent par les fonctions de la base, qui tiennent les packs à jour.
// En démo, tout reste en mémoire et rien n'est compté.
import {
  REGLAGES_AGENDA_DEFAUT,
  type MonRendezVous,
  type ReglagesAgenda,
  type RendezVous,
  type StatutRdv,
  type TypeRdv,
} from '@/domain/agenda';
import type { Occupation } from '@/domain/agenda-google';
import { nouvelId } from '@/lib/identifiant';

import { supabase } from './supabase';

export interface NouveauRendezVous {
  type: TypeRdv;
  clientIds: string[];
  /** Un créneau, ou plusieurs pour une série (même client, chaque semaine). */
  creneaux: { debut: string; fin: string }[];
  lieu: string;
  lienVisio?: string;
  note: string;
}

export interface RendezVousParLien {
  prenoms: string;
  coach: string;
  telephone?: string;
  type: TypeRdv;
  debut: string;
  fin: string;
  lieu: string;
  lienVisio?: string;
  statut: StatutRdv;
  annulableJusquAu: string;
}

export type ActionClient = 'confirme' | 'refuse' | 'annule';

/** Connexion du coach à son Google Agenda (sans le jeton, qui reste côté serveur). */
export interface EtatGoogle {
  email: string;
  connecteLe: string;
  synchroLe?: string;
  erreur?: string;
}

export interface DepotAgenda {
  /** Coach : rendez-vous dont le début tombe entre ces deux dates (ISO). Clôture d'abord ceux qui sont terminés. */
  rendezVous(du: string, au: string): Promise<RendezVous[]>;
  creer(r: NouveauRendezVous): Promise<void>;
  /** Contenu, horaire et personnes inscrites. Les personnes ne changent plus une fois la séance comptée. */
  modifier(id: string, r: Omit<NouveauRendezVous, 'creneaux'> & { debut: string; fin: string }): Promise<void>;
  supprimer(id: string): Promise<void>;
  /** compter : pour « absent » et « annulé tardivement », la séance est-elle due ? */
  changerStatut(id: string, statut: StatutRdv, compter?: boolean): Promise<void>;
  reglages(): Promise<ReglagesAgenda>;
  enregistrerReglages(r: ReglagesAgenda): Promise<void>;
  // Client connecté
  /** clientId ne sert qu'en démo : en ligne, la base sait qui est connecté. */
  mesRendezVous(clientId: string): Promise<MonRendezVous[]>;
  repondre(id: string, action: ActionClient): Promise<void>;
  // Lien du mail, sans compte
  parLien(jeton: string): Promise<RendezVousParLien | null>;
  repondreParLien(jeton: string, action: ActionClient): Promise<void>;
  // Google Agenda du coach
  /** Événements perso du Google Agenda (hors rendez-vous de l'app) qui commencent avant `au` et finissent après `du`. */
  occupations(du: string, au: string): Promise<Occupation[]>;
  google(): Promise<EtatGoogle | null>;
  /** Adresse de la page de connexion Google ; `retour` : page de l'app où revenir ensuite. */
  connecterGoogle(retour: string): Promise<string>;
  synchroniserGoogle(): Promise<void>;
  deconnecterGoogle(): Promise<void>;
}

const message = (e: { message?: string } | null, defaut: string) => {
  const m = e?.message ?? '';
  // Les refus écrits par la base (« Trop tard pour annuler en ligne… ») sont déjà en français.
  return /^[A-ZÀ-Ý][^:]*[a-zé ]/.test(m) && !/violates|permission|relation|function|column|syntax/i.test(m) ? m : defaut;
};

// ——— Démo ———

const memoire = {
  rdv: [] as RendezVous[],
  reglages: { ...REGLAGES_AGENDA_DEFAUT },
  prenoms: new Map<string, { prenom: string; nom: string }>(),
};

/** Démo : quelques rendez-vous autour d'aujourd'hui (Léa, Thomas, et une séance en duo), une seule fois. */
function semerDemo() {
  if (memoire.rdv.length) return;
  const lea = { clientId: 'client-lea', prenom: 'Léa', nom: 'Martin', decompte: false };
  const thomas = { clientId: 'client-thomas', prenom: 'Thomas', nom: 'Bernard', decompte: false };
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const a = (jour: number, h: number, m: number, duree = 60) => {
    const d = new Date(base);
    d.setDate(d.getDate() + jour);
    d.setHours(h, m);
    return { debut: d.toISOString(), fin: new Date(d.getTime() + duree * 60_000).toISOString() };
  };
  const exemples: [ReturnType<typeof a>, TypeRdv, StatutRdv, (typeof lea)[], string][] = [
    [a(-5, 18, 0), 'seance', 'realise', [lea], 'Salle Fitness Park'],
    [a(0, 12, 15), 'seance', 'confirme', [thomas], 'Salle Fitness Park'],
    [a(1, 18, 0), 'seance', 'confirme', [lea], 'Salle Fitness Park'],
    [a(2, 7, 30, 45), 'visio', 'confirme', [thomas], ''],
    [a(3, 12, 30), 'seance', 'propose', [lea, thomas], 'Parc de la Tête d’Or'],
    [a(4, 18, 0), 'seance', 'annule', [thomas], 'Salle Fitness Park'],
    [a(5, 9, 0, 30), 'appel', 'confirme', [lea], ''],
    [a(8, 18, 0), 'seance', 'propose', [lea], 'Salle Fitness Park'],
    [a(10, 12, 30), 'seance', 'propose', [lea, thomas], 'Parc de la Tête d’Or'],
  ];
  memoire.rdv = exemples.map(([c, type, statut, qui, lieu]) => ({
    id: nouvelId(),
    type,
    ...c,
    lieu,
    lienVisio: type === 'visio' ? 'https://meet.google.com/abc-defg-hij' : undefined,
    note: '',
    statut,
    compte: statut === 'realise',
    participants: qui.map((p) => ({ ...p })),
  }));
}

const demo: DepotAgenda = {
  async rendezVous(du, au) {
    semerDemo();
    const maintenant = Date.now();
    for (const r of memoire.rdv) if ((r.statut === 'propose' || r.statut === 'confirme') && new Date(r.fin).getTime() <= maintenant) r.statut = 'realise';
    return memoire.rdv.filter((r) => r.debut >= du && r.debut < au).sort((a, b) => a.debut.localeCompare(b.debut));
  },
  async creer(r) {
    const serieId = r.creneaux.length > 1 ? nouvelId() : undefined;
    for (const c of r.creneaux)
      memoire.rdv.push({
        id: nouvelId(),
        type: r.type,
        debut: c.debut,
        fin: c.fin,
        lieu: r.lieu,
        lienVisio: r.lienVisio || undefined,
        note: r.note,
        statut: 'propose',
        compte: false,
        serieId,
        participants: r.clientIds.map((id) => ({ clientId: id, ...(memoire.prenoms.get(id) ?? { prenom: 'Client', nom: '' }), decompte: false })),
      });
  },
  async modifier(id, r) {
    const x = memoire.rdv.find((y) => y.id === id);
    if (!x) return;
    const deplace = x.debut !== r.debut || x.fin !== r.fin;
    Object.assign(x, { type: r.type, debut: r.debut, fin: r.fin, lieu: r.lieu, lienVisio: r.lienVisio || undefined, note: r.note });
    if (deplace && (x.statut === 'confirme' || x.statut === 'refuse')) x.statut = 'propose';
    if (!x.compte)
      x.participants = r.clientIds.map((c) => ({ clientId: c, ...(memoire.prenoms.get(c) ?? { prenom: 'Client', nom: '' }), decompte: false }));
  },
  async supprimer(id) {
    memoire.rdv = memoire.rdv.filter((r) => r.id !== id);
  },
  async changerStatut(id, statut) {
    const x = memoire.rdv.find((y) => y.id === id);
    if (x) x.statut = statut;
  },
  async reglages() {
    return memoire.reglages;
  },
  async enregistrerReglages(r) {
    memoire.reglages = { ...r };
  },
  async mesRendezVous(clientId) {
    semerDemo();
    return memoire.rdv
      .filter((r) => r.participants.some((p) => p.clientId === clientId))
      .map((r) => ({
        id: r.id,
        type: r.type,
        debut: r.debut,
        fin: r.fin,
        lieu: r.lieu,
        lienVisio: r.lienVisio,
        statut: r.statut,
        avec: r.participants.filter((p) => p.clientId !== clientId).map((p) => p.prenom).join(', ') || undefined,
        annulableJusquAu: new Date(new Date(r.debut).getTime() - memoire.reglages.delaiAnnulationHeures * 3_600_000).toISOString(),
      }));
  },
  async repondre(id, action) {
    const x = memoire.rdv.find((y) => y.id === id);
    if (x) x.statut = action;
  },
  async parLien() {
    return null;
  },
  async repondreParLien() {},
  async occupations(du, au) {
    // Démo : deux créneaux perso, pour montrer l'affichage.
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const a = (jour: number, h: number, duree: number, titre: string) => {
      const d = new Date(base);
      d.setDate(d.getDate() + jour);
      d.setHours(h);
      return { id: `demo-${jour}-${h}`, debut: d.toISOString(), fin: new Date(d.getTime() + duree * 3_600_000).toISOString(), titre, journee: false };
    };
    return [a(0, 9, 1, 'Banque'), a(1, 10, 1, 'Dentiste'), a(3, 17, 2, 'École des enfants')].filter((o) => o.debut < au && o.fin > du);
  },
  async google() {
    return null;
  },
  async connecterGoogle() {
    throw new Error('La connexion à Google Agenda se fait avec un compte en ligne, pas en démo.');
  },
  async synchroniserGoogle() {},
  async deconnecterGoogle() {},
};

/** Démo : les prénoms des clients, pour afficher les rendez-vous créés. */
export function retenirClientsDemo(clients: { id: string; prenom: string; nom: string }[]) {
  for (const c of clients) memoire.prenoms.set(c.id, { prenom: c.prenom, nom: c.nom });
}

// ——— Supabase ———

type LigneRdv = {
  id: string;
  type: TypeRdv;
  debut: string;
  fin: string;
  lieu: string;
  lien_visio: string | null;
  note: string;
  statut: StatutRdv;
  compte: boolean;
  serie_id: string | null;
  rendez_vous_participants: {
    client_id: string;
    pack_id: string | null;
    decompte: boolean;
    montant: number | string | null;
    clients: { prenom: string; nom: string } | null;
  }[];
};

const versRdv = (l: LigneRdv): RendezVous => ({
  id: l.id,
  type: l.type,
  debut: l.debut,
  fin: l.fin,
  lieu: l.lieu,
  lienVisio: l.lien_visio ?? undefined,
  note: l.note,
  statut: l.statut,
  compte: l.compte,
  serieId: l.serie_id ?? undefined,
  participants: l.rendez_vous_participants
    .map((p) => ({
      clientId: p.client_id,
      prenom: p.clients?.prenom ?? '',
      nom: p.clients?.nom ?? '',
      packId: p.pack_id ?? undefined,
      decompte: p.decompte,
      montant: p.montant === null ? undefined : Number(p.montant),
    }))
    .sort((a, b) => a.prenom.localeCompare(b.prenom)),
});

const COLONNES_RDV =
  'id, type, debut, fin, lieu, lien_visio, note, statut, compte, serie_id, rendez_vous_participants(client_id, pack_id, decompte, montant, clients(prenom, nom))';

function enLigne(db: NonNullable<typeof supabase>): DepotAgenda {
  /** Après un changement, copie tout de suite dans Google Agenda (lien Meet compris) ; sinon la tâche planifiée s'en charge. */
  const versGoogle = () => {
    void db.rpc('mon_google_agenda').then(({ data }) => {
      if ((data as unknown[] | null)?.length) void db.functions.invoke('agenda-google', { body: { action: 'synchroniser' } }).catch(() => undefined);
    });
  };
  const depot: DepotAgenda = {
    async rendezVous(du, au) {
      await db.rpc('cloturer_mes_rendez_vous');
      const { data, error } = await db.from('rendez_vous').select(COLONNES_RDV).gte('debut', du).lt('debut', au).order('debut');
      if (error) throw new Error('Impossible de lire l’agenda. Vérifie ta connexion.');
      return (data as unknown as LigneRdv[]).map(versRdv);
    },
    async creer(r) {
      const serieId = r.creneaux.length > 1 ? nouvelId() : null;
      const lignes = r.creneaux.map((c) => ({
        id: nouvelId(),
        type: r.type,
        debut: c.debut,
        fin: c.fin,
        lieu: r.lieu.trim(),
        lien_visio: r.lienVisio?.trim() || null,
        note: r.note.trim(),
        serie_id: serieId,
      }));
      const { error } = await db.from('rendez_vous').insert(lignes);
      if (error) throw new Error('Le rendez-vous n’a pas pu être enregistré. Réessaie.');
      const participants = lignes.flatMap((l) => r.clientIds.map((c) => ({ rendez_vous_id: l.id, client_id: c })));
      const p = await db.from('rendez_vous_participants').insert(participants);
      if (p.error) {
        // Sans personne inscrite, le rendez-vous n'a pas de sens : on le retire.
        await db.from('rendez_vous').delete().in('id', lignes.map((l) => l.id));
        throw new Error('Les clients n’ont pas pu être ajoutés au rendez-vous. Réessaie.');
      }
      versGoogle();
    },
    async modifier(id, r) {
      const { error } = await db
        .from('rendez_vous')
        .update({ type: r.type, debut: r.debut, fin: r.fin, lieu: r.lieu.trim(), lien_visio: r.lienVisio?.trim() || null, note: r.note.trim() })
        .eq('id', id);
      if (error) throw new Error('Le rendez-vous n’a pas pu être modifié. Réessaie.');
      const { data } = await db.from('rendez_vous_participants').select('client_id').eq('rendez_vous_id', id);
      const avant = new Set((data ?? []).map((p) => p.client_id as string));
      const ajout = r.clientIds.filter((c) => !avant.has(c));
      const retrait = [...avant].filter((c) => !r.clientIds.includes(c));
      if (ajout.length) {
        const a = await db.from('rendez_vous_participants').insert(ajout.map((c) => ({ rendez_vous_id: id, client_id: c })));
        if (a.error) throw new Error('Impossible de changer les personnes d’une séance déjà comptée.');
      }
      if (retrait.length) {
        const s = await db.from('rendez_vous_participants').delete().eq('rendez_vous_id', id).in('client_id', retrait).select('client_id');
        if (s.error || (s.data ?? []).length !== retrait.length) throw new Error('Impossible de changer les personnes d’une séance déjà comptée.');
      }
      versGoogle();
    },
    async supprimer(id) {
      const { data, error } = await db.from('rendez_vous').delete().eq('id', id).select('id');
      if (error) throw new Error('Le rendez-vous n’a pas pu être supprimé. Réessaie.');
      if (!data?.length) throw new Error('Cette séance a déjà été comptée : passe-la d’abord en « Annulé ».');
      versGoogle();
    },
    async changerStatut(id, statut, compter = true) {
      const { error } = await db.rpc('changer_statut_rendez_vous', { p_id: id, p_statut: statut, p_compter: compter });
      if (error) throw new Error(message(error, 'Le statut n’a pas pu être changé. Réessaie.'));
      versGoogle();
    },
    async reglages() {
      const { data, error } = await db.from('reglages_agenda').select('*').maybeSingle();
      if (error) throw new Error('Impossible de lire les réglages de l’agenda.');
      if (!data) return { ...REGLAGES_AGENDA_DEFAUT };
      return {
        dureeMinutes: data.duree_minutes,
        tamponMinutes: data.tampon_minutes,
        delaiAnnulationHeures: data.delai_annulation_heures,
        rappelHeures: data.rappel_heures,
        rappelCourt: data.rappel_court,
        seuilFinPack: data.seuil_fin_pack,
        inactiviteJours: data.inactivite_jours,
        lieuDefaut: data.lieu_defaut,
      };
    },
    async enregistrerReglages(r) {
      const { data: coach } = await db.rpc('mon_coach_id');
      const { error } = await db.from('reglages_agenda').upsert({
        coach_id: coach,
        duree_minutes: r.dureeMinutes,
        tampon_minutes: r.tamponMinutes,
        delai_annulation_heures: r.delaiAnnulationHeures,
        rappel_heures: r.rappelHeures,
        rappel_court: r.rappelCourt,
        seuil_fin_pack: r.seuilFinPack,
        inactivite_jours: r.inactiviteJours,
        lieu_defaut: r.lieuDefaut.trim(),
      });
      if (error) throw new Error('Réglages non enregistrés : vérifie les valeurs et réessaie.');
    },
    async mesRendezVous() {
      const { data, error } = await db.rpc('mes_rendez_vous');
      if (error) throw new Error('Impossible de lire tes rendez-vous. Vérifie ta connexion.');
      return (
        data as {
          id: string;
          type: TypeRdv;
          debut: string;
          fin: string;
          lieu: string;
          lien_visio: string | null;
          statut: StatutRdv;
          avec: string | null;
          annulable_jusqu_au: string;
        }[]
      ).map((r) => ({
        id: r.id,
        type: r.type,
        debut: r.debut,
        fin: r.fin,
        lieu: r.lieu,
        lienVisio: r.lien_visio ?? undefined,
        statut: r.statut,
        avec: r.avec ?? undefined,
        annulableJusquAu: r.annulable_jusqu_au,
      }));
    },
    async repondre(id, action) {
      const { error } = await db.rpc('repondre_rendez_vous', { p_id: id, p_action: action });
      if (error) throw new Error(message(error, 'Réponse non enregistrée. Réessaie.'));
    },
    async parLien(jeton) {
      const { data, error } = await db.rpc('rendez_vous_par_jeton', { p_jeton: jeton });
      if (error) throw new Error('Lien illisible. Vérifie qu’il est complet.');
      const r = (data as Record<string, string | null>[])[0];
      if (!r) return null;
      return {
        prenoms: r.prenoms ?? '',
        coach: r.coach ?? '',
        telephone: r.telephone ?? undefined,
        type: r.type as TypeRdv,
        debut: r.debut!,
        fin: r.fin!,
        lieu: r.lieu ?? '',
        lienVisio: r.lien_visio ?? undefined,
        statut: r.statut as StatutRdv,
        annulableJusquAu: r.annulable_jusqu_au!,
      };
    },
    async repondreParLien(jeton, action) {
      const { error } = await db.rpc('repondre_par_jeton', { p_jeton: jeton, p_action: action });
      if (error) throw new Error(message(error, 'Réponse non enregistrée. Réessaie.'));
    },
    async occupations(du, au) {
      const { data, error } = await db.from('google_occupations').select('id, debut, fin, titre, journee').lt('debut', au).gt('fin', du).order('debut');
      if (error) return [];
      return data as Occupation[];
    },
    async google() {
      const { data, error } = await db.rpc('mon_google_agenda');
      if (error) return null;
      const r = (data as { email: string; connecte_le: string; synchro_le: string | null; erreur: string | null }[])[0];
      return r ? { email: r.email, connecteLe: r.connecte_le, synchroLe: r.synchro_le ?? undefined, erreur: r.erreur ?? undefined } : null;
    },
    async connecterGoogle(retour) {
      const { data, error } = await db.functions.invoke<{ url?: string; erreur?: string }>('agenda-google', { body: { action: 'connecter', retour } });
      if (error || !data?.url) throw new Error(data?.erreur ?? 'La connexion à Google n’est pas disponible pour le moment.');
      return data.url;
    },
    async synchroniserGoogle() {
      const { data, error } = await db.functions.invoke<{ erreur?: string }>('agenda-google', { body: { action: 'synchroniser' } });
      if (error) throw new Error('La synchro Google n’a pas pu se faire. Réessaie plus tard.');
      if (data?.erreur) throw new Error(data.erreur);
    },
    async deconnecterGoogle() {
      const { error } = await db.functions.invoke('agenda-google', { body: { action: 'deconnecter' } });
      if (error) throw new Error('La déconnexion n’a pas pu se faire. Réessaie.');
    },
  };
  return depot;
}

export const agenda: DepotAgenda = supabase ? enLigne(supabase) : demo;
