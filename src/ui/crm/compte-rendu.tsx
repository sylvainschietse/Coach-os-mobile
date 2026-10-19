import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { compteRenduHtml, construireCompteRendu } from '@/domain/compte-rendu';
import type { Booster, FicheContact } from '@/domain/crm';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { dateCourte, TitreSection, useCoachNom } from './commun';

/** Le compte rendu à remettre au client : aperçu, mot du coach, puis PDF partagé par e-mail ou messagerie. */
export function CompteRenduVue({ contactId, boosterId, onModifierSeance }: { contactId: string; boosterId: string; onModifierSeance: () => void }) {
  const { donnee: fiche, erreur, recharger } = useCharger(() => crm.fiche(contactId), `${contactId}-${boosterId}`);
  if (erreur) return <Erreur message={erreur} />;
  if (!fiche) return <Chargement />;
  const booster = fiche.boosters.find((b) => b.id === boosterId);
  if (!booster) return <Erreur message="Ce Booster n’existe plus." />;
  return <Apercu key={booster.id} fiche={fiche} booster={booster} onModifierSeance={onModifierSeance} recharger={recharger} />;
}

function Apercu({ fiche, booster, onModifierSeance, recharger }: { fiche: FicheContact; booster: Booster; onModifierSeance: () => void; recharger: () => void }) {
  const coach = useCoachNom();
  const [mot, setMot] = useState(booster.compteRendu ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const cr = construireCompteRendu(fiche.contact, { ...booster, compteRendu: mot }, fiche.questionnaires[0]?.reponses, coach);
  const sansPriorite = booster.priorites.length === 0;

  // Le mot du coach s'enregistre un instant après la frappe.
  useEffect(() => {
    if (mot === (booster.compteRendu ?? '')) return;
    const minuteur = setTimeout(() => crm.enregistrerBooster(booster.id, { compteRendu: mot.trim() || undefined }).catch(() => undefined), 700);
    return () => clearTimeout(minuteur);
  }, [mot, booster.id, booster.compteRendu]);

  async function partager() {
    setEnvoi(true);
    setErreur(undefined);
    try {
      // A4 en points (72 par pouce).
      const { uri } = await Print.printToFileAsync({ html: compteRenduHtml(cr, { police: BEBAS_NEUE_BASE64 }), width: 595, height: 842 });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: cr.titre });
      await crm.enregistrerBooster(booster.id, { planEnvoyeLe: new Date().toISOString() });
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le PDF n’a pas pu être créé.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <Carte>
        <ChampTexte
          libelle="Le mot du coach (facultatif)"
          multiligne
          valeur={mot}
          onChange={setMot}
          placeholder="Quelques lignes personnelles en ouverture du compte rendu"
        />
        {sansPriorite && <Texte style={{ fontSize: 14, color: couleurs.orange }}>Les 3 priorités ne sont pas encore remplies.</Texte>}
        <Bouton variante="discret" libelle="Modifier la séance (tests, priorités)" onPress={onModifierSeance} />
      </Carte>

      <TitreSection>Aperçu</TitreSection>
      <Carte style={{ gap: espace(3) }}>
        <View style={{ borderBottomWidth: 3, borderColor: couleurs.rouge, paddingBottom: espace(2) }}>
          <Text style={{ fontFamily: polices.titre, fontSize: 28, color: couleurs.noir }}>{cr.titre}</Text>
          <Texte doux style={{ fontSize: 14 }}>{`${cr.pour} · séance Booster du ${cr.date}`}</Texte>
        </View>
        {cr.sections.map((s) => (
          <View key={s.titre} style={{ gap: espace(1) }}>
            <Text style={{ fontFamily: polices.texteGras, fontSize: 13, color: couleurs.rouge, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.titre}
            </Text>
            {s.lignes.map((l, i) => (
              <Texte key={i} style={{ fontSize: 15, fontFamily: s.numerotee ? polices.texteGras : polices.texte }}>
                {s.numerotee ? `${i + 1}. ${l}` : s.lignes.length > 1 ? `• ${l}` : l}
              </Texte>
            ))}
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderColor: couleurs.bordure, paddingTop: espace(2), gap: espace(1) }}>
          {cr.conclusion.map((l) => (
            <Texte key={l} style={{ fontSize: 15 }}>{l}</Texte>
          ))}
        </View>
      </Carte>

      {erreur && <Erreur message={erreur} />}
      {Platform.OS === 'web' ? (
        <Texte doux style={{ fontSize: 14, textAlign: 'center' }}>
          Sur le téléphone, le bouton « Créer le PDF et l’envoyer » ouvre le partage (e-mail, WhatsApp…) avec le PDF joint.
        </Texte>
      ) : (
        <Bouton libelle={booster.planEnvoyeLe ? 'Renvoyer le PDF' : 'Créer le PDF et l’envoyer'} onPress={partager} chargement={envoi} />
      )}
      {booster.planEnvoyeLe && <Texte doux style={{ fontSize: 13, textAlign: 'center' }}>{`Déjà envoyé le ${dateCourte(booster.planEnvoyeLe)}`}</Texte>}
    </View>
  );
}
