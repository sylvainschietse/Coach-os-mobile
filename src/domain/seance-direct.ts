// Séance en direct : pendant une séance en présentiel, le coach note ce que fait son client au fur et à mesure.
// Il part d'une séance vierge ou d'une séance du programme en cours, ajoute des exercices du catalogue, et pour
// chaque série saisit la charge, les répétitions (ou la durée)… Le repos se chronomètre tout seul entre deux séries
// cochées et reste modifiable. Fonctions pures : l'écran, la démo et le serveur partagent ces règles.
import { jourParis } from './entrainement';
import { RefusEntrainement, type Etat, type RealisationLue, type RealisationStockee, type SeanceStockee } from './entrainement-etat';
import type { Exercice, LignePrescription, Mesure, Seance, Valeurs } from './types';

/** Ce qu'on saisit sur une série : deux cases au plus, dans l'ordre. */
export const MESURES_SAISIES: Mesure[] = ['charge', 'repetitions', 'duree', 'distance', 'calories', 'watts'];
export const LIBELLES_MESURES: Record<Mesure, string> = {
  charge: 'kg',
  repetitions: 'Reps',
  duree: 'Sec.',
  distance: 'Mètres',
  calories: 'Cal',
  watts: 'Watts',
  allure500: '/500 m',
};
/** Au-delà, on considère que la pause n'est plus un repos entre deux séries (le coach a discuté, changé d'atelier…). */
export const REPOS_MAX_S = 15 * 60;

export interface SerieDirecte {
  id: string;
  /** Texte tapé, tel quel (« 47,5 »). */
  valeurs: Partial<Record<Mesure, string>>;
  faite: boolean;
  /** Moment où la série a été cochée (ms). */
  faiteA?: number;
  /** Repos pris avant cette série, en secondes. */
  reposS?: number;
}

export interface ExerciceDirect {
  /** L'exercice de la séance du programme, ou un identifiant neuf pour un exercice ajouté. */
  ligneId: string;
  exercice: Exercice;
  /** Venu de la séance du programme. */
  prevu: boolean;
  /** « 3 × 10–12 · récup 1:30 », pour un exercice prévu. */
  prescription?: string;
  recuperationS?: number;
  series: SerieDirecte[];
}

export interface SeanceDirecte {
  clientId: string;
  titre: string;
  debut: number;
  /** Séance du programme dont on est parti. */
  seanceId?: string;
  cycleId?: string;
  planificationId?: string;
  exercices: ExerciceDirect[];
}

/** Les cases d'un exercice : celles de son catalogue, deux au plus ; charge et répétitions par défaut. */
export function mesuresDe(e: Pick<Exercice, 'mesures'>): Mesure[] {
  const m = (e.mesures ?? []).filter((x) => MESURES_SAISIES.includes(x)).slice(0, 2);
  return m.length ? m : ['charge', 'repetitions'];
}

const jourLong = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
export const titreDirect = (ms: number) => `Séance en direct · ${jourLong(ms)}`;

/** Une séance vierge compte dans le cycle en cours du client, s'il en a un. */
export function seanceVierge(clientId: string, debut: number, cycleId?: string): SeanceDirecte {
  return { clientId, titre: titreDirect(debut), debut, cycleId, exercices: [] };
}

const serieVide = (nouvelId: () => string): SerieDirecte => ({ id: nouvelId(), valeurs: {}, faite: false });

/** Les exercices de la séance du programme, avec autant de séries vides que prévu. */
export function depuisSeance(
  clientId: string,
  seance: Seance,
  debut: number,
  nouvelId: () => string,
  opts: { cycleId?: string; planificationId?: string; titre?: string; prescription?: (l: LignePrescription) => string } = {},
): SeanceDirecte {
  return {
    clientId,
    titre: opts.titre ?? seance.titre,
    debut,
    seanceId: seance.id,
    cycleId: opts.cycleId,
    planificationId: opts.planificationId,
    exercices: seance.blocs.flatMap((b) =>
      b.lignes.map((l) => ({
        ligneId: l.id,
        exercice: l.exercice,
        prevu: true,
        prescription: opts.prescription?.(l),
        recuperationS: l.recuperationS,
        series: Array.from({ length: Math.min(Math.max(l.series, 1), 10) }, () => serieVide(nouvelId)),
      })),
    ),
  };
}

export function ajouterExercice(s: SeanceDirecte, exercice: Exercice, nouvelId: () => string): SeanceDirecte {
  return { ...s, exercices: [...s.exercices, { ligneId: nouvelId(), exercice, prevu: false, series: [serieVide(nouvelId)] }] };
}

export function retirerExercice(s: SeanceDirecte, ligneId: string): SeanceDirecte {
  return { ...s, exercices: s.exercices.filter((e) => e.ligneId !== ligneId) };
}

const majExercice = (s: SeanceDirecte, ligneId: string, f: (e: ExerciceDirect) => ExerciceDirect): SeanceDirecte => ({
  ...s,
  exercices: s.exercices.map((e) => (e.ligneId === ligneId ? f(e) : e)),
});

/** Une série de plus, préremplie avec la précédente : souvent seule la dernière case change. */
export function ajouterSerie(s: SeanceDirecte, ligneId: string, nouvelId: () => string): SeanceDirecte {
  return majExercice(s, ligneId, (e) => {
    const derniere = e.series.at(-1);
    return { ...e, series: [...e.series, { id: nouvelId(), valeurs: { ...(derniere?.valeurs ?? {}) }, faite: false }] };
  });
}

export function retirerSerie(s: SeanceDirecte, ligneId: string, serieId: string): SeanceDirecte {
  return majExercice(s, ligneId, (e) => ({ ...e, series: e.series.filter((x) => x.id !== serieId) }));
}

/** Le coach tape une valeur : seuls chiffres, virgule et point passent. */
export function saisir(s: SeanceDirecte, ligneId: string, serieId: string, mesure: Mesure, texte: string): SeanceDirecte {
  const propre = texte.replace(/[^0-9.,]/g, '').slice(0, 7);
  return majExercice(s, ligneId, (e) => ({
    ...e,
    series: e.series.map((x) => (x.id === serieId ? { ...x, valeurs: { ...x.valeurs, [mesure]: propre } } : x)),
  }));
}

export function lireNombre(t: string | undefined): number | undefined {
  if (t === undefined || !t.trim()) return undefined;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** « 1:32 » → 92 ; « 90 » → 90. */
export function lireDuree(t: string): number | undefined {
  const m = t.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = lireNombre(t);
  return n === undefined ? undefined : Math.round(n);
}

export const ecrireDuree = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/** La dernière série cochée de la séance (tous exercices confondus), pour le chrono de repos. */
export function derniereFaite(s: SeanceDirecte): { ligneId: string; serieId: string; numero: number; faiteA: number; nom: string } | undefined {
  let d: ReturnType<typeof derniereFaite>;
  for (const e of s.exercices)
    e.series.forEach((x, i) => {
      if (x.faite && x.faiteA !== undefined && (!d || x.faiteA > d.faiteA)) d = { ligneId: e.ligneId, serieId: x.id, numero: i + 1, faiteA: x.faiteA, nom: e.exercice.nom };
    });
  return d;
}

/**
 * Cocher une série : le repos est le temps écoulé depuis la série précédente du même exercice, quand elle a été
 * cochée avant (et pas il y a plus de 15 minutes). Une série cochée sans valeur reprend celles de la précédente.
 */
export function cocher(s: SeanceDirecte, ligneId: string, serieId: string, maintenant: number): SeanceDirecte {
  return majExercice(s, ligneId, (e) => {
    const i = e.series.findIndex((x) => x.id === serieId);
    if (i < 0) return e;
    const serie = e.series[i];
    if (serie.faite) return { ...e, series: e.series.map((x) => (x.id === serieId ? { ...x, faite: false, faiteA: undefined } : x)) };
    const avant = e.series
      .slice(0, i)
      .filter((x) => x.faite && x.faiteA !== undefined)
      .at(-1);
    const ecoule = avant ? Math.round((maintenant - avant.faiteA!) / 1000) : undefined;
    const reposS = serie.reposS ?? (ecoule !== undefined && ecoule >= 0 && ecoule <= REPOS_MAX_S ? ecoule : undefined);
    const vide = !Object.values(serie.valeurs).some((v) => v?.trim());
    const valeurs = vide && i > 0 ? { ...e.series[i - 1].valeurs } : serie.valeurs;
    return { ...e, series: e.series.map((x) => (x.id === serieId ? { ...x, valeurs, faite: true, faiteA: maintenant, reposS } : x)) };
  });
}

export function changerRepos(s: SeanceDirecte, ligneId: string, serieId: string, texte: string): SeanceDirecte {
  const r = lireDuree(texte);
  return majExercice(s, ligneId, (e) => ({
    ...e,
    series: e.series.map((x) => (x.id === serieId ? { ...x, reposS: r !== undefined && r <= 3600 ? r : undefined } : x)),
  }));
}

/** Les valeurs chiffrées d'une série ; vide si rien n'est saisi. */
export function valeursDe(serie: SerieDirecte, mesures: Mesure[]): Valeurs {
  const v: Valeurs = {};
  for (const m of mesures) {
    const n = lireNombre(serie.valeurs[m]);
    if (n !== undefined) v[m] = n;
  }
  return v;
}

/** Une série compte quand elle est cochée ou qu'une valeur y est saisie. */
const compte = (serie: SerieDirecte, mesures: Mesure[]) => serie.faite || Object.keys(valeursDe(serie, mesures)).length > 0;

export interface EnvoiDirect {
  id: string;
  clientId: string;
  titre: string;
  debut: string;
  fin: string;
  note?: number;
  commentaire?: string;
  seanceId?: string;
  cycleId?: string;
  planificationId?: string;
  seanceDirecteId: string;
  blocId: string;
  /** Le nom et les cases servent seulement à la démo ; le serveur relit l'exercice dans son catalogue. */
  exercices: { ligneId: string; exerciceId: string; nom?: string; mesures?: Mesure[]; series: { id: string; valeurs: Valeurs; reposS?: number }[] }[];
}

/** Ce qui part vers la base : les séries cochées ou remplies, avec des valeurs ; une série cochée vide est gardée. */
export function construireEnvoi(
  s: SeanceDirecte,
  infos: { id: string; fin: number; note?: number; commentaire?: string; seanceDirecteId: string; blocId: string },
): EnvoiDirect {
  return {
    id: infos.id,
    clientId: s.clientId,
    titre: s.titre.trim() || titreDirect(s.debut),
    debut: new Date(s.debut).toISOString(),
    fin: new Date(Math.max(infos.fin, s.debut)).toISOString(),
    note: infos.note,
    commentaire: infos.commentaire?.trim() || undefined,
    seanceId: s.seanceId,
    cycleId: s.cycleId,
    planificationId: s.planificationId,
    seanceDirecteId: infos.seanceDirecteId,
    blocId: infos.blocId,
    exercices: s.exercices
      .map((e) => {
        const m = mesuresDe(e.exercice);
        return {
          ligneId: e.ligneId,
          exerciceId: e.exercice.id,
          nom: e.exercice.nom,
          mesures: m,
          series: e.series.filter((x) => compte(x, m)).map((x) => ({ id: x.id, valeurs: valeursDe(x, m), reposS: x.reposS })),
        };
      })
      .filter((e) => e.series.length > 0),
  };
}

export const nbSeriesNotees = (s: SeanceDirecte) => s.exercices.reduce((n, e) => n + e.series.filter((x) => compte(x, mesuresDe(e.exercice))).length, 0);

const fr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

/** « 3 × 10 à 45 kg », « 4 séries · 8 à 10 reps · 40 à 45 kg », « 3 × 45 s ». */
export function resumeSeries(series: Valeurs[]): string {
  const l = series.filter((v) => Object.keys(v).length);
  if (!l.length) return '';
  const plage = (vals: (number | undefined)[], unite: string) => {
    const v = vals.filter((x): x is number => x !== undefined);
    if (!v.length) return '';
    const [min, max] = [Math.min(...v), Math.max(...v)];
    return min === max ? `${fr(min)}${unite}` : `${fr(min)} à ${fr(max)}${unite}`;
  };
  const reps = plage(l.map((v) => v.repetitions), '');
  const charge = plage(l.map((v) => v.charge), ' kg');
  const duree = plage(l.map((v) => v.duree), ' s');
  const autre = !reps && !duree ? plage(l.map((v) => v.distance), ' m') || plage(l.map((v) => v.calories), ' cal') || plage(l.map((v) => v.watts), ' W') : '';
  const effort = reps || duree || autre;
  if (!effort) return `${l.length} série${l.length > 1 ? 's' : ''}${charge ? ` à ${charge}` : ''}`;
  const simple = !effort.includes(' à ');
  if (simple) return `${l.length} × ${effort}${charge ? (charge.includes(' à ') ? ` · ${charge}` : ` à ${charge}`) : ''}`;
  return [`${l.length} séries`, reps ? `${reps} reps` : effort, charge].filter(Boolean).join(' · ');
}

/** Ce que le client a fait la dernière fois sur cet exercice : « La dernière fois (12 nov.) : 3 × 10 à 45 kg ». */
export function derniereFois(historique: RealisationLue[], exerciceId: string): { date: string; texte: string; series: Valeurs[] } | undefined {
  const r = [...historique]
    .sort((a, b) => b.fin.localeCompare(a.fin))
    .find((x) => x.series.some((s) => s.exerciceId === exerciceId && Object.keys(s.valeurs).length));
  if (!r) return undefined;
  const series = r.series
    .filter((s) => s.exerciceId === exerciceId)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.valeurs);
  return { date: jourCourt(r.fin), texte: resumeSeries(series), series };
}

/** Exercices déjà faits par le client, du plus récent au plus ancien, sans doublon. */
export function exercicesRecents(historique: RealisationLue[]): string[] {
  const vus = new Set<string>();
  for (const r of [...historique].sort((a, b) => b.fin.localeCompare(a.fin))) for (const s of r.series) vus.add(s.exerciceId);
  return [...vus];
}

const chargeMax = (series: Valeurs[]) => Math.max(0, ...series.map((v) => v.charge ?? 0));

export interface BilanDirect {
  dureeMin: number;
  nbExercices: number;
  nbSeries: number;
  tonnage: number;
  lignes: { ligneId: string; nom: string; resume: string; record: boolean }[];
}

/** Le résumé de fin : durée, tonnage, et les charges jamais atteintes sur un exercice déjà fait. */
export function bilan(envoi: EnvoiDirect, s: SeanceDirecte, historique: RealisationLue[]): BilanDirect {
  const noms = new Map(s.exercices.map((e) => [e.ligneId, e.exercice.nom]));
  let tonnage = 0;
  const lignes = envoi.exercices.map((e) => {
    const valeurs = e.series.map((x) => x.valeurs);
    valeurs.forEach((v) => (tonnage += (v.charge ?? 0) * (v.repetitions ?? 0)));
    const avant = historique.flatMap((r) => r.series.filter((x) => x.exerciceId === e.exerciceId).map((x) => x.valeurs));
    const maintenant = chargeMax(valeurs);
    return { ligneId: e.ligneId, nom: noms.get(e.ligneId) ?? 'Exercice', resume: resumeSeries(valeurs), record: avant.length > 0 && maintenant > chargeMax(avant) };
  });
  return {
    dureeMin: Math.max(1, Math.round((Date.parse(envoi.fin) - Date.parse(envoi.debut)) / 60000)),
    nbExercices: envoi.exercices.length,
    nbSeries: envoi.exercices.reduce((n, e) => n + e.series.length, 0),
    tonnage: Math.round(tonnage),
    lignes,
  };
}

const refus = (m: string): never => {
  throw new RefusEntrainement(m);
};

/**
 * Mode démo : les mêmes règles que la fonction SQL enregistrer_seance_en_direct. Les exercices ajoutés vont dans une
 * séance « en direct » du client ; la réalisation pointe sur la séance du programme quand on en est parti.
 */
export function enregistrerDirect(
  e: Etat,
  p: EnvoiDirect,
  coachId: string,
): { etat: Pick<Etat, 'realisations' | 'planifications'> & { seances: SeanceStockee[] }; resultat: 'enregistree' | 'doublon' } {
  const existante = e.realisations.find((x) => x.id === p.id);
  if (existante) {
    if (existante.clientId !== p.clientId) refus('Envoi déjà utilisé pour une autre séance');
    return { etat: { realisations: e.realisations, planifications: e.planifications, seances: [] }, resultat: 'doublon' };
  }
  const exercices = p.exercices.filter((x) => x.series.length > 0);
  if (!exercices.length && p.note === undefined && !p.commentaire?.trim()) refus('Note au moins une série');
  const source = p.seanceId ? (e.seances.find((x) => x.id === p.seanceId && !x.supprimeLe && (!x.clientId || x.clientId === p.clientId)) ?? refus('Séance introuvable')) : undefined;
  // Séance vierge : elle compte dans le cycle en cours ; séance du programme : seulement si c'est le programme du cycle.
  const c = p.cycleId
    ? e.cycles.find((x) => x.id === p.cycleId && x.clientId === p.clientId && x.statut === 'Actif' && (!source || x.programmeId === source.programmeId))
    : undefined;
  const prog = c ? e.programmes.find((x) => x.id === c.programmeId) : undefined;
  const prevues = new Map((source?.blocs ?? []).flatMap((b) => b.lignes.map((l) => [l.id, l] as const)));
  const ajouts = exercices.filter((x) => !prevues.has(x.ligneId));
  const seances: SeanceStockee[] = [];
  if (ajouts.length) {
    seances.push({
      id: p.seanceDirecteId,
      coachId,
      clientId: p.clientId,
      titre: p.titre || source?.titre || 'Séance en direct',
      blocs: [
        {
          id: p.blocId,
          titre: 'Séance en direct',
          lignes: ajouts.map((x) => {
            const reps = x.series.map((s) => s.valeurs.repetitions).filter((v): v is number => v !== undefined);
            const charges = x.series.map((s) => s.valeurs.charge).filter((v): v is number => v !== undefined);
            const [min, max] = reps.length ? [Math.min(...reps), Math.max(...reps)] : [undefined, undefined];
            return {
              id: x.ligneId,
              exercice: { id: x.exerciceId, nom: x.nom ?? 'Exercice', mesures: x.mesures ?? ['charge', 'repetitions'] },
              series: x.series.length,
              repetitionsMin: min,
              repetitionsMax: max,
              repetitions: min === undefined ? undefined : min === max ? String(min) : `${min}–${max}`,
              chargeIndicative: charges.length ? Math.max(...charges) : undefined,
            };
          }),
        },
      ],
    });
  }
  const s = source ?? seances[0] ?? refus('Note au moins une série');
  const noms: Record<string, string> = {};
  const series = exercices.flatMap((x) => {
    const prevue = prevues.get(x.ligneId);
    noms[x.ligneId] = x.nom ?? prevue?.exercice.nom ?? 'Exercice';
    return x.series.map((serie, index) => ({ id: serie.id, ligneId: x.ligneId, exerciceId: x.exerciceId, index, valeurs: serie.valeurs, suggestion: {}, reposS: serie.reposS }));
  });
  let plan = c && source && p.planificationId ? e.planifications.find((x) => x.id === p.planificationId && x.clientId === p.clientId && x.cycleId === c.id && x.seanceId === s.id && x.statut === 'Prévue') : undefined;
  let planifications = e.planifications;
  if (c && source) {
    plan ??= planifications.find((x) => x.clientId === p.clientId && x.cycleId === c.id && x.seanceId === s.id && x.statut === 'Prévue' && x.date === jourParis(p.fin));
    planifications = plan
      ? planifications.map((x) => (x.id === plan!.id ? { ...x, statut: 'Réalisée', realiseeLe: p.fin, realisationId: p.id } : x))
      : [
          ...planifications,
          { id: `realisation-${p.id}`, clientId: p.clientId, cycleId: c.id, seanceId: s.id, seanceTitre: s.titre, date: jourParis(p.fin), statut: 'Réalisée', realiseeLe: p.fin, realisationId: p.id, envoiId: `realisation-${p.id}` },
        ];
  }
  const r: RealisationStockee = {
    id: p.id,
    clientId: p.clientId,
    seanceId: s.id,
    cycleId: c?.id,
    planificationId: plan?.id,
    debut: p.debut,
    fin: p.fin,
    note: p.note,
    commentaire: p.commentaire?.trim() || undefined,
    series,
    seanceTitre: p.titre || s.titre,
    programmeId: prog?.id,
    programmeNom: prog?.titre,
    cycleNom: c?.nom,
    noms,
  };
  return { etat: { realisations: [...e.realisations, r], planifications, seances }, resultat: 'enregistree' };
}
