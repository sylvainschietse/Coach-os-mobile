// Coach : la liste des fils, un par client qui a l'appli, les messages non lus en premier.
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ecouterMessages, messagerie } from '@/data/messagerie';
import { apercu, heureMessage } from '@/domain/messagerie';
import { useCharger } from '@/lib/useCharger';

import { Chargement, Erreur } from '../composants';
import { Vide } from '../coque';
import { couleurs, polices } from '../theme';

export function ConversationsCoach() {
  const liste = useCharger(() => messagerie.conversations(), 'conversations');
  const { recharger } = liste;
  useEffect(() => ecouterMessages(recharger), [recharger]);
  // Le coach fait le ménage des vidéos de plus de 30 jours en ouvrant ses messages.
  useEffect(() => {
    messagerie.purger().catch(() => undefined);
  }, []);

  const maintenant = new Date();
  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.aide}>Un fil par client qui a l’appli. Tes horaires de réponse, affichés à tes clients, se règlent dans « Mon profil ».</Text>
      {liste.erreur && <Erreur message={liste.erreur} onReessayer={recharger} />}
      {!liste.donnee && !liste.erreur && <Chargement />}
      {liste.donnee?.length === 0 && <Vide icone={MessageCircle} titre="Aucun client avec l’appli" texte="La messagerie s’ouvre dès qu’un client a son accès à l’appli." />}
      <View style={{ gap: 8 }}>
        {liste.donnee?.map((c) => (
          <Pressable
            key={c.clientId}
            accessibilityRole="button"
            accessibilityLabel={`${c.prenom} ${c.nom}${c.nonLus ? `, ${c.nonLus} non lu${c.nonLus > 1 ? 's' : ''}` : ''}`}
            onPress={() => router.push({ pathname: '/coach/messages/[id]', params: { id: c.clientId, nom: c.prenom } })}
            style={({ pressed }) => [styles.ligne, c.nonLus > 0 && { borderColor: couleurs.rouge }, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.initiale}>
              <Text style={styles.initialeTexte}>{(c.prenom[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text numberOfLines={1} style={[styles.nom, { flex: 1 }]}>
                  {`${c.prenom} ${c.nom}`.trim()}
                </Text>
                {c.dernier && <Text style={styles.heure}>{heureMessage(c.dernier.le, maintenant)}</Text>}
              </View>
              <Text numberOfLines={1} style={[styles.apercu, c.nonLus > 0 && { color: couleurs.texte, fontFamily: polices.texteMoyen }]}>
                {c.dernier ? `${c.dernier.auteur === 'coach' ? 'Toi : ' : ''}${apercu(c.dernier)}` : 'Aucun message'}
              </Text>
            </View>
            {c.nonLus > 0 && (
              <View style={styles.pastille}>
                <Text style={styles.pastilleTexte}>{c.nonLus}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
    borderRadius: 14,
    padding: 12,
  },
  initiale: { width: 40, height: 40, borderRadius: 20, backgroundColor: couleurs.discret, alignItems: 'center', justifyContent: 'center' },
  initialeTexte: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  nom: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  heure: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  apercu: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux },
  pastille: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: couleurs.rouge, alignItems: 'center', justifyContent: 'center' },
  aide: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux },
  pastilleTexte: { fontFamily: polices.texteGras, fontSize: 12, color: '#FFFFFF' },
});
