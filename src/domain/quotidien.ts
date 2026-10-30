// Suivis du quotidien (objectifs secondaires) : pas, eau, cigarettes, sommeil, alimentation, énergie…
// Un relevé par jour et par indicateur, une cible par indicateur. Règles pures, sans écran ni base.
// Ajouter un suivi = ajouter une ligne à INDICATEURS : la base accepte tout identifiant en minuscules.

export type Indicateur =
  | 'pas'
  | 'eau'
  | 'cigarettes'
  | 'sommeil'
  | 'sommeil_qualite'
  | 'fruits_legumes'
  | 'alcool'
  | 'sucre'
  | 'energie'
  | 'stress'
  | 'dernier_ecran'
  | 'activite';

/** `au_moins` : on vise la cible ou plus (pas, eau) ; `au_plus` : la cible ou moins (cigarettes, alcool). */
export type Sens = 'au_moins' | 'au_plus';

export interface DefinitionIndicateur {
  cle: Indicateur;
  libelle: string;
  /** Unité courte affichée après la valeur. */
  unite: string;
  sens: Sens;
  /** `nombre` : champ et boutons − / + ; `note` : 1 à 5 en un geste ; `heure` : HH:MM. */
  saisie: 'nombre' | 'note' | 'heure';
  min: number;
  max: number;
  /** Pas des boutons − / +. */
  pas: number;
  cibleDefaut: number;
  /** La cible se compte sur la semaine (lundi → dimanche) plutôt que sur la journée. */
  hebdo?: boolean;
  /** Suivi actif tant que le client ou le coach ne l'a pas réglé. */
  actifDefaut: boolean;
  aide: string;
}

export const INDICATEURS: DefinitionIndicateur[] = [
  {
    cle: 'pas',
    libelle: 'Nombre de pas',
    unite: 'pas',
    sens: 'au_moins',
    saisie: 'nombre',
    min: 0,
    max: 100000,
    pas: 500,
    cibleDefaut: 8000,
    actifDefaut: true,
    aide: 'Le total de la journée, lu sur le téléphone ou la montre.',
  },
  {
    cle: 'eau',
    libelle: 'Eau bue',
    unite: 'L',
    sens: 'au_moins',
    saisie: 'nombre',
    min: 0,
    max: 10,
    pas: 0.25,
    cibleDefaut: 1.5,
    actifDefaut: true,
    aide: 'Un grand verre fait environ 0,25 L.',
  },
  {
    cle: 'sommeil',
    libelle: 'Sommeil',
    unite: 'h',
    sens: 'au_moins',
    saisie: 'nombre',
    min: 0,
    max: 16,
    pas: 0.5,
    cibleDefaut: 7.5,
    actifDefaut: true,
    aide: 'Les heures dormies la nuit dernière.',
  },
  {
    cle: 'sommeil_qualite',
    libelle: 'Qualité du sommeil',
    unite: '/5',
    sens: 'au_moins',
    saisie: 'note',
    min: 1,
    max: 5,
    pas: 1,
    cibleDefaut: 4,
    actifDefaut: true,
    aide: '1 : très mauvaise nuit · 5 : excellente nuit.',
  },
  {
    cle: 'activite',
    libelle: 'Activité hors séance',
    unite: 'min',
    sens: 'au_moins',
    saisie: 'nombre',
    min: 0,
    max: 600,
    pas: 10,
    cibleDefaut: 30,
    actifDefaut: true,
    aide: 'Marche, vélo, étirements… en dehors des séances du programme.',
  },
  {
    cle: 'fruits_legumes',
    libelle: 'Fruits et légumes',
    unite: 'portions',
    sens: 'au_moins',
    saisie: 'nombre',
    min: 0,
    max: 20,
    pas: 1,
    cibleDefaut: 5,
    actifDefaut: true,
    aide: 'Une portion = un fruit moyen, une poignée de légumes ou un bol de crudités.',
  },
  {
    cle: 'energie',
    libelle: 'Énergie',
    unite: '/5',
    sens: 'au_moins',
    saisie: 'note',
    min: 1,
    max: 5,
    pas: 1,
    cibleDefaut: 4,
    actifDefaut: true,
    aide: '1 : épuisé · 5 : en pleine forme.',
  },
  {
    cle: 'stress',
    libelle: 'Stress',
    unite: '/5',
    sens: 'au_plus',
    saisie: 'note',
    min: 1,
    max: 5,
    pas: 1,
    cibleDefaut: 2,
    actifDefaut: true,
    aide: '1 : très détendu · 5 : très stressé.',
  },
  {
    cle: 'sucre',
    libelle: 'Sucre (boissons, grignotage)',
    unite: 'fois',
    sens: 'au_plus',
    saisie: 'nombre',
    min: 0,
    max: 30,
    pas: 1,
    cibleDefaut: 1,
    actifDefaut: false,
    aide: 'Chaque soda, jus, viennoiserie, bonbon ou biscuit compte pour une fois.',
  },
  {
    cle: 'alcool',
    libelle: 'Alcool',
    unite: 'verres',
    sens: 'au_plus',
    saisie: 'nombre',
    min: 0,
    max: 40,
    pas: 1,
    cibleDefaut: 5,
    hebdo: true,
    actifDefaut: false,
    aide: 'Les verres du jour ; la cible se compte sur la semaine. Un verre standard : 25 cl de bière, 10 cl de vin.',
  },
  {
    cle: 'cigarettes',
    libelle: 'Cigarettes',
    unite: 'cig.',
    sens: 'au_plus',
    saisie: 'nombre',
    min: 0,
    max: 100,
    pas: 1,
    cibleDefaut: 5,
    actifDefaut: false,
    aide: 'Le nombre fumé aujourd’hui. Baissez la cible petit à petit avec votre coach.',
  },
  {
    cle: 'dernier_ecran',
    libelle: 'Dernier écran le soir',
    unite: '',
    sens: 'au_plus',
    saisie: 'heure',
    // En heures depuis minuit la veille : 23 h 30 = 23,5 ; 0 h 30 = 24,5 (une nuit ne se coupe pas à minuit).
    min: 18,
    max: 30,
    pas: 0.25,
    cibleDefaut: 22.5,
    actifDefaut: false,
    aide: 'L’heure à laquelle vous avez posé téléphone, tablette ou télévision.',
  },
];

export const DEFINITION = Object.fromEntries(INDICATEURS.map((d) => [d.cle, d])) as Record<Indicateur, DefinitionIndicateur>;
export const estIndicateur = (cle: string): cle is Indicateur => cle in DEFINITION;

export interface Releve {
  clientId: string;
  /** AAAA-MM-JJ */
  jour: string;
  indicateur: Indicateur;
  valeur: number;
  /** `telephone` : lu sur le téléphone ou la montre (Health Connect), pas saisi. */
  source: 'saisie' | 'telephone';
}

export interface Reglage {
  clientId: string;
  indicateur: Indicateur;
  actif: boolean;
  /** Vide : la cible par défaut de l'indicateur. */
  cible?: number;
  modifiePar?: 'client' | 'coach';
}

export interface IndicateurSuivi {
  def: DefinitionIndicateur;
  actif: boolean;
  cible: number;
  cibleParDefaut: boolean;
}

/** Les douze indicateurs avec leur réglage (actif, cible), dans l'ordre du catalogue. */
export function indicateursDuClient(reglages: Reglage[]): IndicateurSuivi[] {
  return INDICATEURS.map((def) => {
    const r = reglages.find((x) => x.indicateur === def.cle);
    return { def, actif: r ? r.actif : def.actifDefaut, cible: r?.cible ?? def.cibleDefaut, cibleParDefaut: r?.cible === undefined };
  });
}

const deux = (n: number) => String(n).padStart(2, '0');

/** 23,5 → « 23:30 » ; 24,75 → « 00:45 ». */
export function formaterHeure(h: number): string {
  const minutes = Math.round(h * 60);
  return `${deux(Math.floor(minutes / 60) % 24)}:${deux(minutes % 60)}`;
}

/** « 23:30 », « 23h30 », « 23 » ou « 0:45 » → heures depuis minuit la veille (avant midi : après minuit). */
export function lireHeure(saisie: string): number | undefined {
  const t = saisie.trim().toLowerCase();
  if (t === '') return undefined;
  const m = /^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?$/.exec(t);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return NaN;
  return (h < 12 ? h + 24 : h) + min / 60;
}

const nombreFr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export function formaterValeur(def: DefinitionIndicateur, v: number): string {
  if (def.saisie === 'heure') return formaterHeure(v);
  if (def.saisie === 'note') return `${nombreFr(v)}/5`;
  return `${nombreFr(v)} ${def.unite}`.trim();
}

/** Lit la saisie d'un indicateur ; vide = pas de relevé (pas zéro). */
export function lireValeur(def: DefinitionIndicateur, saisie: string): number | undefined {
  if (def.saisie === 'heure') return lireHeure(saisie);
  const t = saisie.replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function erreurValeur(def: DefinitionIndicateur, v: number | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Number.isNaN(v)) return def.saisie === 'heure' ? `${def.libelle} : écrivez l’heure comme 22:30.` : `${def.libelle} : un nombre.`;
  if (def.saisie === 'heure') return v < def.min || v > def.max ? `${def.libelle} : entre 18:00 et 06:00.` : undefined;
  if (v < def.min || v > def.max) return `${def.libelle} : entre ${nombreFr(def.min)} et ${nombreFr(def.max)}.`;
  if (def.saisie === 'note' && !Number.isInteger(v)) return `${def.libelle} : une note de 1 à 5.`;
  return undefined;
}

export function erreurCible(def: DefinitionIndicateur, v: number | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Number.isNaN(v)) return `Cible : ${def.saisie === 'heure' ? 'écrivez l’heure comme 22:30' : 'un nombre'}.`;
  const max = def.hebdo ? def.max * 7 : def.max;
  if (v < def.min || v > max) return def.saisie === 'heure' ? 'Cible : entre 18:00 et 06:00.' : `Cible : entre ${nombreFr(def.min)} et ${nombreFr(max)}.`;
  return undefined;
}

export const atteint = (sens: Sens, valeur: number, cible: number) => (sens === 'au_moins' ? valeur >= cible : valeur <= cible);

/** Ajoute n jours à une date AAAA-MM-JJ (calendrier, sans fuseau). */
export function decalerJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
}

/** Les n derniers jours jusqu'à `fin` inclus, du plus ancien au plus récent. */
export const derniersJours = (fin: string, n: number) => Array.from({ length: n }, (_, i) => decalerJour(fin, i - n + 1));

const lundi = (jour: string) => decalerJour(jour, -((new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7));

export interface Resume {
  /** Valeur par jour sur la période (undefined : rien de noté ce jour-là). */
  points: { jour: string; valeur?: number }[];
  /** Moyenne des 7 derniers jours notés (un jour vide n'est pas un zéro). */
  moyenne7?: number;
  joursNotes7: number;
  /** Jours où la cible du jour est tenue, parmi les jours notés des 7 derniers jours. */
  joursAtteints7: number;
  /** Indicateur hebdomadaire : total de la semaine en cours. */
  totalSemaine?: number;
  /** Tendance : moyenne des 7 derniers jours notés moins celle des 7 précédents. */
  tendance?: number;
}

export function resumer(suivi: Pick<IndicateurSuivi, 'def' | 'cible'>, releves: Releve[], aujourdhui: string, jours = 30): Resume {
  const parJour = new Map(releves.filter((r) => r.indicateur === suivi.def.cle).map((r) => [r.jour, r.valeur]));
  const points = derniersJours(aujourdhui, jours).map((jour) => ({ jour, valeur: parJour.get(jour) }));
  const valeurs = (debut: number, fin: number) =>
    derniersJours(aujourdhui, 14)
      .slice(debut, fin)
      .flatMap((j) => (parJour.has(j) ? [parJour.get(j)!] : []));
  const moyenne = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : undefined);
  const recents = valeurs(7, 14);
  const avant = valeurs(0, 7);
  const m7 = moyenne(recents);
  const mAvant = moyenne(avant);
  const debutSemaine = lundi(aujourdhui);
  const totalSemaine = suivi.def.hebdo
    ? [...parJour.entries()].filter(([j]) => j >= debutSemaine && j <= aujourdhui).reduce((s, [, v]) => s + v, 0)
    : undefined;
  return {
    points,
    moyenne7: m7,
    joursNotes7: recents.length,
    joursAtteints7: suivi.def.hebdo ? 0 : recents.filter((v) => atteint(suivi.def.sens, v, suivi.cible)).length,
    totalSemaine,
    tendance: m7 !== undefined && mAvant !== undefined ? Math.round((m7 - mAvant) * 100) / 100 : undefined,
  };
}

/** Indicateurs lus sur le téléphone ou la montre (Health Connect). */
export const LUS_SUR_TELEPHONE: Indicateur[] = ['pas', 'sommeil'];

/**
 * Une valeur lue sur le téléphone remplace-t-elle le relevé du jour ? Jamais une saisie à la main
 * (le client a corrigé), seulement un relevé vide ou une lecture précédente devenue différente.
 */
export function aImporter(releves: Releve[], jour: string, indicateur: Indicateur, valeur: number | null): valeur is number {
  if (valeur === null || !Number.isFinite(valeur)) return false;
  const actuel = releves.find((r) => r.jour === jour && r.indicateur === indicateur);
  return !actuel || (actuel.source === 'telephone' && actuel.valeur !== valeur);
}
