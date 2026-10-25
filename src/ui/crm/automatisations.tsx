// C08 — Automatisations, reprise de CRMWorkspace (module « Automations ») : questionnaire, envoi des comptes rendus
// (badge Webhook renseigné / Raccordement manquant, contrat du scénario Make) et relances.
// Rien n'est présenté comme fonctionnel sans preuve : Tally n'est « reçu » qu'après une vraie réponse arrivée par le webhook,
// et Make n'est « renseigné » que si la fonction serveur le confirme. Un épuisement des crédits Make est un blocage visible.
import { useFocusEffect } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { automatisations, type EntreeJournal, type EtatJournal } from '@/data/automatisations';
import { crm, ecouterCrm } from '@/data/crm';
import { documents, ecouterDocuments } from '@/data/documents';
import { MODELES } from '@/domain/crm';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { Carte, Chargement, Erreur } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { adresseQuestionnaire } from './commun';
import { Badge, Repliable } from './dossier';

const TALLY = 'https://tally.so/r/81Ye7r';

/** Libellés distincts demandés par le cahier : transmission acceptée ≠ e-mail envoyé ; crédits épuisés = blocage. */
export const ETATS_ENVOI: Record<EtatJournal, string> = {
  erreur: 'Traitement en erreur',
  en_cours: 'Transmission en cours',
  transmis: 'Transmission acceptée',
  envoye: 'E-mail envoyé',
  echec: 'Échec',
  bloque: 'Bloqué : crédits Make épuisés',
};

const quand = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const CONTRAT = {
  event: 'coachos.report.send',
  schemaVersion: 1,
  idempotencyKey: 'document:version',
  documentId: '…',
  contactId: '…',
  boosterId: null,
  coachingId: null,
  to: 'client@example.com',
  firstName: 'Prénom',
  subject: 'Votre compte rendu',
  pdfUrl: 'https://… (lien signé, valable 1 heure)',
  filename: 'compte-rendu.pdf',
};

export function Automatisations() {
  const charge = useCharger(async () => {
    const [etat, docs, lien, contacts] = await Promise.all([automatisations.etat(), documents.documents(), crm.lienQuestionnaire(), crm.contacts()]);
    return { etat, docs, lien, contacts };
  }, 'automatisations');
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterDocuments);
  useRechargerSur(charge.recharger, ecouterCrm);
  if (charge.erreur) return <Erreur message={charge.erreur} onReessayer={charge.recharger} />;
  if (!charge.donnee) return <Chargement />;
  const { etat, docs, lien, contacts } = charge.donnee;

  const nom = (id?: string) => {
    const c = contacts.find((x) => x.id === id);
    return c ? [c.prenom, c.nom].filter(Boolean).join(' ') : '';
  };
  const erreursQuestionnaire = etat.journal.filter((j) => j.flux === 'questionnaire');
  const envois = etat.journal.filter((j) => j.flux === 'compte_rendu');
  // PDF préparé : un compte rendu ou bilan avec fichier, pas encore envoyé ni transmis.
  const prepares = docs.filter(
    (d) => d.chemin && !d.envoye && (d.type === 'Bilan' || d.type === "Plan d'action") && !envois.some((j) => j.documentId === d.id && j.version === d.version),
  );
  const nomDoc = (j: EntreeJournal) => docs.find((d) => d.id === j.documentId)?.nom ?? 'Document supprimé';

  return (
    <View style={{ gap: espace(4) }}>
      {etat.avertissement && <Text style={styles.avertissement}>{etat.avertissement}</Text>}

      <Carte style={styles.carte}>
        <Text style={styles.titre}>Questionnaire d’accueil</Text>
        <Text style={styles.doux}>
          Les réponses arrivent sur la fiche du contact, rapprochée par téléphone puis par e-mail, jamais par le nom. Une réponse reçue deux fois
          ne crée rien de plus.
        </Text>
        <View style={styles.ligne}>
          <Badge
            variante={etat.tally.recues ? 'primaire' : 'contour'}
            libelle={etat.tally.recues ? `Tally : ${etat.tally.recues} réponse${etat.tally.recues > 1 ? 's' : ''} reçue${etat.tally.recues > 1 ? 's' : ''}` : 'Tally : aucune réponse reçue'}
          />
          <Badge variante={etat.aRapprocher ? 'secondaire' : 'contour'} libelle={`Rapprochement à traiter : ${etat.aRapprocher}`} />
          <Badge variante={erreursQuestionnaire.length ? 'secondaire' : 'contour'} libelle={`Traitement en erreur : ${erreursQuestionnaire.length}`} />
        </View>
        {etat.tally.derniere && <Text style={styles.doux}>Dernière réponse Tally reçue le {quand(etat.tally.derniere)}.</Text>}
        {erreursQuestionnaire.map((j) => (
          <Text key={j.id} style={styles.erreur}>
            {quand(j.majLe)} · {j.detail ?? 'Réponse non traitée'}
            {j.tentatives > 1 ? ` (${j.tentatives} tentatives)` : ''}
          </Text>
        ))}
        <View style={styles.ligne}>
          <BoutonContour libelle="Ouvrir le questionnaire Tally" icone={ArrowUpRight} onPress={() => Linking.openURL(TALLY)} />
          {lien && <BoutonContour libelle="Ouvrir le questionnaire de l’app" icone={ArrowUpRight} onPress={() => Linking.openURL(adresseQuestionnaire(lien))} />}
        </View>
        <Repliable resume="Raccorder Tally sans Make">
          {etat.webhookTally ? (
            <View style={{ gap: espace(2) }}>
              <Text style={styles.texte}>Dans Tally, Intégrations, Webhooks, coller cette adresse et activer la signature :</Text>
              <Text selectable style={styles.code}>
                {etat.webhookTally}
              </Text>
              <Text style={styles.texte}>
                Renseigner ensuite la clé de signature Tally dans les secrets Supabase sous le nom TALLY_SIGNING_SECRET. Sans signature valide,
                rien n’est enregistré. Le badge Tally passe à « reçue » à la première vraie réponse.
              </Text>
            </View>
          ) : (
            <Text style={styles.texte}>En démo, Tally n’est pas raccordé : seules les réponses saisies dans le questionnaire de l’app arrivent.</Text>
          )}
        </Repliable>
      </Carte>

      <Carte style={styles.carte}>
        <View style={styles.ligne}>
          <Text style={styles.titre}>Envoi des comptes rendus</Text>
          <Badge
            variante={etat.make === 'configure' ? 'primaire' : 'contour'}
            libelle={etat.make === 'configure' ? 'Webhook renseigné' : etat.make === 'inconnu' ? 'Raccordement non vérifiable' : 'Raccordement manquant'}
          />
        </View>
        <Text style={styles.texte}>
          Générez le PDF dans le Booster ou le bilan, puis transmettez-le au scénario Make dédié depuis Documents. Un accusé de réception Make ne
          vaut pas confirmation d’envoi.
        </Text>
        {etat.make !== 'configure' && (
          <Text style={styles.avertissement}>
            {etat.make === 'inconnu'
              ? 'La fonction serveur d’envoi ne répond pas : elle n’est peut-être pas encore déployée.'
              : 'Renseigner ZITE_MAKE_REPORT_WEBHOOK_URL dans les secrets Supabase avec le webhook du scénario d’envoi de comptes rendus. Le webhook du questionnaire Tally ne doit pas être utilisé ici.'}
          </Text>
        )}
        <View style={styles.ligne}>
          <Badge variante="contour" libelle={`PDF préparé : ${prepares.length}`} />
          {(['transmis', 'envoye', 'echec', 'bloque'] as const).map((e) => (
            <Badge key={e} variante={e === 'bloque' && envois.some((j) => j.etat === e) ? 'secondaire' : 'contour'} libelle={`${ETATS_ENVOI[e]} : ${envois.filter((j) => j.etat === e).length}`} />
          ))}
        </View>
        {envois.slice(0, 10).map((j) => (
          <View key={j.id} style={styles.entree}>
            <Text style={styles.texte}>
              {nomDoc(j)} · version {j.version}
              {nom(j.contactId) ? ` · ${nom(j.contactId)}` : ''}
            </Text>
            <Text style={j.etat === 'envoye' ? styles.ok : j.etat === 'transmis' || j.etat === 'en_cours' ? styles.doux : styles.erreur}>
              {ETATS_ENVOI[j.etat]} · {quand(j.majLe)}
              {j.detail ? ` · ${j.detail}` : ''}
            </Text>
          </View>
        ))}
        <Repliable resume="Contrat du scénario Make">
          <View style={{ gap: espace(2) }}>
            <Text style={styles.texte}>
              Webhook → vérifier idempotencyKey → télécharger pdfUrl → envoyer l’e-mail à to. Stocker la clé traitée dans un Data Store Make pour
              éviter les doublons. Coach OS coche Documents « Envoyé » et le plan d’action du Booster après succès réel.
            </Text>
            <Text style={styles.texte}>
              Pour une réponse immédiate confirmée : renvoyer un JSON contenant sent=true, documentId identique et providerMessageId après succès du
              module e-mail. Sinon la demande reste « Transmission acceptée ». Une réponse HTTP 402 ou 429 est notée comme blocage.
            </Text>
            <Text selectable style={styles.code}>
              {JSON.stringify(CONTRAT, null, 2)}
            </Text>
          </View>
        </Repliable>
      </Carte>

      <Carte style={styles.carte}>
        <Text style={styles.titre}>Relances</Text>
        <Text style={styles.texte}>Coach OS crée lui-même ces tâches de relance ; l’envoi du message reste fait par le coach.</Text>
        {[
          `${MODELES.questionnaire.libelle} : à la création d’un prospect.`,
          `${MODELES.booster.libelle} : dès que ses réponses arrivent.`,
          `${MODELES.rappel_booster.libelle} : la veille de la séance.`,
          `${MODELES.suivi_booster.libelle} : deux jours après la séance.`,
        ].map((t) => (
          <Text key={t} style={styles.texte}>
            • {t}
          </Text>
        ))}
        <Text style={styles.doux}>
          Les relances J+10 / J+30 et les mises à jour de statut faites par les automatisations Airtable ne sont pas reprises ici.
        </Text>
      </Carte>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { padding: 20, gap: espace(3) },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  texte: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texte },
  doux: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texteDoux },
  ok: { fontFamily: polices.texte, fontSize: 13, color: couleurs.vert },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espace(2) },
  entree: { borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: 2 },
  avertissement: { backgroundColor: couleurs.orangeClair, color: couleurs.orange, padding: 12, borderRadius: 8, fontFamily: polices.texte, fontSize: 14, lineHeight: 20 },
  code: { backgroundColor: couleurs.discret, padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: couleurs.texte },
});
