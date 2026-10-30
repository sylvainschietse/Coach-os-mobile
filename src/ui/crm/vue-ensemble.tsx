// C01 — Accueil, repris de CRMWorkspace (module « Accueil ») : chiffres cliquables, Prochains Boosters et À faire
// (relances à envoyer et tâches), bouton Programmes et cycles clients.
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { crm } from '@/data/crm';
import { ajouterJours, jourLocal, MODELES, statutBooster, type BoosterDossier, type ContactResume, type RelanceAFaire } from '@/domain/crm';
import { montantLisible } from '@/domain/gestion';

import { BoutonContour, Stat } from '../coque';
import { Carte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { adresseQuestionnaire, CarteRelance, dateCourte, jourLisible, nomComplet } from './commun';

export type DonneesVueEnsemble = {
  contacts: ContactResume[];
  relances: RelanceAFaire[];
  boosters: BoosterDossier[];
  encaissements: number;
  aEncaisser: number;
  lienQuestionnaire: string | null;
};

export function VueEnsemble({
  donnees,
  onRubrique,
  onOuvrirTache,
  onNouvelleTache,
  onOuvrirContact,
  onOuvrirBooster,
  onCycles,
}: {
  donnees: DonneesVueEnsemble;
  onRubrique: (r: 'Contacts' | 'Boosters' | 'Paiements') => void;
  onOuvrirTache: (id: string) => void;
  onNouvelleTache: () => void;
  onOuvrirContact: (id: string) => void;
  onOuvrirBooster: (b: BoosterDossier) => void;
  onCycles: () => void;
}) {
  const { width } = useWindowDimensions();
  const [tout, setTout] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const agir = (action: Promise<void>) => {
    setErreur(undefined);
    action.catch((e) => setErreur(e instanceof Error ? e.message : 'Action non confirmée'));
  };
  const enRetard = donnees.relances.filter((r) => r.enRetard).length;
  const aFaire = tout ? donnees.relances : donnees.relances.slice(0, 5);
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
        <Stat style={{ flexBasis: base }} libelle="À faire en retard" valeur={String(enRetard)} />
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
        {/* Relances automatiques et tâches ajoutées à la main, en une liste : chaque message part d'un appui. */}
        <Carte style={{ flex: 1, padding: 20 }}>
          <View style={[ligne, { paddingVertical: 0, marginBottom: 16 }]}>
            <Text style={[titreCarte, { marginBottom: 0 }]}>À faire</Text>
            <BoutonContour libelle="+ Tâche" onPress={onNouvelleTache} />
          </View>
          <View style={{ gap: 12 }}>
            {aFaire.map((r) =>
              r.modele === 'tache' ? (
                <Pressable key={r.id} accessibilityRole="button" onPress={() => onOuvrirTache(r.id)} style={[{ paddingVertical: 8 }, bordure]}>
                  <Text style={ligneTexte}>{r.titre || r.note || MODELES[r.modele].libelle}</Text>
                  <Text style={ligneDoux}>
                    {nomComplet(r.contact)} · {jourLisible(r.echeance)}
                  </Text>
                </Pressable>
              ) : (
                <CarteRelance
                  key={r.id}
                  relance={r}
                  contact={r.contact}
                  enRetard={r.enRetard}
                  lienQuestionnaire={donnees.lienQuestionnaire ? adresseQuestionnaire(donnees.lienQuestionnaire) : undefined}
                  booster={donnees.boosters.find((b) => b.contactId === r.contactId && b.statut === 'prevu')?.date}
                  onFaite={() => agir(crm.terminerRelance(r.id))}
                  onReporter={() => agir(crm.reporterRelance(r.id, ajouterJours(jourLocal(new Date()), 1)))}
                  onOuvrirContact={() => onOuvrirContact(r.contactId)}
                />
              ),
            )}
          </View>
          {!donnees.relances.length && <Text style={ligneDoux}>Rien à faire aujourd’hui.</Text>}
          {donnees.relances.length > 5 && (
            <Text accessibilityRole="button" onPress={() => setTout((t) => !t)} style={[ligneDoux, { marginTop: 12, textDecorationLine: 'underline' }]}>
              {tout ? 'Réduire' : `Tout afficher (${donnees.relances.length})`}
            </Text>
          )}
          {erreur && <Text style={[ligneDoux, { color: couleurs.rouge, marginTop: 8 }]}>{erreur}</Text>}
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
