import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const cle = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** null tant que les deux variables ne sont pas renseignées : l'app reste en mode démo. */
export const supabase: SupabaseClient | null =
  url && cle
    ? createClient(url, cle, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          // Retour de Google ou Microsoft : sur le web, le code arrive dans l'adresse de la page.
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (etat) => {
    if (etat === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export type Fournisseur = 'google' | 'azure' | 'apple';

/** Moyens de connexion activés, d'après EXPO_PUBLIC_CONNEXIONS (ex. « google,azure,apple,inscription »). */
const actives = (process.env.EXPO_PUBLIC_CONNEXIONS ?? '').split(',').map((x) => x.trim());
export const connexions = {
  fournisseurs: (['google', 'azure', 'apple'] as const).filter((f) => actives.includes(f) && (f !== 'apple' || Platform.OS === 'ios')),
  inscription: actives.includes('inscription'),
};
