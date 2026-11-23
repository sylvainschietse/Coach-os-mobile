// Élastiques : le coach choisit, pour un exercice d'une séance, la couleur de l'élastique et s'il aide (traction,
// dips, pistol…) ou s'il freine (rowing, pull-apart, squat avec élastique…). Chaque couleur correspond à une force,
// réglable par le coach pour coller à ses propres élastiques. Règles pures, sans écran ni base.
import type { Exercice } from './types';

export type SensElastique = 'aide' | 'resistance';
export type CleCouleur = 'jaune' | 'rouge' | 'noir' | 'violet' | 'vert' | 'bleu' | 'orange' | 'gris';

export interface CouleurElastique {
  cle: CleCouleur;
  nom: string;
  hex: string;
  /** Force en texte libre, comme sur l'étiquette du fabricant : « 7–16 kg ». */
  force: string;
  /** Le coach peut masquer les couleurs qu'il n'a pas. */
  active: boolean;
}

export type ReglagesElastiques = { couleurs: CouleurElastique[] };

/** Ce qui est gardé sur la ligne : la couleur telle qu'elle était réglée au moment d'enregistrer la séance. */
export interface ElastiqueLigne {
  couleur: CleCouleur;
  nom: string;
  hex: string;
  force?: string;
  sens: SensElastique;
}

/**
 * Repères habituels des bandes de traction (boucles de 208 cm), de la plus légère à la plus forte. Les fabricants ne
 * suivent pas tous le même code : le coach ajuste la force ou masque une couleur dans « Mes élastiques ».
 */
export const COULEURS_ELASTIQUE: CouleurElastique[] = [
  { cle: 'jaune', nom: 'Jaune', hex: '#F4C430', force: '2–7 kg', active: true },
  { cle: 'rouge', nom: 'Rouge', hex: '#D32F2F', force: '7–16 kg', active: true },
  { cle: 'noir', nom: 'Noir', hex: '#1F1F1F', force: '11–23 kg', active: true },
  { cle: 'violet', nom: 'Violet', hex: '#7B3FA0', force: '16–36 kg', active: true },
  { cle: 'vert', nom: 'Vert', hex: '#2E7D32', force: '23–57 kg', active: true },
  { cle: 'bleu', nom: 'Bleu', hex: '#1E5BC6', force: '30–70 kg', active: true },
  { cle: 'orange', nom: 'Orange', hex: '#EF6C00', force: '40–80 kg', active: false },
  { cle: 'gris', nom: 'Gris', hex: '#8A8F98', force: '50–100 kg', active: false },
];
export const REGLAGES_ELASTIQUES: ReglagesElastiques = { couleurs: COULEURS_ELASTIQUE };

const CLES = COULEURS_ELASTIQUE.map((c) => c.cle);
const MAX_FORCE = 30;

/** Relit les réglages enregistrés ; toute couleur absente ou abîmée reprend son réglage de départ. */
export function lireReglagesElastiques(brut: unknown): ReglagesElastiques {
  const liste = brut && typeof brut === 'object' && Array.isArray((brut as { couleurs?: unknown }).couleurs) ? ((brut as { couleurs: unknown[] }).couleurs) : [];
  return {
    couleurs: COULEURS_ELASTIQUE.map((defaut) => {
      const x = liste.find((c) => !!c && typeof c === 'object' && (c as { cle?: unknown }).cle === defaut.cle) as Partial<CouleurElastique> | undefined;
      if (!x) return defaut;
      return {
        ...defaut,
        force: typeof x.force === 'string' ? x.force.trim().slice(0, MAX_FORCE) : defaut.force,
        active: typeof x.active === 'boolean' ? x.active : defaut.active,
      };
    }),
  };
}

/** Relit l'élastique d'une ligne enregistrée ; rien si la valeur ne tient pas debout. */
export function lireElastique(brut: unknown): ElastiqueLigne | undefined {
  if (!brut || typeof brut !== 'object') return undefined;
  const x = brut as Record<string, unknown>;
  const defaut = COULEURS_ELASTIQUE.find((c) => c.cle === x.couleur);
  if (!defaut || (x.sens !== 'aide' && x.sens !== 'resistance')) return undefined;
  return {
    couleur: defaut.cle,
    nom: typeof x.nom === 'string' && x.nom.trim() ? x.nom.trim().slice(0, 30) : defaut.nom,
    hex: typeof x.hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(x.hex) ? x.hex : defaut.hex,
    force: typeof x.force === 'string' && x.force.trim() ? x.force.trim().slice(0, MAX_FORCE) : undefined,
    sens: x.sens,
  };
}

export const elastiqueDepuis = (c: CouleurElastique, sens: SensElastique): ElastiqueLigne => ({
  couleur: c.cle,
  nom: c.nom,
  hex: c.hex,
  force: c.force.trim() || undefined,
  sens,
});

export const estCleCouleur = (v: unknown): v is CleCouleur => (CLES as unknown[]).includes(v);

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const AU_POIDS_DU_CORPS = ['Poids du corps', 'Aucun', 'Barre de traction', 'Anneaux', 'Barres parallèles', 'Banc', 'Box', 'Chaise', 'Mur', 'Cale'];

/** Mobilité, maintien, sauts et pompes au mur : un élastique n'y apporte rien. */
const PAS_D_ELASTIQUE = /mobilite|maintien|isometrique|saute|claque|au mur|scapulaire|cervical/;
/** Mouvements au poids du corps qu'un élastique rend plus faciles. */
const ASSISTABLES =
  /\btraction|chin.?up|pull.?up|muscle.?up|\bdips?\b|pompe|pistol|squat sur une jambe|nordic|toes.?to.?bar|releve de (genoux|jambes) suspendu|l.?sit|equilibre sur les mains|dragon flag/;
/** Mouvements au poids du corps auxquels on ajoute souvent un élastique pour les durcir. */
const DURCISSABLES = /squat|pont fessier|hip thrust|frog pump|clamshell|abduction de hanche|extension de hanche|fente|marche laterale|monster walk|split squat|montee sur banc/;

/**
 * Peut-on mettre un élastique sur cet exercice, et dans quel sens par défaut ?
 * « resistance » : l'élastique fait partie du mouvement (rowing élastique, pull-apart…) ou le durcit (squat, pont fessier) ;
 * « aide » : l'élastique allège le poids du corps (traction, dips, pistol, nordic…). Rien : un élastique n'y a pas sa place.
 */
export function usageElastique(e: Pick<Exercice, 'nom' | 'materiel'>): SensElastique | undefined {
  const nom = sansAccents(e.nom);
  const materiel = e.materiel ?? [];
  if (/assist/.test(nom) && /elastique|band/.test(nom + sansAccents(materiel.join(' ')))) return 'aide';
  if (materiel.some((m) => /elastique|mini.?band/.test(sansAccents(m))) || /elastique|mini.?band/.test(nom)) return 'resistance';
  const auPoidsDuCorps = !materiel.length || materiel.every((m) => AU_POIDS_DU_CORPS.includes(m));
  if (!auPoidsDuCorps || PAS_D_ELASTIQUE.test(nom)) return undefined;
  if (ASSISTABLES.test(nom)) return 'aide';
  if (DURCISSABLES.test(nom)) return 'resistance';
  return undefined;
}

export const LIBELLES_SENS: Record<SensElastique, string> = { aide: 'Aide', resistance: 'Résistance' };

/** « Élastique rouge · aide ≈ 7–16 kg » : ce que lit le client sous l'exercice. */
export function texteElastique(e: ElastiqueLigne): string {
  const sens = e.sens === 'aide' ? 'aide' : 'résistance';
  return `Élastique ${e.nom.toLowerCase()} · ${sens}${e.force ? ` ≈ ${e.force}` : ''}`;
}

/** Les couleurs proposées au coach : celles qu'il a, plus celle déjà choisie sur la ligne si elle a été masquée depuis. */
export function couleursProposees(r: ReglagesElastiques, choisie?: CleCouleur): CouleurElastique[] {
  return r.couleurs.filter((c) => c.active || c.cle === choisie);
}

/** Exercices du catalogue qui acceptent un élastique, rangés par sens. */
export function exercicesAvecElastique<T extends Pick<Exercice, 'nom' | 'materiel'>>(catalogue: T[]) {
  const aide: T[] = [];
  const resistance: T[] = [];
  for (const e of catalogue) {
    const u = usageElastique(e);
    if (u === 'aide') aide.push(e);
    else if (u === 'resistance') resistance.push(e);
  }
  return { aide, resistance };
}
