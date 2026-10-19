import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Profil } from './depot';
import { profilConnecte } from './depot-supabase';
import { supabase } from './supabase';

const CLE = 'coachos.demo.profil';

interface ValeurSession {
  profil: Profil | null;
  pret: boolean;
  choisirProfilDemo: (p: Profil) => Promise<void>;
  connecter: (email: string, motDePasse: string) => Promise<string | null>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<ValeurSession | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (supabase) setProfil(await profilConnecte(supabase));
        else {
          const brut = await AsyncStorage.getItem(CLE);
          if (brut) setProfil(JSON.parse(brut) as Profil);
        }
      } catch {
        setProfil(null);
      } finally {
        setPret(true);
      }
    })();
  }, []);

  const choisirProfilDemo = useCallback(async (p: Profil) => {
    await AsyncStorage.setItem(CLE, JSON.stringify(p));
    setProfil(p);
  }, []);

  const connecter = useCallback(async (email: string, motDePasse: string) => {
    if (!supabase) return 'Connexion indisponible en mode démo.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
    if (error) return 'E-mail ou mot de passe incorrect.';
    const p = await profilConnecte(supabase);
    if (!p) {
      await supabase.auth.signOut();
      return 'Ce compte n’est rattaché à aucun coach ni client actif.';
    }
    setProfil(p);
    return null;
  }, []);

  const deconnecter = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    await AsyncStorage.removeItem(CLE);
    setProfil(null);
  }, []);

  return (
    <Contexte.Provider value={{ profil, pret, choisirProfilDemo, connecter, deconnecter }}>{children}</Contexte.Provider>
  );
}

export function useSession() {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('useSession hors de SessionProvider');
  return valeur;
}
