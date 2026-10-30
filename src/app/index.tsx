import { Redirect, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CLIENTS_DEMO, COACH_DEMO } from '@/data/demo';
import { useSession } from '@/data/session';
import { connexions, supabase, type Fournisseur } from '@/data/supabase';
import { verifierMotDePasse } from '@/domain/acces-client';
import { Bouton, Texte } from '@/ui/composants';
import { LienPolitique } from '@/ui/consentement';
import { couleurs, espace, polices } from '@/ui/theme';

export default function Accueil() {
  const { profil, motDePasseProvisoire, sansDossier } = useSession();
  if (profil && motDePasseProvisoire) return <Cadre><NouveauMotDePasse /></Cadre>;
  if (!profil && sansDossier) return <Cadre><SansDossier /></Cadre>;
  if (profil?.role === 'client') return <Redirect href="/client" />;
  if (profil?.role === 'coach') return <Redirect href="/coach" />;

  return <Cadre>{supabase ? <Connexion /> : <ChoixDemo />}</Cadre>;
}

function Cadre({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.fond}>
      <View style={styles.contenu}>
        <View style={{ gap: espace(1) }}>
          <Text style={styles.marque}>
            COACH<Text style={{ color: couleurs.rouge }}>GO</Text>
          </Text>
          <Texte style={{ color: '#C9C9CF' }}>Ton programme, ta séance, ta progression.</Texte>
        </View>
        <View style={{ gap: espace(4) }}>
          {children}
          <View style={{ alignItems: 'center' }}>
            <LienPolitique clair />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** U01 : connecté, mais aucun dossier relié à ce compte. « Actualiser mon accès » montre la vérification puis son résultat. */
function SansDossier() {
  const { email, actualiser, deconnecter } = useSession();
  const [verification, setVerification] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  async function verifier() {
    setVerification(true);
    setResultat(null);
    try {
      await actualiser();
      // Si le dossier est trouvé, l'accueil redirige ; sinon on le dit, avec l'heure, pour qu'aucun clic ne paraisse muet.
      const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setResultat(`Vérifié à ${heure} : toujours aucun dossier relié à cette adresse. Demande à ton coach de vérifier l’e-mail inscrit sur ta fiche.`);
    } catch {
      setResultat('La vérification n’a pas abouti. Vérifie ta connexion et réessaie.');
    } finally {
      setVerification(false);
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <Text style={styles.libelle}>Bienvenue dans CoachGo</Text>
      <Texte style={{ color: '#C9C9CF' }}>
        Ton accès n’est pas encore relié à ton dossier. Vérifie que tu utilises l’adresse e-mail communiquée à ton coach.
      </Texte>
      {email && <Texte style={{ color: '#FFFFFF' }}>{email}</Texte>}
      <Bouton libelle={verification ? 'Vérification…' : 'Actualiser mon accès'} onPress={verifier} chargement={verification} />
      {resultat && (
        <Text style={styles.resultat} accessibilityLiveRegion="polite" role="status">
          {resultat}
        </Text>
      )}
      <Bouton variante="contour" libelle="Se déconnecter" onPress={deconnecter} />
    </View>
  );
}

/** Première connexion d'un client : il remplace le mot de passe provisoire envoyé par son coach. */
function NouveauMotDePasse() {
  const { changerMotDePasse, deconnecter } = useSession();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    const probleme = verifierMotDePasse(motDePasse, confirmation);
    if (probleme) return setErreur(probleme);
    setEnvoi(true);
    setErreur(await changerMotDePasse(motDePasse));
    setEnvoi(false);
  }

  return (
    <View style={{ gap: espace(3) }}>
      <Text style={styles.libelle}>Choisis ton mot de passe</Text>
      <Texte style={{ color: '#C9C9CF' }}>Remplace le mot de passe provisoire par le tien. Toi seul le connaîtras.</Texte>
      <TextInput
        style={styles.saisie}
        placeholder="Nouveau mot de passe (8 caractères ou plus)"
        placeholderTextColor="#8A8A92"
        secureTextEntry
        autoComplete="new-password"
        value={motDePasse}
        onChangeText={setMotDePasse}
      />
      <TextInput
        style={styles.saisie}
        placeholder="Le même, une seconde fois"
        placeholderTextColor="#8A8A92"
        secureTextEntry
        autoComplete="new-password"
        value={confirmation}
        onChangeText={setConfirmation}
        onSubmitEditing={valider}
      />
      {erreur && <Texte style={{ color: '#FF8A8F' }}>{erreur}</Texte>}
      <Bouton libelle="Enregistrer" onPress={valider} chargement={envoi} desactive={!motDePasse || !confirmation} />
      <Bouton variante="contour" libelle="Se déconnecter" onPress={deconnecter} />
    </View>
  );
}

function ChoixDemo() {
  const { choisirProfilDemo } = useSession();
  return (
    <View style={{ gap: espace(3) }}>
      <Text style={styles.libelle}>Démonstration · données fictives</Text>
      {CLIENTS_DEMO.map((c) => (
        <Bouton
          key={c.id}
          libelle={`Je suis ${c.prenom}, client`}
          onPress={() => choisirProfilDemo({ role: 'client', clientId: c.id, prenom: c.prenom })}
        />
      ))}
      <Bouton
        variante="secondaire"
        libelle={`Je suis ${COACH_DEMO.nom}, coach`}
        onPress={() => choisirProfilDemo({ role: 'coach', coachId: COACH_DEMO.id, nom: COACH_DEMO.nom })}
      />
      <Bouton
        variante="contour"
        libelle="Je suis un futur client : questionnaire d’accueil"
        onPress={() => router.push({ pathname: '/questionnaire/[lien]', params: { lien: 'sylvain' } })}
      />
    </View>
  );
}

const LIBELLES: Record<Fournisseur, string> = {
  google: 'Continuer avec Google',
  azure: 'Continuer avec Microsoft',
  apple: 'Continuer avec Apple',
};

function Connexion() {
  const { connecter, connecterAvec, inscrire } = useSession();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    setErreur(null);
    setInfo(null);
    if (mode === 'inscription') {
      const probleme = verifierMotDePasse(motDePasse, motDePasse);
      if (probleme) return setErreur(probleme);
      setEnvoi(true);
      const r = await inscrire(email, motDePasse);
      setEnvoi(false);
      if (r.erreur) return setErreur(r.erreur);
      if (r.aConfirmer) setInfo(`Un e-mail de confirmation est parti à ${email.trim()}. Ouvre le lien qu’il contient, puis connecte-toi.`);
      return;
    }
    setEnvoi(true);
    setErreur(await connecter(email, motDePasse));
    setEnvoi(false);
  }

  async function avec(f: Fournisseur) {
    setErreur(null);
    setErreur(await connecterAvec(f));
  }

  return (
    <View style={{ gap: espace(3) }}>
      {connexions.fournisseurs.map((f) => (
        <Bouton key={f} variante="contour" libelle={LIBELLES[f]} onPress={() => avec(f)} />
      ))}
      {connexions.fournisseurs.length > 0 && <Text style={[styles.libelle, { textAlign: 'center' }]}>ou avec ton e-mail</Text>}
      <TextInput
        style={styles.saisie}
        placeholder="E-mail"
        placeholderTextColor="#8A8A92"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.saisie}
        placeholder={mode === 'inscription' ? 'Choisis un mot de passe (8 caractères ou plus)' : 'Mot de passe'}
        placeholderTextColor="#8A8A92"
        secureTextEntry
        autoComplete={mode === 'inscription' ? 'new-password' : 'password'}
        value={motDePasse}
        onChangeText={setMotDePasse}
        onSubmitEditing={valider}
      />
      {erreur && <Texte style={{ color: '#FF8A8F' }}>{erreur}</Texte>}
      {info && <Texte style={{ color: '#C9C9CF' }}>{info}</Texte>}
      <Bouton
        libelle={mode === 'inscription' ? 'Créer mon compte' : 'Se connecter'}
        onPress={valider}
        chargement={envoi}
        desactive={!email || !motDePasse}
      />
      {connexions.inscription && (
        <Bouton
          variante="contour"
          libelle={mode === 'inscription' ? 'J’ai déjà un compte' : 'Première fois ? Crée ton compte'}
          onPress={() => {
            setMode(mode === 'inscription' ? 'connexion' : 'inscription');
            setErreur(null);
            setInfo(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  resultat: { fontFamily: polices.texte, fontSize: 15, lineHeight: 21, color: '#C9C9CF' },
  fond: { flex: 1, backgroundColor: couleurs.noir },
  contenu: { flex: 1, justifyContent: 'space-between', padding: espace(6), paddingTop: espace(20), width: '100%', maxWidth: 480, alignSelf: 'center' },
  marque: { fontFamily: polices.titre, fontSize: 64, color: '#FFFFFF', letterSpacing: 1 },
  libelle: { fontFamily: polices.texteMoyen, color: '#8A8A92', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  saisie: {
    backgroundColor: '#1C1C20',
    color: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: espace(4),
    paddingVertical: espace(3.5),
    fontFamily: polices.texte,
    fontSize: 16,
  },
});
