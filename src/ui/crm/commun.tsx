import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ecouterRelancesCoach, relancesCoach } from '@/data/relances-coach';
import { useSession } from '@/data/session';
import { formaterTelephone, lienEnvoi, MODELES, normaliserTelephone, rediger, STATUTS, type Canal, type Contact, type Relance, type Statut } from '@/domain/crm';
import { estAuto, estRelancePerso, REGLAGES_RELANCES, type ReglagesRelances } from '@/domain/relances-coach';
import { adresseWeb } from '@/lib/adresse-web';
import { LIEN_GUIDE_PROSPECTS } from '@/lib/guides';
import { useCharger, useRechargerSur } from '@/lib/useCharger';
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
export function adresseQuestionnaire(lien: string | null | undefined): string | undefined {
  return process.env.EXPO_PUBLIC_QUESTIONNAIRE_TALLY || (lien ? adresseWeb(`/questionnaire/${lien}`) : undefined);
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
export function BoutonsEnvoi({
  contact,
  message,
  sujet,
  onEnvoye,
}: {
  contact: Pick<Contact, 'telephone' | 'email' | 'prenom'>;
  message: string;
  sujet?: string;
  onEnvoye?: () => void;
}) {
  const disponibles = CANAUX.filter((c) => lienEnvoi(c.canal, contact, message, sujet));
  if (disponibles.length === 0)
    return (
      <Texte doux style={{ fontSize: 13 }}>
        {!message.trim()
          ? 'Le message est vide : rien à envoyer.'
          : contact.telephone
            ? 'Le numéro de téléphone n’est pas reconnu. Corrige-le dans ses coordonnées.'
            : 'Ajoute son téléphone ou son e-mail dans ses coordonnées pour lui écrire.'}
      </Texte>
    );
  return (
    <View style={styles.envois}>
      {disponibles.map(({ canal, libelle }) => (
        <Pressable
          key={canal}
          accessibilityRole="button"
          onPress={async () => {
            const lien = lienEnvoi(canal, contact, message, sujet);
            if (!lien) return;
            await ouvrirLien(lien).catch(() => undefined);
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

/** Le message tel qu'il partira, puis SMS / WhatsApp / E-mail : on voit ce qu'on envoie avant d'appuyer. */
export function EnvoiMessage({
  contact,
  message,
  sujet,
  onEnvoye,
}: {
  contact: Pick<Contact, 'telephone' | 'email' | 'prenom'>;
  message: string;
  sujet?: string;
  onEnvoye?: () => void;
}) {
  const destinataire = [contact.telephone ? formaterTelephone(normaliserTelephone(contact.telephone) ?? contact.telephone) : '', contact.email ?? '']
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ gap: espace(2) }}>
      {destinataire ? <Text style={styles.motif}>À {contact.prenom || 'ce contact'} · {destinataire}</Text> : null}
      <Text selectable style={styles.message}>
        {message}
      </Text>
      <BoutonsEnvoi contact={contact} message={message} sujet={sujet} onEnvoye={onEnvoye} />
    </View>
  );
}

/** Mes relances du coach (textes réécrits, relances coupées), relues quand il les change. */
export function useReglagesRelances(): ReglagesRelances {
  const charge = useCharger(() => relancesCoach.lire().catch(() => REGLAGES_RELANCES), 'reglages-relances');
  useRechargerSur(charge.recharger, ecouterRelancesCoach);
  return charge.donnee ?? REGLAGES_RELANCES;
}

/** Message « questionnaire » prêt à partir, avec le bon lien (Tally ou questionnaire intégré). */
export function useMessageQuestionnaire(contact: Pick<Contact, 'prenom'>, lien: string | null | undefined): string | undefined {
  const coach = useCoachNom();
  const adresse = adresseQuestionnaire(lien);
  const reglages = useReglagesRelances();
  return adresse ? rediger('questionnaire', contact, { coach, lienQuestionnaire: adresse }, reglages.textes.questionnaire) : undefined;
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
  const reglages = useReglagesRelances();
  const perso = estRelancePerso(relance);
  // Relance du coach : le message est déjà rempli dans la note ; sinon le texte en service (réécrit ou d'origine).
  const message = perso
    ? (relance.note ?? '')
    : rediger(relance.modele, contact, { coach, lienQuestionnaire, booster, guide: LIEN_GUIDE_PROSPECTS }, estAuto(relance.modele) ? reglages.textes[relance.modele] : undefined);
  const tache = relance.modele === 'tache';
  // Sans adresse de questionnaire, le message partirait sans lien : on ne propose pas l'envoi.
  const sansLien = relance.modele === 'questionnaire' && !lienQuestionnaire;
  return (
    <View style={[styles.relance, enRetard && { borderColor: couleurs.rouge }]}>
      <Pressable onPress={onOuvrirContact} disabled={!onOuvrirContact} accessibilityRole={onOuvrirContact ? 'link' : undefined}>
        <View style={styles.ligneTitre}>
          <Text style={styles.nom}>{nomComplet(contact)}</Text>
          {enRetard && <Text style={styles.retard}>En retard</Text>}
        </View>
        {tache && <Text style={styles.message}>{relance.note}</Text>}
        <Text style={styles.motif}>
          {perso ? relance.titre : MODELES[relance.modele].libelle}
          {relance.note && !tache && !perso ? ` · ${relance.note}` : ''}
          {contact.telephone ? ` · ${formaterTelephone(contact.telephone)}` : ''}
        </Text>
      </Pressable>
      {!tache && <Text style={styles.message}>{message}</Text>}
      {!tache && !sansLien && <BoutonsEnvoi contact={contact} message={message} onEnvoye={onFaite} />}
      {sansLien && <Texte doux style={{ fontSize: 13 }}>Le lien du questionnaire n’est pas réglé : impossible de l’envoyer pour l’instant.</Texte>}
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
