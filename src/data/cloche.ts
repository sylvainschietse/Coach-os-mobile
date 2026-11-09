// Cloche de notifications : l'historique des alertes de la personne connectée (table notifications, lecture seule
// sous RLS) et ce qu'elle a déjà lu. Les messages ont leur propre bouton : ils ne s'affichent pas ici.
// En démo (sans base), la cloche reste vide.
import { supabase } from './supabase';

export interface NotificationAppli {
  id: string;
  genre: string;
  titre: string;
  corps: string;
  url: string | null;
  creeLe: string;
  lue: boolean;
}

const abonnes = new Set<() => void>();
/** Une notification arrive pendant que l'appli est ouverte : la cloche se relit. */
export const prevenirCloche = () => abonnes.forEach((fn) => fn());
export function ecouterCloche(fn: () => void) {
  abonnes.add(fn);
  return () => void abonnes.delete(fn);
}

export async function notificationsRecentes(limite = 50): Promise<NotificationAppli[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, genre, titre, corps, url, cree_le, lue_le')
    .neq('genre', 'message')
    .order('cree_le', { ascending: false })
    .limit(limite);
  if (error) throw new Error('Notifications indisponibles.');
  return (data ?? []).map((l) => ({
    id: l.id as string,
    genre: l.genre as string,
    titre: l.titre as string,
    corps: (l.corps as string) ?? '',
    url: (l.url as string | null) ?? null,
    creeLe: l.cree_le as string,
    lue: !!l.lue_le,
  }));
}

export async function nombreNonLues(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).neq('genre', 'message').is('lue_le', null);
  if (error) return 0;
  return count ?? 0;
}

/** Marque comme lues ces notifications, ou toutes si aucune n'est donnée. */
export async function marquerLues(ids?: string[]) {
  if (!supabase) return;
  const { error } = await supabase.rpc('marquer_notifications_lues', { p_ids: ids?.length ? ids : null });
  if (error) throw new Error('Impossible de marquer comme lu.');
  prevenirCloche();
}
