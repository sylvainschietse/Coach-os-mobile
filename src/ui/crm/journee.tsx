import { useFocusEffect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { ajouterJours, jourLocal, formaterTelephone } from '@/domain/crm';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { adresseQuestionnaire, CarteRelance, dateHeure, nomComplet, TitreSection } from './commun';

/** La page d'accueil du coach : qui relancer aujourd'hui, quels Boosters arrivent. */
export function Journee({
  onOuvrirContact,
  onVoirQuestionnaire,
}: {
  onOuvrirContact: (id: string) => void;
  onVoirQuestionnaire: (lien: string) => void;
}) {
  const { donnee, erreur, recharger } = useCharger(
    async () => ({ ...(await crm.journee()), lien: await crm.lienQuestionnaire() }),
    'journee',
  );
  useFocusEffect(recharger);
  useRechargerSur(recharger, ecouterCrm);

  if (erreur) return <Erreur message={erreur} />;
  if (!donnee) return <Chargement />;
  const { relances, boosters, lien } = donnee;
  const adresse = lien ? adresseQuestionnaire(lien) : undefined;

  async function agir(action: Promise<void>) {
    await action;
    recharger();
  }

  return (
    <View style={{ gap: espace(3) }}>
      <TitreSection compte={relances.length}>À faire aujourd’hui</TitreSection>
      {relances.length === 0 && <Texte doux>Rien à faire aujourd’hui.</Texte>}
      {relances.map((r) => (
        <CarteRelance
          key={r.id}
          relance={r}
          contact={r.contact}
          enRetard={r.enRetard}
          lienQuestionnaire={adresse}
          booster={boosters.find((b) => b.contactId === r.contactId)?.date}
          onOuvrirContact={() => onOuvrirContact(r.contactId)}
          onFaite={() => agir(crm.terminerRelance(r.id))}
          onReporter={() => agir(crm.reporterRelance(r.id, ajouterJours(jourLocal(new Date()), 1)))}
        />
      ))}

      <TitreSection compte={boosters.length}>Boosters des 7 prochains jours</TitreSection>
      {boosters.length === 0 && <Texte doux>Aucun Booster prévu.</Texte>}
      {boosters.map((b) => (
        <Pressable key={b.id} onPress={() => onOuvrirContact(b.contactId)} accessibilityRole="link">
          <Carte style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3) }}>
            <View style={{ backgroundColor: couleurs.rougeClair, borderRadius: 10, padding: espace(2), minWidth: 64, alignItems: 'center' }}>
              <Text style={{ fontFamily: polices.titre, fontSize: 20, color: couleurs.rouge }}>
                {new Date(b.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>{nomComplet(b.contact)}</Text>
              <Texte doux style={{ fontSize: 14 }}>
                {dateHeure(b.date)}
                {b.contact.telephone ? ` · ${formaterTelephone(b.contact.telephone)}` : ''}
              </Texte>
            </View>
          </Carte>
        </Pressable>
      ))}

      {lien && (
        <>
          <TitreSection>Ton questionnaire d’accueil</TitreSection>
          <Carte>
            <Texte style={{ fontSize: 14 }}>
              Envoie ce lien à un prospect : ses réponses arrivent directement sur sa fiche, rattachées à son numéro.
            </Texte>
            <Text selectable style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.bleu }}>
              {adresse}
            </Text>
            <Bouton variante="discret" libelle="Voir le questionnaire" onPress={() => onVoirQuestionnaire(lien)} />
          </Carte>
        </>
      )}
    </View>
  );
}
