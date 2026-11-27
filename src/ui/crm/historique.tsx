// Historique du dossier : la ligne de résumé sous le nom (« Client depuis 3 mois · Instagram ») et, en la touchant,
// tout ce qui s'est passé du premier contact à aujourd'hui (étapes, étapes sautées, Booster, paiements, bilans, notes).
import { ChevronRight, Plus, Trash2 } from '@/ui/icones';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import type { Contact } from '@/domain/crm';
import { CATEGORIES_HISTORIQUE, filtrerHistorique, parMois, type CategorieHistorique, type LigneHistorique } from '@/domain/historique';
import { etatA11y } from '@/lib/accessibilite';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { Chargement, Erreur } from '../composants';
import { arrondi, couleurs, espace, polices } from '../theme';
import { BoutonEtape } from './acces';
import { ChangerEtape } from './etapes';

function useHistorique(contactId: string) {
  const charge = useCharger(() => crm.historique(contactId), `historique-${contactId}`);
  useRechargerSur(charge.recharger, ecouterCrm);
  return charge;
}

/** Sous le nom du dossier : une ligne, qui ouvre l'historique. */
export function ResumeHistorique({ contactId, ouvert, onPress }: { contactId: string; ouvert: boolean; onPress: () => void }) {
  const { donnee } = useHistorique(contactId);
  if (!donnee?.resume) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${donnee.resume}. ${ouvert ? 'Fermer' : 'Ouvrir'} l’historique`}
      {...etatA11y({ expanded: ouvert })}
      onPress={onPress}
      style={({ pressed }) => [styles.resume, pressed && { backgroundColor: couleurs.discret }]}
    >
      <Text style={styles.resumeTexte}>{donnee.resume}</Text>
      <View style={styles.resumeLien}>
        <Text style={styles.resumeLienTexte}>{ouvert ? 'Fermer' : 'Historique'}</Text>
        {!ouvert && <ChevronRight size={16} color={couleurs.rouge} />}
      </View>
    </Pressable>
  );
}

const jour = (quand: string) =>
  new Date(quand.length === 10 ? `${quand}T12:00:00` : quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const COULEUR: Record<CategorieHistorique, string> = {
  parcours: couleurs.vert,
  paiements: couleurs.suggestion,
  bilans: couleurs.bleu,
  notes: couleurs.violet,
};

export function HistoriqueContact({ contact, onRetour }: { contact: Contact; onRetour: () => void }) {
  const charge = useHistorique(contact.id);
  const [filtre, setFiltre] = useState<CategorieHistorique | 'tout'>('tout');
  const [note, setNote] = useState<string | null>(null);
  const [etape, setEtape] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();

  async function enregistrerNote() {
    if (note === null) return;
    setOccupe(true);
    setErreur(undefined);
    try {
      await crm.ajouterNote(contact.id, note);
      setNote(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Note non enregistrée');
    } finally {
      setOccupe(false);
    }
  }

  async function supprimer(id: string) {
    setErreur(undefined);
    try {
      await crm.supprimerNote(id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression non confirmée');
    }
  }

  const groupes = charge.donnee ? parMois(filtrerHistorique(charge.donnee.lignes, filtre)) : [];
  return (
    <View style={{ gap: espace(4), marginTop: espace(2) }}>
      <View style={styles.entete}>
        <Text style={styles.titre}>Historique</Text>
        <Text accessibilityRole="button" onPress={onRetour} style={styles.retour}>
          Retour à la fiche
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espace(2) }}>
        {CATEGORIES_HISTORIQUE.map((c) => (
          <Pressable
            key={c.cle}
            accessibilityRole="button"
            {...etatA11y({ selected: filtre === c.cle })}
            onPress={() => setFiltre(c.cle)}
            style={[styles.filtre, filtre === c.cle && styles.filtreActif]}
          >
            <Text style={[styles.filtreTexte, filtre === c.cle && { color: couleurs.blanc }]}>{c.libelle}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {contact.statut !== 'archive' && note === null && (
        <View style={styles.actions}>
          <View style={{ flexGrow: 1, flexBasis: 140 }}>
            <BoutonContour libelle="Ajouter une note" icone={Plus} iconeAGauche onPress={() => setNote('')} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 140 }}>
            <BoutonContour libelle="Changer d’étape" onPress={() => setEtape(true)} />
          </View>
        </View>
      )}
      {note !== null && (
        <View style={styles.saisie}>
          <TextInput
            accessibilityLabel="Ta note"
            autoFocus
            multiline
            value={note}
            onChangeText={setNote}
            placeholder="Ex. : genou droit sensible, éviter les fentes"
            placeholderTextColor={couleurs.suggestion}
            style={styles.champ}
          />
          <View style={styles.actions}>
            <View style={{ flexGrow: 1 }}>
              <BoutonContour libelle="Annuler" onPress={() => setNote(null)} />
            </View>
            <View style={{ flexGrow: 1 }}>
              <BoutonEtape libelle={occupe ? 'Enregistrement…' : 'Enregistrer la note'} desactive={occupe || !note.trim()} onPress={enregistrerNote} />
            </View>
          </View>
        </View>
      )}
      {erreur && (
        <Text accessibilityRole="alert" style={styles.erreur}>
          {erreur}
        </Text>
      )}

      {charge.erreur && !charge.donnee ? (
        <Erreur message={charge.erreur} onReessayer={charge.recharger} />
      ) : !charge.donnee ? (
        <Chargement />
      ) : groupes.length === 0 ? (
        <Text style={styles.vide}>Rien pour ce filtre.</Text>
      ) : (
        groupes.map((g) => (
          <View key={g.mois} style={{ gap: espace(1) }}>
            <Text style={styles.mois}>{g.mois.toUpperCase()}</Text>
            {g.lignes.map((l) => (
              <Evenement key={l.id} ligne={l} onSupprimer={l.noteId ? () => supprimer(l.noteId!) : undefined} />
            ))}
          </View>
        ))
      )}

      {etape && <ChangerEtape contact={contact} onFermer={() => setEtape(false)} onFait={() => setEtape(false)} />}
    </View>
  );
}

function Evenement({ ligne: l, onSupprimer }: { ligne: LigneHistorique; onSupprimer?: () => void }) {
  return (
    <View style={styles.evenement}>
      <View
        style={[
          styles.point,
          { backgroundColor: COULEUR[l.categorie] },
          l.fort && { backgroundColor: couleurs.rouge },
          l.sautee && styles.pointSaute,
        ]}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.evTitre, l.fort && { fontFamily: polices.texteGras }, l.sautee && { color: couleurs.texteDoux }]}>
          {l.sautee ? `${l.titre} · étape sautée` : l.titre}
        </Text>
        {!l.sautee && <Text style={styles.evDetail}>{[jour(l.quand), l.detail].filter(Boolean).join(' · ')}</Text>}
      </View>
      {onSupprimer && (
        <Pressable accessibilityRole="button" accessibilityLabel="Supprimer cette note" onPress={onSupprimer} hitSlop={8} style={styles.suppr}>
          <Trash2 size={16} color={couleurs.texteDoux} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  resume: {
    marginTop: espace(3),
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(2),
    paddingHorizontal: espace(3),
    paddingVertical: espace(2),
    borderRadius: arrondi.controle,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
  },
  resumeTexte: { flex: 1, minWidth: 0, fontFamily: polices.texte, fontSize: 13, color: couleurs.texte },
  resumeLien: { flexDirection: 'row', alignItems: 'center' },
  resumeLienTexte: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.rouge },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) },
  titre: { fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte },
  retour: { minHeight: 44, lineHeight: 44, fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux, textDecorationLine: 'underline' },
  filtre: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
  },
  filtreActif: { backgroundColor: couleurs.noir, borderColor: couleurs.noir },
  filtreTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  saisie: { gap: espace(2) },
  champ: {
    minHeight: 80,
    padding: espace(3),
    borderRadius: arrondi.controle,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    backgroundColor: couleurs.carte,
    fontFamily: polices.texte,
    fontSize: 15,
    color: couleurs.texte,
    textAlignVertical: 'top',
  },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  vide: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux },
  mois: { marginTop: espace(2), fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 0.5, color: couleurs.texteDoux },
  evenement: { flexDirection: 'row', gap: espace(3), paddingVertical: 6, alignItems: 'flex-start' },
  point: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  pointSaute: { backgroundColor: couleurs.carte, borderWidth: 2, borderStyle: 'dashed', borderColor: couleurs.suggestion },
  evTitre: { fontFamily: polices.texte, fontSize: 15, color: couleurs.texte },
  evDetail: { marginTop: 2, fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  suppr: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
