// Suivi du client : mensurations, records et nutrition. Règles pures, sans écran ni base.
import type { JournalNutrition, Mensuration, PlanNutrition, RealisationDetail, RecordPerso, UniteRecord } from './types';

type ChampMensuration = Exclude<keyof Mensuration, 'id' | 'clientId' | 'date' | 'note'>;

export const CHAMPS_MENSURATIONS: { cle: ChampMensuration; libelle: string; unite: string; min: number; max: number }[] = [
  { cle: 'poidsKg', libelle: 'Poids', unite: 'kg', min: 20, max: 400 },
  { cle: 'masseGrassePct', libelle: 'Masse grasse', unite: '%', min: 2, max: 75 },
  { cle: 'tourTailleCm', libelle: 'Tour de taille', unite: 'cm', min: 30, max: 250 },
  { cle: 'tourHanchesCm', libelle: 'Tour de hanches', unite: 'cm', min: 30, max: 250 },
  { cle: 'tourPoitrineCm', libelle: 'Tour de poitrine', unite: 'cm', min: 30, max: 250 },
  { cle: 'tourBrasCm', libelle: 'Tour de bras', unite: 'cm', min: 10, max: 100 },
  { cle: 'tourCuisseCm', libelle: 'Tour de cuisse', unite: 'cm', min: 20, max: 150 },
];

/** Lit un nombre saisi au clavier français (« 72,5 »). Vide = non mesuré, pas zéro. */
export function lireNombre(saisie: string): number | undefined {
  const t = saisie.replace(',', '.').trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export const formaterNombre = (n?: number) => (n === undefined ? '' : String(Math.round(n * 10) / 10).replace('.', ','));

export function erreursMensuration(m: Partial<Mensuration>): string[] {
  const erreurs: string[] = [];
  const remplis = CHAMPS_MENSURATIONS.filter((c) => m[c.cle] !== undefined);
  if (remplis.length === 0) erreurs.push('Renseigne au moins une mesure.');
  for (const c of remplis) {
    const v = m[c.cle] as number;
    if (Number.isNaN(v) || v < c.min || v > c.max) erreurs.push(`${c.libelle} : entre ${c.min} et ${c.max} ${c.unite}.`);
  }
  return erreurs;
}

/** La taille est rangée dans le profil : une seule valeur, en centimètres (mêmes bornes que le profil nutrition). */
export function erreursTaille(cm: number | undefined): string[] {
  if (cm === undefined) return ['Indique ta taille en centimètres.'];
  if (Number.isNaN(cm) || cm < 100 || cm > 250) return ['Taille en centimètres, entre 100 et 250.'];
  return [];
}

/** Indice de masse corporelle, arrondi au dixième ; rien sans poids ou sans taille. */
export function imc(poidsKg?: number, tailleCm?: number): number | undefined {
  if (!poidsKg || !tailleCm) return undefined;
  return Math.round((poidsKg / (tailleCm / 100) ** 2) * 10) / 10;
}

/** Première et dernière valeur d'une mesure, et l'écart entre les deux. */
export function evolution(mensurations: Mensuration[], cle: ChampMensuration) {
  const points = mensurations
    .filter((m) => m[cle] !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, valeur: m[cle] as number }));
  if (points.length === 0) return undefined;
  const premier = points[0];
  const dernier = points[points.length - 1];
  return { premier, dernier, ecart: Math.round((dernier.valeur - premier.valeur) * 10) / 10, points };
}

export const UNITES_RECORD: { cle: UniteRecord; libelle: string }[] = [
  { cle: 'kg', libelle: 'Charge (kg)' },
  { cle: 'reps', libelle: 'Répétitions' },
  { cle: 's', libelle: 'Temps (s)' },
  { cle: 'm', libelle: 'Distance (m)' },
  { cle: 'cal', libelle: 'Calories' },
];

export function erreursRecord(r: Partial<RecordPerso>): string[] {
  const erreurs: string[] = [];
  if (!r.libelle?.trim()) erreurs.push('Choisis ou écris l’exercice.');
  if (r.valeur === undefined || Number.isNaN(r.valeur) || r.valeur <= 0) erreurs.push('Indique ta performance.');
  if (r.repetitions !== undefined && (!Number.isInteger(r.repetitions) || r.repetitions < 1)) erreurs.push('Répétitions : un nombre entier.');
  return erreurs;
}

export function formaterRecord(r: Pick<RecordPerso, 'valeur' | 'unite' | 'repetitions'>) {
  const v = formaterNombre(r.valeur);
  switch (r.unite) {
    case 'kg':
      return r.repetitions && r.repetitions > 1 ? `${v} kg × ${r.repetitions}` : `${v} kg`;
    case 'reps':
      return `${v} répétitions`;
    case 's':
      return r.valeur >= 60 ? `${Math.floor(r.valeur / 60)} min ${String(Math.round(r.valeur % 60)).padStart(2, '0')}` : `${v} s`;
    case 'm':
      return `${v} m`;
    case 'cal':
      return `${v} cal`;
  }
}

/** Le meilleur record par exercice (pour un temps, le plus court n'est pas toujours le mieux : on garde le plus récent). */
export function meilleursRecords(records: RecordPerso[]) {
  const parLibelle = new Map<string, RecordPerso[]>();
  for (const r of records) {
    const cle = `${r.libelle.trim().toLowerCase()}|${r.unite}|${r.unite === 'kg' ? (r.repetitions ?? 1) : ''}`;
    parLibelle.set(cle, [...(parLibelle.get(cle) ?? []), r]);
  }
  return [...parLibelle.values()]
    .map((liste) => {
      const tries = [...liste].sort((a, b) => b.date.localeCompare(a.date));
      const meilleur = tries[0].unite === 's' ? tries[0] : tries.reduce((m, r) => (r.valeur > m.valeur ? r : m), tries[0]);
      return { meilleur, historique: tries };
    })
    .sort((a, b) => a.meilleur.libelle.localeCompare(b.meilleur.libelle, 'fr'));
}

/**
 * Meilleures charges relevées dans les séances faites : une piste pour le client, pas un record validé.
 * Il décide lui-même de l'enregistrer.
 */
export function meilleuresChargesDesSeances(realisations: RealisationDetail[]) {
  const meilleures = new Map<string, { exerciceId: string; nom: string; charge: number; repetitions?: number; date: string }>();
  for (const r of realisations) {
    for (const s of r.series) {
      const charge = s.valeurs.charge;
      if (charge === undefined || charge <= 0) continue;
      const actuel = meilleures.get(s.exerciceId);
      const reps = s.valeurs.repetitions;
      if (!actuel || charge > actuel.charge || (charge === actuel.charge && (reps ?? 0) > (actuel.repetitions ?? 0))) {
        meilleures.set(s.exerciceId, { exerciceId: s.exerciceId, nom: r.exercices[s.exerciceId] ?? 'Exercice', charge, repetitions: reps, date: r.fin.slice(0, 10) });
      }
    }
  }
  return [...meilleures.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function erreursPlan(p: Partial<PlanNutrition>): string[] {
  const erreurs: string[] = [];
  const bornes: [keyof PlanNutrition, string, number, number][] = [
    ['calories', 'Calories', 800, 8000],
    ['proteinesG', 'Protéines', 0, 600],
    ['glucidesG', 'Glucides', 0, 1200],
    ['lipidesG', 'Lipides', 0, 400],
    ['eauL', 'Eau', 0, 10],
  ];
  for (const [cle, libelle, min, max] of bornes) {
    const v = p[cle] as number | undefined;
    if (v !== undefined && (Number.isNaN(v) || v < min || v > max)) erreurs.push(`${libelle} : entre ${min} et ${max}.`);
  }
  if (bornes.every(([cle]) => p[cle] === undefined) && !p.conseils?.trim()) erreurs.push('Renseigne au moins un objectif ou un conseil.');
  return erreurs;
}

/** Calories déduites des macros (4/4/9), pour vérifier la cohérence avec l'objectif saisi. */
export function caloriesDesMacros(p: Partial<PlanNutrition>) {
  if (p.proteinesG === undefined && p.glucidesG === undefined && p.lipidesG === undefined) return undefined;
  return Math.round((p.proteinesG ?? 0) * 4 + (p.glucidesG ?? 0) * 4 + (p.lipidesG ?? 0) * 9);
}

export function erreursJournal(j: Partial<JournalNutrition>): string[] {
  const erreurs: string[] = [];
  if (j.respect === undefined && j.eauL === undefined && !j.repas?.trim() && !j.ressenti?.trim()) {
    erreurs.push('Remplis au moins une case.');
  }
  if (j.eauL !== undefined && (Number.isNaN(j.eauL) || j.eauL < 0 || j.eauL > 15)) erreurs.push('Eau : entre 0 et 15 litres.');
  return erreurs;
}

/** Moyennes sur les derniers jours notés (pas sur les jours sans saisie : un jour vide n'est pas un mauvais jour). */
export function resumeJournal(journal: JournalNutrition[], jours = 7, aujourdhui = new Date().toISOString().slice(0, 10)) {
  const debut = new Date(Date.parse(aujourdhui) - (jours - 1) * 86400000).toISOString().slice(0, 10);
  const recents = journal.filter((j) => j.date >= debut && j.date <= aujourdhui);
  const moyenne = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : undefined);
  return {
    joursNotes: recents.length,
    respect: moyenne(recents.flatMap((j) => (j.respect === undefined ? [] : [j.respect]))),
    eauL: moyenne(recents.flatMap((j) => (j.eauL === undefined ? [] : [j.eauL]))),
  };
}

export const LIBELLES_RESPECT = ['', 'Pas du tout', 'Un peu', 'À moitié', 'Presque', 'Parfaitement'];
