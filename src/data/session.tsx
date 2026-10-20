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
  /** Le compte a été créé par le coach : le client doit choisir son propre mot de passe. */
  motDePasseProvisoire: boolean;
  changerMotDePasse: (nouveau: string) => Promise<string | null>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<ValeurSession | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [pret, setPret] = useState(false);
  const [motDePasseProvisoire, setProvisoire] = useState(false);

  const lireProvisoire = useCallback(async () => {
    if (!supabase) return setProvisoire(false);
    const { data } = await supabase.auth.getUser();
    setProvisoire(data.user?.user_metadata?.mot_de_passe_provisoire === true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (supabase) {
          setProfil(await profilConnecte(supabase));
          await lireProvisoire();
        }
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
  }, [lireProvisoire]);

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
    await lireProvisoire();
    setProfil(p);
    return null;
  }, [lireProvisoire]);

  const changerMotDePasse = useCallback(async (nouveau: string) => {
    if (!supabase) return null;
    const { error } = await supabase.auth.updateUser({ password: nouveau, data: { mot_de_passe_provisoire: false } });
    if (error) return 'Le mot de passe n’a pas pu être enregistré. Réessaie.';
    setProvisoire(false);
    return null;
  }, []);

  const deconnecter = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    await AsyncStorage.removeItem(CLE);
    setProfil(null);
    setProvisoire(false);
  }, []);

  return (
    <Contexte.Provider value={{ profil, pret, choisirProfilDemo, connecter, deconnecter, motDePasseProvisoire, changerMotDePasse }}>{children}</Contexte.Provider>
  );
}

export function useSession() {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('useSession hors de SessionProvider');
  return valeur;
}
