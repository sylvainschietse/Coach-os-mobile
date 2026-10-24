import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Profil } from './depot';
import { profilConnecte } from './depot-supabase';
import { supabase, type Fournisseur } from './supabase';

const CLE = 'coachos.demo.profil';

interface ValeurSession {
  profil: Profil | null;
  /** Adresse du compte connecté, affichée dans l'en-tête ; absente en démo. */
  email?: string;
  pret: boolean;
  choisirProfilDemo: (p: Profil) => Promise<void>;
  connecter: (email: string, motDePasse: string) => Promise<string | null>;
  /** Google, Microsoft ou Apple. Renvoie un message d'erreur, ou null si c'est bon (ou annulé). */
  connecterAvec: (fournisseur: Fournisseur) => Promise<string | null>;
  /** Inscription d'un client avec son e-mail : il confirme son adresse avant d'accéder à ses données. */
  inscrire: (email: string, motDePasse: string) => Promise<{ erreur?: string; aConfirmer?: boolean }>;
  /** Après le lien de confirmation ou le retour de Google : relit la session. */
  actualiser: () => Promise<string | null>;
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
  const [email, setEmail] = useState<string>();

  const lireProvisoire = useCallback(async () => {
    if (!supabase) return setProvisoire(false);
    const { data } = await supabase.auth.getUser();
    setEmail(data.user?.email ?? undefined);
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

  /** Une fois connecté, quel que soit le moyen : le compte doit correspondre à un coach ou à un client. */
  const actualiser = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const p = await profilConnecte(supabase);
    if (!p) {
      await supabase.auth.signOut();
      return `Aucune fiche client avec l’e-mail ${data.user.email ?? ''}. Demande à ton coach de vérifier l’adresse inscrite sur ta fiche.`;
    }
    await lireProvisoire();
    setProfil(p);
    return null;
  }, [lireProvisoire]);

  const connecter = useCallback(async (email: string, motDePasse: string) => {
    if (!supabase) return 'Connexion indisponible en mode démo.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
    if (error?.code === 'email_not_confirmed') return 'Confirme d’abord ton adresse avec le lien reçu par e-mail.';
    if (error) return 'E-mail ou mot de passe incorrect.';
    return actualiser();
  }, [actualiser]);

  const connecterAvec = useCallback(async (fournisseur: Fournisseur) => {
    if (!supabase) return 'Connexion indisponible en mode démo.';
    const retour = Linking.createURL('auth');
    const scopes = fournisseur === 'azure' ? 'email openid profile' : undefined;
    if (Platform.OS === 'web') {
      // Sur ordinateur, la page part chez Google puis revient avec un code, lu au chargement.
      const { error } = await supabase.auth.signInWithOAuth({ provider: fournisseur, options: { redirectTo: retour, scopes } });
      return error ? 'Connexion impossible pour le moment.' : null;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: fournisseur,
      options: { redirectTo: retour, scopes, skipBrowserRedirect: true },
    });
    if (error || !data.url) return 'Connexion impossible pour le moment.';
    const resultat = await WebBrowser.openAuthSessionAsync(data.url, retour);
    if (resultat.type !== 'success') return null;
    const code = Linking.parse(resultat.url).queryParams?.code;
    if (typeof code !== 'string') return 'La connexion n’a pas abouti. Réessaie.';
    const echange = await supabase.auth.exchangeCodeForSession(code);
    if (echange.error) return 'La connexion n’a pas abouti. Réessaie.';
    return actualiser();
  }, [actualiser]);

  const inscrire = useCallback(async (email: string, motDePasse: string) => {
    if (!supabase) return { erreur: 'Inscription indisponible en mode démo.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: motDePasse,
      options: { emailRedirectTo: Linking.createURL('auth') },
    });
    if (error?.code === 'user_already_exists') return { erreur: 'Un compte existe déjà avec cet e-mail : connecte-toi.' };
    if (error) return { erreur: 'Inscription impossible pour le moment. Réessaie plus tard.' };
    if (!data.session) return { aConfirmer: true };
    const probleme = await actualiser();
    return probleme ? { erreur: probleme } : {};
  }, [actualiser]);

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
    <Contexte.Provider value={{
      email,
        profil,
        pret,
        choisirProfilDemo,
        connecter,
        connecterAvec,
        inscrire,
        actualiser,
        deconnecter,
        motDePasseProvisoire,
        changerMotDePasse,
      }}>{children}</Contexte.Provider>
  );
}

export function useSession() {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('useSession hors de SessionProvider');
  return valeur;
}
