import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/data/session';
import { formaterTelephone, lienEnvoi, MODELES, rediger, STATUTS, type Canal, type Contact, type Relance, type Statut } from '@/domain/crm';
import { adresseWeb } from '@/lib/adresse-web';
import { ouvrirLien } from '@/lib/ouvrir-lien';

import { Pastille, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';

const TEINTES = { gris: couleurs.texteDoux, bleu: couleurs.bleu, orange: couleurs.orange, vert: couleurs.vert, noir: couleurs.noir };

export function PastilleStatut({ statut }: { statut: Statut }) {
  return <Pastille libelle={STATUTS[statut].libelle} couleur={TEINTES[STATUTS[statut].couleur]} />;
}

export const nomComplet = (c: Pick<Contact, 'prenom' | 'nom'>) => `${c.prenom} ${c.nom}`.trim() || 'Sans nom';

export const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const jourLisible = (jour: string) => {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

/**
 * Adresse du questionnaire à envoyer aux prospects : le formulaire Tally du coach quand il est renseigné
 * (ses réponses arrivent dans l'app par le webhook), sinon le questionnaire intégré à l'app.
 */
export function adresseQuestionnaire(lien: string) {
  return process.env.EXPO_PUBLIC_QUESTIONNAIRE_TALLY || adresseWeb(`/questionnaire/${lien}`);
}

export function useCoachNom() {
  const { profil } = useSession();
  return profil?.role === 'coach' ? profil.nom : 'ton coach';
}

const CANAUX: { canal: Canal; libelle: string }[] = [
  { canal: 'sms', libelle: 'SMS' },
  { canal: 'whatsapp', libelle: 'WhatsApp' },
  { canal: 'email', libelle: 'E-mail' },
];

/** Boutons qui ouvrent l'app de messagerie avec le message déjà écrit. */
export function BoutonsEnvoi({ contact, message, onEnvoye }: { contact: Contact; message: string; onEnvoye?: () => void }) {
  const disponibles = CANAUX.filter((c) => lienEnvoi(c.canal, contact, message));
  if (disponibles.length === 0) return <Texte doux style={{ fontSize: 13 }}>Ajoute un téléphone ou un e-mail pour le contacter.</Texte>;
  return (
    <View style={styles.envois}>
      {disponibles.map(({ canal, libelle }) => (
        <Pressable
          key={canal}
          accessibilityRole="button"
          onPress={async () => {
            await ouvrirLien(lienEnvoi(canal, contact, message)!).catch(() => undefined);
            onEnvoye?.();
          }}
          style={({ pressed }) => [styles.envoi, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.envoiTexte}>{libelle}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Une relance à faire : le message prêt, l'envoi en un appui, ou « fait » / « demain ». */
export function CarteRelance({
  relance,
  contact,
  lienQuestionnaire,
  booster,
  enRetard,
  onFaite,
  onReporter,
  onOuvrirContact,
}: {
  relance: Relance;
  contact: Contact;
  lienQuestionnaire?: string;
  booster?: string;
  enRetard?: boolean;
  onFaite: () => void;
  onReporter: () => void;
  onOuvrirContact?: () => void;
}) {
  const coach = useCoachNom();
  const message = rediger(relance.modele, contact, { coach, lienQuestionnaire, booster });
  const tache = relance.modele === 'tache';
  return (
    <View style={[styles.relance, enRetard && { borderColor: couleurs.rouge }]}>
      <Pressable onPress={onOuvrirContact} disabled={!onOuvrirContact} accessibilityRole={onOuvrirContact ? 'link' : undefined}>
        <View style={styles.ligneTitre}>
          <Text style={styles.nom}>{nomComplet(contact)}</Text>
          {enRetard && <Text style={styles.retard}>En retard</Text>}
        </View>
        {tache && <Text style={styles.message}>{relance.note}</Text>}
        <Text style={styles.motif}>
          {MODELES[relance.modele].libelle}
          {relance.note && !tache ? ` · ${relance.note}` : ''}
          {contact.telephone ? ` · ${formaterTelephone(contact.telephone)}` : ''}
        </Text>
      </Pressable>
      {!tache && <Text style={styles.message}>{message}</Text>}
      {!tache && <BoutonsEnvoi contact={contact} message={message} onEnvoye={onFaite} />}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onFaite} style={styles.action}>
          <Text style={styles.actionTexte}>✓ Fait</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onReporter} style={styles.action}>
          <Text style={styles.actionTexte}>Demain</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TitreSection({ children, compte }: { children: string; compte?: number }) {
  return (
    <Text style={styles.section}>
      {children}
      {compte !== undefined ? `  ${compte}` : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  relance: {
    backgroundColor: couleurs.carte,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espace(4),
    gap: espace(2),
  },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: espace(2) },
  nom: { fontFamily: polices.titre, fontSize: 22, color: couleurs.noir, letterSpacing: 0.5 },
  retard: { fontFamily: polices.texteGras, fontSize: 12, color: couleurs.rouge, textTransform: 'uppercase', letterSpacing: 0.5 },
  motif: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texteDoux },
  message: {
    fontFamily: polices.texte,
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texte,
    backgroundColor: couleurs.fond,
    borderRadius: 10,
    padding: espace(3),
  },
  envois: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  envoi: { backgroundColor: couleurs.noir, borderRadius: 10, paddingHorizontal: espace(4), paddingVertical: espace(2.5) },
  envoiTexte: { color: '#FFFFFF', fontFamily: polices.texteGras, fontSize: 14 },
  actions: { flexDirection: 'row', gap: espace(2) },
  action: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, paddingHorizontal: espace(3), paddingVertical: espace(2) },
  actionTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  section: {
    fontFamily: polices.texteGras,
    color: couleurs.rouge,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: espace(2),
  },
});
