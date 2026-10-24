// Entraînement du lot 3 : ce que les écrans lisent et les règles d'origine, sans base de données.
// Le mode démo applique ici les mêmes contrôles que les fonctions SQL (activer_cycle, planifier_seance,
// enregistrer_realisation, mettre_a_la_corbeille) pour qu'un essai sur l'appareil se comporte comme la vraie app.
import { appliquerCycle, aujourdhuiParis, avancementCycle, finSuivi, jourParis, type StatutCycle } from './entrainement';
import type { LignePrescription, Programme, Seance, SerieRealisee, Valeurs } from './types';

export type ModeLien = 'Modèle' | 'Copie personnalisée';

/** Une carte de la bibliothèque (AirtableLibrary). */
export interface ModeleResume {
  id: string;
  titre: string;
  niveau?: string;
  objectif?: string;
  seancesParSemaine?: number;
  dureeSemaines?: number;
  environnement?: string;
  statut?: string;
  nbSeances: number;
  seanceSeule: boolean;
}

/** Une ligne « J1 · séance » du détail d'un programme. */
export interface SeanceResumeCoach {
  id: string;
  titre: string;
  ordre?: number;
  dominante?: string;
  dureeMin?: number;
  objectif?: string;
  nbExercices: number;
}

export type EnTeteProgramme = Omit<Programme, 'seances'>;

export interface ProgrammeDetail {
  programme: EnTeteProgramme;
  seances: SeanceResumeCoach[];
}

/** Une ligne retirée d'une séance : jamais effacée, restaurable. */
export interface Retrait {
  blocId: string;
  ligne: LignePrescription;
}

export interface SeanceCoach {
  seance: Seance;
  programme: { id: string; titre: string; clientId?: string; seanceSeule: boolean };
  retraits: Retrait[];
}

export interface ElementCorbeille {
  kind: 'programme' | 'seance';
  id: string;
  nom: string;
}

export interface CycleClient {
  id: string;
  suiviId: string;
  clientId: string;
  ordre: number;
  nom: string;
  objectif?: string;
  debut: string;
  fin: string;
  statut: StatutCycle;
  programmeId?: string;
  programmeNom?: string;
  mode?: ModeLien;
  nbResultats: number;
}

export interface Suivi {
  id: string;
  clientId: string;
  debut: string;
  dureeMois: number;
}

export interface SuiviClient {
  clientId: string;
  nom: string;
  suivi?: Suivi;
  cycles: CycleClient[];
}

export type StatutCreneau = 'Prévue' | 'Réalisée' | 'Annulée';

export interface Planification {
  id: string;
  clientId: string;
  cycleId: string;
  seanceId: string;
  seanceTitre: string;
  date: string;
  heure?: string;
  statut: StatutCreneau;
  realiseeLe?: string;
  realisationId?: string;
  envoiId: string;
}

export interface DemandeCreneau {
  id?: string;
  cycleId: string;
  seanceId: string;
  date: string;
  heure?: string;
  envoiId: string;
}

/** Réalisation d'une séance du cycle (logSeance) : l'id vient du téléphone, renvoyé deux fois il ne crée rien. */
export interface RealisationCycle {
  id: string;
  clientId: string;
  seanceId: string;
  cycleId?: string;
  planificationId?: string;
  debut: string;
  fin: string;
  note?: number;
  commentaire?: string;
  series: SerieRealisee[];
}

/** Une réalisation lue, avec les libellés figés au moment de l'enregistrement. */
export interface RealisationLue extends RealisationCycle {
  seanceTitre: string;
  programmeId?: string;
  programmeNom?: string;
  cycleNom?: string;
  noms: Record<string, string>;
}

export interface EspaceEntrainement {
  suivi?: Suivi & { fin: string };
  /** Cycles visibles du client : Actif et Terminé seulement. */
  planning: CycleClient[];
  cycle?: CycleClient & { etat: 'a_venir' | 'en_cours' | 'depasse'; semaine: number | null; nbSemaines: number };
  programme?: EnTeteProgramme;
  seances: Seance[];
  realisations: RealisationLue[];
}

export class RefusEntrainement extends Error {}
const refus = (m: string): never => {
  throw new RefusEntrainement(m);
};

// ---------- État complet (mode démo) ----------

export type ProgrammeStocke = EnTeteProgramme & { coachId: string; supprimeLe?: string };
export type SeanceStockee = Seance & { coachId: string; supprimeLe?: string; retraits?: Retrait[] };
export type CycleStocke = Omit<CycleClient, 'programmeNom' | 'nbResultats'>;
export interface RealisationStockee extends RealisationCycle {
  seanceTitre: string;
  programmeId?: string;
  programmeNom?: string;
  cycleNom?: string;
  noms: Record<string, string>;
}

export interface Etat {
  programmes: ProgrammeStocke[];
  seances: SeanceStockee[];
  suivis: Suivi[];
  cycles: CycleStocke[];
  planifications: Planification[];
  realisations: RealisationStockee[];
}

const nbExercices = (s: Seance) => s.blocs.reduce((n, b) => n + b.lignes.length, 0);
const visibles = (e: Etat, programmeId: string) =>
  e.seances.filter((s) => s.programmeId === programmeId && !s.supprimeLe).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.titre.localeCompare(b.titre));

export function bibliotheque(e: Etat, coachId: string): ModeleResume[] {
  return e.programmes
    .filter((p) => p.coachId === coachId && !p.clientId && !p.supprimeLe)
    .map((p) => ({
      id: p.id,
      titre: p.titre,
      niveau: p.niveau,
      objectif: p.objectif,
      seancesParSemaine: p.seancesParSemaine,
      dureeSemaines: p.dureeSemaines,
      environnement: p.environnement,
      statut: p.statut,
      nbSeances: visibles(e, p.id).length,
      seanceSeule: !!p.seanceSeule,
    }))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}

const sansStockage = <T extends { coachId: string; supprimeLe?: string }>({ coachId: _c, supprimeLe: _s, ...reste }: T) => reste;

export function detailProgramme(e: Etat, id: string): ProgrammeDetail {
  const p = e.programmes.find((x) => x.id === id) ?? refus('Programme introuvable');
  return {
    programme: sansStockage(p),
    seances: visibles(e, id).map((s) => ({
      id: s.id,
      titre: s.titre,
      ordre: s.ordre,
      dominante: s.dominante,
      dureeMin: s.dureeMin,
      objectif: s.objectif,
      nbExercices: nbExercices(s),
    })),
  };
}

export function seanceCoach(e: Etat, id: string): SeanceCoach {
  const s = e.seances.find((x) => x.id === id && !x.supprimeLe) ?? refus('Séance introuvable');
  const p = e.programmes.find((x) => x.id === s.programmeId);
  const { coachId: _c, supprimeLe: _s, retraits, ...seance } = s;
  return {
    seance,
    programme: { id: p?.id ?? '', titre: p?.titre ?? 'Séance', clientId: p?.clientId, seanceSeule: !!p?.seanceSeule },
    retraits: retraits ?? [],
  };
}

/** enregistrer_seance : ce qui disparaît de la séance est retiré, pas effacé ; ce qui revient sort des retraits. */
export function fusionnerSeance(avant: SeanceStockee | undefined, s: Seance, coachId: string): SeanceStockee {
  const presentes = new Set(s.blocs.flatMap((b) => b.lignes.map((l) => l.id)));
  const anciens = (avant?.retraits ?? []).filter((r) => !presentes.has(r.ligne.id));
  const nouveaux: Retrait[] = (avant?.blocs ?? []).flatMap((b) => b.lignes.filter((l) => !presentes.has(l.id)).map((ligne) => ({ blocId: b.id, ligne })));
  return { ...s, coachId, supprimeLe: avant?.supprimeLe, retraits: [...anciens, ...nouveaux] };
}

export function restaurerLigne(s: SeanceStockee, ligneId: string): SeanceStockee {
  const r = (s.retraits ?? []).find((x) => x.ligne.id === ligneId) ?? refus('Exercice déjà restauré');
  const bloc = s.blocs.find((b) => b.id === r.blocId);
  const blocs = bloc
    ? s.blocs.map((b) => (b.id === r.blocId ? { ...b, lignes: [...b.lignes, r.ligne] } : b))
    : [...s.blocs, { id: r.blocId, titre: 'Sans bloc', lignes: [r.ligne] }];
  return { ...s, blocs, retraits: (s.retraits ?? []).filter((x) => x !== r) };
}

/** mettre_a_la_corbeille : toute la sélection est vérifiée avant d'écrire. */
export function verifierCorbeille(e: Etat, items: Pick<ElementCorbeille, 'kind' | 'id'>[]) {
  for (const it of items) {
    const s = it.kind === 'seance' ? e.seances.find((x) => x.id === it.id) : undefined;
    const progId = it.kind === 'programme' ? it.id : s?.programmeId;
    const p = e.programmes.find((x) => x.id === progId);
    const nom = it.kind === 'programme' ? p?.titre : s?.titre;
    if (!nom) refus('Élément introuvable');
    const lie =
      e.cycles.some((c) => c.programmeId === progId) ||
      e.realisations.some((r) => e.seances.find((x) => x.id === r.seanceId)?.programmeId === progId) ||
      !!p?.clientId;
    if (lie) refus(`${nom} : Ce programme est lié à un dossier client ou à des résultats. Il ne peut pas être supprimé.`);
  }
}

export function corbeille(e: Etat, coachId: string): ElementCorbeille[] {
  return [
    ...e.programmes.filter((p) => p.coachId === coachId && p.supprimeLe).map((p) => ({ kind: 'programme' as const, id: p.id, nom: p.titre, quand: p.supprimeLe! })),
    ...e.seances.filter((s) => s.coachId === coachId && s.supprimeLe).map((s) => ({ kind: 'seance' as const, id: s.id, nom: s.titre, quand: s.supprimeLe! })),
  ]
    .sort((a, b) => b.quand.localeCompare(a.quand))
    .map(({ quand: _q, ...x }) => x);
}

// ---------- Cycles clients ----------

export function cyclesDuClient(e: Etat, clientId: string): CycleClient[] {
  return e.cycles
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => ({
      ...c,
      programmeNom: e.programmes.find((p) => p.id === c.programmeId)?.titre,
      nbResultats: e.realisations.filter((r) => r.cycleId === c.id).length,
    }));
}

/** saveCycle : l'activation ne passe jamais par l'enregistrement, et un cycle terminé garde son programme. */
export function verifierCycle(avant: CycleStocke | undefined, c: CycleStocke) {
  if (!c.nom.trim()) refus('Nom requis');
  if (!c.debut || !c.fin) refus('Dates requises');
  if (c.fin < c.debut) refus('La fin doit suivre le début');
  if (c.statut === 'Actif' && avant?.statut !== 'Actif') refus('Utilisez « Activer » pour rendre un cycle actif');
  if (c.statut === 'Actif' && !c.programmeId) refus('Un cycle actif doit garder un programme');
  if (avant?.statut === 'Terminé' && avant.programmeId !== c.programmeId) refus('Cycle terminé : programme figé');
}

/** activer_cycle : Prêt, programme lié, aujourd'hui (Paris) dans les dates ; l'ancien cycle actif passe Terminé. */
export function activer(e: Etat, id: string, jour = aujourdhuiParis()): CycleStocke[] {
  const c = e.cycles.find((x) => x.id === id) ?? refus('Cycle introuvable');
  if (c.statut === 'Actif') return e.cycles;
  if (c.statut !== 'Prêt') refus(`Activation refusée : le cycle est « ${c.statut} ». Passez-le d'abord en « Prêt ».`);
  if (jour < c.debut || jour > c.fin) {
    const f = (d: string) => d.split('-').reverse().join('/');
    refus(`Activation refusée : aujourd'hui (${f(jour)}, Paris) est hors du cycle (${f(c.debut)} → ${f(c.fin)}). Replanifiez les dates ou attendez le début.`);
  }
  if (!c.programmeId) refus('Activation refusée : aucun programme lié.');
  return e.cycles.map((x) =>
    x.id === id ? { ...x, statut: 'Actif' } : x.suiviId === c.suiviId && x.statut === 'Actif' ? { ...x, statut: 'Terminé' } : x,
  );
}

export function deplacer(e: Etat, id: string, sens: 1 | -1): CycleStocke[] {
  const c = e.cycles.find((x) => x.id === id) ?? refus('Cycle introuvable');
  const ids = e.cycles.filter((x) => x.suiviId === c.suiviId).sort((a, b) => a.ordre - b.ordre).map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + sens;
  if (j < 0 || j >= ids.length) return e.cycles;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return e.cycles.map((x) => (x.suiviId === c.suiviId ? { ...x, ordre: ids.indexOf(x.id) + 1 } : x));
}

// ---------- Côté client ----------

export function espaceClient(e: Etat, clientId: string, jour = aujourdhuiParis()): EspaceEntrainement {
  const suivi = e.suivis.find((s) => s.clientId === clientId);
  const planning = cyclesDuClient(e, clientId).filter((c) => c.statut === 'Actif' || c.statut === 'Terminé');
  const actif = planning.find((c) => c.statut === 'Actif');
  const p = actif?.programmeId ? e.programmes.find((x) => x.id === actif.programmeId) : undefined;
  return {
    suivi: suivi && { ...suivi, fin: finSuivi(suivi.debut, suivi.dureeMois) },
    planning,
    cycle: actif && { ...actif, ...avancementCycle(actif, jour) },
    programme: p && sansStockage(p),
    seances: p ? visibles(e, p.id).map(({ coachId: _c, supprimeLe: _s, retraits: _r, ...s }) => s) : [],
    realisations: e.realisations.filter((r) => r.clientId === clientId).sort((a, b) => b.fin.localeCompare(a.fin)),
  };
}

const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** planifier_seance : créneau à venir, dans les dates du cycle actif, séance de son programme, pas en double. */
export function planifier(e: Etat, clientId: string, d: DemandeCreneau, jour = aujourdhuiParis()): Planification[] {
  const deja = e.planifications.find((x) => x.envoiId === d.envoiId && x.clientId === clientId);
  if (deja) return e.planifications;
  const c = e.cycles.find((x) => x.id === d.cycleId && x.clientId === clientId) ?? refus('Cycle hors de votre dossier');
  const ancien = d.id ? e.planifications.find((x) => x.id === d.id && x.clientId === clientId && x.cycleId === c.id) ?? refus('Créneau hors de votre dossier') : undefined;
  if (ancien?.statut === 'Réalisée') refus('Une séance réalisée reste conservée dans votre historique');
  if (c.statut !== 'Actif' || !c.programmeId) refus('Le coach doit activer ce cycle avant de planifier');
  if (!d.date || d.date < jour || d.date < c.debut || d.date > c.fin || !d.envoiId) refus('Choisissez une date à venir dans les dates du cycle actif');
  if (d.heure && !HEURE.test(d.heure)) refus('Heure invalide');
  const s = e.seances.find((x) => x.id === d.seanceId && !x.supprimeLe);
  if (!s || s.programmeId !== c.programmeId) refus('Séance hors de votre programme actif');
  const doublon = e.planifications.some(
    (x) => x.clientId === clientId && x.cycleId === c.id && x.statut === 'Prévue' && x.seanceId === d.seanceId && x.date === d.date && x.id !== d.id,
  );
  if (doublon) refus('Cette séance est déjà prévue ce jour-là');
  if (ancien)
    return e.planifications.map((x) =>
      x.id === ancien.id ? { ...x, seanceId: s!.id, seanceTitre: s!.titre, date: d.date, heure: d.heure || undefined, envoiId: d.envoiId } : x,
    );
  return [
    ...e.planifications,
    { id: d.envoiId, clientId, cycleId: c.id, seanceId: s!.id, seanceTitre: s!.titre, date: d.date, heure: d.heure || undefined, statut: 'Prévue', envoiId: d.envoiId },
  ];
}

export function annuler(e: Etat, clientId: string, id: string): Planification[] {
  const p = e.planifications.find((x) => x.id === id && x.clientId === clientId) ?? refus('Créneau introuvable');
  if (p.statut === 'Réalisée') refus('Une séance réalisée reste conservée dans votre historique');
  return e.planifications.map((x) => (x.id === id ? { ...x, statut: 'Annulée' } : x));
}

/**
 * enregistrer_realisation : contrôles, libellés figés, puis le calendrier (le créneau choisi, sinon celui prévu ce
 * jour-là, sinon un créneau « Réalisée » créé). Renvoyer le même id ne crée rien de plus.
 */
export function enregistrer(e: Etat, r: RealisationCycle, jour = aujourdhuiParis()): { etat: Pick<Etat, 'realisations' | 'planifications'>; resultat: 'enregistree' | 'doublon' } {
  const s = e.seances.find((x) => x.id === r.seanceId && !x.supprimeLe) ?? refus('Séance introuvable ou retirée par votre coach');
  const c = r.cycleId ? e.cycles.find((x) => x.id === r.cycleId && x.clientId === r.clientId) : undefined;
  if (r.cycleId) {
    if (!c || c.statut !== 'Actif' || !c.programmeId) refus("Ce cycle n'est pas en cours");
    if (jour < c!.debut || jour > c!.fin) refus('Cette séance est en dehors des dates du cycle actif');
    if (s.programmeId !== c!.programmeId) refus('Séance hors du cycle en cours');
  } else if (s.clientId !== r.clientId) refus('Séance hors de votre dossier');
  let plan = r.planificationId ? e.planifications.find((x) => x.id === r.planificationId) : undefined;
  if (r.planificationId) {
    if (!plan || plan.clientId !== r.clientId || plan.cycleId !== c?.id || plan.seanceId !== s.id || plan.statut === 'Annulée') refus('Créneau hors de cette séance');
    if (plan!.statut === 'Réalisée' && plan!.realisationId !== r.id) refus('Ce créneau est déjà réalisé');
  }
  const existante = e.realisations.find((x) => x.id === r.id);
  let realisations = e.realisations;
  if (existante) {
    if (existante.clientId !== r.clientId || existante.seanceId !== s.id) refus('Envoi déjà utilisé pour une autre séance');
  } else {
    if (r.series.length === 0 && r.note === undefined && !r.commentaire?.trim()) refus('Renseignez au moins un résultat ou un ressenti');
    const lignes = new Map(s.blocs.flatMap((b) => b.lignes.map((l) => [l.id, l] as const)));
    if (r.series.some((x) => !lignes.has(x.ligneId))) refus('Exercice hors de cette séance');
    const prog = c ? e.programmes.find((x) => x.id === c.programmeId) : undefined;
    const noms: Record<string, string> = {};
    r.series.forEach((x) => (noms[x.ligneId] = lignes.get(x.ligneId)!.exercice.nom));
    realisations = [
      ...e.realisations,
      { ...r, commentaire: r.commentaire?.trim() || undefined, seanceTitre: s.titre, programmeId: prog?.id, programmeNom: prog?.titre, cycleNom: c?.nom, noms },
    ];
  }
  const fin = existante?.fin ?? r.fin;
  let planifications = e.planifications;
  if (c && !planifications.some((x) => x.realisationId === r.id)) {
    plan ??= planifications.find((x) => x.clientId === r.clientId && x.cycleId === c.id && x.seanceId === s.id && x.statut === 'Prévue' && x.date === jourParis(fin));
    planifications = plan
      ? planifications.map((x) => (x.id === plan!.id ? { ...x, statut: 'Réalisée', realiseeLe: fin, realisationId: r.id } : x))
      : [
          ...planifications,
          {
            id: `realisation-${r.id}`,
            clientId: r.clientId,
            cycleId: c.id,
            seanceId: s.id,
            seanceTitre: s.titre,
            date: jourParis(fin),
            statut: 'Réalisée',
            realiseeLe: fin,
            realisationId: r.id,
            envoiId: `realisation-${r.id}`,
          },
        ];
  }
  return { etat: { realisations, planifications }, resultat: existante ? 'doublon' : 'enregistree' };
}

// ---------- Lecture des résultats (Historique client, Bilan coach) ----------

/** Une série telle que l'app d'origine l'affiche : « 60 kg × 10 », ou les valeurs cardio et statiques. */
export function texteSerie(v: Valeurs) {
  const morceaux: string[] = [];
  if (v.charge !== undefined || v.repetitions !== undefined) morceaux.push(`${v.charge ?? '—'} kg × ${v.repetitions ?? '—'}`);
  if (v.duree !== undefined) morceaux.push(v.duree >= 60 && v.duree % 60 === 0 ? `${v.duree / 60} min` : `${v.duree} s`);
  if (v.distance !== undefined) morceaux.push(`${v.distance} m`);
  if (v.calories !== undefined) morceaux.push(`${v.calories} cal`);
  if (v.watts !== undefined) morceaux.push(`${v.watts} W`);
  if (v.allure500 !== undefined) morceaux.push(`${Math.floor(v.allure500 / 60)}:${String(v.allure500 % 60).padStart(2, '0')} / 500 m`);
  return morceaux.join(' · ') || '—';
}

/** La prescription réellement montrée au client pour un cycle lié tel quel : le cycle 1 du modèle. */
export const seancePourClient = (s: Seance): Seance => ({ ...s, blocs: s.blocs.map((b) => ({ ...b, lignes: b.lignes.map((l) => appliquerCycle(l, 1)) })) });
