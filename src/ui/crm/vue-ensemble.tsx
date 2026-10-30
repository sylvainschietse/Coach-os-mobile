// C01 — Vue d'ensemble, reprise de CRMWorkspace (module « Accueil ») : quatre cartes cliquables,
// Prochains Boosters et Relances à faire (six au plus), bouton Programmes et cycles clients.
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { MODELES, statutBooster, type BoosterDossier, type ContactResume, type RelanceAFaire } from '@/domain/crm';
import { montantLisible } from '@/domain/gestion';

import { BoutonContour, Stat } from '../coque';
import { Carte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { dateCourte, jourLisible, nomComplet } from './commun';

export type DonneesVueEnsemble = { contacts: ContactResume[]; relances: RelanceAFaire[]; boosters: BoosterDossier[]; encaissements: number; aEncaisser: number };

export function VueEnsemble({
  donnees,
  onRubrique,
  onOuvrirTache,
  onOuvrirBooster,
  onCycles,
}: {
  donnees: DonneesVueEnsemble;
  onRubrique: (r: 'Contacts' | 'Boosters' | 'Taches' | 'Paiements') => void;
  onOuvrirTache: (id: string) => void;
  onOuvrirBooster: (b: BoosterDossier) => void;
  onCycles: () => void;
}) {
  const { width } = useWindowDimensions();
  const actifs = donnees.contacts.filter((c) => c.statut !== 'archive');
  // Comme à l'origine : tout Booster ni Terminé ni Annulé d'un dossier actif, le plus proche d'abord.
  const prochains = donnees.boosters
    .filter((b) => b.statut === 'prevu' && b.contact.statut !== 'archive')
    .sort((a, b) => a.date.localeCompare(b.date));
  // Grille d'origine : 1 colonne, 2 dès sm (640px), 4 dès xl (1280px) ; on raisonne sur la largeur de l'écran.
  const colonnes = width >= 1280 ? 4 : width >= 640 ? 2 : 1;
  const base = `${100 / colonnes - 2}%` as const;

  return (
    <View style={{ gap: espace(6) }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat style={{ flexBasis: base }} libelle="Contacts" valeur={String(actifs.length)} onPress={() => onRubrique('Contacts')} />
        <Stat style={{ flexBasis: base }} libelle="Boosters à réaliser" valeur={String(prochains.length)} onPress={() => onRubrique('Boosters')} />
        <Stat style={{ flexBasis: base }} libelle="Relances en retard" valeur={String(donnees.relances.length)} onPress={() => onRubrique('Taches')} />
        {/* Paiements « Payé » datés du mois en cours. */}
        <Stat style={{ flexBasis: base }} libelle="Encaissé ce mois" valeur={montantLisible(donnees.encaissements)} onPress={() => onRubrique('Paiements')} />
        {/* Paiements « En attente » : abonnements du mois et packs vendus, à passer en « Payé » une fois reçus. */}
        <Stat style={{ flexBasis: base }} libelle="À encaisser" valeur={montantLisible(donnees.aEncaisser)} onPress={() => onRubrique('Paiements')} />
      </View>
      <View style={{ flexDirection: width >= 1280 ? 'row' : 'column', gap: 20 }}>
        <Carte style={{ flex: 1, padding: 20 }}>
          <Text style={titreCarte}>Prochains Boosters</Text>
          {prochains.slice(0, 6).map((b, i) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              onPress={() => onOuvrirBooster(b)}
              style={[ligne, i < Math.min(prochains.length, 6) - 1 && bordure]}
            >
              <View style={{ flexShrink: 1 }}>
                <Text style={ligneTexte}>{nomComplet(b.contact)}</Text>
                <Text style={ligneDoux}>{dateCourte(b.date)}</Text>
              </View>
              <View style={badge}>
                <Text style={badgeTexte}>{statutBooster(b)}</Text>
              </View>
            </Pressable>
          ))}
          {!prochains.length && <Text style={ligneDoux}>Aucun Booster à venir.</Text>}
        </Carte>
        <Carte style={{ flex: 1, padding: 20 }}>
          <Text style={titreCarte}>Relances à faire</Text>
          {donnees.relances.slice(0, 6).map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => onOuvrirTache(r.id)}
              style={[{ paddingVertical: 12 }, i < Math.min(donnees.relances.length, 6) - 1 && bordure]}
            >
              <Text style={ligneTexte}>{r.titre || r.note || MODELES[r.modele].libelle}</Text>
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
