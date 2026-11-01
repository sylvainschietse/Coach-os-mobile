// Mode démo : les 95 modèles importés servent de base en lecture seule ; ce que le coach crée ou modifie, les
// suivis, cycles, créneaux et réalisations restent sur l'appareil. Les règles sont celles des fonctions SQL.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ajouterJours, aujourdhuiParis } from '@/domain/entrainement';
import {
  activer,
  annuler,
  bibliotheque,
  corbeille,
  cyclesDuClient,
  deplacer,
  detailProgramme,
  enregistrer,
  espaceClient,
  fusionnerSeance,
  planifier,
  restaurerLigne,
  seanceCoach,
  seancesBibliotheque,
  verifierCorbeille,
  verifierCycle,
  type CycleStocke,
  type Etat,
  type Planification,
  type RealisationStockee,
  type ProgrammeStocke,
  type SeanceStockee,
} from '@/domain/entrainement-etat';

import type { SerieRealisee, Valeurs } from '@/domain/types';

import { CLIENTS_DEMO, COACH_DEMO } from './demo';
import type { Entrainement } from './entrainement';
import { modelesImportes } from './modeles-demo';

const CLE = 'coachos.demo.entrainement';
const MODELE_DEMO = 'rec0a3UFdHP6Mwh7P'; // MOD-SAL-13-4 · Débutant · Prise de muscle · 4 séances

/** Ce qui est gardé sur l'appareil : les modèles modifiés remplacent l'original du même id. */
type Stocke = Omit<Etat, 'programmes' | 'seances'> & { programmes: ProgrammeStocke[]; seances: SeanceStockee[] };

/** Un suivi fictif pour Léa, son cycle en cours lié tel quel à un modèle importé, pour essayer l'espace client. */
/**
 * Trois semaines et demie d'entraînement fictif de Léa sur le cycle 1, pour que le coach voie tout de suite son suivi :
 * séances faites (charges qui montent, ressenti, commentaires), une séance manquée, et les créneaux à venir.
 */
function historiqueDemo(clientId: string, cycleId: string, cycleNom: string, debut: string, jour: string) {
  const base = modelesImportes(COACH_DEMO.id);
  const prog = base.programmes.find((x) => x.id === MODELE_DEMO);
  const seances = base.seances.filter((x) => x.programmeId === MODELE_DEMO).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
  const planifications: Planification[] = [];
  const realisations: RealisationStockee[] = [];
  if (!prog || seances.length === 0) return { planifications, realisations };
  // Jours de la semaine du cycle où Léa s'entraîne ; une séance manquée en semaine 2.
  const JOURS = [0, 1, 3, 5];
  const MANQUEE = '2-3';
  const COMMENTAIRES: Record<string, string> = {
    '1-0': 'Première séance, j’ai pris mes repères sur les charges.',
    '2-1': 'Fatiguée après le travail, j’ai gardé les mêmes charges.',
    '3-0': 'Super séance, le squat passe beaucoup mieux !',
    '3-2': 'Petite gêne à l’épaule droite sur le développé, rien de grave.',
    '4-0': 'J’ai monté toutes les charges, je me sens plus forte.',
  };
  for (let semaine = 1; semaine <= 5; semaine++) {
    JOURS.forEach((decalage, i) => {
      const date = ajouterJours(debut, (semaine - 1) * 7 + decalage);
      const seance = seances[i % seances.length];
      const cle = `${semaine}-${i}`;
      const id = `demo-creneau-${cle}`;
      const faite = date < jour && cle !== MANQUEE;
      const realisationId = faite ? `demo-realisation-${cle}` : undefined;
      if (date > ajouterJours(jour, 7)) return;
      planifications.push({
        id,
        clientId,
        cycleId,
        seanceId: seance.id,
        seanceTitre: seance.titre,
        date,
        statut: faite ? 'Réalisée' : 'Prévue',
        realiseeLe: faite ? `${date}T18:05:00.000Z` : undefined,
        realisationId,
        envoiId: id,
      });
      if (!faite) return;
      const noms: Record<string, string> = {};
      const series: SerieRealisee[] = [];
      seance.blocs
        .flatMap((b) => b.lignes)
        .forEach((l) => {
          noms[l.id] = l.exercice.nom;
          const mesures = l.exercice.mesures ?? [];
          for (let k = 0; k < l.series; k++) {
            // Charge de départ propre à chaque exercice, +2,5 kg par semaine ; la dernière série un peu plus dure.
            const valeurs: Valeurs = mesures.includes('charge')
              ? {
                  charge: 8 + ([...l.exercice.id].reduce((t, c) => t + c.charCodeAt(0), 0) % 5) * 4 + (semaine - 1) * 2.5,
                  repetitions: (l.repetitionsMax ?? 12) - (k === l.series - 1 ? 2 : 0) - (cle === '2-1' ? 1 : 0),
                }
              : mesures.includes('repetitions')
                ? { repetitions: l.repetitionsMax ?? 8 }
                : { duree: (l.dureeS ?? 20) + (semaine - 1) * 5 };
            series.push({ id: `${realisationId}-${l.id}-${k}`, ligneId: l.id, exerciceId: l.exercice.id, index: series.length, valeurs, suggestion: {} });
          }
        });
      realisations.push({
        id: realisationId!,
        clientId,
        seanceId: seance.id,
        cycleId,
        planificationId: id,
        debut: `${date}T17:00:00.000Z`,
        fin: `${date}T18:05:00.000Z`,
        note: cle === '2-1' ? 5 : 6 + ((semaine + i) % 3),
        commentaire: COMMENTAIRES[cle],
        series,
        seanceTitre: seance.titre,
        programmeId: prog.id,
        programmeNom: prog.titre,
        cycleNom,
        noms,
      });
    });
  }
  return { planifications, realisations };
}

function depart(): Stocke {
  const jour = aujourdhuiParis();
  const debut = ajouterJours(jour, -24);
  const suivi = { id: 'suivi-lea', clientId: CLIENTS_DEMO[0].id, debut, dureeMois: 3 };
  const cycle = (ordre: number, nom: string, d: string, statut: CycleStocke['statut'], programmeId?: string): CycleStocke => ({
    id: `cycle-lea-${ordre}`,
    suiviId: suivi.id,
    clientId: suivi.clientId,
    ordre,
    nom,
    debut: d,
    fin: ajouterJours(d, 34),
    statut,
    programmeId,
    mode: programmeId ? 'Modèle' : undefined,
  });
  return {
    programmes: [],
    seances: [],
    suivis: [suivi],
    cycles: [cycle(1, 'Cycle 1 · Fondations', debut, 'Actif', MODELE_DEMO), cycle(2, 'Cycle 2 · Progression', ajouterJours(debut, 35), 'Brouillon')],
    ...historiqueDemo(suivi.clientId, 'cycle-lea-1', 'Cycle 1 · Fondations', debut, jour),
  };
}

async function lire(): Promise<Stocke> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (brut) return JSON.parse(brut) as Stocke;
  } catch {
    // Stockage indisponible : on repart du départ fictif.
  }
  return depart();
}

const sauver = (s: Stocke) => AsyncStorage.setItem(CLE, JSON.stringify(s));

function fusion<T extends { id: string }>(base: T[], modifies: T[]) {
  const ids = new Set(modifies.map((x) => x.id));
  return [...base.filter((x) => !ids.has(x.id)), ...modifies];
}

async function etat(): Promise<Etat & { stocke: Stocke }> {
  const stocke = await lire();
  const base = modelesImportes(COACH_DEMO.id);
  return { ...stocke, programmes: fusion(base.programmes, stocke.programmes), seances: fusion(base.seances, stocke.seances), stocke };
}

const remplacer = <T extends { id: string }>(liste: T[], x: T) => [...liste.filter((y) => y.id !== x.id), x];

export const entrainementDemo: Entrainement = {
  bibliotheque: async (coachId) => bibliotheque(await etat(), coachId),
  programme: async (id) => detailProgramme(await etat(), id),
  async seancesDuProgramme(id) {
    const e = await etat();
    return detailProgramme(e, id).seances.map((s) => seanceCoach(e, s.id).seance);
  },
  seance: async (id) => seanceCoach(await etat(), id),
  seancesBibliotheque: async (coachId) => seancesBibliotheque(await etat(), coachId),

  async enregistrerProgramme(coachId, p, seances = []) {
    const e = await etat();
    const avant = e.programmes.find((x) => x.id === p.id);
    const programmes = remplacer(e.stocke.programmes, { ...avant, ...p, coachId, supprimeLe: avant?.supprimeLe });
    let liste = e.stocke.seances;
    for (const s of seances) liste = remplacer(liste, fusionnerSeance(undefined, { ...s, programmeId: p.id, clientId: p.clientId }, coachId));
    await sauver({ ...e.stocke, programmes, seances: liste });
  },

  async enregistrerSeance(coachId, s) {
    const e = await etat();
    const avant = e.seances.find((x) => x.id === s.id);
    await sauver({ ...e.stocke, seances: remplacer(e.stocke.seances, fusionnerSeance(avant, s, coachId)) });
  },

  async restaurerLigne(seanceId, ligneId) {
    const e = await etat();
    const s = e.seances.find((x) => x.id === seanceId);
    if (!s) throw new Error('Séance introuvable');
    await sauver({ ...e.stocke, seances: remplacer(e.stocke.seances, restaurerLigne(s, ligneId)) });
  },

  corbeille: async (coachId) => corbeille(await etat(), coachId),

  async supprimer(items) {
    const e = await etat();
    verifierCorbeille(e, items);
    const quand = new Date().toISOString();
    let { programmes, seances } = e.stocke;
    for (const it of items) {
      if (it.kind === 'programme') programmes = remplacer(programmes, { ...e.programmes.find((p) => p.id === it.id)!, supprimeLe: quand });
      else seances = remplacer(seances, { ...e.seances.find((s) => s.id === it.id)!, supprimeLe: quand });
    }
    await sauver({ ...e.stocke, programmes, seances });
  },

  async restaurer(it) {
    const e = await etat();
    if (it.kind === 'programme') {
      const p = e.programmes.find((x) => x.id === it.id);
      if (p) await sauver({ ...e.stocke, programmes: remplacer(e.stocke.programmes, { ...p, supprimeLe: undefined }) });
    } else {
      const s = e.seances.find((x) => x.id === it.id);
      if (s) await sauver({ ...e.stocke, seances: remplacer(e.stocke.seances, { ...s, supprimeLe: undefined }) });
    }
  },

  async suivis() {
    const e = await etat();
    const ajoutes: { id: string; prenom: string; nom: string }[] = await AsyncStorage.getItem('coachos.demo.clients-ajoutes')
      .then((b) => JSON.parse(b ?? '[]'))
      .catch(() => []);
    return [...CLIENTS_DEMO, ...ajoutes].map((c) => ({
      clientId: c.id,
      nom: `${c.prenom} ${c.nom}`.trim(),
      suivi: e.suivis.find((s) => s.clientId === c.id),
      cycles: cyclesDuClient(e, c.id),
    }));
  },

  async enregistrerSuivi(_coachId, s) {
    const e = await etat();
    if (!Number.isInteger(s.dureeMois) || s.dureeMois < 1 || s.dureeMois > 24) throw new Error('Durée : un entier de 1 à 24 mois');
    const avant = e.suivis.find((x) => x.clientId === s.clientId);
    await sauver({ ...e.stocke, suivis: remplacer(e.suivis, { ...s, id: avant?.id ?? s.id }) });
  },

  async enregistrerCycle(_coachId, c) {
    const e = await etat();
    const avant = e.cycles.find((x) => x.id === c.id);
    verifierCycle(avant, c);
    const ordre = avant?.ordre ?? e.cycles.filter((x) => x.suiviId === c.suiviId).reduce((m, x) => Math.max(m, x.ordre), 0) + 1;
    await sauver({ ...e.stocke, cycles: remplacer(e.cycles, { ...c, ordre }) });
  },

  async activerCycle(id) {
    const e = await etat();
    await sauver({ ...e.stocke, cycles: activer(e, id) });
  },

  async deplacerCycle(id, sens) {
    const e = await etat();
    await sauver({ ...e.stocke, cycles: deplacer(e, id, sens) });
  },

  async resultats(clientId) {
    const e = await etat();
    const realisations = e.realisations.filter((r) => r.clientId === clientId).sort((a, b) => b.fin.localeCompare(a.fin));
    const prescriptions: Record<string, { series: number; repetitions?: string }> = {};
    for (const s of e.seances) for (const b of s.blocs) for (const l of b.lignes) prescriptions[l.id] = { series: l.series, repetitions: l.repetitions };
    return { realisations, prescriptions };
  },

  espaceClient: async (clientId) => espaceClient(await etat(), clientId),
  calendrier: async (clientId, cycleId) => (await etat()).planifications.filter((p) => p.clientId === clientId && p.cycleId === cycleId),

  async planifier(clientId, d) {
    const e = await etat();
    await sauver({ ...e.stocke, planifications: planifier(e, clientId, d) });
  },

  async annulerCreneau(clientId, id) {
    const e = await etat();
    await sauver({ ...e.stocke, planifications: annuler(e, clientId, id) });
  },

  async enregistrerRealisation(r) {
    const e = await etat();
    const { etat: suite, resultat } = enregistrer(e, r);
    await sauver({ ...e.stocke, ...suite });
    return resultat;
  },
};

export const effacerEntrainementDemo = () => AsyncStorage.removeItem(CLE);
