// C04 — Éditeur Booster repris de RecordEditor (table Boosters) : rubriques exactes Préparation / Entretien /
// Tests / Conclusion, champs et choix de Champs-CRM.json, enregistrement explicite, Supprimer à gauche du pied.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { offres } from '@/data/offres';
import { appliquerOffreVendue, libelleOffre } from '@/data/vente-booster';
import { preparerSeance } from '@/domain/briefing';
import { cleJour, heureDe, heureValide, versIso } from '@/domain/agenda';
import {
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
import { iaDisponible, rangerEntretien } from '@/data/redaction';
import { ajouterDicteeBooster, LIBELLES_DICTEE, type RangementDictee, type RubriqueDictee } from '@/domain/dictee-booster';
import { ENTRETIEN, evaluationVide, TESTS, type Evaluation, type IdTest } from '@/domain/evaluation';
import { exercicesRenseignes, type ExerciceTest } from '@/domain/exercices-test';
import { prioritesAuto } from '@/domain/redaction';
import { testsGolfRenseignes } from '@/domain/tests-golf';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Selecteur, SousNav, type OngletDef } from '../coque';
import { Bouton, Chargement, Erreur } from '../composants';
import { ChampDate, ChampHeure } from '../date-heure';
import { BoutonDictee } from '../dictee';
import { couleurs, espace, polices } from '../theme';
import { BoutonPied, CaseACocher, Cellule, Choix, ChoixMultiple, Grille, Libelle, Modale, PiedEditeur, Saisie } from './dossier';
import { ConclusionBooster } from './conclusion-booster';
import { ExercicesTest } from './exercices-test';
import { MesuresVideoTest } from './mesures-video-test';
import { TestsGolf, type GolfPrecedent } from './tests-golf';
import { BoutonEtape } from './acces';
import { EnvoiMessage, nomComplet, useMessageQuestionnaire } from './commun';

type Rubrique = 'Préparation' | 'Entretien' | 'Tests' | 'Conclusion';
const RUBRIQUES: OngletDef<Rubrique>[] = (['Préparation', 'Entretien', 'Tests', 'Conclusion'] as const).map((r) => ({ cle: r, libelle: r }));

interface Brouillon {
  nom: string;
  contactId: string;
  /** AAAA-MM-JJ, choisi dans le mini calendrier. */
  jour: string;
  /** « 18:30 », choisi dans la grille des heures. */
  heure: string;
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
    jour: b?.date ? cleJour(b.date) : '',
    heure: b?.date ? heureDe(b.date) : '',
    statut: b ? statutBooster(b) : 'À préparer',
    resumeIa: b?.resumeIa ?? '',
    pointsAttention: b?.pointsAttention ?? '',
    entretien,
    evaluation,
    // Déterminées par l'application d'après les tests, le bilan et l'objectif ; le coach ne les saisit pas.
    priorites: troisPriorites(prioritesAuto({ evaluation, entretien }, reponses)),
    offreRecommandee: b?.offreRecommandee ?? '',
    resultatCommercial: b?.resultatCommercial ?? '',
    dateRelance: b?.dateRelance ?? '',
    planEnvoye: !!b?.planEnvoyeLe,
    notesInternes: b?.notesInternes ?? '',
  };
}

const vide = (t: string) => t.trim() || undefined;

/** Date et heure du Booster en ISO, ou undefined tant que l'une des deux manque. */
const dateBooster = (b: Pick<Brouillon, 'jour' | 'heure'>) => (/^\d{4}-\d{2}-\d{2}$/.test(b.jour) && heureValide(b.heure) ? versIso(b.jour, b.heure.trim()) : undefined);

/** Ce qui a changé depuis l'ouverture, au format du dépôt. */
function saisieDe(b: Brouillon, initial: Brouillon, booster: Booster | undefined): SaisieFicheBooster {
  const s: SaisieFicheBooster = {};
  const change = <K extends keyof Brouillon>(k: K) => JSON.stringify(b[k]) !== JSON.stringify(initial[k]);
  if (change('nom')) s.nom = vide(b.nom);
  if (change('jour') || change('heure')) s.date = dateBooster(b);
  if (change('statut')) s.statutCrm = b.statut;
  if (change('resumeIa')) s.resumeIa = vide(b.resumeIa);
  if (change('pointsAttention')) s.pointsAttention = vide(b.pointsAttention);
  if (change('entretien')) s.entretien = Object.fromEntries(Object.entries(b.entretien).filter(([, v]) => v.trim()));
  if (change('evaluation')) s.evaluation = b.evaluation;
  if (change('priorites')) s.priorites = b.priorites;
  if (change('offreRecommandee')) s.offreRecommandee = vide(b.offreRecommandee);
  if (change('resultatCommercial')) s.resultatCommercial = vide(b.resultatCommercial);
  if (change('dateRelance')) s.dateRelance = b.dateRelance || undefined;
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
      let fiche = contactId ? await crm.fiche(contactId) : null;
      let booster = boosterId ? fiche?.boosters.find((b) => b.id === boosterId) : undefined;
      if (boosterId && !booster) throw new Error('Ce Booster n’existe plus.');
      // Booster créé avant l'arrivée des réponses : son briefing vide est rempli et enregistré tout seul à l'ouverture,
      // plus besoin d'appuyer sur « Reprendre les réponses du questionnaire ».
      const q = fiche?.questionnaires[0];
      if (booster && q && !booster.resumeIa?.trim() && !booster.pointsAttention?.trim() && booster.statut === 'prevu') {
        const { resumeIa, pointsAttention } = depuisQuestionnaire(q);
        await crm.modifierBooster(booster.id, { resumeIa, pointsAttention });
        fiche = await crm.fiche(contactId!);
        booster = fiche?.boosters.find((b) => b.id === boosterId) ?? booster;
      }
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
      golfPrecedent={golfPrecedent(fiche?.boosters ?? [], booster)}
      exercicesAvant={exercicesPrecedents(fiche?.boosters ?? [], booster)}
      contact={fiche?.contact}
      questionnaire={fiche?.questionnaires[0]}
      contacts={contacts}
      onFermer={onFermer}
      onSupprimer={onSupprimer}
    />
  );
}

/** Le dernier Booster du client avant celui-ci où des tests golf ont été mesurés. */
function golfPrecedent(boosters: Booster[], booster: Booster | undefined): GolfPrecedent | undefined {
  const avant = boosters
    .filter((x) => x.id !== booster?.id && (!booster || x.date < booster.date) && testsGolfRenseignes(x.evaluation?.golf) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return avant?.evaluation?.golf ? { date: avant.date, golf: avant.evaluation.golf } : undefined;
}

/** Le dernier Booster du client avant celui-ci où des exercices ont été testés. */
function exercicesPrecedents(boosters: Booster[], booster: Booster | undefined): ExercicesAvant | undefined {
  const avant = boosters
    .filter((x) => x.id !== booster?.id && (!booster || x.date < booster.date) && exercicesRenseignes(x.evaluation?.exercices) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return avant?.evaluation?.exercices
    ? { date: `Booster du ${new Date(avant.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, exercices: avant.evaluation.exercices }
    : undefined;
}

type ExercicesAvant = { date: string; exercices: ExerciceTest[] };

function Editeur({
  booster,
  golfPrecedent,
  exercicesAvant,
  contact,
  questionnaire,
  contacts,
  onFermer,
  onSupprimer,
}: {
  booster?: Booster;
  golfPrecedent?: GolfPrecedent;
  exercicesAvant?: ExercicesAvant;
  contact?: Contact;
  questionnaire?: Questionnaire;
  contacts: ContactResume[];
  onFermer: () => void;
  onSupprimer: (b: Booster, contact: Contact) => void;
}) {
  const [rubrique, setRubrique] = useState<Rubrique>('Préparation');
  const reponses = questionnaire?.reponses;
  const [initial, setInitial] = useState(() => brouillonDe(booster, contact, reponses));
  // Nouveau Booster d'un contact qui a répondu : le briefing est déjà rempli à partir de ses réponses (modifiable).
  const [brut, setB] = useState(() => (!booster && questionnaire ? { ...initial, ...depuisQuestionnaire(questionnaire) } : initial));
  // Les priorités suivent les tests et l'entretien à chaque modification.
  const b = { ...brut, priorites: troisPriorites(prioritesAuto(brut, reponses)) };
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const [conclure, setConclure] = useState(false);
  const [vente, setVente] = useState<string>();
  // Les offres du coach (Mes offres) ; sans offre créée, la liste d'origine.
  const mesOffres = useCharger(() => offres.lister(), 'offres-booster');
  const choixOffres = (() => {
    const liste = (mesOffres.donnee ?? []).filter((o) => o.active).map(libelleOffre);
    const base = liste.length ? [...liste, 'Aucune'] : OFFRES_RECOMMANDEES;
    return b.offreRecommandee && !base.includes(b.offreRecommandee) ? [b.offreRecommandee, ...base] : base;
  })();
  const saisie = saisieDe(b, initial, booster);
  const modifie = Object.keys(saisie).length > 0 || (!booster && !!b.contactId);
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());
  const maj = (patch: Partial<Brouillon>) => setB((x) => ({ ...x, ...patch }));

  const date = dateBooster(b);
  const erreurs = {
    date: !b.jour ? 'Choisissez la date.' : !heureValide(b.heure) ? 'Choisissez l’heure.' : undefined,
    relance: undefined as string | undefined,
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
      setVente(undefined);
      // « Vendu » : client actif (fait par le dépôt) avec l'offre recommandée sur sa fiche client.
      if (contact && b.resultatCommercial === 'Vendu' && (saisie.resultatCommercial || saisie.offreRecommandee)) {
        const nom = await appliquerOffreVendue(contact.id, b.offreRecommandee);
        setVente(`${contact.prenom || 'Le contact'} est client actif${nom ? ` avec l’offre « ${nom} »` : ''}.`);
      }
      // Booster passé à « Terminée » sans suite choisie : on demande tout de suite où ranger la personne.
      const decide = b.resultatCommercial === 'Vendu' || b.resultatCommercial === 'En veille';
      if (saisie.statutCrm === 'Terminée' && !decide && contact && contact.statut !== 'client' && contact.statut !== 'archive') setConclure(true);
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
          {vente && !modifie && <Text style={styles.vente}>{vente}</Text>}
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
      {/* Pas de questionnaire reçu : le briefing reste vide. On propose de l'envoyer d'ici, sans repasser par la liste. */}
      {rubrique === 'Préparation' && contactChoisi && !questionnaire && <QuestionnaireManquant contact={contactChoisi} />}
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
            <ChampDate
              libelle="Date de la Booster"
              jour={b.jour}
              onChange={(jour) => maj({ jour })}
              erreur={(booster || b.heure) && !b.jour ? 'Choisissez la date.' : undefined}
            />
          </Cellule>
          <Cellule>
            <ChampHeure
              libelle="Heure"
              heure={b.heure}
              onChange={(heure) => maj({ heure })}
              erreur={(booster || b.jour) && !heureValide(b.heure) ? 'Choisissez l’heure.' : undefined}
              aide={date ? 'Le Booster apparaîtra dans votre agenda à cette heure-là.' : undefined}
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
          </Cellule>
          <Cellule pleine>
            <Saisie libelle="Points d’attention" long valeur={b.pointsAttention} onChange={(pointsAttention) => maj({ pointsAttention })} />
          </Cellule>
        </Grille>
      )}

      {rubrique === 'Entretien' && (
        <>
          <DicteeEntretien
            sansQuestionnaire={!questionnaire}
            onRanger={(rangement) => setB((x) => ({ ...x, entretien: ajouterDicteeBooster(x.entretien, rangement) }))}
          />
          <Grille>
            {ENTRETIEN.map((q) => (
              <Cellule key={q.id} pleine>
                <Saisie libelle={q.libelle} long dictee valeur={b.entretien[q.id] ?? ''} onChange={(v) => maj({ entretien: { ...b.entretien, [q.id]: v } })} />
              </Cellule>
            ))}
          </Grille>
        </>
      )}

      {rubrique === 'Tests' && <Tests evaluation={b.evaluation} golfPrecedent={golfPrecedent} exercicesAvant={exercicesAvant} onChange={(evaluation) => maj({ evaluation })} />}

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
              choix={choixOffres}
              valeur={b.offreRecommandee || undefined}
              onChange={(v) => maj({ offreRecommandee: v ?? '' })}
            />
          </Cellule>
          <Cellule>
            <Choix
              libelle="Résultat commercial"
              choix={RESULTATS_COMMERCIAUX}
              valeur={b.resultatCommercial || undefined}
              onChange={(v) =>
                // Vendu ou En veille : le Booster a eu lieu, il passe à « Terminée » (le compte rendu devient disponible).
                maj({ resultatCommercial: v ?? '', ...((v === 'Vendu' || v === 'En veille') && b.statut !== 'Annulée' ? { statut: 'Terminée' as StatutBooster } : {}) })
              }
            />
          </Cellule>
          <Cellule>
            <ChampDate libelle="Date de relance" jour={b.dateRelance} onChange={(dateRelance) => maj({ dateRelance })} effacable />
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
      {conclure && booster && contact && <ConclusionBooster boosterId={booster.id} contact={contact} offre={b.offreRecommandee || undefined} onFermer={() => setConclure(false)} />}
    </Modale>
  );
}

/**
 * Le coach dicte tout l'entretien d'une traite ; « Ranger » répartit ce qu'il a dit dans les rubriques (par l'IA avec
 * le compte en ligne), en ajoutant à ce qui est déjà écrit. Rien n'est enregistré avant « Enregistrer » : il relit d'abord.
 */
function DicteeEntretien({ sansQuestionnaire, onRanger }: { sansQuestionnaire: boolean; onRanger: (r: RangementDictee) => void }) {
  const [texte, setTexte] = useState('');
  const [ranges, setRanges] = useState<RubriqueDictee[]>();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const changer = (v: string) => {
    setTexte(v);
    setRanges(undefined);
    setErreur(undefined);
  };
  async function ranger() {
    setOccupe(true);
    setErreur(undefined);
    try {
      const rangement = await rangerEntretien(texte);
      const rubriques = Object.keys(rangement) as RubriqueDictee[];
      if (!rubriques.length) throw new Error('Rien à ranger dans ce texte. Complète les rubriques à la main.');
      onRanger(rangement);
      setRanges(rubriques);
      setTexte('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le rangement n’a pas abouti.');
    } finally {
      setOccupe(false);
    }
  }
  return (
    <View style={[styles.encart, { marginBottom: espace(4), backgroundColor: couleurs.fond }]}>
      <Text style={styles.encartTitre}>Dicter l’entretien</Text>
      <Text style={styles.aide}>
        {sansQuestionnaire ? 'Pas de questionnaire ? Raconte ce que tu sais du client, le compte rendu se fera avec. ' : ''}
        {iaDisponible
          ? 'Parle librement : l’IA range chaque information dans la bonne rubrique, tu relis avant d’enregistrer.'
          : 'Annonce chaque rubrique avant d’en parler : « Objectif… Antécédents… Freins… ». Le reste va dans Observations.'}
      </Text>
      <BoutonDictee valeur={texte} onChange={changer} desactive={occupe} />
      <Saisie
        libelle="Texte dicté"
        long
        valeur={texte}
        onChange={changer}
        desactive={occupe}
        placeholder="Objectif : perdre 5 kilos pour l’été. Antécédents : opéré du genou. Freins : horaires décalés…"
      />
      <View style={{ alignSelf: 'flex-start' }}>
        <Bouton variante="secondaire" libelle="Ranger dans les rubriques" onPress={ranger} desactive={!texte.trim()} chargement={occupe} />
      </View>
      {erreur && (
        <Text accessibilityRole="alert" style={styles.erreur}>
          {erreur}
        </Text>
      )}
      {ranges && (
        <Text accessibilityRole="alert" style={styles.aide}>
          {`Ajouté à : ${ranges.map((r) => LIBELLES_DICTEE[r]).join(', ')}. Relis ci-dessous, puis Enregistrer.`}
        </Text>
      )}
    </View>
  );
}

/** Ce que la base a enregistré, pour vérifier après coup sans rouvrir la fiche. */
function QuestionnaireManquant({ contact }: { contact: Contact }) {
  const { donnee: lien } = useCharger(() => crm.lienQuestionnaire(), 'lien-questionnaire');
  const message = useMessageQuestionnaire(contact, lien);
  const [ouvert, setOuvert] = useState(false);
  return (
    <View style={[styles.encart, { marginBottom: espace(4) }]}>
      <Text style={styles.encartTitre}>{contact.prenom || 'Ce contact'} n’a pas encore rempli le questionnaire</Text>
      <Text style={styles.aide}>Ses réponses préparent le briefing de la séance (objectif, profil sportif, points d’attention).</Text>
      <Text style={styles.aide}>
        Sans réponses, tu peux quand même faire le compte rendu : dans Entretien, dicte ce que tu sais (objectif, antécédents, freins…) et
        l’application le range dans les bonnes rubriques.
      </Text>
      {!ouvert && message && (
        <View style={{ alignSelf: 'flex-start' }}>
          <BoutonEtape libelle="Envoyer le questionnaire" onPress={() => setOuvert(true)} />
        </View>
      )}
      {ouvert && message && <EnvoiMessage contact={contact} sujet="Ton questionnaire" message={message} />}
    </View>
  );
}

function ResumeLecture({ booster }: { booster: Booster }) {
  return (
    <Text style={styles.aide}>
      Enregistré : {statutBooster(booster)} ·{' '}
      {new Date(booster.date).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
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
function Tests({
  evaluation: e,
  golfPrecedent,
  exercicesAvant,
  onChange,
}: {
  evaluation: Evaluation;
  golfPrecedent?: GolfPrecedent;
  exercicesAvant?: ExercicesAvant;
  onChange: (e: Evaluation) => void;
}) {
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
        ...(t.id === 'poussee' || t.id === 'tirage' || t.id === 'jambes' || t.id === 'core'
          ? [
              <Cellule key={`${t.id}-exercices`} pleine>
                <ExercicesTest categorie={t.id} exercices={e.exercices} avant={exercicesAvant} onChange={(exercices) => onChange({ ...e, exercices })} />
              </Cellule>,
            ]
          : []),
        ...(t.id === 'mobilite' || t.id === 'posture'
          ? [
              <Cellule key={`${t.id}-video`} pleine>
                <MesuresVideoTest test={t.id} libelle={t.libelle} mesures={test(t.id).mesures ?? []} onChange={(mesures) => majTest(t.id, { mesures })} />
              </Cellule>,
            ]
          : []),
      ])}
      <Cellule pleine>
        <ExercicesTest categorie="libre" exercices={e.exercices} avant={exercicesAvant} onChange={(exercices) => onChange({ ...e, exercices })} />
      </Cellule>
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
        <Saisie libelle="Observations tests" long dictee valeur={e.notes ?? ''} onChange={(notes) => onChange({ ...e, notes })} />
      </Cellule>
      <TestsGolf golf={e.golf} precedent={golfPrecedent} onChange={(golf) => onChange({ ...e, golf })} />
    </Grille>
  );
}

const styles = StyleSheet.create({
  encart: { backgroundColor: couleurs.orangeClair, borderRadius: 12, padding: 14, gap: espace(2) },
  encartTitre: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte },
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
  vente: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.vert },
});
