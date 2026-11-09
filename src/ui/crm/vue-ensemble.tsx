// C01 — Accueil, repris de CRMWorkspace (module « Accueil ») : chiffres cliquables, Prochains Boosters et À faire
// (relances à envoyer et tâches), bouton Programmes et cycles clients.
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { crm } from '@/data/crm';
import { ajouterJours, jourLocal, MODELES, rediger, statutBooster, type BoosterDossier, type ContactResume, type QuestionnaireATraiter, type RelanceAFaire } from '@/domain/crm';
import { decalerMois, moisDe, nomMois } from '@/domain/bilan-mois';
import { montantLisible } from '@/domain/gestion';

import { useSession } from '@/data/session';

import { AgendaCoach } from '../agenda/agenda-coach';
import { CeQuiSestPasse } from '../accueil/ce-qui-s-est-passe';
import { BoutonContour } from '../coque';
import { Carte } from '../composants';
import { couleurs, espace, polices, univers, type CleUnivers } from '../theme';
import { adresseQuestionnaire, CarteRelance, dateCourte, EnvoiMessage, jourLisible, nomComplet, useCoachNom } from './commun';

export type DonneesVueEnsemble = {
  contacts: ContactResume[];
  relances: RelanceAFaire[];
  boosters: BoosterDossier[];
  encaissements: number;
  aEncaisser: number;
  lienQuestionnaire: string | null;
  /** Réponses reçues, Booster pas encore planifié. */
  questionnaires: QuestionnaireATraiter[];
};

export function VueEnsemble({
  donnees,
  onRubrique,
  onOuvrirTache,
  onNouvelleTache,
  onOuvrirContact,
  onOuvrirBooster,
  onPlanifierBooster,
  onCycles,
  onAgenda,
}: {
  donnees: DonneesVueEnsemble;
  onRubrique: (r: 'Contacts' | 'Boosters' | 'Paiements' | 'Bilan') => void;
  onOuvrirTache: (id: string) => void;
  onNouvelleTache: () => void;
  onOuvrirContact: (id: string) => void;
  onOuvrirBooster: (b: BoosterDossier) => void;
  onPlanifierBooster: (contactId: string) => void;
  onCycles: () => void;
  onAgenda: () => void;
}) {
  const { width } = useWindowDimensions();
  const { profil } = useSession();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const [tout, setTout] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const agir = (action: Promise<void>) => {
    setErreur(undefined);
    action.catch((e) => setErreur(e instanceof Error ? e.message : 'Action non confirmée'));
  };
  const enRetard = donnees.relances.filter((r) => r.enRetard).length;
  const [proposer, setProposer] = useState<string>();
  const coach = useCoachNom();
  // La relance « Proposer une séance Booster » d'un contact qui vient de répondre est dans la carte des nouvelles réponses :
  // pas deux fois à l'écran.
  const nouveaux = new Set(donnees.questionnaires.map((x) => x.contact.id));
  const relances = donnees.relances.filter((r) => !(r.modele === 'booster' && nouveaux.has(r.contactId)));
  const aFaire = tout ? relances : relances.slice(0, 5);
  const relanceBooster = (contactId: string) => donnees.relances.find((r) => r.modele === 'booster' && r.contactId === contactId);
  const actifs = donnees.contacts.filter((c) => c.statut !== 'archive' && c.statut !== 'client');
  // Comme à l'origine : tout Booster ni Terminé ni Annulé d'un dossier actif, le plus proche d'abord.
  const prochains = donnees.boosters
    .filter((b) => b.statut === 'prevu' && b.contact.statut !== 'archive')
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <View style={{ gap: espace(4) }}>
      {/* L'agenda tel qu'il est dans l'onglet Agenda (jour, semaine, mois, flèches), ouvert sur aujourd'hui. */}
      <Carte style={{ padding: 12 }}>
        <AgendaCoach coachId={coachId} accueil />
      </Carte>
      {/* Première semaine du mois : le bilan du mois qui vient de se terminer est prêt. */}
      {new Date().getDate() <= 7 && (
        <Pressable accessibilityRole="button" onPress={() => onRubrique('Bilan')}>
          <Carte style={{ padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={[titreCarte, { marginBottom: 4 }]}>Ton bilan de {nomMois(decalerMois(moisDe(new Date()), -1))} est prêt</Text>
              <Text style={ligneDoux}>Encaissé, abonnements réglés, séances, clients vus et l’évolution sur l’année.</Text>
            </View>
            <BoutonContour libelle="Voir le bilan" onPress={() => onRubrique('Bilan')} />
          </Carte>
        </Pressable>
      )}
      {/* Une réponse au questionnaire arrive toute seule (Tally ou l'app) : on la voit ici, avec ses réponses et le Booster à planifier. */}
      {donnees.questionnaires.length > 0 && (
        <Carte style={{ padding: 20, borderColor: couleurs.rouge }}>
          <Text style={titreCarte}>
            Nouvelles réponses au questionnaire · {donnees.questionnaires.length}
          </Text>
          {donnees.questionnaires.slice(0, 5).map(({ questionnaire: q, contact, objectif }, i, liste) => (
            <View key={q.id} style={[{ paddingVertical: 12, gap: 8 }, i < liste.length - 1 && bordure]}>
              <Pressable accessibilityRole="link" onPress={() => onOuvrirContact(contact.id)}>
                <Text style={[ligneTexte, { fontFamily: polices.texteGras }]}>{nomComplet(contact)}</Text>
                <Text style={ligneDoux}>
                  Reçu {dateCourte(q.recuLe)}
                  {objectif ? ` · ${objectif}` : ''}
                </Text>
                {q.alertes.length > 0 && <Text style={[ligneDoux, { color: couleurs.orange }]}>⚠️ {q.alertes[0]}</Text>}
              </Pressable>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <BoutonContour libelle="Voir ses réponses" onPress={() => onOuvrirContact(contact.id)} />
                <BoutonContour libelle="Planifier le Booster" onPress={() => onPlanifierBooster(contact.id)} />
                {relanceBooster(contact.id) && proposer !== contact.id && (
                  <BoutonContour libelle="Lui proposer un créneau" onPress={() => setProposer(contact.id)} />
                )}
              </View>
              {proposer === contact.id && relanceBooster(contact.id) && (
                <EnvoiMessage
                  contact={contact}
                  message={rediger('booster', contact, { coach })}
                  onEnvoye={() => agir(crm.terminerRelance(relanceBooster(contact.id)!.id))}
                />
              )}
            </View>
          ))}
        </Carte>
      )}
      {/* Les cinq chiffres dans une seule carte : deux rangées de petites cases, chacune ouvre sa rubrique. */}
      <Carte style={{ padding: 16 }}>
        <Text style={[titreCarte, { marginBottom: 12 }]}>En bref</Text>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chiffre teinte="rougeDore" libelle="Prospects" valeur={String(actifs.length)} onPress={() => onRubrique('Contacts')} />
            <Chiffre teinte="bleu" libelle="Boosters" valeur={String(prochains.length)} onPress={() => onRubrique('Boosters')} />
            <Chiffre teinte="rouge" libelle="En retard" valeur={String(enRetard)} alerte={enRetard > 0} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Paiements « Payé » datés du mois en cours. */}
            <Chiffre teinte="ambre" libelle="Encaissé ce mois" valeur={montantLisible(donnees.encaissements)} onPress={() => onRubrique('Paiements')} />
            {/* Paiements « En attente » : abonnements du mois et packs vendus, à passer en « Payé » une fois reçus. */}
            <Chiffre teinte="ambre" libelle="À encaisser" valeur={montantLisible(donnees.aEncaisser)} alerte={donnees.aEncaisser > 0} onPress={() => onRubrique('Paiements')} />
          </View>
        </View>
      </Carte>
      <CeQuiSestPasse onOuvrirContact={onOuvrirContact} onAgenda={onAgenda} onPaiements={() => onRubrique('Paiements')} />
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
                  lienQuestionnaire={adresseQuestionnaire(donnees.lienQuestionnaire)}
                  booster={donnees.boosters.find((b) => b.contactId === r.contactId && b.statut === 'prevu')?.date}
                  onFaite={() => agir(crm.terminerRelance(r.id))}
                  onReporter={() => agir(crm.reporterRelance(r.id, ajouterJours(jourLocal(new Date()), 1)))}
                  onOuvrirContact={() => onOuvrirContact(r.contactId)}
                />
              ),
            )}
          </View>
          {!relances.length && <Text style={ligneDoux}>Rien à faire aujourd’hui.</Text>}
          {relances.length > 5 && (
            <Text accessibilityRole="button" onPress={() => setTout((t) => !t)} style={[ligneDoux, { marginTop: 12, textDecorationLine: 'underline' }]}>
              {tout ? 'Réduire' : `Tout afficher (${relances.length})`}
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

/**
 * Une case de la carte « En bref » : libellé discret, chiffre en gras ; rouge quand il demande une action. Le fond pâle
 * et le halo dans le coin donnent la couleur de son univers (ambre l'argent, bleu les rendez-vous…).
 */
function Chiffre({ libelle, valeur, onPress, alerte, teinte }: { libelle: string; valeur: string; onPress?: () => void; alerte?: boolean; teinte: CleUnivers }) {
  const u = univers[teinte];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${libelle} : ${valeur}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: couleurs.bordure,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: couleurs.carte,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${u.accent}38 0%, ${u.accent}00 45%), linear-gradient(140deg, ${u.clair} 0%, #FFFFFF 80%)`,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: polices.texte, color: couleurs.texteDoux }}>{libelle}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, fontFamily: polices.texteGras, color: alerte ? couleurs.rouge : couleurs.texte, marginTop: 2 }}>
        {valeur}
      </Text>
    </Pressable>
  );
}

const titreCarte = { fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte, marginBottom: 16 } as const;
const ligne = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 } as const;
const bordure = { borderBottomWidth: 1, borderBottomColor: couleurs.bordure } as const;
const ligneTexte = { fontSize: 14, fontFamily: polices.texte, color: couleurs.texte } as const;
const ligneDoux = { fontSize: 13, fontFamily: polices.texte, color: couleurs.texteDoux } as const;
const badge = { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 } as const;
const badgeTexte = { fontSize: 12, fontFamily: polices.texteGras, color: couleurs.texte } as const;
