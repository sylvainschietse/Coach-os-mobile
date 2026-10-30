// C04 — Éditeur Booster repris de RecordEditor (table Boosters) : rubriques exactes Préparation / Entretien /
// Tests / Conclusion, champs et choix de Champs-CRM.json, enregistrement explicite, Supprimer à gauche du pied.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { preparerSeance } from '@/domain/briefing';
import {
  ecrireDateHeure,
  ecrireJour,
  lireDateHeure,
  lireJour,
  nomBooster,
  OFFRES_RECOMMANDEES,
  RESULTATS_COMMERCIAUX,
  statutBooster,
  STATUTS_BOOSTER,
  troisPriorites,
  type Booster,
  type Contact,
  type ContactResume,
  type Questionnaire,
  type SaisieFicheBooster,
  type StatutBooster,
} from '@/domain/crm';
import { ENTRETIEN, evaluationVide, TESTS, type Evaluation, type IdTest } from '@/domain/evaluation';
import { prioritesAuto } from '@/domain/redaction';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Selecteur, SousNav, type OngletDef } from '../coque';
import { Chargement, Erreur } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { BoutonPied, CaseACocher, Cellule, Choix, ChoixMultiple, Grille, Libelle, Modale, PiedEditeur, Saisie } from './dossier';
import { nomComplet } from './commun';

type Rubrique = 'Préparation' | 'Entretien' | 'Tests' | 'Conclusion';
const RUBRIQUES: OngletDef<Rubrique>[] = (['Préparation', 'Entretien', 'Tests', 'Conclusion'] as const).map((r) => ({ cle: r, libelle: r }));

interface Brouillon {
  nom: string;
  contactId: string;
  date: string;
  statut: StatutBooster;
  resumeIa: string;
  pointsAttention: string;
  entretien: Record<string, string>;
  evaluation: Evaluation;
  priorites: string[];
  offreRecommandee: string;
  resultatCommercial: string;
  dateRelance: string;
  planEnvoye: boolean;
  notesInternes: string;
}

function brouillonDe(b: Booster | undefined, contact: Contact | undefined, reponses: Record<string, string> | undefined): Brouillon {
  const evaluation = b?.evaluation ?? evaluationVide();
  const entretien = { ...(b?.entretien ?? {}) };
  return {
    nom: b?.nom ?? (contact ? nomBooster(contact) : ''),
    contactId: b?.contactId ?? contact?.id ?? '',
    date: ecrireDateHeure(b?.date),
    statut: b ? statutBooster(b) : 'À préparer',
    resumeIa: b?.resumeIa ?? '',
    pointsAttention: b?.pointsAttention ?? '',
    entretien,
    evaluation,
    // Déterminées par l'application d'après les tests, le bilan et l'objectif ; le coach ne les saisit pas.
    priorites: troisPriorites(prioritesAuto({ evaluation, entretien }, reponses)),
    offreRecommandee: b?.offreRecommandee ?? '',
    resultatCommercial: b?.resultatCommercial ?? '',
    dateRelance: ecrireJour(b?.dateRelance),
    planEnvoye: !!b?.planEnvoyeLe,
    notesInternes: b?.notesInternes ?? '',
  };
}

const vide = (t: string) => t.trim() || undefined;

/** Ce qui a changé depuis l'ouverture, au format du dépôt. */
function saisieDe(b: Brouillon, initial: Brouillon, booster: Booster | undefined): SaisieFicheBooster {
  const s: SaisieFicheBooster = {};
  const change = <K extends keyof Brouillon>(k: K) => JSON.stringify(b[k]) !== JSON.stringify(initial[k]);
  if (change('nom')) s.nom = vide(b.nom);
  if (change('date')) s.date = lireDateHeure(b.date, new Date());
  if (change('statut')) s.statutCrm = b.statut;
  if (change('resumeIa')) s.resumeIa = vide(b.resumeIa);
  if (change('pointsAttention')) s.pointsAttention = vide(b.pointsAttention);
  if (change('entretien')) s.entretien = Object.fromEntries(Object.entries(b.entretien).filter(([, v]) => v.trim()));
  if (change('evaluation')) s.evaluation = b.evaluation;
  if (change('priorites')) s.priorites = b.priorites;
  if (change('offreRecommandee')) s.offreRecommandee = vide(b.offreRecommandee);
  if (change('resultatCommercial')) s.resultatCommercial = vide(b.resultatCommercial);
  if (change('dateRelance')) s.dateRelance = lireJour(b.dateRelance);
  if (change('planEnvoye')) s.planEnvoyeLe = b.planEnvoye ? (booster?.planEnvoyeLe ?? new Date().toISOString()) : undefined;
  if (change('notesInternes')) s.notesInternes = vide(b.notesInternes);
  return s;
}

export function EditeurBoosterModale({
  boosterId,
  contactId,
  onFermer,
  onSupprimer,
}: {
  /** Absent : « Nouveau Booster » (contact prérempli s'il est connu). */
  boosterId?: string;
  contactId?: string;
  onFermer: () => void;
  onSupprimer: (b: Booster, contact: Contact) => void;
}) {
  const charge = useCharger(
    async () => {
      const contacts = boosterId ? [] : (await crm.contacts()).filter((c) => c.statut !== 'archive');
      const fiche = contactId ? await crm.fiche(contactId) : null;
      const booster = boosterId ? fiche?.boosters.find((b) => b.id === boosterId) : undefined;
      if (boosterId && !booster) throw new Error('Ce Booster n’existe plus.');
      return { contacts, fiche, booster };
    },
    `booster-${boosterId ?? 'nouveau'}-${contactId ?? ''}`,
  );
  // Après Enregistrer, le Booster est relu depuis la base : le résumé en bas montre ce qui est vraiment stocké.
  useRechargerSur(charge.recharger, ecouterCrm);
  if (!charge.donnee)
    return (
      <Modale titre={boosterId ? 'Modifier · Boosters' : 'Créer · Boosters'} onFermer={onFermer}>
        {charge.erreur ? <Erreur message={charge.erreur} onReessayer={charge.recharger} /> : <Chargement />}
      </Modale>
    );
  const { contacts, fiche, booster } = charge.donnee;
  return (
    <Editeur
      booster={booster}
      contact={fiche?.contact}
      questionnaire={fiche?.questionnaires[0]}
      contacts={contacts}
      onFermer={onFermer}
      onSupprimer={onSupprimer}
    />
  );
}

function Editeur({
  booster,
  contact,
  questionnaire,
  contacts,
  onFermer,
  onSupprimer,
}: {
  booster?: Booster;
  contact?: Contact;
  questionnaire?: Questionnaire;
  contacts: ContactResume[];
  onFermer: () => void;
  onSupprimer: (b: Booster, contact: Contact) => void;
}) {
  const [rubrique, setRubrique] = useState<Rubrique>('Préparation');
  const reponses = questionnaire?.reponses;
  const [initial, setInitial] = useState(() => brouillonDe(booster, contact, reponses));
  const [brut, setB] = useState(initial);
  // Les priorités suivent les tests et l'entretien à chaque modification.
  const b = { ...brut, priorites: troisPriorites(prioritesAuto(brut, reponses)) };
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const saisie = saisieDe(b, initial, booster);
  const modifie = Object.keys(saisie).length > 0 || (!booster && !!b.contactId);
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());
  const maj = (patch: Partial<Brouillon>) => setB((x) => ({ ...x, ...patch }));

  const date = lireDateHeure(b.date, new Date());
  const relance = b.dateRelance.trim() ? lireJour(b.dateRelance) : undefined;
  const erreurs = {
    date: !b.date.trim() ? 'La date et l’heure sont nécessaires.' : !date ? 'Écrivez la date comme 24/10/2026 18:30' : undefined,
    relance: b.dateRelance.trim() && !relance ? 'Écrivez la date comme 30/10/2026' : undefined,
    contact: !b.contactId ? 'Choisissez le contact de ce Booster.' : undefined,
  };
  const invalide = Object.values(erreurs).some(Boolean);

  async function enregistrer() {
    setOccupe(true);
    setErreur(undefined);
    try {
      if (!booster) {
        await crm.creerBooster(b.contactId, {
          ...saisie,
          priorites: b.priorites,
          nom: vide(b.nom),
          date: date!,
          statutCrm: b.statut,
        });
        onFermer();
        return;
      }
      // Des priorités enregistrées avant le calcul automatique sont remplacées au premier enregistrement.
      const priorites = JSON.stringify(b.priorites) !== JSON.stringify(troisPriorites(booster.priorites)) ? { priorites: b.priorites } : {};
      await crm.modifierBooster(booster.id, { ...saisie, ...priorites });
      setInitial(b);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
    } finally {
      setOccupe(false);
    }
  }

  const contactChoisi = contact ?? contacts.find((c) => c.id === b.contactId);
  return (
    <Modale
      titre={booster ? 'Modifier · Boosters' : 'Créer · Boosters'}
      onFermer={() => demanderSortie(onFermer)}
      enTete={<SousNav nom="Rubriques du Booster" onglets={RUBRIQUES} valeur={rubrique} onChange={setRubrique} />}
      pied={
        <View style={{ gap: espace(3) }}>
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          {/* Un champ invalide d'une autre rubrique bloque Enregistrer : on dit lequel, où qu'on soit. */}
          {modifie && invalide && !erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              Enregistrement impossible : {erreurs.contact ?? (erreurs.date ? `date du Booster (Préparation). ${erreurs.date}` : `date de relance (Conclusion). ${erreurs.relance}`)}
            </Text>
          )}
          <PiedEditeur
            modifie={modifie}
            enregistrement={occupe}
            peutEnregistrer={!occupe && !invalide && (!booster || modifie)}
            onEnregistrer={enregistrer}
            onFermer={() => (sortie ? sortie() : demanderSortie(onFermer))}
            sortieDemandee={!!sortie}
            onRester={() => setSortie(null)}
            gauche={
              booster && contact ? (
                <BoutonPied danger libelle="Supprimer" desactive={occupe} onPress={() => demanderSortie(() => onSupprimer(booster, contact))} />
              ) : undefined
            }
          />
        </View>
      }
    >
      {rubrique === 'Préparation' && (
        <Grille>
          <Cellule>
            <Saisie libelle="Booster" valeur={b.nom} onChange={(nom) => maj({ nom })} />
          </Cellule>
          <Cellule>
            {contact ? (
              <View style={{ gap: espace(2) }}>
                <Libelle>Contact</Libelle>
                <Text style={styles.contact}>{nomComplet(contact)}</Text>
              </View>
            ) : (
              <View style={{ gap: espace(2) }}>
                <Libelle>Contact</Libelle>
                <Selecteur
                  libelle="Contact"
                  sansLibelle
                  options={[
                    { cle: '', libelle: 'Choisir…' },
                    ...contacts.map((c) => ({
                      cle: c.id,
                      libelle: nomComplet(c),
                    })),
                  ]}
                  valeur={b.contactId}
                  onChange={(id) => {
                    const c = contacts.find((x) => x.id === id);
                    maj({
                      contactId: id,
                      nom: !b.nom || (contactChoisi && b.nom === nomBooster(contactChoisi)) ? (c ? nomBooster(c) : '') : b.nom,
                    });
                  }}
                />
                {erreurs.contact && <Text style={styles.erreur}>{erreurs.contact}</Text>}
              </View>
            )}
          </Cellule>
          <Cellule>
            <Saisie
              libelle="Date de la Booster"
              valeur={b.date}
              onChange={(d) => maj({ date: d })}
              placeholder="24/10/2026 18:30"
              erreur={b.date || booster ? erreurs.date : undefined}
              aide={
                date
                  ? new Date(date).toLocaleString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Jour/mois/année heure:minutes'
              }
            />
          </Cellule>
          <Cellule>
            <Choix
              libelle="Statut"
              choix={STATUTS_BOOSTER}
              vide={null}
              valeur={b.statut}
              onChange={(s) => maj({ statut: (s as StatutBooster) ?? 'À préparer' })}
            />
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Résumé IA" long valeur={b.resumeIa} onChange={(resumeIa) => maj({ resumeIa })} />
            {questionnaire && !b.resumeIa.trim() && !b.pointsAttention.trim() && (
              <View style={{ marginTop: espace(2), alignSelf: 'flex-start' }}>
                <BoutonPied libelle="Reprendre les réponses du questionnaire" onPress={() => maj(depuisQuestionnaire(questionnaire))} />
                <Text style={styles.aide}>
                  Résumé tiré des réponses, sans IA. La douleur déclarée reste un point d’attention, pas un résultat de test.
                </Text>
              </View>
            )}
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Points d’attention" long valeur={b.pointsAttention} onChange={(pointsAttention) => maj({ pointsAttention })} />
          </Cellule>
        </Grille>
      )}

      {rubrique === 'Entretien' && (
        <Grille>
          {ENTRETIEN.map((q) => (
            <Cellule key={q.id} pleine>
              <Saisie libelle={q.libelle} long valeur={b.entretien[q.id] ?? ''} onChange={(v) => maj({ entretien: { ...b.entretien, [q.id]: v } })} />
            </Cellule>
          ))}
        </Grille>
      )}

      {rubrique === 'Tests' && <Tests evaluation={b.evaluation} onChange={(evaluation) => maj({ evaluation })} />}

      {rubrique === 'Conclusion' && (
        <Grille>
          <Cellule pleine>
            <View style={{ gap: espace(2) }}>
              <Libelle>Priorités</Libelle>
              {b.priorites.filter(Boolean).map((p, i) => (
                <Text key={p} style={styles.contact}>{`${i + 1}. ${p}`}</Text>
              ))}
              <Text style={styles.aide}>
                Déterminées par l’application d’après les tests, une douleur éventuelle, les habitudes du bilan et l’objectif. Elles se mettent à jour
                quand les tests changent.
              </Text>
            </View>
          </Cellule>
          <Cellule>
            <Choix
              libelle="Offre recommandée"
              choix={OFFRES_RECOMMANDEES}
              valeur={b.offreRecommandee || undefined}
              onChange={(v) => maj({ offreRecommandee: v ?? '' })}
            />
          </Cellule>
          <Cellule>
            <Choix
              libelle="Résultat commercial"
              choix={RESULTATS_COMMERCIAUX}
              valeur={b.resultatCommercial || undefined}
              onChange={(v) => maj({ resultatCommercial: v ?? '' })}
            />
          </Cellule>
          <Cellule>
            <Saisie
              libelle="Date de relance"
              valeur={b.dateRelance}
              onChange={(dateRelance) => maj({ dateRelance })}
              placeholder="30/10/2026"
              erreur={erreurs.relance}
            />
          </Cellule>
          <Cellule>
            <CaseACocher libelle="Plan d’action envoyé" valeur={b.planEnvoye} onChange={(planEnvoye) => maj({ planEnvoye })} />
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Notes internes" long valeur={b.notesInternes} onChange={(notesInternes) => maj({ notesInternes })} />
            <Text style={styles.aide}>Réservées au coach : elles ne figurent jamais dans le compte rendu.</Text>
          </Cellule>
        </Grille>
      )}

      {booster && contact && <ResumeLecture booster={booster} />}
    </Modale>
  );
}

/** Ce que la base a enregistré, pour vérifier après coup sans rouvrir la fiche. */
function ResumeLecture({ booster }: { booster: Booster }) {
  return (
    <Text style={styles.aide}>
      Enregistré : {statutBooster(booster)} ·{' '}
      {new Date(booster.date).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}
      {booster.planEnvoyeLe ? ` · plan marqué envoyé le ${new Date(booster.planEnvoyeLe).toLocaleDateString('fr-FR')}` : ''}
    </Text>
  );
}

function depuisQuestionnaire(q: Questionnaire): Partial<Brouillon> {
  const r = preparerSeance(q.reponses);
  const blocs = [
    ['Objectif', r.objectif],
    ['Profil sportif', r.profil],
    ['Leviers à travailler', r.leviers],
    ['Motivation et attentes', r.motivation],
  ] as const;
  return {
    resumeIa: blocs
      .filter(([, l]) => l.length)
      .map(([t, l]) => `${t}\n${l.map((x) => `• ${x}`).join('\n')}`)
      .join('\n\n'),
    pointsAttention: r.sante.length ? r.sante.join('\n') : 'Aucune douleur ni contre-indication déclarée dans le questionnaire.',
  };
}

/** Évaluations qualitatives d'origine : un résultat non choisi reste « Non renseigné », jamais « Non réalisé ». */
function Tests({ evaluation: e, onChange }: { evaluation: Evaluation; onChange: (e: Evaluation) => void }) {
  const test = (id: IdTest) => e.tests[id] ?? { observations: [] };
  const majTest = (id: IdTest, patch: Partial<NonNullable<Evaluation['tests'][IdTest]>>) =>
    onChange({ ...e, tests: { ...e.tests, [id]: { ...test(id), ...patch } } });
  return (
    <Grille>
      {TESTS.flatMap((t) => [
        <Cellule key={t.id}>
          <Choix libelle={t.libelle} choix={t.resultats} valeur={test(t.id).resultat} onChange={(resultat) => majTest(t.id, { resultat })} />
        </Cellule>,
        ...(t.rpe
          ? [
              <Cellule key={`${t.id}-rpe`}>
                <Choix
                  libelle={`${t.libelle} — RPE /10`}
                  choix={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']}
                  valeur={test(t.id).rpe ? String(test(t.id).rpe) : undefined}
                  onChange={(v) => majTest(t.id, { rpe: v ? Number(v) : undefined })}
                />
              </Cellule>,
            ]
          : []),
        <Cellule key={`${t.id}-obs`} pleine>
          <ChoixMultiple
            libelle={`${t.libelle} — observations`}
            choix={t.observations}
            valeurs={test(t.id).observations}
            onChange={(observations) => majTest(t.id, { observations })}
          />
        </Cellule>,
      ])}
      <Cellule>
        <Choix
          libelle="Douleur pendant les tests"
          choix={['Non', 'Oui']}
          valeur={e.douleur}
          onChange={(d) => onChange({ ...e, douleur: d as Evaluation['douleur'] })}
        />
      </Cellule>
      <Cellule>
        <Saisie
          libelle="Douleur / gêne — précision"
          valeur={e.douleurPrecision ?? ''}
          onChange={(douleurPrecision) => onChange({ ...e, douleurPrecision })}
        />
      </Cellule>
      <Cellule pleine>
        <Saisie libelle="Observations tests" long valeur={e.notes ?? ''} onChange={(notes) => onChange({ ...e, notes })} />
      </Cellule>
    </Grille>
  );
}

const styles = StyleSheet.create({
  contact: {
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texte,
    minHeight: 44,
    textAlignVertical: 'center',
    lineHeight: 44,
  },
  aide: {
    marginTop: espace(1),
    fontFamily: polices.texte,
    fontSize: 12,
    lineHeight: 18,
    color: couleurs.texteDoux,
  },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
});
