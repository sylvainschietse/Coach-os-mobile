// Bilan des calories d'une journée : ce que le client a dépensé (métabolisme de base, digestion, pas, séances du
// programme, activités ajoutées ou venues de la montre), comparé à ce qu'il a mangé et à son objectif du jour.
// Des estimations pour se faire une idée, pas des mesures. Fonctions pures, testées dans tests/bilan-calories.test.ts.
import { estimerCalories, POIDS_PAR_DEFAUT } from './catalogue-activites';
import { titreActivite, type Activite } from './activites';

/** Dépense d'un pas, par kg de poids (≈ 0,035 kcal par pas à 70 kg, marche ordinaire). */
export const KCAL_PAR_PAS_ET_KG = 0.0005;
/** Digestion (effet thermique des aliments) : environ 10 % du métabolisme de base. */
export const PART_DIGESTION = 0.1;
/** Séance du programme sans durée lisible : on compte une heure. */
const DUREE_SEANCE_PAR_DEFAUT = 3600;

export interface LigneDepense {
  libelle: string;
  kcal: number;
  detail?: string;
}

export interface BilanCalories {
  /** Métabolisme de base (au repos, Mifflin-St Jeor) ; absent si le profil nutrition est incomplet. */
  metabolisme?: number;
  lignes: LigneDepense[];
  /** Total dépensé ; absent sans métabolisme (le chiffre n'aurait pas de sens). */
  depense?: number;
  /** Dépensé en bougeant : pas, séances et activités. */
  mouvement: number;
  mange?: number;
  objectif?: number;
  /** mangé − dépensé : négatif = déficit, positif = surplus. */
  balance?: number;
}

export interface SeanceFaite {
  titre: string;
  debut: string;
  fin: string;
}

/** Durée d'une séance du programme, bornée de 10 min à 3 h (une séance laissée ouverte compte une heure). */
export function dureeSeance(s: Pick<SeanceFaite, 'debut' | 'fin'>): number {
  const d = (new Date(s.fin).getTime() - new Date(s.debut).getTime()) / 1000;
  if (!Number.isFinite(d) || d <= 0 || d > 3 * 3600) return DUREE_SEANCE_PAR_DEFAUT;
  return Math.max(d, 600);
}

export function bilanCalories(p: {
  metabolisme?: number | null;
  poidsKg?: number | null;
  pas?: number;
  seances: SeanceFaite[];
  activites: Pick<Activite, 'sport' | 'titre' | 'dureeS' | 'calories' | 'ressenti'>[];
  mange?: number;
  objectif?: number;
}): BilanCalories {
  const poids = p.poidsKg && p.poidsKg >= 30 && p.poidsKg <= 250 ? p.poidsKg : POIDS_PAR_DEFAUT;
  const lignes: LigneDepense[] = [];
  const metabolisme = p.metabolisme && p.metabolisme > 0 ? Math.round(p.metabolisme) : undefined;
  if (metabolisme) {
    lignes.push({ libelle: 'Métabolisme de base', kcal: metabolisme, detail: 'ce que ton corps brûle au repos' });
    lignes.push({ libelle: 'Digestion', kcal: Math.round(metabolisme * PART_DIGESTION), detail: 'environ 10 % du métabolisme' });
  }
  let mouvement = 0;
  if (p.pas && p.pas > 0) {
    const kcal = Math.round(p.pas * poids * KCAL_PAR_PAS_ET_KG);
    mouvement += kcal;
    lignes.push({ libelle: 'Pas', kcal, detail: `${new Intl.NumberFormat('fr-FR').format(Math.round(p.pas))} pas` });
  }
  for (const s of p.seances) {
    const dureeS = dureeSeance(s);
    const kcal = estimerCalories({ sport: 'musculation', titre: s.titre, dureeS }, poids) ?? 0;
    mouvement += kcal;
    lignes.push({ libelle: s.titre || 'Séance du programme', kcal, detail: `séance du programme · ${Math.round(dureeS / 60)} min` });
  }
  for (const a of p.activites) {
    const kcal = a.calories ?? estimerCalories(a, poids) ?? 0;
    mouvement += kcal;
    lignes.push({ libelle: titreActivite(a), kcal, detail: `activité · ${Math.round(a.dureeS / 60)} min` });
  }
  const depense = metabolisme ? lignes.reduce((n, l) => n + l.kcal, 0) : undefined;
  const mange = p.mange !== undefined ? Math.round(p.mange) : undefined;
  return {
    metabolisme,
    lignes,
    depense,
    mouvement,
    mange,
    objectif: p.objectif ? Math.round(p.objectif) : undefined,
    balance: depense !== undefined && mange !== undefined ? mange - depense : undefined,
  };
}

/** « Déficit de 320 kcal », « Surplus de 150 kcal », « À l'équilibre ». */
export function texteBalance(balance: number): string {
  if (Math.abs(balance) < 50) return 'À l’équilibre';
  return `${balance < 0 ? 'Déficit' : 'Surplus'} de ${new Intl.NumberFormat('fr-FR').format(Math.abs(Math.round(balance)))} kcal`;
}
