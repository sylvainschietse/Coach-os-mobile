// Alertes coupées par la personne connectée (table notifications_coupees). En démo (sans base), rien n'est coupé.
import { supabase } from './supabase';

export async function alertesCoupees(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications_coupees').select('genre');
  if (error) throw new Error('Réglages des alertes indisponibles.');
  return (data ?? []).map((l: { genre: string }) => l.genre);
}

export async function reglerAlerte(genre: string, active: boolean) {
  if (!supabase) return;
  const { error } = active
    ? await supabase.from('notifications_coupees').delete().eq('genre', genre)
    : await supabase.from('notifications_coupees').upsert({ genre }, { onConflict: 'user_id,genre', ignoreDuplicates: true });
  if (error) throw new Error('Réglage non enregistré, réessaie.');
}
