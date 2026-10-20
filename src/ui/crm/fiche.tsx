import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import {
  ajouterJours,
  formaterTelephone,
  jourLocal,
  lireDateHeure,
  MODELES,
  normaliserTelephone,
  type Booster,
  type FicheContact,
  type ModeleMessage,
} from '@/domain/crm';
import { preparerSeance } from '@/domain/briefing';
import { ENTRETIEN } from '@/domain/evaluation';
import { reponsesParSection } from '@/domain/questionnaire';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { AccesAppli } from './acces';
import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte, Titre } from '../composants';
import { couleurs, espace, polices } from '../theme';
import {
  adresseQuestionnaire,
  BoutonsEnvoi,
  CarteRelance,
  dateCourte,
  dateHeure,
  jourLisible,
  nomComplet,
  PastilleStatut,
  TitreSection,
} from './commun';

/** Tout ce que le coach sait d'un contact, et la prochaine étape à portée de main. */
export function FicheContactVue({ id, onVoirClient }: { id: string; onVoirClient: (clientId: string, prenom: string) => void }) {
  const { donnee, erreur, recharger } = useCharger(
    async () => ({ fiche: await crm.fiche(id), lien: await crm.lienQuestionnaire() }),
    id,
  );
  useRechargerSur(recharger, ecouterCrm);
  const [erreurAction, setErreurAction] = useState<string>();

  if (erreur) return <Erreur message={erreur} />;
  if (!donnee) return <Chargement />;
  const { fiche, lien } = donnee;
  const { contact, boosters, relances, questionnaires } = fiche;
  const prevu = boosters.find((b) => b.statut === 'prevu');
  const faits = boosters.filter((b) => b.statut === 'fait');
  const ouvertes = relances.filter((r) => !r.faiteLe);
  const faites = relances.filter((r) => r.faiteLe && !r.auto);
  const alertes = questionnaires.flatMap((q) => q.alertes);

  /** Toutes les actions passent par ici : une erreur s'affiche au lieu d'être perdue. */
  async function agir(action: () => Promise<void>) {
    setErreurAction(undefined);
    try {
      await action();
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : 'Action impossible');
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <View style={{ gap: espace(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), flexWrap: 'wrap' }}>
          <Titre>{nomComplet(contact)}</Titre>
          <PastilleStatut statut={contact.statut} />
        </View>
        <Texte doux style={{ fontSize: 14 }}>
          Ajouté le {dateCourte(contact.creeLe)}
          {contact.source ? ` · via ${contact.source}` : ''}
        </Texte>
      </View>
      {erreurAction && <Erreur message={erreurAction} />}

      {alertes.length > 0 && (
        <View style={{ backgroundColor: couleurs.orangeClair, borderRadius: 12, padding: espace(3), gap: espace(1) }}>
          <Text style={{ fontFamily: polices.texteGras, color: couleurs.orange }}>À vérifier</Text>
          {alertes.map((a) => (
            <Texte key={a} style={{ fontSize: 14 }}>
              {a}
            </Texte>
          ))}
        </View>
      )}

      <Coordonnees fiche={fiche} agir={agir} />

      <TitreSection>Prochaine étape</TitreSection>
      <ProchaineEtape fiche={fiche} prevu={prevu} agir={agir} onVoirClient={onVoirClient} />
      {contact.statut === 'client' && contact.clientId && <AccesAppli contact={contact} />}

      {questionnaires[0] && <PreparationSeance reponses={questionnaires[0].reponses} />}

      <TitreSection compte={ouvertes.length}>Relances</TitreSection>
      {ouvertes.map((r) => (
        <CarteRelance
          key={r.id}
          relance={r}
          contact={contact}
          enRetard={r.echeance < jourLocal(new Date())}
          lienQuestionnaire={lien ? adresseQuestionnaire(lien) : undefined}
          booster={prevu?.date}
          onFaite={() => agir(() => crm.terminerRelance(r.id))}
          onReporter={() => agir(() => crm.reporterRelance(r.id, ajouterJours(jourLocal(new Date()), 1)))}
        />
      ))}
      {ouvertes.length === 0 && <Texte doux>Aucune relance prévue.</Texte>}
      {contact.statut !== 'archive' && <NouvelleRelance contactId={contact.id} agir={agir} />}
      {faites.length > 0 && (
        <Texte doux style={{ fontSize: 13 }}>
          Déjà faites : {faites.map((r) => `${MODELES[r.modele].libelle.toLowerCase()} (${dateCourte(r.faiteLe!)})`).join(', ')}
        </Texte>
      )}

      {faits.map((b) => (
        <CompteRenduBooster key={b.id} booster={b} />
      ))}

      {questionnaires.map((q) => (
        <View key={q.id} style={{ gap: espace(3) }}>
          <TitreSection>{`Questionnaire reçu le ${dateCourte(q.recuLe)}`}</TitreSection>
          {reponsesParSection(q.reponses, ['prenom', 'nom', 'telephone', 'email']).map((s) => (
            <Carte key={s.titre}>
              <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.noir }}>{s.titre}</Text>
              {s.lignes.map((l, i) => (
                <View key={l.id} style={{ gap: 2 }}>
                  {l.rubrique && l.rubrique !== s.lignes[i - 1]?.rubrique && (
                    <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: couleurs.rouge, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {l.rubrique}
                    </Text>
                  )}
                  <Texte doux style={{ fontSize: 13 }}>{l.libelle}</Texte>
                  <Texte style={{ fontSize: 15 }}>{l.valeur}</Texte>
                </View>
              ))}
            </Carte>
          ))}
        </View>
      ))}
      {questionnaires.length === 0 && contact.statut !== 'client' && (
        <Texte doux style={{ fontSize: 14 }}>Pas encore de questionnaire reçu.</Texte>
      )}

      <Notes fiche={fiche} agir={agir} />

      <Archivage fiche={fiche} agir={agir} />
    </View>
  );
}

type Agir = (action: () => Promise<void>) => Promise<void>;

function Coordonnees({ fiche, agir }: { fiche: FicheContact; agir: Agir }) {
  const { contact } = fiche;
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState({ prenom: '', nom: '', telephone: '', email: '', dateNaissance: '' });

  if (edition) {
    const telInvalide = saisie.telephone.trim() !== '' && !normaliserTelephone(saisie.telephone);
    return (
      <Carte>
        <ChampTexte libelle="Prénom" valeur={saisie.prenom} onChange={(prenom) => setSaisie({ ...saisie, prenom })} />
        <ChampTexte libelle="Nom" valeur={saisie.nom} onChange={(nom) => setSaisie({ ...saisie, nom })} />
        <ChampTexte
          libelle="Téléphone"
          type="telephone"
          valeur={saisie.telephone}
          onChange={(telephone) => setSaisie({ ...saisie, telephone })}
          erreur={telInvalide ? 'Numéro non reconnu' : undefined}
        />
        <ChampTexte libelle="E-mail" type="email" valeur={saisie.email} onChange={(email) => setSaisie({ ...saisie, email })} />
        <ChampTexte
          libelle="Date de naissance"
          valeur={saisie.dateNaissance}
          placeholder="jj/mm/aaaa"
          onChange={(dateNaissance) => setSaisie({ ...saisie, dateNaissance })}
        />
        <Bouton
          libelle="Enregistrer"
          desactive={telInvalide}
          onPress={() =>
            agir(async () => {
              await crm.modifierContact(contact.id, { ...saisie, dateNaissance: saisie.dateNaissance.trim() || undefined });
              setEdition(false);
            })
          }
        />
        <Bouton variante="discret" libelle="Annuler" onPress={() => setEdition(false)} />
      </Carte>
    );
  }

  return (
    <Carte>
      {contact.telephone && <Texte>{formaterTelephone(contact.telephone)}</Texte>}
      {contact.email && <Texte>{contact.email}</Texte>}
      {contact.dateNaissance && <Texte doux style={{ fontSize: 14 }}>Né(e) le {contact.dateNaissance}</Texte>}
      {!contact.telephone && !contact.email && <Texte doux>Pas encore de coordonnées.</Texte>}
      <BoutonsEnvoi contact={contact} message={`Bonjour ${contact.prenom}, `} />
      <Bouton
        variante="discret"
        libelle="Modifier les coordonnées"
        onPress={() => {
          setSaisie({
            prenom: contact.prenom,
            nom: contact.nom,
            telephone: formaterTelephone(contact.telephone),
            email: contact.email ?? '',
            dateNaissance: contact.dateNaissance ?? '',
          });
          setEdition(true);
        }}
      />
    </Carte>
  );
}

function ProchaineEtape({
  fiche,
  prevu,
  agir,
  onVoirClient,
}: {
  fiche: FicheContact;
  prevu?: Booster;
  agir: Agir;
  onVoirClient: (clientId: string, prenom: string) => void;
}) {
  const { contact } = fiche;
  const [autreBooster, setAutreBooster] = useState(false);

  if (contact.statut === 'archive') {
    return (
      <Carte>
        <Texte>Ce contact est archivé : il n’apparaît plus dans les relances.</Texte>
        <Bouton libelle="Réactiver" onPress={() => agir(() => crm.reactiver(contact.id))} />
      </Carte>
    );
  }
  if (contact.statut === 'client' && contact.clientId) {
    return (
      <Carte>
        <Texte>{contact.prenom} est client : ses séances et son suivi sont dans l’onglet Clients.</Texte>
        <Bouton variante="secondaire" libelle="Voir son suivi" onPress={() => onVoirClient(contact.clientId!, contact.prenom)} />
      </Carte>
    );
  }
  if (prevu) {
    return (
      <Carte>
        <SousTitre>{`Booster ${dateHeure(prevu.date)}`}</SousTitre>
        <Bouton libelle="Ouvrir la séance Booster" onPress={() => ouvrirSeance(prevu)} />
        <Bouton variante="discret" libelle="Annuler ce Booster" onPress={() => agir(() => crm.annulerBooster(prevu.id))} />
      </Carte>
    );
  }
  if (contact.statut === 'booster_fait' && !autreBooster) {
    return (
      <Carte>
        <Texte>Le Booster est fait. Si {contact.prenom} continue, ouvre son espace client pour lui préparer ses séances.</Texte>
        <Bouton libelle="Passer en client" onPress={() => agir(() => crm.devenirClient(contact.id))} />
        <Bouton variante="discret" libelle="Planifier un autre Booster" onPress={() => setAutreBooster(true)} />
      </Carte>
    );
  }
  return <PlanifierBooster onValider={(date) => agir(() => crm.planifierBooster(contact.id, date))} />;
}

function PlanifierBooster({ onValider }: { onValider: (dateIso: string) => void }) {
  const [texte, setTexte] = useState('');
  const date = lireDateHeure(texte, new Date());
  const rapides = [1, 2, 3].map((j) => {
    const d = new Date();
    d.setDate(d.getDate() + j);
    return { libelle: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }), texte: `${d.getDate()}/${d.getMonth() + 1} 18:00` };
  });
  return (
    <Carte>
      <SousTitre>Planifier la séance Booster</SousTitre>
      <Puces>
        {rapides.map((r) => (
          <Puce key={r.texte} libelle={`${r.libelle} 18 h`} actif={texte === r.texte} onPress={() => setTexte(r.texte)} />
        ))}
      </Puces>
      <ChampTexte
        libelle="Date et heure"
        valeur={texte}
        onChange={setTexte}
        placeholder="24/10 18:30"
        erreur={texte && !date ? 'Écris la date comme 24/10 18:30' : undefined}
        aide={date ? dateHeure(date) : undefined}
      />
      <Bouton libelle="Planifier" desactive={!date} onPress={() => date && onValider(date)} />
    </Carte>
  );
}

const ouvrirSeance = (b: Booster) => router.push({ pathname: '/coach/booster/[id]', params: { id: b.id, contact: b.contactId } });

function CompteRenduBooster({ booster }: { booster: Booster }) {
  return (
    <View style={{ gap: espace(3) }}>
      <TitreSection>{`Booster du ${dateCourte(booster.date)}`}</TitreSection>
      <Carte>
        {booster.priorites.length > 0 && (
          <View style={{ gap: espace(1) }}>
            <Texte doux style={{ fontSize: 13 }}>Les 3 priorités</Texte>
            {booster.priorites.map((p, i) => (
              <Texte key={i} style={{ fontSize: 15 }}>
                {i + 1}. {p}
              </Texte>
            ))}
          </View>
        )}
        {booster.tests && (
          <View style={{ gap: 2 }}>
            <Texte doux style={{ fontSize: 13 }}>Évaluation physique</Texte>
            <Texte style={{ fontSize: 14, lineHeight: 21 }}>{booster.tests}</Texte>
          </View>
        )}
        {ENTRETIEN.filter((q) => booster.entretien?.[q.id]?.trim()).map((q) => (
          <View key={q.id} style={{ gap: 2 }}>
            <Texte doux style={{ fontSize: 13 }}>{q.libelle}</Texte>
            <Texte style={{ fontSize: 15 }}>{booster.entretien![q.id]}</Texte>
          </View>
        ))}
        {booster.compteRendu && (
          <View style={{ gap: 2 }}>
            <Texte doux style={{ fontSize: 13 }}>Mot du coach (compte rendu)</Texte>
            <Texte style={{ fontSize: 15 }}>{booster.compteRendu}</Texte>
          </View>
        )}
        <Texte doux style={{ fontSize: 13 }}>{booster.paye ? 'Séance payée' : 'Paiement non noté'}</Texte>
        <Bouton
          libelle={booster.planEnvoyeLe ? `Compte rendu envoyé le ${dateCourte(booster.planEnvoyeLe)}` : 'Voir le compte rendu'}
          variante={booster.planEnvoyeLe ? 'secondaire' : 'primaire'}
          onPress={() => router.push({ pathname: '/coach/compte-rendu/[id]', params: { id: booster.id, contact: booster.contactId } })}
        />
        <Bouton variante="discret" libelle="Compléter la séance" onPress={() => ouvrirSeance(booster)} />
      </Carte>
    </View>
  );
}

const DELAIS = [
  { libelle: 'Aujourd’hui', jours: 0 },
  { libelle: 'Demain', jours: 1 },
  { libelle: 'Dans 3 jours', jours: 3 },
  { libelle: 'Dans 1 semaine', jours: 7 },
];

function NouvelleRelance({ contactId, agir }: { contactId: string; agir: Agir }) {
  const [ouvert, setOuvert] = useState(false);
  const [modele, setModele] = useState<ModeleMessage>('libre');
  const [jours, setJours] = useState(3);
  const [note, setNote] = useState('');
  if (!ouvert) return <Bouton variante="discret" libelle="+ Programmer une relance" onPress={() => setOuvert(true)} />;
  const echeance = ajouterJours(jourLocal(new Date()), jours);
  return (
    <Carte>
      <SousTitre>Nouvelle relance</SousTitre>
      <Puces>
        {(Object.keys(MODELES) as ModeleMessage[]).map((m) => (
          <Puce key={m} libelle={MODELES[m].libelle} actif={modele === m} onPress={() => setModele(m)} />
        ))}
      </Puces>
      <Puces>
        {DELAIS.map((d) => (
          <Puce key={d.jours} libelle={d.libelle} actif={jours === d.jours} onPress={() => setJours(d.jours)} />
        ))}
      </Puces>
      <ChampTexte libelle="Note pour toi (facultatif)" valeur={note} onChange={setNote} placeholder="Ex. rappeler après ses vacances" />
      <Bouton
        libelle={`Programmer pour ${jourLisible(echeance)}`}
        onPress={() =>
          agir(async () => {
            await crm.ajouterRelance(contactId, echeance, modele, note);
            setOuvert(false);
            setNote('');
          })
        }
      />
      <Bouton variante="discret" libelle="Annuler" onPress={() => setOuvert(false)} />
    </Carte>
  );
}

function Notes({ fiche, agir }: { fiche: FicheContact; agir: Agir }) {
  const [texte, setTexte] = useState(fiche.contact.notes ?? '');
  const modifie = texte !== (fiche.contact.notes ?? '');
  return (
    <View style={{ gap: espace(3) }}>
      <TitreSection>Notes</TitreSection>
      <ChampTexte libelle="Visible par toi seul" multiligne valeur={texte} onChange={setTexte} />
      {modifie && <Bouton variante="secondaire" libelle="Enregistrer la note" onPress={() => agir(() => crm.modifierContact(fiche.contact.id, { notes: texte }))} />}
    </View>
  );
}

function Archivage({ fiche, agir }: { fiche: FicheContact; agir: Agir }) {
  const [confirmer, setConfirmer] = useState(false);
  if (fiche.contact.statut === 'archive') return null;
  if (!confirmer) return <Bouton variante="discret" libelle="Archiver ce contact" onPress={() => setConfirmer(true)} />;
  return (
    <Carte style={{ borderColor: couleurs.rouge }}>
      <Texte>
        Archiver {fiche.contact.prenom} ? Ses relances s’arrêtent et sa fiche quitte la liste. Rien n’est effacé : tu pourras le
        réactiver.
      </Texte>
      <Bouton libelle="Oui, archiver" onPress={() => agir(() => crm.archiver(fiche.contact.id))} />
      <Bouton variante="discret" libelle="Annuler" onPress={() => setConfirmer(false)} />
    </Carte>
  );
}

/** Le résumé du bilan à relire avant la séance : santé d'abord, puis objectif, profil, leviers et motivation. */
function PreparationSeance({ reponses }: { reponses: Record<string, string> }) {
  const b = preparerSeance(reponses);
  const blocs: { titre: string; lignes: string[] }[] = [
    { titre: 'Objectif', lignes: b.objectif },
    { titre: 'Profil sportif', lignes: b.profil },
    { titre: 'Leviers à travailler', lignes: b.leviers },
    { titre: 'Motivation et attentes', lignes: b.motivation },
  ];
  return (
    <>
      <TitreSection>Préparer la séance</TitreSection>
      <Carte>
        {b.sante.length > 0 ? (
          <View style={{ backgroundColor: couleurs.rougeClair, borderRadius: 10, padding: espace(3), gap: espace(1) }}>
            <Text style={{ fontFamily: polices.texteGras, color: couleurs.rouge }}>Santé : à vérifier avant les tests</Text>
            {b.sante.map((l) => (
              <Texte key={l} style={{ fontSize: 14 }}>{l}</Texte>
            ))}
          </View>
        ) : (
          <Texte doux style={{ fontSize: 14 }}>Aucune douleur ni contre-indication déclarée.</Texte>
        )}
        {blocs
          .filter((x) => x.lignes.length > 0)
          .map((x) => (
            <View key={x.titre} style={{ gap: 2 }}>
              <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.noir }}>{x.titre}</Text>
              {x.lignes.map((l) => (
                <Texte key={l} style={{ fontSize: 14 }}>{`• ${l}`}</Texte>
              ))}
            </View>
          ))}
        {b.leviers.length === 0 && <Texte doux style={{ fontSize: 14 }}>Aucune habitude ne ressort comme point faible.</Texte>}
      </Carte>
    </>
  );
}
