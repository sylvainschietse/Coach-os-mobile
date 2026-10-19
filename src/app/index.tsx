import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CLIENTS_DEMO, COACH_DEMO } from '@/data/demo';
import { useSession } from '@/data/session';
import { supabase } from '@/data/supabase';
import { Bouton, Texte } from '@/ui/composants';
import { couleurs, espace, polices } from '@/ui/theme';

export default function Accueil() {
  const { profil } = useSession();
  if (profil?.role === 'client') return <Redirect href="/client" />;
  if (profil?.role === 'coach') return <Redirect href="/coach" />;

  return (
    <SafeAreaView style={styles.fond}>
      <View style={styles.contenu}>
        <View style={{ gap: espace(1) }}>
          <Text style={styles.marque}>
            COACH <Text style={{ color: couleurs.rouge }}>OS</Text>
          </Text>
          <Texte style={{ color: '#C9C9CF' }}>Ton programme, ta séance, ta progression.</Texte>
        </View>
        {supabase ? <Connexion /> : <ChoixDemo />}
      </View>
    </SafeAreaView>
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

function Connexion() {
  const { connecter } = useSession();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    setEnvoi(true);
    setErreur(await connecter(email, motDePasse));
    setEnvoi(false);
  }

  return (
    <View style={{ gap: espace(3) }}>
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
        placeholder="Mot de passe"
        placeholderTextColor="#8A8A92"
        secureTextEntry
        autoComplete="password"
        value={motDePasse}
        onChangeText={setMotDePasse}
        onSubmitEditing={valider}
      />
      {erreur && <Texte style={{ color: '#FF8A8F' }}>{erreur}</Texte>}
      <Bouton libelle="Se connecter" onPress={valider} chargement={envoi} desactive={!email || !motDePasse} />
    </View>
  );
}

const styles = StyleSheet.create({
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
