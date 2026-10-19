import type { Realisation } from './types';

/**
 * File d'envoi : une séance terminée y est rangée avant tout envoi réseau.
 * L'identifiant vient du téléphone, donc un double appui ou un renvoi
 * après coupure ne crée jamais deux séances.
 */
export function ajouterALaFile(file: Realisation[], realisation: Realisation): Realisation[] {
  if (file.some((r) => r.id === realisation.id)) return file;
  return [...file, realisation];
}

export function retirerDeLaFile(file: Realisation[], ids: string[]): Realisation[] {
  return file.filter((r) => !ids.includes(r.id));
}

/** Envoie chaque élément dans l'ordre ; ceux qui échouent restent pour la prochaine tentative. */
export async function viderLaFile(
  file: Realisation[],
  envoyer: (r: Realisation) => Promise<void>,
): Promise<{ restante: Realisation[]; envoyees: string[] }> {
  const envoyees: string[] = [];
  for (const realisation of file) {
    try {
      await envoyer(realisation);
      envoyees.push(realisation.id);
    } catch {
      break;
    }
  }
  return { restante: retirerDeLaFile(file, envoyees), envoyees };
}
