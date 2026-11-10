// « Et après le Booster ? » : le coach range la personne en client actif ou en veille.
// Proposé quand le Booster passe à Terminée, et depuis la carte « À conclure » de l'onglet Boosters.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import type { Contact, IssueBooster } from '@/domain/crm';

import { Bouton } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { Modale } from './dossier';

const OPTIONS: { issue: IssueBooster; titre: string; texte: (prenom: string) => string }[] = [
  {
    issue: 'client',
    titre: 'Client actif',
    texte: (p) => `${p} a pris une formule : direction Clients actifs, et les relances de prospect s’arrêtent.`,
  },
  {
    issue: 'veille',
    titre: 'En veille',
    texte: (p) => `${p} n’a rien pris pour l’instant : sortie des Boosters, rangement dans Prospects › En veille. Tes relances à 10 jours et 1 mois restent prévues.`,
  },
];

export function ConclusionBooster({
  boosterId,
  contact,
  onFermer,
}: {
  boosterId: string;
  contact: Pick<Contact, 'prenom' | 'statut'>;
  onFermer: () => void;
}) {
  const [issue, setIssue] = useState<IssueBooster>();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const prenom = contact.prenom || 'Cette personne';

  async function valider() {
    if (!issue) return;
    setOccupe(true);
    setErreur(undefined);
    try {
      await crm.conclureBooster(boosterId, issue);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Choix non enregistré');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Modale
      titre="Et après le Booster ?"
      largeur={520}
      onFermer={() => !occupe && onFermer()}
      pied={
        <View style={{ gap: espace(2) }}>
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          <Bouton libelle="Valider" desactive={!issue} chargement={occupe} onPress={valider} />
          <Text accessibilityRole="button" onPress={() => !occupe && onFermer()} style={styles.plusTard}>
            Plus tard
          </Text>
        </View>
      }
    >
      <View style={{ gap: espace(3) }}>
        <Text style={styles.question}>Où ranger {prenom} maintenant ?</Text>
        {OPTIONS.map((o) => {
          const choisi = issue === o.issue;
          return (
            <Pressable
              key={o.issue}
              accessibilityRole="radio"
              accessibilityState={{ checked: choisi }}
              onPress={() => setIssue(o.issue)}
              style={[styles.option, choisi && styles.optionChoisie]}
            >
              <View style={[styles.rond, choisi && styles.rondChoisi]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.titre}>{o.titre}</Text>
                <Text style={styles.texte}>{o.texte(prenom)}</Text>
              </View>
            </Pressable>
          );
        })}
        <Text style={styles.aide}>Tu pourras changer d’avis depuis sa fiche (statut).</Text>
      </View>
    </Modale>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: polices.texte, fontSize: 15, color: couleurs.texteDoux },
  option: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    borderRadius: 14,
    padding: 14,
    backgroundColor: couleurs.carte,
  },
  optionChoisie: { borderColor: couleurs.rouge, backgroundColor: couleurs.rougeClair },
  rond: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: couleurs.saisie, marginTop: 1 },
  rondChoisi: { borderWidth: 6, borderColor: couleurs.rouge },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  texte: { marginTop: 3, fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.texteDoux },
  aide: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux, textAlign: 'center' },
  plusTard: { textAlign: 'center', fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte, paddingVertical: 8 },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
});
