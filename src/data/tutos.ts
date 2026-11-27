// Les tutos vidéo de la rubrique Aide : la liste vient de la table « tutos » (modifiable sans nouvelle version de
// l'appli), avec la liste livrée dans l'appli en démo ou si la table est vide. Les vidéos ne sont jamais embarquées :
// elles sont lues dans le compartiment public « tutos » au moment où on les ouvre.
import { adresseTuto, ranger, TUTOS_PAR_DEFAUT, type PublicTuto, type Tuto } from '@/domain/tutos';

import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;

interface LigneTuto {
  id: string;
  ordre: number;
  titre: string;
  explication: string | null;
  duree_secondes: number | null;
  video: string;
  image: string | null;
  pour: string | null;
}

const PUBLICS: PublicTuto[] = ['tous', 'nutrition', 'cycle'];

export const tutos = {
  async lister(): Promise<Tuto[]> {
    if (!supabase) return TUTOS_PAR_DEFAUT;
    const { data, error } = await supabase.from('tutos').select('id, ordre, titre, explication, duree_secondes, video, image, pour').order('ordre');
    // Table pas encore créée ou vide : la liste livrée avec l'appli plutôt qu'une page vide.
    if (error || !data?.length) return TUTOS_PAR_DEFAUT;
    return ranger(
      (data as LigneTuto[]).map((l) => ({
        id: l.id,
        ordre: l.ordre,
        titre: l.titre,
        explication: l.explication ?? '',
        dureeSecondes: l.duree_secondes ?? 0,
        video: l.video,
        image: l.image ?? undefined,
        pour: PUBLICS.includes(l.pour as PublicTuto) ? (l.pour as PublicTuto) : 'tous',
      })),
    );
  },
  adresse: (chemin?: string) => adresseTuto(chemin, BASE),
};
