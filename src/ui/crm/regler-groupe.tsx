// Paiements groupés par client : le client a réglé plusieurs séances en une fois.
// Le coach coche les séances, choisit le moyen de paiement et les marque toutes payées d'un coup.
// Chaque ligne passe « Payé » comme depuis sa fiche : la facture (de la ligne ou du mois) suit toute seule.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { montantLisible, type MoyenPaiement } from '@/domain/gestion';

import { BoutonContour } from '../coque';
import { Bouton } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { carteDossier } from './contacts';
import { CaseACocher, Libelle } from './dossier';

/** Stripe se règle tout seul : ici, ce que le coach encaisse lui-même. */
const MOYENS: MoyenPaiement[] = ['Espèces', 'Virement', 'Chèque', 'Carte bancaire'];

export type LigneARegler = { id: string; titre: string; date?: string; montant?: number };

const jourMois = (j?: string) => (j ? `${j.slice(8, 10)}/${j.slice(5, 7)}` : '');

export function ReglerPlusieurs({ prenom, lignes, onFait }: { prenom: string; lignes: LigneARegler[]; onFait?: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [moyen, setMoyen] = useState<MoyenPaiement>();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  if (!lignes.length) return null;

  // Une ligne réglée ailleurs entre-temps disparaît de la sélection.
  const ids = lignes.filter((l) => choisies.has(l.id)).map((l) => l.id);
  const total = lignes.filter((l) => choisies.has(l.id)).reduce((t, l) => t + (l.montant ?? 0), 0);

  if (!ouvert)
    return (
      <View style={{ alignSelf: 'flex-start' }}>
        <BoutonContour
          libelle={lignes.length > 1 ? 'Marquer plusieurs séances payées' : 'Marquer payée'}
          onPress={() => {
            setChoisies(new Set(lignes.map((l) => l.id)));
            setMoyen(undefined);
            setErreur(undefined);
            setOuvert(true);
          }}
        />
      </View>
    );

  async function valider() {
    if (!moyen || !ids.length) return;
    setOccupe(true);
    setErreur(undefined);
    try {
      await crm.reglerPaiements(ids, moyen);
      setOuvert(false);
      onFait?.();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
    } finally {
      setOccupe(false);
    }
  }

  const basculer = (id: string) =>
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <View style={[carteDossier, { gap: espace(3) }]}>
      <Text style={styles.titre}>Qu’est-ce que {prenom || 'ce client'} a réglé ?</Text>
      <View>
        {lignes.map((l) => (
          <CaseACocher
            key={l.id}
            libelle={`${l.date ? `${jourMois(l.date)} · ` : ''}${l.titre || 'Sans nom'} · ${montantLisible(l.montant)}`}
            valeur={choisies.has(l.id)}
            onChange={() => basculer(l.id)}
          />
        ))}
      </View>
      <View style={{ gap: espace(2) }}>
        <Libelle>Moyen de paiement</Libelle>
        <View style={styles.ligne}>
          {MOYENS.map((m) => {
            const actif = moyen === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ checked: actif }}
                onPress={() => setMoyen(m)}
                style={[styles.puce, actif && { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge }]}
              >
                <Text style={[styles.puceTexte, actif && { color: '#FFFFFF' }]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {erreur && (
        <Text accessibilityRole="alert" style={styles.erreur}>
          {erreur}
        </Text>
      )}
      {!moyen && ids.length > 0 && <Text style={styles.aide}>Choisis le moyen de paiement pour valider.</Text>}
      <Bouton
        libelle={ids.length ? `Marquer payée${ids.length > 1 ? 's' : ''} · ${ids.length} séance${ids.length > 1 ? 's' : ''} · ${montantLisible(total)}` : 'Coche au moins une séance'}
        desactive={!moyen || !ids.length}
        chargement={occupe}
        onPress={valider}
      />
      <Text accessibilityRole="button" onPress={() => setOuvert(false)} style={styles.annuler}>
        Annuler
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espace(2) },
  puce: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  erreur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
  aide: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  annuler: { alignSelf: 'center', paddingHorizontal: 12, lineHeight: 44, fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texteDoux },
});
