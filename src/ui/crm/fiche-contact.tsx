// C03 — Fiche Contact reprise de RecordEditor (table Contacts) et ContactBoosters.tsx :
// modale `max-w-3xl`, initiales + coordonnées + statut, rubriques Coordonnées / Boosters / Nutrition / Photos,
// grille deux colonnes, pied collant (état du dossier, Fermer, Enregistrer).
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { useSession } from '@/data/session';
import {
  formaterTelephone,
  normaliserEmail,
  normaliserTelephone,
  OBJECTIFS,
  OFFRES_VENDUES,
  ORIGINES,
  PROCHAINES_ACTIONS,
  statutBooster,
  statutContact,
  STATUTS_CONTACT,
  type Booster,
  type Contact,
  type Doublon,
  type FicheContact as Fiche,
  type SaisieContactFiche,
  type StatutContact,
} from '@/domain/crm';
import { ENTRETIEN, TESTS } from '@/domain/evaluation';
import { reponsesParSection } from '@/domain/questionnaire';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { NutritionDuClient } from '../alimentation/nutrition-coach';
import { BoutonContour, SousNav, type OngletDef } from '../coque';
import { AccesAppli } from './acces';
import { Photos } from '../suivi/photos';
import { Chargement, Erreur } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { nomComplet } from './commun';
import { Cellule, Choix, Grille, Initiales, Modale, PiedEditeur, Repliable, Saisie, Valeur } from './dossier';

export type VoletFiche = 'fiche' | 'boosters' | 'nutrition' | 'photos';
const VOLETS: OngletDef<VoletFiche>[] = [
  { cle: 'fiche', libelle: 'Coordonnées' },
  { cle: 'boosters', libelle: 'Boosters' },
  { cle: 'nutrition', libelle: 'Nutrition' },
  { cle: 'photos', libelle: 'Photos' },
];

type Brouillon = Record<keyof Required<SaisieContactFiche>, string>;
const CLES: (keyof Brouillon)[] = [
  'nom',
  'prenom',
  'telephone',
  'email',
  'statutCrm',
  'objectifPrincipal',
  'prochaineAction',
  'notes',
  'source',
  'offreVendue',
  'dateNaissance',
];

function brouillonDe(c?: Contact): Brouillon {
  return {
    nom: c?.nom ?? '',
    prenom: c?.prenom ?? '',
    telephone: formaterTelephone(c?.telephone),
    email: c?.email ?? '',
    statutCrm: c ? statutContact(c) : 'Nouveau Prospect',
    objectifPrincipal: c?.objectifPrincipal ?? '',
    prochaineAction: c?.prochaineAction ?? '',
    notes: c?.notes ?? '',
    source: c?.source ?? '',
    offreVendue: c?.offreVendue ?? '',
    dateNaissance: c?.dateNaissance ?? '',
  };
}

export function FicheContactModale({
  id,
  volet,
  onVolet,
  onFermer,
  onOuvrirAutre,
  onBooster,
  onNouveauBooster,
  onSupprimerBooster,
}: {
  /** Absent : création d'un contact. */
  id?: string;
  volet: VoletFiche;
  onVolet: (v: VoletFiche) => void;
  onFermer: () => void;
  /** Doublon trouvé à la création : ouvrir la fiche existante au lieu d'en créer une seconde. */
  onOuvrirAutre: (id: string) => void;
  onBooster: (b: Booster) => void;
  onNouveauBooster: (contactId: string) => void;
  onSupprimerBooster: (b: Booster, contact: Contact) => void;
}) {
  const charge = useCharger(() => (id ? crm.fiche(id) : Promise.resolve(null)), `fiche-${id ?? 'nouveau'}`);
  useRechargerSur(charge.recharger, ecouterCrm);
  const fiche = charge.donnee;

  if (id && !fiche)
    return (
      <Modale titre="Fiche client" onFermer={onFermer}>
        {charge.erreur ? <Erreur message={charge.erreur} onReessayer={charge.recharger} /> : <Chargement />}
      </Modale>
    );
  return (
    <Editeur
      key={fiche ? `${fiche.contact.id}` : 'nouveau'}
      fiche={fiche ?? undefined}
      volet={id ? volet : 'fiche'}
      onVolet={onVolet}
      onFermer={onFermer}
      onOuvrirAutre={onOuvrirAutre}
      onBooster={onBooster}
      onNouveauBooster={onNouveauBooster}
      onSupprimerBooster={onSupprimerBooster}
    />
  );
}

function Editeur({
  fiche,
  volet,
  onVolet,
  onFermer,
  onOuvrirAutre,
  onBooster,
  onNouveauBooster,
  onSupprimerBooster,
}: {
  fiche?: Fiche;
  volet: VoletFiche;
  onVolet: (v: VoletFiche) => void;
  onFermer: () => void;
  onOuvrirAutre: (id: string) => void;
  onBooster: (b: Booster) => void;
  onNouveauBooster: (contactId: string) => void;
  onSupprimerBooster: (b: Booster, contact: Contact) => void;
}) {
  const contact = fiche?.contact;
  const [initial, setInitial] = useState(() => brouillonDe(contact));
  const [brouillon, setBrouillon] = useState(initial);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [doublon, setDoublon] = useState<Doublon>();
  const [sortie, setSortie] = useState<(() => void) | null>(null);
  const modifies = CLES.filter((k) => brouillon[k] !== initial[k]);
  const modifie = modifies.length > 0;
  const demanderSortie = (suite: () => void) => (modifie ? setSortie(() => suite) : suite());
  const set = (k: keyof Brouillon) => (v: string | undefined) => setBrouillon((b) => ({ ...b, [k]: v ?? '' }));

  const telInvalide = !!brouillon.telephone.trim() && !normaliserTelephone(brouillon.telephone);
  const emailInvalide = !!brouillon.email.trim() && !normaliserEmail(brouillon.email);
  const coordonneeManquante = !normaliserTelephone(brouillon.telephone) && !normaliserEmail(brouillon.email);
  const peutEnregistrer =
    volet === 'fiche' && !occupe && !telInvalide && !emailInvalide && !coordonneeManquante && !!brouillon.prenom.trim() && (!contact || modifie);

  async function enregistrer() {
    setOccupe(true);
    setErreur(undefined);
    setDoublon(undefined);
    try {
      if (!contact) {
        const r = await crm.creerContact({
          ...versSaisie(brouillon, CLES, undefined),
          prenom: brouillon.prenom,
        });
        if ('doublon' in r) {
          setDoublon(r.doublon);
          return;
        }
        onFermer();
        return;
      }
      await crm.modifierContact(contact.id, versSaisie(brouillon, modifies, contact));
      // Relu depuis la base par l'écouteur : le pied repasse à « Dossier à jour ».
      setInitial(brouillon);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
    } finally {
      setOccupe(false);
    }
  }

  const titre = contact ? nomComplet(contact) : 'Créer · Contacts';
  return (
    <Modale
      titre={titre}
      onFermer={() => demanderSortie(onFermer)}
      enTete={
        contact && (
          <>
            <View style={styles.identite}>
              <Initiales prenom={contact.prenom} nom={contact.nom} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text style={styles.coordonnees}>
                  {contact.email || 'Email à compléter'}
                  {contact.telephone ? ` · ${formaterTelephone(contact.telephone)}` : ''}
                </Text>
                <Text style={styles.statut}>
                  {statutContact(contact)}
                  {contact.statut === 'archive' ? ' · Archivé' : ''}
                </Text>
              </View>
            </View>
            <SousNav
              nom="Rubriques de la fiche client"
              onglets={VOLETS}
              valeur={volet}
              onChange={(v) =>
                v !== volet &&
                demanderSortie(() => {
                  setBrouillon(initial);
                  onVolet(v);
                })
              }
            />
          </>
        )
      }
      pied={
        <View style={{ gap: espace(3) }}>
          {doublon && (
            <View style={styles.alerte}>
              <Text style={styles.alerteTexte}>
                {doublon.par === 'telephone' ? 'Ce numéro' : 'Cet e-mail'} est déjà celui de {nomComplet(doublon.contact)}
                {doublon.contact.statut === 'archive' ? ' (dossier archivé)' : ''}. Aucune nouvelle fiche n’a été créée.
              </Text>
              <BoutonContour
                libelle={`Ouvrir la fiche de ${doublon.contact.prenom || 'ce contact'}`}
                onPress={() => onOuvrirAutre(doublon.contact.id)}
              />
            </View>
          )}
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          <PiedEditeur
            modifie={modifie}
            enregistrement={occupe}
            peutEnregistrer={peutEnregistrer}
            onEnregistrer={enregistrer}
            onFermer={() => (sortie ? sortie() : demanderSortie(onFermer))}
            sortieDemandee={!!sortie}
            onRester={() => setSortie(null)}
          />
        </View>
      }
    >
      {volet === 'fiche' && (
        <Coordonnees
          brouillon={brouillon}
          set={set}
          telInvalide={telInvalide}
          emailInvalide={emailInvalide}
          coordonneeManquante={coordonneeManquante && (!!contact || modifie)}
        />
      )}
      {/* Le compte du client pour se connecter à l'appli : e-mail et mot de passe provisoire à lui envoyer. */}
      {volet === 'fiche' && contact && (
        <View style={{ marginTop: espace(4) }}>
          <AccesAppli contact={contact} />
        </View>
      )}
      {volet === 'boosters' && fiche && (
        <BoostersDuContact
          fiche={fiche}
          onBooster={onBooster}
          onNouveau={() => onNouveauBooster(fiche.contact.id)}
          onSupprimer={(b) => onSupprimerBooster(b, fiche.contact)}
        />
      )}
      {volet === 'nutrition' && contact && <NutritionContact contact={contact} />}
      {volet === 'photos' && (
        <View style={{ marginVertical: espace(4), borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: espace(4) }}>
          {contact?.clientId ? (
            <Photos key={contact.clientId} clientId={contact.clientId} proprietaire={false} />
          ) : (
            <Text style={styles.aide}>Photos : aucun espace client rattaché à ce contact.</Text>
          )}
        </View>
      )}
    </Modale>
  );
}

/** Seuls les champs modifiés partent ; le statut égal à l'étape du parcours redevient automatique. */
function versSaisie(b: Brouillon, cles: (keyof Brouillon)[], contact: Contact | undefined): SaisieContactFiche {
  const saisie: SaisieContactFiche = {};
  for (const k of cles) {
    if (k === 'statutCrm') {
      const etape = contact ? statutContact({ ...contact, statutCrm: undefined }) : 'Nouveau Prospect';
      saisie.statutCrm = b.statutCrm && b.statutCrm !== etape ? (b.statutCrm as StatutContact) : undefined;
    } else saisie[k] = b[k];
  }
  return saisie;
}

function Coordonnees({
  brouillon: b,
  set,
  telInvalide,
  emailInvalide,
  coordonneeManquante,
}: {
  brouillon: Brouillon;
  set: (k: keyof Brouillon) => (v: string | undefined) => void;
  telInvalide: boolean;
  emailInvalide: boolean;
  coordonneeManquante: boolean;
}) {
  return (
    <Grille>
      <Cellule>
        <Saisie libelle="Nom" valeur={b.nom} onChange={set('nom')} />
      </Cellule>
      <Cellule>
        <Saisie libelle="Prénom" valeur={b.prenom} onChange={set('prenom')} erreur={!b.prenom.trim() ? 'Le prénom est nécessaire.' : undefined} />
      </Cellule>
      <Cellule>
        <Saisie
          libelle="Téléphone"
          type="telephone"
          valeur={b.telephone}
          onChange={set('telephone')}
          placeholder="06 12 34 56 78"
          erreur={telInvalide ? 'Numéro non reconnu' : coordonneeManquante ? 'Un téléphone ou un e-mail suffit.' : undefined}
        />
      </Cellule>
      <Cellule>
        <Saisie libelle="Email" type="email" valeur={b.email} onChange={set('email')} erreur={emailInvalide ? 'Adresse non reconnue' : undefined} />
      </Cellule>
      <Cellule>
        <Choix libelle="Statut" choix={STATUTS_CONTACT} vide={null} valeur={b.statutCrm} onChange={set('statutCrm')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Objectif principal" choix={OBJECTIFS} valeur={b.objectifPrincipal || undefined} onChange={set('objectifPrincipal')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Prochaine action" choix={PROCHAINES_ACTIONS} valeur={b.prochaineAction || undefined} onChange={set('prochaineAction')} />
      </Cellule>
      <Cellule pleine>
        <Saisie libelle="Notes" long valeur={b.notes} onChange={set('notes')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Origine" choix={ORIGINES} valeur={b.source || undefined} onChange={set('source')} />
      </Cellule>
      <Cellule>
        <Choix libelle="Offre Vendue" choix={OFFRES_VENDUES} valeur={b.offreVendue || undefined} onChange={set('offreVendue')} />
      </Cellule>
      <Cellule>
        <Saisie libelle="Date de naissance" valeur={b.dateNaissance} onChange={set('dateNaissance')} placeholder="jj/mm/aaaa" />
      </Cellule>
    </Grille>
  );
}

const dateBooster = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const jour = (j: string | undefined) =>
  j
    ? new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : undefined;

function BoostersDuContact({
  fiche,
  onBooster,
  onNouveau,
  onSupprimer,
}: {
  fiche: Fiche;
  onBooster: (b: Booster) => void;
  onNouveau: () => void;
  onSupprimer: (b: Booster) => void;
}) {
  const { boosters, questionnaires } = fiche;
  return (
    <View style={styles.encadre}>
      <Text style={styles.encadreTitre}>Questionnaire et Boosters</Text>
      <Text style={styles.aide}>
        Retrouvez ici les informations enregistrées dans les Boosters de ce client : briefing issu du questionnaire, entretien, tests et conclusion.
      </Text>
      {questionnaires.map((q) => (
        <View key={q.id} style={styles.bloc}>
          <Repliable
            resume={`Questionnaire reçu le ${new Date(q.recuLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          >
            <View style={{ gap: espace(4) }}>
              {q.alertes.map((a) => (
                <Text key={a} style={[styles.alerteTexte, styles.alerte]}>
                  {a}
                </Text>
              ))}
              {reponsesParSection(q.reponses, ['prenom', 'nom', 'telephone', 'email']).map((s) => (
                <View key={s.titre} style={{ gap: espace(2) }}>
                  <Text style={styles.section}>{s.titre}</Text>
                  {s.lignes.map((l) => (
                    <Valeur key={l.id} libelle={l.libelle} valeur={l.valeur} />
                  ))}
                </View>
              ))}
            </View>
          </Repliable>
        </View>
      ))}
      {!boosters.length && (
        <Text style={styles.aide}>Aucun Booster lié à ce contact. Après réception du questionnaire, actualisez les dossiers.</Text>
      )}
      {boosters.map((b, i) => (
        <View key={b.id} style={styles.bloc}>
          <Repliable ouvert={i === 0} resume={`${b.nom || 'Booster'} · ${dateBooster(b.date)} · ${statutBooster(b)}`}>
            <LectureBooster booster={b} />
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: espace(2),
                marginTop: espace(5),
              }}
            >
              <BoutonContour libelle="Modifier ce Booster" onPress={() => onBooster(b)} />
              {b.statut === 'fait' && (
                <BoutonContour
                  libelle="Voir le compte rendu"
                  onPress={() =>
                    router.push({
                      pathname: '/coach/compte-rendu/[id]',
                      params: { id: b.id, contact: b.contactId },
                    })
                  }
                />
              )}
              <Text accessibilityRole="button" onPress={() => onSupprimer(b)} style={styles.supprimer}>
                Supprimer ce Booster
              </Text>
            </View>
          </Repliable>
        </View>
      ))}
      <View style={{ alignSelf: 'flex-start' }}>
        <BoutonContour libelle="Planifier un Booster" onPress={onNouveau} />
      </View>
    </View>
  );
}

/** Lecture d'un Booster dans la fiche : quatre sections d'origine, « Non renseigné » pour l'absence. */
export function LectureBooster({ booster: b }: { booster: Booster }) {
  const e = b.evaluation;
  const sections: {
    titre: string;
    valeurs: { libelle: string; valeur?: string; long?: boolean }[];
  }[] = [
    {
      titre: 'Questionnaire et briefing',
      valeurs: [
        { libelle: 'Résumé IA', valeur: b.resumeIa, long: true },
        {
          libelle: 'Points d’attention',
          valeur: b.pointsAttention,
          long: true,
        },
      ],
    },
    {
      titre: 'Entretien',
      valeurs: ENTRETIEN.map((q) => ({
        libelle: q.libelle,
        valeur: b.entretien?.[q.id],
        long: true,
      })),
    },
    {
      titre: 'Tests physiques',
      valeurs: [
        ...TESTS.flatMap((t) => [
          { libelle: t.libelle, valeur: e?.tests[t.id]?.resultat },
          {
            libelle: `${t.libelle} — observations`,
            valeur: e?.tests[t.id]?.observations.join(' · '),
          },
          ...(t.rpe
            ? [
                {
                  libelle: `${t.libelle} — RPE /10`,
                  valeur: e?.tests[t.id]?.rpe ? String(e.tests[t.id]!.rpe) : undefined,
                },
              ]
            : []),
        ]),
        { libelle: 'Douleur pendant les tests', valeur: e?.douleur },
        { libelle: 'Douleur / gêne — précision', valeur: e?.douleurPrecision },
        { libelle: 'Observations tests', valeur: e?.notes, long: true },
      ],
    },
    {
      titre: 'Priorités et conclusion',
      valeurs: [
        ...[0, 1, 2].map((i) => ({
          libelle: `Priorité ${i + 1}`,
          valeur: b.priorites[i],
        })),
        { libelle: 'Offre recommandée', valeur: b.offreRecommandee },
        { libelle: 'Résultat commercial', valeur: b.resultatCommercial },
        { libelle: 'Date de relance', valeur: jour(b.dateRelance) },
        {
          libelle: 'Plan d’action envoyé',
          valeur: b.planEnvoyeLe ? 'Oui' : 'Non',
        },
        { libelle: 'Notes internes', valeur: b.notesInternes, long: true },
      ],
    },
  ];
  return (
    <View style={{ gap: espace(5) }}>
      {sections.map((s) => (
        <View key={s.titre} style={{ gap: espace(2) }}>
          <Text style={styles.section}>{s.titre}</Text>
          <Grille>
            {s.valeurs.map((v) => (
              <Cellule key={v.libelle} pleine={v.long}>
                <Valeur libelle={v.libelle} valeur={v.valeur} />
              </Cellule>
            ))}
          </Grille>
        </View>
      ))}
    </View>
  );
}

function NutritionContact({ contact }: { contact: Contact }) {
  const { profil } = useSession();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  if (!contact.clientId)
    return (
      <Text style={styles.aide}>
        {contact.prenom || 'Ce contact'} n’a pas encore d’espace client. Préparez l’accès client depuis « Actions du dossier » pour suivre sa
        nutrition.
      </Text>
    );
  return <NutritionDuClient clientId={contact.clientId} coachId={coachId} />;
}

const styles = StyleSheet.create({
  identite: { flexDirection: 'row', alignItems: 'center', gap: espace(3) },
  coordonnees: {
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texteDoux,
  },
  statut: {
    marginTop: 4,
    fontFamily: polices.texte,
    fontSize: 12,
    color: couleurs.rouge,
  },
  encadre: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 12,
    padding: 16,
    gap: espace(3),
  },
  encadreTitre: {
    fontFamily: polices.texteGras,
    fontSize: 16,
    color: couleurs.texte,
  },
  bloc: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 8,
    padding: 12,
  },
  section: {
    fontFamily: polices.texteGras,
    fontSize: 14,
    color: couleurs.rouge,
  },
  aide: {
    fontFamily: polices.texte,
    fontSize: 12,
    lineHeight: 18,
    color: couleurs.texteDoux,
  },
  supprimer: {
    minHeight: 44,
    paddingHorizontal: 12,
    textAlignVertical: 'center',
    lineHeight: 44,
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.rouge,
  },
  alerte: {
    backgroundColor: couleurs.orangeClair,
    borderRadius: 10,
    padding: espace(3),
    gap: espace(2),
  },
  alerteTexte: {
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texte,
  },
  erreur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
});
