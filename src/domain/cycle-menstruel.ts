// Assistant de cycle menstruel de la cliente : phase du jour, prochaines règles, décalages, et l'entraînement
// comparé phase par phase. Règles pures, sans écran ni base.
// Données de santé : le suivi est éteint tant que la cliente ne l'a pas activé, et la coach ne voit que ce que la
// cliente choisit de partager (rien par défaut). Ce n'est ni un avis médical ni un moyen de contraception.
import { jourParis, unRm } from './entrainement';
import type { RealisationLue } from './entrainement-etat';
import { decalerJour } from './quotidien';

/** Ce que la coach voit : rien, la phase du moment seulement, ou tout (phase, historique, notes, comparaison). */
export type PartageCycle = 'rien' | 'phase' | 'tout';
export const PARTAGES: { cle: PartageCycle; libelle: string; detail: string }[] = [
  { cle: 'rien', libelle: 'Rien', detail: 'Ton suivi reste privé. Ta coach ne voit pas que tu l’utilises.' },
  { cle: 'phase', libelle: 'La phase du moment', detail: 'Ta coach voit ta phase du jour pour adapter tes séances, sans tes dates ni tes notes.' },
  { cle: 'tout', libelle: 'Tout', detail: 'Ta coach voit aussi tes dates de règles, tes symptômes et ta comparaison d’entraînement.' },
];

export type Phase = 'regles' | 'folliculaire' | 'ovulation' | 'luteale';
export const PHASES: Record<Phase, { libelle: string; court: string; couleur: string; fond: string; conseil: string; conseilCoach: string }> = {
  regles: {
    libelle: 'Règles',
    court: 'Règles',
    couleur: '#B3141A',
    fond: '#FFE6E7',
    conseil: 'Écoute ton corps : si l’énergie est basse, garde le mouvement et allège les charges ou le volume.',
    conseilCoach: 'Selon son énergie, garder le mouvement en allégeant charges ou volume.',
  },
  folliculaire: {
    libelle: 'Phase folliculaire',
    court: 'Folliculaire',
    couleur: '#1B7A45',
    fond: '#DDF3E5',
    conseil: 'Souvent le bon moment pour pousser : charges, intensité et nouveaux défis.',
    conseilCoach: 'Souvent le bon moment pour monter les charges et l’intensité.',
  },
  ovulation: {
    libelle: 'Ovulation (estimée)',
    court: 'Ovulation',
    couleur: '#8A5A00',
    fond: '#FFF1CC',
    conseil: 'L’énergie est souvent au plus haut. Soigne l’échauffement et la technique sur les gros mouvements.',
    conseilCoach: 'Énergie souvent haute : soigner l’échauffement et la technique sur les gros mouvements.',
  },
  luteale: {
    libelle: 'Phase lutéale',
    court: 'Lutéale',
    couleur: '#6B4BC9',
    fond: '#EFEAFF',
    conseil: 'La fatigue peut monter en fin de phase : hydrate-toi, dors bien, et adapte l’intensité à ton ressenti.',
    conseilCoach: 'La fatigue peut monter en fin de phase : adapter l’intensité à son ressenti.',
  },
};
export const ORDRE_PHASES: Phase[] = ['regles', 'folliculaire', 'ovulation', 'luteale'];

export type Symptome = 'crampes' | 'fatigue' | 'ballonnements' | 'maux_tete' | 'humeur' | 'poitrine' | 'sommeil' | 'fringales';
export const SYMPTOMES: { cle: Symptome; libelle: string }[] = [
  { cle: 'crampes', libelle: 'Crampes' },
  { cle: 'fatigue', libelle: 'Fatigue' },
  { cle: 'ballonnements', libelle: 'Ballonnements' },
  { cle: 'maux_tete', libelle: 'Maux de tête' },
  { cle: 'humeur', libelle: 'Humeur en dents de scie' },
  { cle: 'poitrine', libelle: 'Poitrine sensible' },
  { cle: 'sommeil', libelle: 'Sommeil perturbé' },
  { cle: 'fringales', libelle: 'Fringales' },
];
export const estSymptome = (s: string): s is Symptome => SYMPTOMES.some((x) => x.cle === s);

export interface ReglagesCycle {
  clientId: string;
  /** Durée habituelle d'un cycle, en jours (du 1er jour des règles au 1er jour des suivantes). */
  dureeCycle: number;
  /** Durée habituelle des règles, en jours. */
  dureeRegles: number;
  /** Contraception hormonale, ménopause, pas de règles : on suit l'énergie et les symptômes, sans prévision. */
  sansPrevision: boolean;
}

/** Le choix de la cliente, gardé avec ses autres accords (table des consentements). */
export interface ChoixCycle {
  actif: boolean;
  partage: PartageCycle;
  le?: string;
}

/** Des règles notées : le premier jour, et le dernier si la cliente l'a indiqué. */
export interface Regles {
  clientId: string;
  debut: string;
  fin?: string;
}

export interface NoteCycle {
  clientId: string;
  jour: string;
  symptomes: Symptome[];
  note?: string;
}

export const DUREE_CYCLE_DEFAUT = 28;
export const DUREE_REGLES_DEFAUT = 5;
export const BORNES = { cycle: { min: 21, max: 45 }, regles: { min: 2, max: 10 } };
/** Phase lutéale : la plus stable, environ 14 jours. L'ovulation se place donc 14 jours avant les règles suivantes. */
const LUTEALE = 14;
/** Un écart hors de ces bornes est un oubli de saisie (ou un cycle très inhabituel) : il ne compte pas dans la moyenne. */
const ECART_VALIDE = { min: 15, max: 60 };

const jours = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const borner = (n: number, b: { min: number; max: number }) => Math.min(b.max, Math.max(b.min, Math.round(n)));
const moyenne = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : undefined);

export function reglagesParDefaut(clientId: string): ReglagesCycle {
  return { clientId, dureeCycle: DUREE_CYCLE_DEFAUT, dureeRegles: DUREE_REGLES_DEFAUT, sansPrevision: false };
}

export function erreurReglages(r: Pick<ReglagesCycle, 'dureeCycle' | 'dureeRegles'>): string | undefined {
  if (!Number.isInteger(r.dureeCycle) || r.dureeCycle < BORNES.cycle.min || r.dureeCycle > BORNES.cycle.max)
    return `Durée du cycle : entre ${BORNES.cycle.min} et ${BORNES.cycle.max} jours.`;
  if (!Number.isInteger(r.dureeRegles) || r.dureeRegles < BORNES.regles.min || r.dureeRegles > BORNES.regles.max)
    return `Durée des règles : entre ${BORNES.regles.min} et ${BORNES.regles.max} jours.`;
  return undefined;
}

/** Du plus ancien au plus récent, un seul début par date. */
export function trier(regles: Regles[]): Regles[] {
  const parDebut = new Map(regles.map((r) => [r.debut, r]));
  return [...parDebut.values()].sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Durées des cycles complets (écart entre deux débuts), du plus ancien au plus récent, sans les écarts aberrants. */
export function durees(regles: Regles[]): number[] {
  const t = trier(regles);
  const d: number[] = [];
  for (let i = 1; i < t.length; i++) {
    const e = jours(t[i - 1].debut, t[i].debut);
    if (e >= ECART_VALIDE.min && e <= ECART_VALIDE.max) d.push(e);
  }
  return d;
}

/**
 * Durée de cycle à utiliser : la moyenne des 6 derniers cycles complets dès qu'il y en a un, sinon celle déclarée.
 * Chaque nouveau début de règles affine donc la prévision.
 */
export function dureeCycleEstimee(regles: Regles[], reglages: ReglagesCycle): number {
  const m = moyenne(durees(regles).slice(-6));
  return m === undefined ? reglages.dureeCycle : borner(m, ECART_VALIDE);
}

/** Durée des règles : moyenne des règles dont la fin est notée, sinon celle déclarée. */
export function dureeReglesEstimee(regles: Regles[], reglages: ReglagesCycle): number {
  const l = trier(regles)
    .filter((r) => r.fin && r.fin >= r.debut)
    .slice(-6)
    .map((r) => jours(r.debut, r.fin!) + 1);
  const m = moyenne(l);
  return m === undefined ? reglages.dureeRegles : borner(m, BORNES.regles);
}

/** Écart type des durées : sert à donner une fourchette honnête plutôt qu'une date au jour près. */
function ecartType(l: number[]): number {
  const m = moyenne(l);
  if (m === undefined || l.length < 2) return 0;
  return Math.sqrt(l.reduce((t, x) => t + (x - m) ** 2, 0) / (l.length - 1));
}

/** Phase d'un jour du cycle (1 = premier jour des règles), pour un cycle de `duree` jours. */
export function phaseDuJourDeCycle(jourCycle: number, duree: number, dureeRegles: number): Phase {
  const ovulation = Math.max(dureeRegles + 2, duree - LUTEALE);
  if (jourCycle <= dureeRegles) return 'regles';
  if (jourCycle >= ovulation - 1 && jourCycle <= ovulation + 1) return 'ovulation';
  return jourCycle < ovulation ? 'folliculaire' : 'luteale';
}

export interface Situation {
  /** 1 = premier jour des règles. */
  jourCycle: number;
  phase: Phase;
  dureeCycle: number;
  /** Premier jour prévu des prochaines règles. */
  prochaines: string;
  /** Jours avant les prochaines règles prévues (0 : aujourd'hui ; négatif : en retard). */
  dansJours: number;
  /** Fourchette de la prévision, d'après la régularité des cycles passés. */
  fourchette: [string, string];
  /** Jours de retard sur la date prévue, s'il y en a. */
  retard?: number;
  /** Assez de cycles notés pour que la prévision repose sur ses vraies durées. */
  fiable: boolean;
}

/** Où en est la cliente ce jour-là. Undefined : aucune règle notée, ou suivi sans prévision. */
export function situation(jour: string, regles: Regles[], reglages: ReglagesCycle): Situation | undefined {
  if (reglages.sansPrevision) return undefined;
  const passees = trier(regles).filter((r) => r.debut <= jour);
  const derniere = passees.at(-1);
  if (!derniere) return undefined;
  const d = durees(regles).slice(-6);
  const duree = dureeCycleEstimee(regles, reglages);
  const dureeRegles = dureeReglesEstimee(regles, reglages);
  const jourCycle = jours(derniere.debut, jour) + 1;
  const prochaines = decalerJour(derniere.debut, duree);
  const dansJours = jours(jour, prochaines);
  const marge = Math.min(5, Math.max(1, Math.round(ecartType(d) || (d.length ? 1 : 2))));
  // Les règles en cours se lisent sur la fin notée, sinon sur la durée habituelle.
  const enRegles = derniere.fin ? jour <= derniere.fin : jourCycle <= dureeRegles;
  const phase: Phase = enRegles ? 'regles' : dansJours < 0 ? 'luteale' : phaseDuJourDeCycle(jourCycle, duree, dureeRegles);
  return {
    jourCycle,
    phase: phase === 'regles' && !enRegles ? 'folliculaire' : phase,
    dureeCycle: duree,
    prochaines,
    dansJours,
    fourchette: [decalerJour(prochaines, -marge), decalerJour(prochaines, marge)],
    retard: dansJours < 0 ? -dansJours : undefined,
    fiable: d.length >= 2,
  };
}

/**
 * Phase d'un jour passé, relue avec le recul : quand les règles suivantes sont notées, l'ovulation se place
 * 14 jours avant elles, ce qui est plus juste que la prévision faite sur le moment.
 */
export function phaseRetrospective(jour: string, regles: Regles[], reglages: ReglagesCycle): Phase | undefined {
  const t = trier(regles);
  const i = t.findLastIndex((r) => r.debut <= jour);
  if (i < 0) return undefined;
  const debut = t[i];
  const suivante = t[i + 1];
  const dureeRegles = dureeReglesEstimee(regles, reglages);
  const ecart = suivante ? jours(debut.debut, suivante.debut) : undefined;
  const duree = ecart !== undefined && ecart >= ECART_VALIDE.min && ecart <= ECART_VALIDE.max ? ecart : dureeCycleEstimee(regles, reglages);
  const jourCycle = jours(debut.debut, jour) + 1;
  // Cycle anormalement long (oubli de saisie probable) : on ne devine pas au-delà.
  if (jourCycle > (ecart ?? duree + 10)) return undefined;
  if (debut.fin ? jour <= debut.fin : jourCycle <= dureeRegles) return 'regles';
  const p = phaseDuJourDeCycle(jourCycle, duree, dureeRegles);
  return p === 'regles' ? 'folliculaire' : p;
}

/** Les jours d'un mois (AAAA-MM) avec leur phase : passée relue avec le recul, future prévue. */
export function calendrier(mois: string, aujourdhui: string, regles: Regles[], reglages: ReglagesCycle): { jour: string; phase?: Phase; prevu: boolean }[] {
  const [a, m] = mois.split('-').map(Number);
  const nb = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const s = situation(aujourdhui, regles, reglages);
  const dureeRegles = dureeReglesEstimee(regles, reglages);
  return Array.from({ length: nb }, (_, i) => {
    const jour = `${mois}-${String(i + 1).padStart(2, '0')}`;
    if (jour <= aujourdhui || !s) return { jour, phase: reglages.sansPrevision ? undefined : phaseRetrospective(jour, regles, reglages), prevu: false };
    // Futur : on déroule les cycles prévus à partir des prochaines règles (ou du cycle en cours).
    const depuisProchaines = jours(s.prochaines, jour);
    const jourCycle = depuisProchaines >= 0 ? (depuisProchaines % s.dureeCycle) + 1 : s.jourCycle + jours(aujourdhui, jour);
    return { jour, phase: phaseDuJourDeCycle(jourCycle, s.dureeCycle, dureeRegles), prevu: true };
  });
}

/** « dans 6 jours, vers le 19 nov. » ; « aujourd'hui » ; « 3 jours de retard ». */
export function phrasePrevision(s: Situation): string {
  const date = new Date(`${s.prochaines}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (s.retard) return `${s.retard} jour${s.retard > 1 ? 's' : ''} de retard sur la date prévue (${date})`;
  if (s.dansJours === 0) return 'prévues aujourd’hui';
  if (s.dansJours === 1) return `prévues demain (${date})`;
  return `dans ${s.dansJours} jours, vers le ${date}`;
}

/** Après un retard de plus de 7 jours, ou si les règles arrivent avant la date : on suggère une note au calme. */
export function messageDecalage(s: Situation | undefined): string | undefined {
  if (!s?.retard) return undefined;
  if (s.retard >= 7)
    return 'Un retard arrive (stress, fatigue, voyage, entraînement intense…). S’il se prolonge ou t’inquiète, parles-en à un professionnel de santé.';
  return 'Tes règles ont commencé ? Note-le : la prévision se recale tout de suite.';
}

// ---------- L'entraînement phase par phase ----------

export interface ChiffresPhase {
  phase: Phase;
  /** Séances faites pendant cette phase. */
  seances: number;
  /** Énergie moyenne notée (1 à 5). */
  energie?: number;
  /** Ressenti moyen des séances (effort perçu, 1 à 10). */
  ressenti?: number;
  /** Force relative : écart moyen, en %, de la force estimée par rapport à la moyenne de chaque exercice. */
  force?: number;
  joursEnergie: number;
}

export interface AnalyseCycle {
  /** Cycles complets notés. */
  cycles: number;
  /** Assez de données pour comparer (au moins 2 cycles complets et des séances dans 2 phases). */
  pret: boolean;
  phases: ChiffresPhase[];
  /** Phrases simples, la plus marquante d'abord. */
  constats: string[];
}

const arrondi = (n: number | undefined, d = 1) => (n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d);
export const CYCLES_MINIMUM = 2;
/** Une comparaison de force ou de ressenti demande au moins ce nombre de séances dans chaque phase comparée. */
const SEANCES_MINIMUM = 3;
const FENETRE_REFERENCE = 21;

/**
 * Compare l'énergie, le ressenti et la force selon la phase. La force de chaque série est comparée à la moyenne de
 * ce même exercice : on compare la cliente à elle-même, mouvement par mouvement, et pas un squat à un curl.
 */
export function analyser(
  regles: Regles[],
  reglages: ReglagesCycle,
  energie: { jour: string; valeur: number }[],
  realisations: Pick<RealisationLue, 'fin' | 'debut' | 'note' | 'series'>[],
  /** « coach » : les constats parlent de la cliente (« Elle est… ») au lieu de lui parler (« Tu es… »). */
  pour: 'cliente' | 'coach' = 'cliente',
): AnalyseCycle {
  const cycles = durees(regles).length;
  const phaseDe = (jour: string) => phaseRetrospective(jour, regles, reglages);
  const acc = new Map<Phase, { seances: number; energie: number[]; ressenti: number[]; force: number[] }>(
    ORDRE_PHASES.map((p) => [p, { seances: 0, energie: [], ressenti: [], force: [] }]),
  );

  for (const e of energie) {
    const p = phaseDe(e.jour);
    if (p) acc.get(p)!.energie.push(e.valeur);
  }

  // Force estimée de la meilleure série par exercice et par séance.
  const parSeance = realisations.map((r) => {
    const meilleures = new Map<string, number>();
    for (const s of r.series) {
      const { charge, repetitions } = s.valeurs;
      if (charge === undefined || !repetitions) continue;
      meilleures.set(s.exerciceId, Math.max(meilleures.get(s.exerciceId) ?? 0, unRm(charge, repetitions)));
    }
    return { jour: jourParis(r.fin || r.debut), note: r.note, meilleures };
  });
  // Chaque séance est comparée aux séances du même exercice dans les 3 semaines autour : la progression normale
  // (des charges qui montent de mois en mois) ne se fait pas passer pour un effet du cycle.
  const parExercice = new Map<string, { jour: string; v: number }[]>();
  for (const s of parSeance) for (const [ex, v] of s.meilleures) parExercice.set(ex, [...(parExercice.get(ex) ?? []), { jour: s.jour, v }]);
  const reference = (ex: string, jour: string) => {
    // Droite de tendance sur les séances proches, lue au jour de la séance : juste même au début et à la fin.
    const proches = (parExercice.get(ex) ?? []).map((x) => ({ t: jours(jour, x.jour), v: x.v })).filter((x) => Math.abs(x.t) <= FENETRE_REFERENCE);
    if (proches.length < 3) return undefined;
    const mt = moyenne(proches.map((x) => x.t))!;
    const mv = moyenne(proches.map((x) => x.v))!;
    const varT = proches.reduce((t, x) => t + (x.t - mt) ** 2, 0);
    const pente = varT ? proches.reduce((t, x) => t + (x.t - mt) * (x.v - mv), 0) / varT : 0;
    const ref = mv - pente * mt;
    return ref > 0 ? ref : undefined;
  };

  for (const s of parSeance) {
    const p = phaseDe(s.jour);
    if (!p) continue;
    const a = acc.get(p)!;
    a.seances++;
    if (s.note !== undefined && s.note !== null) a.ressenti.push(s.note);
    const ecarts = [...s.meilleures].flatMap(([ex, v]) => {
      const ref = reference(ex, s.jour);
      return ref ? [(v / ref - 1) * 100] : [];
    });
    if (ecarts.length) a.force.push(moyenne(ecarts)!);
  }

  const phases: ChiffresPhase[] = ORDRE_PHASES.map((phase) => {
    const a = acc.get(phase)!;
    return {
      phase,
      seances: a.seances,
      energie: arrondi(moyenne(a.energie)),
      ressenti: arrondi(moyenne(a.ressenti)),
      force: arrondi(moyenne(a.force)),
      joursEnergie: a.energie.length,
    };
  });
  const avecSeances = phases.filter((p) => p.seances >= 2).length;
  const pret = cycles >= CYCLES_MINIMUM && (avecSeances >= 2 || phases.filter((p) => p.joursEnergie >= 3).length >= 2);
  return { cycles, pret, phases, constats: pret ? constats(phases, pour === 'coach') : [] };
}

function constats(phases: ChiffresPhase[], coach: boolean): string[] {
  const c: { poids: number; texte: string }[] = [];
  const nom = (p: Phase) => (p === 'regles' ? (coach ? 'pendant ses règles' : 'pendant tes règles') : p === 'ovulation' ? 'autour de l’ovulation' : `en ${PHASES[p].libelle.toLowerCase()}`);

  const force = phases.filter((p) => p.force !== undefined && p.seances >= SEANCES_MINIMUM);
  if (force.length >= 2) {
    const haut = force.reduce((a, b) => (b.force! > a.force! ? b : a));
    const bas = force.reduce((a, b) => (b.force! < a.force! ? b : a));
    const ecart = Math.round(haut.force! - bas.force!);
    if (ecart >= 3) c.push({ poids: ecart * 3, texte: `${coach ? 'Elle est' : 'Tu es'} en moyenne ${ecart} % plus forte ${nom(haut.phase)} que ${nom(bas.phase)}.` });
  }
  const energie = phases.filter((p) => p.energie !== undefined && p.joursEnergie >= 3);
  if (energie.length >= 2) {
    const haut = energie.reduce((a, b) => (b.energie! > a.energie! ? b : a));
    const bas = energie.reduce((a, b) => (b.energie! < a.energie! ? b : a));
    const ecart = haut.energie! - bas.energie!;
    if (ecart >= 0.5)
      c.push({
        poids: ecart * 10,
        texte: `${coach ? 'Son' : 'Ton'} énergie est la plus haute ${nom(haut.phase)} (${String(haut.energie).replace('.', ',')}/5) et la plus basse ${nom(bas.phase)} (${String(bas.energie).replace('.', ',')}/5).`,
      });
  }
  const ressenti = phases.filter((p) => p.ressenti !== undefined && p.seances >= SEANCES_MINIMUM);
  if (ressenti.length >= 2) {
    const dur = ressenti.reduce((a, b) => (b.ressenti! > a.ressenti! ? b : a));
    const facile = ressenti.reduce((a, b) => (b.ressenti! < a.ressenti! ? b : a));
    if (dur.ressenti! - facile.ressenti! >= 1)
      c.push({ poids: (dur.ressenti! - facile.ressenti!) * 5, texte: `${coach ? 'Ses séances lui semblent' : 'Tes séances te semblent'} plus dures ${nom(dur.phase)} (effort ${String(dur.ressenti).replace('.', ',')}/10).` });
  }
  if (!c.length) c.push({ poids: 0, texte: `Pas de grosse différence d’une phase à l’autre pour l’instant : ${coach ? 'son' : 'ton'} entraînement tient bien sur tout le cycle.` });
  return c.sort((a, b) => b.poids - a.poids).map((x) => x.texte);
}

/** Ce que la coach a le droit de lire, d'après le choix de la cliente. Sert en démo et dans l'aperçu coach. */
export function filtrerPourCoach<T extends { regles: Regles[]; notes: NoteCycle[] }>(choix: ChoixCycle | null, donnees: T): (T & { partage: PartageCycle }) | null {
  const partage: PartageCycle = choix?.actif ? choix.partage : 'rien';
  if (partage === 'rien') return null;
  if (partage === 'tout') return { ...donnees, partage };
  // Phase seulement : le dernier début suffit pour situer le jour, sans historique ni notes.
  return { ...donnees, regles: trier(donnees.regles).slice(-1), notes: [], partage };
}
