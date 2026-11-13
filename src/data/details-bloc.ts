// Format, descriptif, tempo et contraction d'un bloc, entre l'app et les colonnes de la table blocs.
import type { Bloc, FormatBloc } from '@/domain/types';

type DetailsBloc = Pick<Bloc, 'format' | 'description' | 'tempo' | 'contraction'>;
export type DetailsBlocBase = { format?: string | null; description?: string | null; tempo?: string | null; contraction?: string | null };

export const detailsBlocJson = (b: DetailsBloc) => ({
  format: b.format ?? null,
  description: b.description ?? null,
  tempo: b.tempo ?? null,
  contraction: b.contraction ?? null,
});

/** Avant l'ajout des colonnes, la ligne n'a pas ces champs : le bloc reste sans détails. */
export const lireDetailsBloc = (b: DetailsBlocBase): DetailsBloc => ({
  format: (b.format as FormatBloc | null) ?? undefined,
  description: b.description ?? undefined,
  tempo: b.tempo ?? undefined,
  contraction: b.contraction ?? undefined,
});
