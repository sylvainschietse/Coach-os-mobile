// Suivi de l'entraînement d'un client par le coach : les semaines du cycle (séances faites, manquées, prévues),
// le détail d'une séance faite comparé à la fois précédente, et les évolutions par exercice et par semaine.
// Tout est calculé ici à partir des réalisations, des créneaux du calendrier et de la fréquence du programme.
import { ajouterJours, jourParis, unRm } from './entrainement';
import type { Planification, RealisationLue } from './entrainement-etat';
import type { SerieRealisee, Valeurs } from './types';

export type StatutPastille = 'faite' | 'manquee' | 'prevue';

export interface Pastille {
  statut: StatutPastille;
  titre: string;
  /** Jour de la séance faite, ou jour prévu au calendrier. Vide pour une séance attendue mais pas planifiée. */
  date?: string;
  realisationId?: string;
}

export interface SemaineSuivi {
  numero: number;
  debut: string;
  fin: string;
  enCours: boolean;
  pastilles: Pastille[];
}

const ORDRE: Record<StatutPastille, number> = { faite: 0, manquee: 1, prevue: 2 };

/**
 * Les semaines d'un cycle, comptées depuis son premier jour (semaine 1 = 7 premiers jours, comme « semaine 3/5 »).
 * Une séance faite est verte ; un créneau passé sans séance, rouge ; un créneau à venir, orange. Quand le client a
 * planifié moins de séances que la fréquence du programme, les séances qui manquent comptent comme manquées (semaine
 * passée) ou prévues (semaine en cours ou à venir).
 */
export function semainesDuCycle(p: {
  cycle: { debut: string; fin: string };
  planifications: Planification[];
  realisations: RealisationLue[];
  seancesParSemaine?: number;
  jour: string;
}): SemaineSuivi[] {
  const { cycle, jour } = p;
  if (!cycle.debut || !cycle.fin || cycle.fin < cycle.debut) return [];
  const semaines: SemaineSuivi[] = [];
  const utilises = new Set(p.realisations.map((r) => r.planificationId).filter(Boolean));
  for (let n = 1, debut = cycle.debut; debut <= cycle.fin; n++, debut = ajouterJours(debut, 7)) {
    const fin = ajouterJours(debut, 6) < cycle.fin ? ajouterJours(debut, 6) : cycle.fin;
    const dans = (d: string) => d >= debut && d <= fin;
    const pastilles: Pastille[] = p.realisations
      .filter((r) => dans(jourParis(r.fin || r.debut)))
      .map((r) => ({ statut: 'faite' as const, titre: r.seanceTitre || 'Séance', date: jourParis(r.fin || r.debut), realisationId: r.id }));
    for (const c of p.planifications) {
      if (!dans(c.date) || c.statut === 'Annulée' || utilises.has(c.id) || (c.realisationId && p.realisations.some((r) => r.id === c.realisationId))) continue;
      if (c.statut === 'Réalisée') pastilles.push({ statut: 'faite', titre: c.seanceTitre, date: c.date, realisationId: c.realisationId });
      else pastilles.push({ statut: c.date < jour ? 'manquee' : 'prevue', titre: c.seanceTitre, date: c.date });
    }
    const manque = (p.seancesParSemaine ?? 0) - pastilles.length;
    for (let i = 0; i < manque; i++) pastilles.push({ statut: fin < jour ? 'manquee' : 'prevue', titre: 'Séance non planifiée' });
    pastilles.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || ORDRE[a.statut] - ORDRE[b.statut]);
    semaines.push({ numero: n, debut, fin, enCours: dans(jour), pastilles });
  }
  return semaines;
}

export interface Assiduite {
  faites: number;
  manquees: number;
  /** À venir : créneaux ou séances attendues de la semaine en cours et des suivantes. */
  aVenir: number;
  /** Faites sur (faites + manquées), en pourcentage ; vide sans séance attendue jusqu'ici. */
  taux?: number;
}

export function assiduite(semaines: SemaineSuivi[]): Assiduite {
  const toutes = semaines.flatMap((s) => s.pastilles);
  const faites = toutes.filter((x) => x.statut === 'faite').length;
  const manquees = toutes.filter((x) => x.statut === 'manquee').length;
  return {
    faites,
    manquees,
    aVenir: toutes.length - faites - manquees,
    taux: faites + manquees ? Math.round((faites / (faites + manquees)) * 100) : undefined,
  };
}

/** Ressenti moyen (note de 1 à 10) des séances faites depuis `depuis`, arrondi au dixième. */
export function ressentiMoyen(realisations: RealisationLue[], depuis?: string) {
  const notes = realisations.filter((r) => r.note !== undefined && r.note !== null && (!depuis || jourParis(r.fin) >= depuis)).map((r) => r.note!);
  return notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : undefined;
}

/** Ce qu'une série « vaut » pour comparer deux séances : force estimée si charge × reps, sinon reps, durée, distance… */
export function scoreSerie(v: Valeurs): number | undefined {
  if (v.charge !== undefined && v.repetitions !== undefined && v.repetitions > 0) return unRm(v.charge, v.repetitions);
  for (const m of ['charge', 'repetitions', 'duree', 'distance', 'calories', 'watts'] as const) if (v[m] !== undefined) return v[m];
  return undefined;
}

const meilleure = (series: SerieRealisee[]) =>
  series.reduce<SerieRealisee | undefined>((m, s) => ((scoreSerie(s.valeurs) ?? -1) > (m ? (scoreSerie(m.valeurs) ?? -1) : -1) ? s : m), undefined);

export type Evolution = 'hausse' | 'baisse' | 'egal';

export interface ExerciceRealise {
  ligneId: string;
  exerciceId: string;
  nom: string;
  prescription?: { series: number; repetitions?: string };
  series: SerieRealisee[];
  /** Meilleure série de la fois précédente (même séance, sinon même exercice). */
  precedente?: SerieRealisee;
  evolution?: Evolution;
}

/**
 * Le détail d'une séance faite : par exercice, les séries dans l'ordre, la prescription, et la comparaison de la
 * meilleure série avec la fois précédente où le client a fait cet exercice.
 */
export function detailSeance(
  r: RealisationLue,
  toutes: RealisationLue[],
  prescriptions: Record<string, { series: number; repetitions?: string }>,
): ExerciceRealise[] {
  const avant = toutes.filter((x) => x.id !== r.id && x.fin < r.fin).sort((a, b) => b.fin.localeCompare(a.fin));
  const parLigne = new Map<string, SerieRealisee[]>();
  for (const s of [...r.series].sort((a, b) => a.index - b.index)) parLigne.set(s.ligneId, [...(parLigne.get(s.ligneId) ?? []), s]);
  return [...parLigne].map(([ligneId, series]) => {
    const exerciceId = series[0].exerciceId;
    const precedentes =
      avant.map((x) => x.series.filter((s) => s.ligneId === ligneId)).find((l) => l.length) ??
      avant.map((x) => x.series.filter((s) => s.exerciceId === exerciceId)).find((l) => l.length);
    const precedente = precedentes && meilleure(precedentes);
    const maintenant = scoreSerie(meilleure(series)?.valeurs ?? {});
    const alors = precedente && scoreSerie(precedente.valeurs);
    const evolution: Evolution | undefined =
      maintenant === undefined || alors === undefined ? undefined : maintenant > alors * 1.005 ? 'hausse' : maintenant < alors * 0.995 ? 'baisse' : 'egal';
    return { ligneId, exerciceId, nom: r.noms[ligneId] ?? 'Exercice', prescription: prescriptions[ligneId], series, precedente, evolution };
  });
}

export interface PointExercice {
  date: string;
  /** Charge la plus lourde soulevée ce jour-là. */
  chargeMax?: number;
  /** Force estimée (1RM, formule d'Epley) de la meilleure série. */
  rm?: number;
  /** Tonnage : somme des charges × répétitions. */
  volume?: number;
  /** Meilleur nombre de répétitions (exercices sans charge). */
  repetitions?: number;
  /** Plus longue durée tenue, en secondes (gainage, cardio). */
  duree?: number;
}

export interface CourbeExercice {
  exerciceId: string;
  nom: string;
  points: PointExercice[];
}

const chargee = (c: { points: PointExercice[] }) => (c.points.some((p) => p.chargeMax !== undefined) ? 1 : 0);

/** Une courbe par exercice : les exercices chargés d'abord, puis le plus souvent fait ; un point par jour. */
export function courbesExercices(realisations: RealisationLue[]): CourbeExercice[] {
  const parExo = new Map<string, { nom: string; jours: Map<string, SerieRealisee[]> }>();
  for (const r of realisations) {
    const jour = jourParis(r.fin || r.debut);
    for (const s of r.series) {
      const e = parExo.get(s.exerciceId) ?? { nom: r.noms[s.ligneId] ?? 'Exercice', jours: new Map() };
      e.jours.set(jour, [...(e.jours.get(jour) ?? []), s]);
      parExo.set(s.exerciceId, e);
    }
  }
  return [...parExo]
    .map(([exerciceId, { nom, jours }]) => ({
      exerciceId,
      nom,
      points: [...jours]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, series]) => {
          const charges = series.map((s) => s.valeurs.charge).filter((c): c is number => c !== undefined);
          const rms = series.map((s) => (s.valeurs.charge !== undefined && s.valeurs.repetitions ? unRm(s.valeurs.charge, s.valeurs.repetitions) : undefined));
          const volume = series.reduce((t, s) => t + (s.valeurs.charge ?? 0) * (s.valeurs.repetitions ?? 0), 0);
          const reps = series.map((s) => s.valeurs.repetitions).filter((x): x is number => x !== undefined);
          const durees = series.map((s) => s.valeurs.duree).filter((x): x is number => x !== undefined);
          return {
            date,
            chargeMax: charges.length ? Math.max(...charges) : undefined,
            rm: rms.some((x) => x !== undefined) ? Math.round(Math.max(...rms.map((x) => x ?? 0)) * 10) / 10 : undefined,
            volume: volume > 0 ? Math.round(volume) : undefined,
            repetitions: reps.length ? Math.max(...reps) : undefined,
            duree: durees.length ? Math.max(...durees) : undefined,
          };
        }),
    }))
    .sort((a, b) => chargee(b) - chargee(a) || b.points.length - a.points.length || a.nom.localeCompare(b.nom, 'fr'));
}

export interface BilanSemaine {
  debut: string;
  seances: number;
  volume: number;
  ressenti?: number;
}

/** Par semaine du cycle : séances faites, tonnage total et ressenti moyen. */
export function bilanParSemaine(semaines: SemaineSuivi[], realisations: RealisationLue[]): BilanSemaine[] {
  return semaines.map((s) => {
    const rs = realisations.filter((r) => {
      const j = jourParis(r.fin || r.debut);
      return j >= s.debut && j <= s.fin;
    });
    return {
      debut: s.debut,
      seances: rs.length,
      volume: Math.round(rs.reduce((t, r) => t + r.series.reduce((u, x) => u + (x.valeurs.charge ?? 0) * (x.valeurs.repetitions ?? 0), 0), 0)),
      ressenti: ressentiMoyen(rs),
    };
  });
}
