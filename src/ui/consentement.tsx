// RGPD : accord du client sur ses données de santé, demandé au premier accès (et à chaque nouvelle version de la
// politique), puis consultable et modifiable depuis « Mes données ».
import { useState } from 'react';
import { Text, View } from 'react-native';

import { consentements } from '@/data/consentement';
import { DONNEES_SANTE, LIEN_POLITIQUE, type Consentement } from '@/domain/consentement';
import { ouvrirLien } from '@/lib/ouvrir-lien';

import { Bouton, Carte, Erreur, Texte, Titre } from './composants';
import { CaseACocher } from './crm/dossier';
import { couleurs, espace, polices } from './theme';

export function LienPolitique({ clair }: { clair?: boolean }) {
  return (
    <Text
      accessibilityRole="link"
      onPress={() => ouvrirLien(LIEN_POLITIQUE)}
      style={{ fontFamily: polices.texte, fontSize: 14, textDecorationLine: 'underline', color: clair ? '#C9C9CF' : couleurs.texteDoux }}
    >
      Politique de confidentialité
    </Text>
  );
}

/**
 * `actuel` absent : premier accès, l'accord sur les données de santé est obligatoire pour continuer.
 * `actuel` présent : le client revoit ses choix et peut activer ou couper l'analyse des photos par l'IA.
 */
export function AccordDonnees({
  clientId,
  prenom,
  actuel,
  onFait,
  onRefuser,
}: {
  clientId: string;
  prenom: string;
  actuel?: Consentement | null;
  onFait: (c: Consentement) => void;
  onRefuser?: () => void;
}) {
  const reglage = !!actuel?.donneesSante;
  const [sante, setSante] = useState(reglage);
  const [ia, setIa] = useState(actuel?.analyseIa ?? false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();

  async function valider() {
    setEnvoi(true);
    setErreur(undefined);
    try {
      onFait(await consentements.accepter(clientId, ia));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ton accord n’a pas pu être enregistré. Réessaie.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <Titre>{reglage ? 'Mes données' : `Bienvenue ${prenom}`}</Titre>
      <Texte>
        Pour te suivre, ton coach et toi enregistrez dans CoachGo des données sur ta santé et ta forme. Elles servent uniquement à ton
        coaching, ne sont visibles que par toi et ton coach, et ne sont ni vendues ni utilisées pour de la publicité.
      </Texte>
      <Carte style={{ gap: espace(2) }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Ce qui est enregistré</Text>
        {DONNEES_SANTE.map((d) => (
          <Texte key={d}>• {d}</Texte>
        ))}
        <Texte doux style={{ fontSize: 14 }}>Hébergement en Europe (Supabase). Tu peux demander à tout moment une copie ou l’effacement de tes données à ton coach.</Texte>
      </Carte>
      <CaseACocher
        libelle="J’accepte que mes données de santé soient enregistrées pour mon coaching (obligatoire)"
        valeur={sante}
        onChange={reglage ? () => undefined : setSante}
      />
      <Carte style={{ gap: espace(2) }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Facultatif : analyse des photos de repas</Text>
        <Texte doux style={{ fontSize: 14 }}>
          Quand tu photographies un repas, la photo est envoyée à Claude (Anthropic, États-Unis) pour estimer les aliments et les quantités.
          Elle n’est pas gardée. Sans cet accord, tu notes tes repas à la main ou par code-barres.
        </Texte>
        <CaseACocher libelle="J’accepte l’analyse de mes photos de repas par l’IA" valeur={ia} onChange={setIa} />
      </Carte>
      <LienPolitique />
      {erreur && <Erreur message={erreur} />}
      <Bouton
        libelle={reglage ? 'Enregistrer mes choix' : 'Continuer'}
        onPress={valider}
        chargement={envoi}
        desactive={!sante || (reglage && ia === actuel?.analyseIa)}
      />
      {reglage ? (
        <Texte doux style={{ fontSize: 14 }}>
          Pour retirer ton accord sur tes données de santé, ce qui arrête ton suivi dans l’appli, ou pour faire effacer ton compte, écris à
          ton coach : il le fait sous un mois.
        </Texte>
      ) : (
        onRefuser && <Bouton variante="discret" libelle="Je refuse et je me déconnecte" onPress={onRefuser} />
      )}
    </View>
  );
}
