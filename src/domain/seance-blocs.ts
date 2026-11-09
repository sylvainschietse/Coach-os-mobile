// Séance par bloc : un bloc par page (superset, biset, circuit…), remplacement d'un exercice indisponible et bilan
// de fin de séance. Fonctions pures, testées dans tests/seance-blocs.test.ts.
import { circuitAlterne } from './minuteur';
import type { Bloc, Exercice, FormatBloc, LignePrescription } from './types';

export const RAISONS_REMPLACEMENT = ['Machine prise', 'Matériel absent', 'Douleur / gêne', 'Autre'] as const;

/** Exercice choisi par le client à la place de celui prévu, et pourquoi. */
export type Remplacement = { exercice: Pick<Exercice, 'id' | 'nom' | 'videoUrl' | 'famille' | 'materiel' | 'muscles'>; raison: string };

const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Exercices du catalogue qui travaillent les mêmes muscles : d'abord ceux qui partagent le plus de muscles, puis
 * ceux de la même famille. Le matériel différent passe devant (si la machine est prise, une autre machine aussi).
 */
export function similaires(catalogue: Exercice[], prevu: Pick<Exercice, 'id' | 'nom' | 'famille' | 'materiel' | 'muscles'>, limite = 3): Exercice[] {
  const muscles = new Set((prevu.muscles ?? []).map(norm));
  const materiel = new Set((prevu.materiel ?? []).map(norm));
  const famille = prevu.famille ? norm(prevu.famille) : '';
  const nom = norm(prevu.nom);
  const notes = catalogue
    .filter((e) => e.id !== prevu.id && norm(e.nom) !== nom)
    .map((e) => {
      const communs = (e.muscles ?? []).filter((m) => muscles.has(norm(m))).length;
      const memeFamille = !!famille && !!e.famille && norm(e.famille) === famille;
      const autreMateriel = !(e.materiel ?? []).some((m) => materiel.has(norm(m)));
      return { e, note: communs * 2 + (memeFamille ? 3 : 0) + (autreMateriel && (communs || memeFamille) ? 1 : 0), pertinent: communs > 0 || memeFamille };
    })
    .filter((x) => x.pertinent);
  notes.sort((a, b) => b.note - a.note || a.e.nom.localeCompare(b.e.nom, 'fr'));
  return notes.slice(0, limite).map((x) => x.e);
}

/**
 * Format d'enchaînement du bloc : celui choisi par le coach, sinon celui écrit dans le titre (« Compléments en
 * superset »). Sans rien, les exercices se font l'un après l'autre (série par série).
 */
export function formatDuBloc(b: Pick<Bloc, 'format' | 'lignes'> & { titre?: string }): Exclude<FormatBloc, 'Classique'> | undefined {
  if (b.lignes.length < 2 || b.format === 'Classique') return undefined;
  if (b.format) return b.format;
  const t = norm(b.titre ?? '');
  if (/\bsuper ?-?sets?\b/.test(t)) return 'Superset';
  if (/\bbi ?-?sets?\b/.test(t)) return 'Biset';
  if (/\btri ?-?sets?\b/.test(t)) return 'Triset';
  if (/\bcircuit\b|\ben alternance\b/.test(t)) return 'Circuit';
  // Exercices au temps, en alternance sur un chrono (« Abdos · 4 min · 20/10 ») : c'est un circuit.
  if (circuitAlterne({ minuteur: (b as Partial<Bloc>).minuteur, lignes: b.lignes })) return 'Circuit';
  return undefined;
}

/** Les blocs à enchaîner (A puis B sans pause) : bisets, supersets, trisets et circuits. */
export const enchaine = (b: Pick<Bloc, 'format' | 'lignes'> & { titre?: string }) => !!formatDuBloc(b);

/** « Superset · 3 tours », « 4 séries » pour un exercice seul, « 3 exercices » pour des exercices l'un après l'autre. */
export function enTeteBloc(b: Pick<Bloc, 'format' | 'lignes' | 'minuteur'> & { titre?: string }): string {
  const tours = b.minuteur?.tours ?? Math.max(1, ...b.lignes.map((l) => l.series || 1));
  const format = formatDuBloc(b);
  if (format) return `${format} · ${tours} tour${tours > 1 ? 's' : ''}`;
  return b.lignes.length === 1 ? `${tours} série${tours > 1 ? 's' : ''}` : `${b.lignes.length} exercices`;
}

/** Titre du bloc sans son numéro d'ordre (« 4 · Compléments » → « Compléments ») : la page dit déjà « Bloc 4 sur 6 ». */
export const titreBloc = (titre: string) => titre.replace(/^\s*\d+\s*[·.\-–)]\s*/, '').trim();

/** Consigne d'enchaînement sous le titre du bloc. */
export function consigneBloc(b: Pick<Bloc, 'format' | 'lignes'> & { titre?: string }): string | undefined {
  if (!enchaine(b)) return undefined;
  const lettres = b.lignes.map((_, i) => lettre(i));
  const repos = b.lignes[b.lignes.length - 1]?.recuperationS;
  return `${lettres.join(' puis ')} sans pause${repos ? `, ${dureeRepos(repos)} de repos après chaque tour` : ''}.`;
}

export const lettre = (i: number) => String.fromCharCode(65 + (i % 26));
export const dureeRepos = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60}` : ''}` : `${s} s`);

/** Repos proposé en bas d'un bloc : celui de la dernière ligne (fin du tour), sinon 90 s. */
export const reposDuBloc = (b: Pick<Bloc, 'lignes'>) => {
  const r = b.lignes[b.lignes.length - 1]?.recuperationS;
  return r && r > 0 ? Math.min(3600, Math.round(r)) : 90;
};

/** Total soulevé : charge × répétitions de chaque série saisie. */
export function tonnage(vals: Record<string, Partial<Record<string, string>>>): number {
  const n = (v?: string) => Number((v ?? '').trim().replace(',', '.'));
  return Math.round(
    Object.values(vals).reduce((t, v) => {
      const c = n(v.charge);
      const r = n(v.repetitions);
      return Number.isFinite(c) && Number.isFinite(r) && c > 0 && r > 0 ? t + c * r : t;
    }, 0),
  );
}

/** Lignes ajoutées au commentaire pour le coach : « ⇄ Rowing poulie basse → Tirage TRX (Machine prise) ». */
export function texteRemplacements(lignes: Pick<LignePrescription, 'id' | 'exercice'>[], remplacements: Record<string, Remplacement>): string {
  return lignes
    .filter((l) => remplacements[l.id])
    .map((l) => `⇄ ${l.exercice.nom} → ${remplacements[l.id].exercice.nom} (${remplacements[l.id].raison})`)
    .join('\n');
}

/** « 52 min », « 1 h 05 » */
export function dureeSeance(debut: string, fin: number): string {
  const min = Math.max(0, Math.round((fin - new Date(debut).getTime()) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
