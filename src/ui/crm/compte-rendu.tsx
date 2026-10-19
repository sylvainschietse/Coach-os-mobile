import * as Linking from 'expo-linking';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { iaDisponible, redigerCompteRendu } from '@/data/redaction';
import { compteRenduHtml, construireCompteRendu, emailCompteRendu, messageCompteRenduEnvoye } from '@/domain/compte-rendu';
import { lienEnvoi } from '@/domain/crm';
import type { Booster, FicheContact } from '@/domain/crm';
import { TESTS } from '@/domain/evaluation';
import { appliquerRedaction, redactionModele, type Redaction } from '@/domain/redaction';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, SousTitre, Texte } from '../composants';
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
  const [envoi, setEnvoi] = useState<'email' | 'partage'>();
  const [erreur, setErreur] = useState<string>();
  // Textes retouchés ou rédigés par l'IA ; tant qu'il n'y en a pas, le modèle suit les tests et les priorités.
  const [textes, setTextes] = useState<Redaction | undefined>(booster.redaction);
  const [priorites, setPriorites] = useState(booster.priorites);
  const [redaction, setRedaction] = useState(false);
  const reponses = fiche.questionnaires[0]?.reponses;
  const cr = construireCompteRendu(fiche.contact, { ...booster, compteRendu: mot, redaction: textes, priorites }, reponses, coach);
  const affiches = textes ?? redactionModele(fiche.contact, { ...booster, priorites }, reponses);
  const sansPriorite = priorites.length === 0;

  // Le mot du coach s'enregistre un instant après la frappe.
  useEffect(() => {
    if (mot === (booster.compteRendu ?? '')) return;
    const minuteur = setTimeout(() => crm.enregistrerBooster(booster.id, { compteRendu: mot.trim() || undefined }).catch(() => undefined), 700);
    return () => clearTimeout(minuteur);
  }, [mot, booster.id, booster.compteRendu]);

  // Les textes retouchés s'enregistrent eux aussi un instant après la frappe.
  useEffect(() => {
    if (!textes || textes === booster.redaction) return;
    const minuteur = setTimeout(() => crm.enregistrerBooster(booster.id, { redaction: textes }).catch(() => undefined), 700);
    return () => clearTimeout(minuteur);
  }, [textes, booster.id, booster.redaction]);

  const retoucher = (patch: Partial<Redaction>) => setTextes({ ...affiches, ...patch, source: 'coach' });

  async function rediger() {
    setRedaction(true);
    setErreur(undefined);
    try {
      const genere = await redigerCompteRendu(fiche.contact, { ...booster, compteRendu: mot, priorites }, reponses);
      // Les priorités générées vont dans leurs champs, sans remplacer celles choisies par le coach.
      const r = appliquerRedaction({ ...booster, priorites }, genere);
      await crm.enregistrerBooster(booster.id, r);
      setPriorites(r.priorites);
      setTextes(r.redaction);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La rédaction n’a pas abouti.');
    } finally {
      setRedaction(false);
    }
  }

  const contact = fiche.contact;

  /** Le même PDF part par e-mail ou par une autre app ; la date d'envoi reste sur le Booster. */
  async function envoyer(par: 'email' | 'partage') {
    setEnvoi(par);
    setErreur(undefined);
    try {
      // A4 en points (72 par pouce).
      const { uri } = await Print.printToFileAsync({ html: compteRenduHtml(cr, { police: BEBAS_NEUE_BASE64 }), width: 595, height: 842 });
      let envoye = true;
      if (par === 'email' && contact.email && (await MailComposer.isAvailableAsync())) {
        const mail = emailCompteRendu(cr);
        const r = await MailComposer.composeAsync({ recipients: [contact.email], subject: mail.sujet, body: mail.corps, attachments: [uri] });
        envoye = r.status !== MailComposer.MailComposerStatus.CANCELLED;
      } else {
        // Pas de compte mail sur le téléphone : on passe par le partage (Gmail, Outlook, WhatsApp…).
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: cr.titre });
      }
      if (envoye) {
        await crm.enregistrerBooster(booster.id, { planEnvoyeLe: new Date().toISOString() });
        recharger();
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le PDF n’a pas pu être créé.');
    } finally {
      setEnvoi(undefined);
    }
  }

  const prevenir = () => Linking.openURL(lienEnvoi('whatsapp', contact, messageCompteRenduEnvoye(cr))!).catch(() => undefined);

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

      <TitreSection>Textes du compte rendu</TitreSection>
      <Carte>
        <Texte doux style={{ fontSize: 14 }}>
          {textes?.source === 'ia'
            ? 'Rédigés par l’IA à partir du bilan, des tests et de l’entretien. Relis-les et retouche ce que tu veux.'
            : textes?.source === 'coach'
              ? 'Textes retouchés par toi, enregistrés.'
              : iaDisponible
                ? 'Textes proposés automatiquement. L’IA peut les rédiger de façon plus personnelle.'
                : 'Textes proposés automatiquement d’après les tests et le bilan. Avec le compte en ligne, l’IA les rédige de façon plus personnelle.'}
        </Texte>
        {iaDisponible && (
          <Bouton
            variante={textes?.source === 'ia' ? 'discret' : undefined}
            libelle={textes?.source === 'ia' ? 'Réécrire avec l’IA' : 'Rédiger avec l’IA'}
            onPress={rediger}
            chargement={redaction}
          />
        )}
        <ChampTexte libelle="Le regard du coach" multiligne valeur={affiches.regard ?? ''} onChange={(v) => retoucher({ regard: v })} />
        {TESTS.filter((t) => booster.evaluation?.tests[t.id]?.resultat).map((t) => (
          <ChampTexte
            key={t.id}
            libelle={`${t.libelle} · ${booster.evaluation!.tests[t.id]!.resultat}`}
            multiligne
            valeur={affiches.tests?.[t.id] ?? ''}
            onChange={(v) => retoucher({ tests: { ...affiches.tests, [t.id]: v } })}
            placeholder="Ce que dit le résultat, et la suite du travail"
          />
        ))}
        {priorites.map((p, i) => (
          <ChampTexte
            key={i}
            libelle={`Priorité ${i + 1} · ${p}`}
            multiligne
            valeur={affiches.priorites?.[i] ?? ''}
            onChange={(v) => retoucher({ priorites: priorites.map((_, j) => (j === i ? v : (affiches.priorites?.[j] ?? ''))) })}
          />
        ))}
        <ChampTexte
          libelle="Cette semaine (une action par ligne)"
          multiligne
          valeur={(affiches.semaine ?? []).join('\n')}
          onChange={(v) => retoucher({ semaine: v.split('\n') })}
        />
        <ChampTexte
          libelle="La suite (une étape par ligne)"
          multiligne
          valeur={(affiches.suite ?? []).join('\n')}
          onChange={(v) => retoucher({ suite: v.split('\n') })}
        />
        {textes && (
          <Bouton
            variante="discret"
            libelle="Revenir aux textes proposés"
            onPress={() => {
              setTextes(undefined);
              crm.enregistrerBooster(booster.id, { redaction: undefined }).catch(() => undefined);
            }}
          />
        )}
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

      <TitreSection>Envoyer au client</TitreSection>
      <Carte>
        <SousTitre>1. Le compte rendu par e-mail</SousTitre>
        {Platform.OS === 'web' ? (
          <Texte doux style={{ fontSize: 14 }}>
            Sur le téléphone, un bouton crée le PDF et ouvre un e-mail prêt à partir vers le client, avec le PDF en pièce jointe.
          </Texte>
        ) : contact.email ? (
          <Bouton
            libelle={booster.planEnvoyeLe ? 'Renvoyer par e-mail' : `Envoyer par e-mail à ${contact.email}`}
            onPress={() => envoyer('email')}
            chargement={envoi === 'email'}
          />
        ) : (
          <Texte style={{ fontSize: 14, color: couleurs.orange }}>Pas d’e-mail sur la fiche : ajoute-le, ou envoie le PDF autrement.</Texte>
        )}
        {Platform.OS !== 'web' && (
          <Bouton variante="discret" libelle="Envoyer le PDF autrement (WhatsApp, Messages…)" onPress={() => envoyer('partage')} chargement={envoi === 'partage'} />
        )}
        {booster.planEnvoyeLe && <Texte doux style={{ fontSize: 13 }}>{`Envoyé le ${dateCourte(booster.planEnvoyeLe)}`}</Texte>}

        <SousTitre>2. Le prévenir sur WhatsApp</SousTitre>
        {contact.telephone ? (
          <>
            <Texte doux style={{ fontSize: 14 }}>{messageCompteRenduEnvoye(cr)}</Texte>
            <Bouton variante={booster.planEnvoyeLe ? undefined : 'discret'} libelle="Prévenir sur WhatsApp" onPress={prevenir} />
          </>
        ) : (
          <Texte style={{ fontSize: 14, color: couleurs.orange }}>Pas de numéro sur la fiche.</Texte>
        )}
      </Carte>
      {erreur && <Erreur message={erreur} />}
    </View>
  );
}
