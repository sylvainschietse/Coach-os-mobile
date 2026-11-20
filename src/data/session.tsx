import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { estErreurReseau, profilApresVerification, type ProfilGarde } from '@/domain/reseau';
import { viderMemoire } from '@/lib/memoire';
import { annulerRappels, oublierCeTelephone } from '@/lib/rappels';

import type { Profil } from './depot';
import { profilConnecte } from './depot-supabase';
import { supabase, type Fournisseur } from './supabase';

const CLE = 'coachos.demo.profil';
/** Dernier profil connu du compte connecté : l'appli s'ouvre avec, même sans réseau (en salle, au sous-sol). */
const CLE_GARDE = 'coachos.profil-garde';

async function lireGarde(): Promise<ProfilGarde<Profil> | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_GARDE);
    return brut ? (JSON.parse(brut) as ProfilGarde<Profil>) : null;
  } catch {
    return null;
  }
}

function garder(g: ProfilGarde<Profil> | null) {
  (g ? AsyncStorage.setItem(CLE_GARDE, JSON.stringify(g)) : AsyncStorage.removeItem(CLE_GARDE)).catch(() => {});
}

interface ValeurSession {
  profil: Profil | null;
  /** Adresse du compte connecté, affichée dans l'en-tête ; absente en démo. */
  email?: string;
  /** Connecté mais relié à aucun dossier (coach ou client) : l'accueil propose « Actualiser mon accès ». */
  sansDossier: boolean;
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
  const [sansDossier, setSansDossier] = useState(false);

  const lireProvisoire = useCallback(async () => {
    if (!supabase) return setProvisoire(false);
    const { data } = await supabase.auth.getUser();
    setEmail(data.user?.email ?? undefined);
    setProvisoire(data.user?.user_metadata?.mot_de_passe_provisoire === true);
  }, []);

  useEffect(() => {
    (async () => {
      if (!supabase) {
        try {
          const brut = await AsyncStorage.getItem(CLE);
          if (brut) setProfil(JSON.parse(brut) as Profil);
        } finally {
          setPret(true);
        }
        return;
      }
      const db = supabase;
      // 1. Le dernier profil connu s'affiche tout de suite, sans attendre le réseau.
      const garde = await lireGarde();
      if (garde) {
        setProfil(garde.profil);
        setEmail(garde.email);
        setProvisoire(garde.provisoire === true);
        setPret(true);
      }
      // 2. Puis on vérifie auprès du serveur. Sans réseau, on garde le profil connu au lieu de déconnecter.
      try {
        const { data, error } = await db.auth.getSession();
        const user = data.session?.user;
        if (!user && error && estErreurReseau(error)) throw error;
        const p = user ? await profilConnecte(db, user.id) : null;
        const resultat = profilApresVerification(garde, { ok: true, profil: p });
        if (garde && (!resultat || resultat.role !== garde.profil.role)) await viderMemoire();
        setProfil(resultat);
        setEmail(user?.email ?? undefined);
        setProvisoire(user?.user_metadata?.mot_de_passe_provisoire === true);
        setSansDossier(!p && !!user);
        garder(resultat ? { profil: resultat, email: user?.email ?? undefined, provisoire: user?.user_metadata?.mot_de_passe_provisoire === true } : null);
      } catch (e) {
        setProfil(profilApresVerification(garde, { ok: false, erreur: e }));
      } finally {
        setPret(true);
      }
    })();
  }, []);

  const choisirProfilDemo = useCallback(async (p: Profil) => {
    await viderMemoire();
    await AsyncStorage.setItem(CLE, JSON.stringify(p));
    setProfil(p);
  }, []);

  /**
   * Une fois connecté, quel que soit le moyen : le compte doit correspondre à un coach ou à un client.
   * Sans dossier relié, on reste connecté sur l'accueil « Bienvenue », qui permet d'actualiser l'accès (U01).
   */
  const actualiser = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    setEmail(data.user.email ?? undefined);
    const p = await profilConnecte(supabase);
    setSansDossier(!p);
    if (!p) return null;
    await lireProvisoire();
    await viderMemoire();
    setProfil(p);
    garder({ profil: p, email: data.user.email ?? undefined, provisoire: data.user.user_metadata?.mot_de_passe_provisoire === true });
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
    lireGarde().then((g) => g && garder({ ...g, provisoire: false }));
    return null;
  }, []);

  const deconnecter = useCallback(async () => {
    // Avant de quitter le compte : ce téléphone ne reçoit plus ses messages, ni ses rappels.
    await oublierCeTelephone().catch(() => undefined);
    await annulerRappels().catch(() => undefined);
    if (supabase) await supabase.auth.signOut();
    await AsyncStorage.removeItem(CLE);
    await AsyncStorage.removeItem(CLE_GARDE).catch(() => undefined);
    await viderMemoire();
    setProfil(null);
    setProvisoire(false);
    setSansDossier(false);
  }, []);

  return (
    <Contexte.Provider value={{
      email,
        sansDossier,
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
