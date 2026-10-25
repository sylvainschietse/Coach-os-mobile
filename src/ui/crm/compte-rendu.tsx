import * as Linking from 'expo-linking';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { depuisBase64, documents, ecouterDocuments, type Fichier } from '@/data/documents';
import { iaDisponible, redigerCompteRendu } from '@/data/redaction';
import { compteRenduHtml, construireCompteRendu, emailCompteRendu, messageCompteRenduEnvoye } from '@/domain/compte-rendu';
import { lienEnvoi } from '@/domain/crm';
import type { Booster, FicheContact } from '@/domain/crm';
import { TESTS } from '@/domain/evaluation';
import { appliquerRedaction, redactionModele, type Redaction } from '@/domain/redaction';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, SousTitre, Texte } from '../composants';
import { choisirFichier, copieLocale, ouvrirFichier } from '../fichiers';
import { couleurs, espace, polices } from '../theme';
import { dateCourte, TitreSection, useCoachNom } from './commun';

/** Le compte rendu à remettre au client : aperçu, mot du coach, puis PDF partagé par e-mail ou messagerie. */
export function CompteRenduVue({ contactId, boosterId, onModifierSeance }: { contactId: string; boosterId: string; onModifierSeance: () => void }) {
  const { donnee: fiche, erreur, recharger } = useCharger(() => crm.fiche(contactId), `${contactId}-${boosterId}`);
  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
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
  const sansPriorite = !priorites.some((p) => p.trim());

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

  const docs = useCharger(async () => (await documents.documents()).find((d) => d.boosterId === booster.id) ?? null, `cr-${booster.id}`);
  useRechargerSur(docs.recharger, ecouterDocuments);
  const doc = docs.donnee ?? undefined;
  const [depot, setDepot] = useState(false);
  const [retour, setRetour] = useState<string>();

  async function deposer(fichier: Fichier) {
    const d = await documents.deposerCompteRendu(booster.id, contact, fichier);
    setRetour(`Version ${d.version} enregistrée dans Documents.`);
    docs.recharger();
  }

  /** Téléphone : le PDF est créé ici puis déposé ; c'est ce fichier-là, et lui seul, qui partira par e-mail. */
  async function enregistrerPdf() {
    setDepot(true);
    setErreur(undefined);
    setRetour(undefined);
    try {
      if (Platform.OS === 'web') {
        const f = await choisirFichier();
        if (!f) return;
        if (f.type !== 'application/pdf') throw new Error('Déposez le compte rendu au format PDF.');
        await deposer(f);
      } else {
        // A4 en points (72 par pouce).
        const { base64 } = await Print.printToFileAsync({ html: compteRenduHtml(cr, { police: BEBAS_NEUE_BASE64 }), width: 595, height: 842, base64: true });
        if (!base64) throw new Error('Le PDF n’a pas pu être créé.');
        const donnees = depuisBase64(base64);
        await deposer({ nom: 'compte-rendu-booster.pdf', type: 'application/pdf', taille: donnees.byteLength, donnees });
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le PDF n’a pas été enregistré.');
    } finally {
      setDepot(false);
    }
  }

  /** Web : la fenêtre d'impression du navigateur propose « Enregistrer au format PDF ». */
  function imprimer() {
    const cadre = document.createElement('iframe');
    cadre.style.position = 'fixed';
    cadre.style.width = '0';
    cadre.style.height = '0';
    cadre.style.border = '0';
    cadre.srcdoc = compteRenduHtml(cr, { police: BEBAS_NEUE_BASE64 });
    cadre.onload = () => {
      cadre.contentWindow?.print();
      setTimeout(() => cadre.remove(), 60000);
    };
    document.body.appendChild(cadre);
  }

  /** La version enregistrée dans Documents part en pièce jointe ; seul « envoyé » rendu par le téléphone compte. */
  async function envoyer(par: 'email' | 'partage') {
    if (!doc?.chemin) return;
    setEnvoi(par);
    setErreur(undefined);
    setRetour(undefined);
    try {
      const uri = await copieLocale(await documents.lien(doc.chemin), `compte-rendu-v${doc.version}.pdf`);
      if (par === 'email' && contact.email && (await MailComposer.isAvailableAsync())) {
        const mail = emailCompteRendu(cr);
        const r = await MailComposer.composeAsync({ recipients: [contact.email], subject: mail.sujet, body: mail.corps, attachments: [uri] });
        if (r.status === MailComposer.MailComposerStatus.SENT) {
          await crm.enregistrerBooster(booster.id, { planEnvoyeLe: new Date().toISOString() });
          await documents.marquerEnvoye(doc.id, doc.version);
          recharger();
        } else if (r.status !== MailComposer.MailComposerStatus.CANCELLED) {
          setRetour('Le téléphone ne confirme pas l’envoi : vérifiez dans votre messagerie, puis cochez « Envoyé » sur le document si besoin.');
        }
      } else {
        // Gmail, Outlook, WhatsApp… : l'app choisie ne dit pas si le message est parti, rien n'est marqué.
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: cr.titre });
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le PDF n’a pas pu être joint.');
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
        {priorites.map((p, i) =>
          p.trim() ? (
            <ChampTexte
              key={i}
              libelle={`Priorité ${i + 1} · ${p}`}
              multiligne
              valeur={affiches.priorites?.[i] ?? ''}
              onChange={(v) => retoucher({ priorites: priorites.map((_, j) => (j === i ? v : (affiches.priorites?.[j] ?? ''))) })}
            />
          ) : null,
        )}
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

      <TitreSection>Dans Documents</TitreSection>
      <Carte>
        <Texte doux style={{ fontSize: 14 }}>
          {Platform.OS === 'web'
            ? 'Enregistrez le compte rendu en PDF depuis la fenêtre d’impression, puis déposez ce PDF : il devient la version servie dans l’espace client et par e-mail.'
            : 'Le PDF est créé à partir de l’aperçu ci-dessus. Chaque enregistrement ajoute une version ; c’est la dernière qui est servie au client et jointe à l’e-mail.'}
        </Texte>
        {docs.erreur && !docs.donnee && <Erreur message={docs.erreur} />}
        {doc?.chemin ? (
          <View style={{ gap: espace(2) }}>
            <Texte style={{ fontSize: 14 }}>{`${doc.nom} · version ${doc.version} · ${dateCourte(doc.modifieLe)}`}</Texte>
            <Texte doux style={{ fontSize: 13 }}>
              {[doc.partageClient ? 'Visible dans l’espace client' : 'Pas encore partagé dans l’espace client', doc.envoye ? 'envoi confirmé' : 'non envoyé'].join(' · ')}
            </Texte>
            <Bouton variante="discret" libelle="Ouvrir le PDF" onPress={() => ouvrirFichier(() => documents.lien(doc.chemin!), `compte-rendu-v${doc.version}.pdf`).catch((e) => setErreur(e.message))} />
            {!doc.partageClient && (
              <Bouton
                variante="discret"
                libelle="Partager dans l’espace client"
                onPress={() =>
                  documents
                    .partager(doc.id, true)
                    .then(() => setRetour('Document partagé dans l’espace client.'))
                    .catch((e) => setErreur(e.message))
                }
              />
            )}
          </View>
        ) : (
          docs.donnee !== undefined && <Texte doux style={{ fontSize: 13 }}>Aucune version enregistrée pour ce Booster.</Texte>
        )}
        {Platform.OS === 'web' && <Bouton variante="discret" libelle="Imprimer ou enregistrer en PDF" onPress={imprimer} />}
        <Bouton
          variante={doc?.chemin ? 'discret' : undefined}
          libelle={Platform.OS === 'web' ? 'Déposer le PDF dans Documents' : doc?.chemin ? 'Enregistrer une nouvelle version' : 'Enregistrer le PDF dans Documents'}
          onPress={enregistrerPdf}
          chargement={depot}
        />
        {retour && <Texte style={{ fontSize: 13, color: couleurs.vert }}>{retour}</Texte>}
      </Carte>

      <TitreSection>Envoyer au client</TitreSection>
      <Carte>
        <SousTitre>1. Le compte rendu par e-mail</SousTitre>
        {Platform.OS === 'web' ? (
          <Texte doux style={{ fontSize: 14 }}>
            Sur le téléphone, un bouton ouvre un e-mail prêt à partir vers le client, avec en pièce jointe la version enregistrée dans Documents.
          </Texte>
        ) : !doc?.chemin ? (
          <Texte style={{ fontSize: 14, color: couleurs.orange }}>Enregistrez d’abord le PDF dans Documents : c’est cette version qui sera envoyée.</Texte>
        ) : contact.email ? (
          <Bouton
            libelle={`${booster.planEnvoyeLe ? 'Renvoyer' : 'Envoyer'} la version ${doc.version} à ${contact.email}`}
            onPress={() => envoyer('email')}
            chargement={envoi === 'email'}
          />
        ) : (
          <Texte style={{ fontSize: 14, color: couleurs.orange }}>Pas d’e-mail sur la fiche : ajoute-le, ou envoie le PDF autrement.</Texte>
        )}
        {Platform.OS !== 'web' && doc?.chemin && (
          <Bouton variante="discret" libelle="Envoyer le PDF autrement (WhatsApp, Messages…)" onPress={() => envoyer('partage')} chargement={envoi === 'partage'} />
        )}
        {booster.planEnvoyeLe && <Texte doux style={{ fontSize: 13 }}>{`Envoi confirmé le ${dateCourte(booster.planEnvoyeLe)}`}</Texte>}

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
