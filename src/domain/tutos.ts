// Rubrique « Aide » du client : les tutos vidéo (table « tutos », vidéos dans le compartiment public « tutos »)
// et les bulles d'astuce, montrées une seule fois à côté d'un bouton qu'on ne voit pas toujours.

export type PublicTuto = 'tous' | 'nutrition' | 'cycle';

export interface Tuto {
  id: string;
  ordre: number;
  titre: string;
  explication: string;
  dureeSecondes: number;
  /** Chemin dans le compartiment « tutos », ou adresse complète (https://…). */
  video: string;
  image?: string;
  pour: PublicTuto;
}

/** La liste livrée avec l'appli : affichée en démo, et sans réseau tant que la liste du serveur n'est pas arrivée. */
export const TUTOS_PAR_DEFAUT: Tuto[] = [
  { id: 'installer', ordre: 1, titre: 'Installer l’appli et te connecter', explication: 'Ton accès reçu par message, le mot de passe provisoire, puis le tien.', dureeSecondes: 43, video: '1-installer-et-se-connecter.mp4', image: '1-installer-et-se-connecter.jpg', pour: 'tous' },
  { id: 'seance', ordre: 2, titre: 'Faire ta séance et noter tes charges', explication: 'Le mode guidé bloc par bloc, le minuteur de repos et « Remplacer ».', dureeSecondes: 44, video: '2-faire-sa-seance.mp4', image: '2-faire-sa-seance.jpg', pour: 'tous' },
  { id: 'sans-telephone', ordre: 3, titre: 'T’entraîner sans téléphone', explication: 'Range ton téléphone, puis raconte ta séance à voix haute à la fin.', dureeSecondes: 45, video: '3-sans-telephone-et-dictee.mp4', image: '3-sans-telephone-et-dictee.jpg', pour: 'tous' },
  { id: 'nutrition', ordre: 4, titre: 'Tes besoins en nutrition', explication: 'Tes calories et tes macros du jour, le guide, et noter un repas.', dureeSecondes: 40, video: '4-nutrition-besoins-et-guide.mp4', image: '4-nutrition-besoins-et-guide.jpg', pour: 'tous' },
  { id: 'recette', ordre: 5, titre: 'Dicter une recette', explication: 'Raconte-la : l’appli remplit les ingrédients et calcule les macros.', dureeSecondes: 41, video: '5-dicter-une-recette.mp4', image: '5-dicter-une-recette.jpg', pour: 'nutrition' },
  { id: 'progres', ordre: 6, titre: 'Ta semaine, tes badges, tes progrès', explication: 'Ta série, Ma semaine, tes records et Ma journée.', dureeSecondes: 46, video: '6-semaine-badges-et-progres.mp4', image: '6-semaine-badges-et-progres.jpg', pour: 'tous' },
  { id: 'cycle', ordre: 7, titre: 'Le suivi du cycle', explication: 'Activer Mon cycle et choisir ce que ta coach voit.', dureeSecondes: 52, video: '7-suivi-du-cycle.mp4', image: '7-suivi-du-cycle.jpg', pour: 'cycle' },
  { id: 'documents', ordre: 8, titre: 'Tes documents et newsletters', explication: 'Comptes rendus, bilans, newsletters et factures.', dureeSecondes: 28, video: '8-documents-et-newsletters.mp4', image: '8-documents-et-newsletters.jpg', pour: 'tous' },
];

export const ETIQUETTE_PUBLIC: Record<PublicTuto, string | null> = {
  tous: null,
  nutrition: 'Option nutrition',
  cycle: 'Si tu es concernée',
};

/** L'adresse d'un fichier du compartiment public « tutos » ; une adresse complète est gardée telle quelle. */
export function adresseTuto(chemin: string | undefined, baseSupabase: string | undefined): string | null {
  if (!chemin) return null;
  if (/^https:\/\//.test(chemin)) return chemin;
  if (!baseSupabase) return null;
  const base = baseSupabase.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/tutos/${chemin.split('/').map(encodeURIComponent).join('/')}`;
}

/** « 0:43 », « 1:05 ». */
export function dureeTuto(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Tri par ordre, sans doublon ni tuto incomplet. */
export function ranger(tutos: Tuto[]): Tuto[] {
  const vus = new Set<string>();
  return tutos
    .filter((t) => t.id && t.titre && t.video && !vus.has(t.id) && vus.add(t.id))
    .sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre));
}

/** Le tuto qui suit, pour « Tuto suivant » (aucun après le dernier). */
export function tutoSuivant(tutos: Tuto[], id: string): Tuto | null {
  const i = tutos.findIndex((t) => t.id === id);
  return i >= 0 && i + 1 < tutos.length ? tutos[i + 1] : null;
}

// ---------- Bulles d'astuce ----------

export type CleAstuce = 'aide' | 'photo-assiette' | 'dicter-recette' | 'sans-telephone' | 'cycle';

export interface Astuce {
  texte: string;
  /** Le tuto ouvert par « Voir le tuto », s'il existe. */
  tuto?: string;
}

export const ASTUCES: Record<CleAstuce, Astuce> = {
  aide: { texte: 'Une question sur l’appli ? Touche le « ? » en haut : des tutos vidéo d’une minute, et ton coach pour le reste.' },
  'photo-assiette': {
    texte: 'Pas envie de chercher chaque aliment ? Prends ton assiette en photo : l’appli reconnaît le plat et calcule les calories et les macros. Tu relis, tu corriges si besoin, c’est ajouté.',
    tuto: 'nutrition',
  },
  'dicter-recette': {
    texte: 'Pas besoin de tout taper : raconte ta recette à voix haute, comme à un ami. L’appli remplit les ingrédients et calcule les macros.',
    tuto: 'recette',
  },
  'sans-telephone': {
    texte: 'Tu préfères ranger ton téléphone pendant ta séance ? « Autres options », puis « Démarrer sans téléphone » : tu racontes ta séance à la fin, en 30 secondes.',
    tuto: 'sans-telephone',
  },
  cycle: {
    texte: 'Ton cycle joue sur ton énergie et tes séances. Rien n’est enregistré sans ton accord, et tu choisis ce que ta coach voit.',
    tuto: 'cycle',
  },
};
