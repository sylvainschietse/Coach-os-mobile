import { depotDemo } from './depot-demo';
import { creerDepotSupabase } from './depot-supabase';
import { supabase } from './supabase';

export const depot = supabase ? creerDepotSupabase(supabase) : depotDemo;
export type { Depot, Profil } from './depot';
