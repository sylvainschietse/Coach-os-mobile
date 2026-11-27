// Parcours des prospects : la rangée d'étapes de l'onglet Prospects (avec le nombre de dossiers), le bouton
// « étape suivante » des cartes et la fenêtre « Changer d'étape », où l'on peut aller à n'importe quelle étape
// (les étapes du milieu sont notées sautées dans l'historique).
import { Check, MoreHorizontal } from '@/ui/icones';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { statutContact, type Contact, type StatutContact } from '@/domain/crm';
import { compterEtapes, ETAPES_PROSPECTS, etapeApres, etapesProposees, etapesSautees, libelleEtape, PARCOURS } from '@/domain/historique';
import { etatA11y } from '@/lib/accessibilite';
import { usePression } from '@/lib/usePression';

import { BoutonContour } from '../coque';
import { arrondi, couleurs, espace, polices } from '../theme';
import { BoutonEtape } from './acces';
import { Modale } from './dossier';

type AvecStatut = Pick<Contact, 'statut' | 'statutAvantArchive' | 'statutCrm'>;

/** « Tous », puis une puce par étape avec son nombre ; on ne voit qu'une étape à la fois. */
export function RangeeEtapes({
  contacts,
  valeur,
  onChange,
}: {
  contacts: AvecStatut[];
  valeur: StatutContact | undefined;
  onChange: (e: StatutContact | undefined) => void;
}) {
  const n = compterEtapes(contacts);
  const total = [...n.values()].reduce((a, b) => a + b, 0);
  const etapes = ETAPES_PROSPECTS.filter((e) => e.toujours || (n.get(e.etape) ?? 0) > 0 || valeur === e.etape);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel="Étapes du parcours"
      contentContainerStyle={styles.rangee}
    >
      <PuceEtape libelle="Tous" nombre={total} actif={!valeur} onPress={() => onChange(undefined)} />
      {etapes.map((e) => (
        <PuceEtape key={e.etape} libelle={e.libelle} nombre={n.get(e.etape) ?? 0} actif={valeur === e.etape} onPress={() => onChange(e.etape)} />
      ))}
    </ScrollView>
  );
}

function PuceEtape({ libelle, nombre, actif, onPress }: { libelle: string; nombre: number; actif: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${libelle}, ${nombre} dossier${nombre > 1 ? 's' : ''}`}
      {...etatA11y({ selected: actif })}
      onPress={onPress}
      style={({ pressed }) => [styles.puce, actif && styles.puceActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.puceTexte, actif && { color: couleurs.blanc }]}>{libelle}</Text>
      <Text style={[styles.puceNombre, actif && { color: couleurs.blanc }]}>{nombre}</Text>
    </Pressable>
  );
}

/**
 * Sous chaque carte de prospect : « Booster fait → » passe à l'étape d'après d'un appui, « ⋯ » ouvre toutes les étapes.
 * Le passage en client passe toujours par la fenêtre : il ouvre l'espace client.
 */
export function BoutonsEtape({ contact, onChange }: { contact: Contact; onChange?: (vers: StatutContact) => void }) {
  const [fenetre, setFenetre] = useState<StatutContact | null>(null);
  const [erreur, setErreur] = useState<string>();
  const actuelle = statutContact(contact);
  const suivante = etapeApres(actuelle);
  const avancer = usePression(async () => {
    if (!suivante) return;
    if (suivante === 'Client actif') return setFenetre(suivante);
    setErreur(undefined);
    try {
      await crm.changerEtape(contact.id, suivante);
      onChange?.(suivante);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Changement non confirmé');
    }
  });
  if (contact.statut === 'archive') return null;
  return (
    <View style={{ gap: espace(2) }}>
      <View style={styles.boutons}>
        {/* En contour : le bouton plein reste celui de l'action à faire (questionnaire, Booster, accès). */}
        {suivante && <BoutonContour libelle={`${libelleEtape(suivante)} →`} desactive={avancer.enCours} onPress={avancer.presser} />}
        <BoutonContour
          icone={MoreHorizontal}
          libelle={suivante ? undefined : 'Changer d’étape'}
          nom="Changer d’étape"
          onPress={() => setFenetre(suivante ?? actuelle)}
        />
      </View>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {fenetre && (
        <ChangerEtape
          contact={contact}
          choixInitial={fenetre}
          onFermer={() => setFenetre(null)}
          onFait={(vers) => {
            setFenetre(null);
            onChange?.(vers);
          }}
        />
      )}
    </View>
  );
}

/** Toutes les étapes du dossier : faites (coche), actuelle, à venir ; le coach touche celle qu'il veut puis valide. */
export function ChangerEtape({
  contact,
  choixInitial,
  onFermer,
  onFait,
}: {
  contact: Contact;
  choixInitial?: StatutContact;
  onFermer: () => void;
  onFait: (vers: StatutContact) => void;
}) {
  const actuelle = statutContact(contact);
  const { parcours, deCote } = etapesProposees(contact);
  const [choix, setChoix] = useState<StatutContact | undefined>(choixInitial && choixInitial !== actuelle ? choixInitial : undefined);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const prenom = contact.prenom || 'Ce contact';
  const rangActuel = PARCOURS.indexOf(actuelle);
  const sautees = choix ? etapesSautees(actuelle, choix) : [];

  async function valider() {
    if (!choix) return;
    setOccupe(true);
    setErreur(undefined);
    try {
      await crm.changerEtape(contact.id, choix);
      onFait(choix);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Changement non confirmé');
      setOccupe(false);
    }
  }

  const ligne = (e: StatutContact) => {
    const ici = e === actuelle;
    const choisie = e === choix;
    const faite = rangActuel >= 0 && PARCOURS.indexOf(e) >= 0 && PARCOURS.indexOf(e) < rangActuel;
    const sautee = sautees.includes(e);
    return (
      <Pressable
        key={e}
        accessibilityRole="radio"
        {...etatA11y({ selected: choisie, disabled: ici })}
        disabled={ici}
        onPress={() => setChoix(e)}
        style={({ pressed }) => [styles.ligne, choisie && styles.ligneChoisie, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.rond, faite && styles.rondFait, ici && styles.rondIci, choisie && styles.rondChoisi, sautee && styles.rondSaute]}>
          {(faite || choisie) && <Check size={13} color={couleurs.blanc} />}
        </View>
        <Text style={[styles.ligneTexte, (ici || choisie) && { fontFamily: polices.texteGras }]}>{libelleEtape(e)}</Text>
        <Text style={styles.ligneNote}>{ici ? 'Actuelle' : sautee ? 'Sautée' : ''}</Text>
      </Pressable>
    );
  };

  return (
    <Modale
      titre={`Étape de ${prenom}`}
      onFermer={onFermer}
      largeur={480}
      pied={
        <View style={{ gap: espace(2) }}>
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          <View style={styles.boutons}>
            <View style={{ flexGrow: 1 }}>
              <BoutonContour libelle="Annuler" onPress={onFermer} />
            </View>
            <View style={{ flexGrow: 1 }}>
              <BoutonEtape
                libelle={occupe ? 'Enregistrement…' : choix ? `Passer en « ${libelleEtape(choix)} »` : 'Choisis une étape'}
                desactive={!choix || occupe}
                onPress={valider}
              />
            </View>
          </View>
        </View>
      }
    >
      <Text style={styles.consigne}>Touche sa nouvelle étape. Tu peux en sauter si elles n’ont pas eu lieu.</Text>
      <View>{parcours.map(ligne)}</View>
      <Text style={styles.section}>METTRE DE CÔTÉ</Text>
      <View>{deCote.map(ligne)}</View>
      {choix && (sautees.length > 0 || choix === 'Client actif' || choix === 'En veille') && (
        <Text style={styles.avert}>
          {sautees.length > 0 && `${sautees.map((s) => `« ${libelleEtape(s)} »`).join(' et ')} ${sautees.length > 1 ? 'seront notées' : 'sera notée'} comme sautée${sautees.length > 1 ? 's' : ''} dans son historique. `}
          {choix === 'Client actif' && contact.statut !== 'client' && `${prenom} rejoindra tes clients actifs et ses relances de prospect s’arrêteront.`}
          {choix === 'En veille' && contact.statut === 'client' && `${prenom} n’aura plus accès à l’appli et sortira de tes clients actifs.`}
        </Text>
      )}
    </Modale>
  );
}

const styles = StyleSheet.create({
  rangee: { gap: espace(2), paddingVertical: 2 },
  puce: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
  },
  puceActive: { backgroundColor: couleurs.noir, borderColor: couleurs.noir },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  puceNombre: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texteDoux },
  boutons: { flexDirection: 'row', gap: espace(2), alignItems: 'center' },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  consigne: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux, marginBottom: espace(2) },
  section: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 0.5, color: couleurs.texteDoux, marginTop: espace(4), marginBottom: espace(1) },
  ligne: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(3),
    paddingHorizontal: espace(2),
    borderBottomWidth: 1,
    borderBottomColor: couleurs.discret,
  },
  ligneChoisie: { backgroundColor: couleurs.rougeClair, borderRadius: arrondi.controle, borderBottomColor: 'transparent' },
  ligneTexte: { flexGrow: 1, flexShrink: 1, fontFamily: polices.texte, fontSize: 15, color: couleurs.texte },
  ligneNote: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  rond: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: couleurs.saisie, alignItems: 'center', justifyContent: 'center' },
  rondFait: { backgroundColor: couleurs.vert, borderColor: couleurs.vert },
  rondIci: { borderColor: couleurs.rouge, borderWidth: 6 },
  rondChoisi: { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge },
  rondSaute: { borderStyle: 'dashed', borderColor: couleurs.suggestion },
  avert: {
    marginTop: espace(4),
    padding: espace(3),
    borderRadius: arrondi.controle,
    backgroundColor: couleurs.orangeClair,
    color: '#9A3412',
    fontFamily: polices.texte,
    fontSize: 13,
    lineHeight: 19,
  },
});
