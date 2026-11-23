// Décodage des marqueurs texte de l'app Zite actuelle, pour la migration.

export interface VarianteCycle {
  series?: number;
  repetitions?: string;
  recuperationS?: number;
  rir?: number | string;
  chargeIntensite?: string;
  tempo?: string;
  consignes?: string;
  progressionPrevue?: string;
  /** Mouvement de ce cycle quand il change (variante proche : même schéma, autre angle ou autre matériel). */
  exercice?: { id: string; nom: string; mesures?: string[]; videoUrl?: string };
}

const MARQUEUR_CYCLES = /\s*\[COACHOS_CYCLES:([\s\S]*)\]\s*$/;
const MARQUEUR_BLOCS = /\s*\[COACHOS_BLOCS:(\[[\s\S]*?\])\]/;

export class MarqueurInvalide extends Error {}

/** Sépare le texte lisible des variantes de cycle encodées dans « Progression prévue ». */
export function decoderCycles(texte: string): { texteLisible: string; variantes: VarianteCycle[] } {
  const m = texte.match(MARQUEUR_CYCLES);
  if (!m) return { texteLisible: texte.trim(), variantes: [] };
  let variantes: unknown;
  try {
    variantes = JSON.parse(m[1]);
  } catch {
    throw new MarqueurInvalide('COACHOS_CYCLES illisible');
  }
  if (!Array.isArray(variantes)) throw new MarqueurInvalide('COACHOS_CYCLES doit être une liste');
  return { texteLisible: texte.slice(0, m.index).trim(), variantes: variantes as VarianteCycle[] };
}

/** Extrait les titres de blocs encodés dans les consignes d'une séance. */
export function decoderBlocs(consignes: string): { texteLisible: string; blocs: string[] } {
  const m = consignes.match(MARQUEUR_BLOCS);
  if (!m) return { texteLisible: consignes.trim(), blocs: [] };
  let blocs: unknown;
  try {
    blocs = JSON.parse(m[1]);
  } catch {
    throw new MarqueurInvalide('COACHOS_BLOCS illisible');
  }
  if (!Array.isArray(blocs) || !blocs.every((b) => typeof b === 'string')) {
    throw new MarqueurInvalide('COACHOS_BLOCS doit être une liste de titres');
  }
  return { texteLisible: consignes.replace(m[0], '').trim(), blocs };
}
