// C01 — Vue d'ensemble, reprise de CRMWorkspace (module « Accueil ») : quatre cartes cliquables,
// Prochains Boosters et Actions prioritaires (six au plus), bouton Programmes et cycles clients.
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { MODELES, STATUTS, type ContactResume, type RelanceAFaire } from '@/domain/crm';

import { BoutonContour, Stat } from '../coque';
import { Carte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { dateHeure, jourLisible, nomComplet } from './commun';

export type DonneesVueEnsemble = { contacts: ContactResume[]; relances: RelanceAFaire[] };

export function VueEnsemble({
  donnees,
  maintenant,
  onRubrique,
  onOuvrirContact,
  onCycles,
}: {
  donnees: DonneesVueEnsemble;
  maintenant: Date;
  onRubrique: (r: 'Contacts' | 'Boosters' | 'Taches' | 'Paiements') => void;
  onOuvrirContact: (id: string) => void;
  onCycles: () => void;
}) {
  const { width } = useWindowDimensions();
  const actifs = donnees.contacts.filter((c) => c.statut !== 'archive');
  const debut = maintenant.getTime() - 3 * 3600_000;
  const prochains = actifs
    .filter((c) => c.prochainBooster && new Date(c.prochainBooster).getTime() >= debut)
    .sort((a, b) => a.prochainBooster!.localeCompare(b.prochainBooster!));
  // Grille d'origine : 1 colonne, 2 dès sm (640px), 4 dès xl (1280px) ; on raisonne sur la largeur de l'écran.
  const colonnes = width >= 1280 ? 4 : width >= 640 ? 2 : 1;
  const base = `${100 / colonnes - 2}%` as const;

  return (
    <View style={{ gap: espace(6) }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat style={{ flexBasis: base }} libelle="Contacts" valeur={String(actifs.length)} onPress={() => onRubrique('Contacts')} />
        <Stat style={{ flexBasis: base }} libelle="Boosters à réaliser" valeur={String(prochains.length)} onPress={() => onRubrique('Boosters')} />
        <Stat style={{ flexBasis: base }} libelle="Actions échues" valeur={String(donnees.relances.length)} onPress={() => onRubrique('Taches')} />
        {/* Aucun paiement n'est encore enregistré dans la nouvelle app : on n'affiche pas 0 €. */}
        <Stat style={{ flexBasis: base }} libelle="Encaissements ce mois" valeur="—" onPress={() => onRubrique('Paiements')} />
      </View>
      <View style={{ flexDirection: width >= 1280 ? 'row' : 'column', gap: 20 }}>
        <Carte style={{ flex: 1, padding: 20 }}>
          <Text style={titreCarte}>Prochains Boosters</Text>
          {prochains.slice(0, 6).map((c, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => onOuvrirContact(c.id)}
              style={[ligne, i < Math.min(prochains.length, 6) - 1 && bordure]}
            >
              <View style={{ flexShrink: 1 }}>
                <Text style={ligneTexte}>{nomComplet(c)}</Text>
                <Text style={ligneDoux}>{dateHeure(c.prochainBooster!)}</Text>
              </View>
              <View style={badge}>
                <Text style={badgeTexte}>{STATUTS[c.statut].libelle}</Text>
              </View>
            </Pressable>
          ))}
          {!prochains.length && <Text style={ligneDoux}>Aucun Booster à venir.</Text>}
        </Carte>
        <Carte style={{ flex: 1, padding: 20 }}>
          <Text style={titreCarte}>Actions prioritaires</Text>
          {donnees.relances.slice(0, 6).map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => onOuvrirContact(r.contactId)}
              style={[{ paddingVertical: 12 }, i < Math.min(donnees.relances.length, 6) - 1 && bordure]}
            >
              <Text style={ligneTexte}>{r.note || MODELES[r.modele].libelle}</Text>
              <Text style={ligneDoux}>
                {nomComplet(r.contact)} · {jourLisible(r.echeance)}
              </Text>
            </Pressable>
          ))}
          {!donnees.relances.length && <Text style={ligneDoux}>Aucune tâche échue.</Text>}
          <View style={{ marginTop: 16 }}>
            <BoutonContour libelle="Programmes et cycles clients" onPress={onCycles} />
          </View>
        </Carte>
      </View>
    </View>
  );
}

const titreCarte = { fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte, marginBottom: 16 } as const;
const ligne = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 } as const;
const bordure = { borderBottomWidth: 1, borderBottomColor: couleurs.bordure } as const;
const ligneTexte = { fontSize: 14, fontFamily: polices.texte, color: couleurs.texte } as const;
const ligneDoux = { fontSize: 13, fontFamily: polices.texte, color: couleurs.texteDoux } as const;
const badge = { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 } as const;
const badgeTexte = { fontSize: 12, fontFamily: polices.texteGras, color: couleurs.texte } as const;
