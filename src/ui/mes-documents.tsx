// U11 — Mes documents repris de coach-os-espace-client/App.tsx : titre, actualisation, cartes nom · type · date
// et « Ouvrir le PDF » ; « Vos documents arriveront ici » quand rien n'est partagé, distinct d'une erreur.
import { FileText, RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { documents, ecouterDocuments } from '@/data/documents';
import type { DocumentClient } from '@/domain/documents';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { EnTeteRubrique, Vide } from './coque';
import { Bouton, Chargement } from './composants';
import { ouvrirFichier } from './fichiers';
import { arrondi, couleurs, espace, polices } from './theme';

const jour = (j: string) => new Date(`${j.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR');

export function MesDocuments({ clientId }: { clientId: string }) {
  const charge = useCharger(() => documents.mesDocuments(clientId), `docs-${clientId}`);
  useRechargerSur(charge.recharger, ecouterDocuments);

  return (
    <View>
      <EnTeteRubrique
        kicker="Mon suivi"
        titre="Mes documents"
        sousTitre="Vos bilans et comptes rendus partagés par votre coach."
        action={
          <Pressable accessibilityRole="button" accessibilityLabel="Actualiser les documents" onPress={charge.recharger} style={styles.actualiser}>
            <RefreshCw size={16} color={couleurs.texte} />
          </Pressable>
        }
      />
      {charge.erreur && !charge.donnee ? (
        <View accessibilityRole="alert" style={styles.carte}>
          <Text style={styles.texte}>Vos documents n’ont pas pu être chargés. Réessayez.</Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <Bouton libelle="Réessayer" onPress={charge.recharger} />
          </View>
        </View>
      ) : !charge.donnee ? (
        <Chargement />
      ) : charge.donnee.length ? (
        <View style={{ gap: espace(3) }}>
          {charge.donnee.map((d) => (
            <CarteDocument key={d.id} doc={d} />
          ))}
        </View>
      ) : (
        <Vide icone={FileText} titre="Vos documents arriveront ici" texte="Votre coach vous partagera vos bilans et comptes rendus dans cet espace." />
      )}
    </View>
  );
}

function CarteDocument({ doc: d }: { doc: DocumentClient }) {
  const [erreur, setErreur] = useState<string>();
  const pdf = d.typeFichier === 'application/pdf';
  return (
    <View style={styles.carte}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espace(3) }}>
        <View style={styles.icone}>
          <FileText size={20} color={couleurs.rouge} />
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={styles.titre}>{d.nom}</Text>
          <Text style={styles.sous}>{`${d.type} · ${jour(d.date)}`}</Text>
        </View>
      </View>
      {d.chemin && (
        <View style={{ alignSelf: 'flex-start' }}>
          <Bouton
            libelle={pdf ? 'Ouvrir le PDF' : 'Ouvrir le document'}
            onPress={() => {
              setErreur(undefined);
              ouvrirFichier(() => documents.lien(d.chemin!), d.nomFichier || 'document.pdf').catch(() =>
                setErreur('Ce document n’est plus accessible. Actualisez la liste ou demandez-le à votre coach.'),
              );
            }}
          />
        </View>
      )}
      {erreur && (
        <Text accessibilityRole="alert" style={[styles.sous, { color: couleurs.rouge }]}>
          {erreur}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: couleurs.carte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: arrondi.carte,
    padding: 20,
    gap: espace(4),
  },
  actualiser: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: arrondi.controle,
    backgroundColor: couleurs.carte,
  },
  icone: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(200, 16, 46, 0.05)' },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  sous: { marginTop: 4, fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  texte: { fontFamily: polices.texte, fontSize: 15, color: couleurs.texte },
});
