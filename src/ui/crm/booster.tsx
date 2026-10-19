import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { preparerSeance } from '@/domain/briefing';
import type { Booster, Contact } from '@/domain/crm';
import {
  basculerObservation,
  choisirResultat,
  choisirRpe,
  ENTRETIEN,
  evaluationVide,
  syntheseEvaluation,
  testsRenseignes,
  TESTS,
  type DefinitionTest,
  type Evaluation,
} from '@/domain/evaluation';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte, Titre } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { dateHeure, nomComplet, TitreSection } from './commun';

/** La séance Booster côté coach : tests en quelques touches, entretien, priorités. Tout s'enregistre au fil de la saisie. */
export function SeanceBooster({
  contactId,
  boosterId,
  onFermer,
  onTermine,
}: {
  contactId: string;
  boosterId: string;
  onFermer: () => void;
  onTermine: () => void;
}) {
  const { donnee: fiche, erreur } = useCharger(() => crm.fiche(contactId), contactId);

  if (erreur) return <Erreur message={erreur} />;
  if (!fiche) return <Chargement />;
  const booster = fiche.boosters.find((b) => b.id === boosterId);
  if (!booster) return <Erreur message="Ce Booster n’existe plus." />;
  const sante = fiche.questionnaires[0] ? preparerSeance(fiche.questionnaires[0].reponses).sante : [];
  // La clé fige l'état initial sur ce Booster : les rechargements ne remplacent pas la saisie en cours.
  return <Saisie key={booster.id} booster={booster} contact={fiche.contact} sante={sante} onFermer={onFermer} onTermine={onTermine} />;
}

type Etat = 'enregistre' | 'en_cours' | 'erreur';

function Saisie({
  booster,
  contact,
  sante,
  onFermer,
  onTermine,
}: {
  booster: Booster;
  contact: Contact;
  sante: string[];
  onFermer: () => void;
  onTermine: () => void;
}) {
  const [evaluation, setEvaluation] = useState<Evaluation>(booster.evaluation ?? evaluationVide());
  const [entretien, setEntretien] = useState<Record<string, string>>(booster.entretien ?? {});
  const [priorites, setPriorites] = useState<string[]>([0, 1, 2].map((i) => booster.priorites[i] ?? ''));
  const [paye, setPaye] = useState(booster.paye ?? false);
  const [version, setVersion] = useState(0);
  const [etat, setEtat] = useState<Etat>('enregistre');
  const [fin, setFin] = useState(false);
  const attente = useRef<ReturnType<typeof setTimeout>>(undefined);
  const envoi = useRef<Promise<void>>(Promise.resolve());

  const changer = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVersion((n) => n + 1);
    setEtat('en_cours');
  };
  const majEvaluation = changer(setEvaluation);

  // Enregistrement automatique, un court instant après la dernière touche.
  useEffect(() => {
    if (version === 0) return;
    attente.current = setTimeout(() => {
      envoi.current = crm
        .enregistrerBooster(booster.id, { evaluation, entretien, priorites: priorites.map((p) => p.trim()).filter(Boolean), paye })
        .then(() => setEtat('enregistre'))
        .catch(() => setEtat('erreur'));
    }, 700);
    return () => clearTimeout(attente.current);
    // Seule la version déclenche l'enregistrement ; les valeurs lues sont celles de ce rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  async function terminer() {
    setFin(true);
    // Un enregistrement automatique encore en route ne doit pas repasser le Booster en « prévu » après la clôture.
    clearTimeout(attente.current);
    await envoi.current;
    try {
      await crm.terminerBooster(booster.id, { evaluation, entretien, priorites, paye });
      onTermine();
    } catch {
      setEtat('erreur');
      setFin(false);
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <View style={{ gap: espace(1) }}>
        <Titre>{nomComplet(contact)}</Titre>
        <Texte doux style={{ fontSize: 14 }}>
          {`Booster ${dateHeure(booster.date)} · `}
          <Text style={{ color: etat === 'erreur' ? couleurs.rouge : couleurs.texteDoux }}>
            {etat === 'en_cours' ? 'Enregistrement…' : etat === 'erreur' ? 'Pas enregistré, vérifie la connexion' : 'Enregistré'}
          </Text>
        </Texte>
      </View>

      {sante.length > 0 && (
        <View style={{ backgroundColor: couleurs.rougeClair, borderRadius: 12, padding: espace(3), gap: espace(1) }}>
          <Text style={{ fontFamily: polices.texteGras, color: couleurs.rouge }}>Déclaré dans le bilan</Text>
          {sante.map((l) => (
            <Texte key={l} style={{ fontSize: 14 }}>{l}</Texte>
          ))}
        </View>
      )}

      <TitreSection>{`Évaluation physique · ${testsRenseignes(evaluation)}/${TESTS.length}`}</TitreSection>
      {TESTS.map((t) => (
        <CarteTest key={t.id} test={t} evaluation={evaluation} onChange={majEvaluation} />
      ))}

      <Carte>
        <SousTitre>Douleur pendant les tests</SousTitre>
        <Puces>
          {(['Non', 'Oui'] as const).map((v) => (
            <Puce
              key={v}
              libelle={v}
              actif={evaluation.douleur === v}
              onPress={() => majEvaluation({ ...evaluation, douleur: evaluation.douleur === v ? undefined : v })}
            />
          ))}
        </Puces>
        {evaluation.douleur === 'Oui' && (
          <ChampTexte
            libelle="Précision courte"
            valeur={evaluation.douleurPrecision ?? ''}
            onChange={(v) => majEvaluation({ ...evaluation, douleurPrecision: v })}
            placeholder="Zone, mouvement concerné, gêne observée"
          />
        )}
        <ChampTexte
          libelle="Observations tests (facultatif)"
          multiligne
          valeur={evaluation.notes ?? ''}
          onChange={(v) => majEvaluation({ ...evaluation, notes: v })}
        />
      </Carte>

      <TitreSection>Entretien</TitreSection>
      <Carte>
        {ENTRETIEN.map((q) => (
          <ChampTexte
            key={q.id}
            libelle={q.libelle}
            multiligne
            valeur={entretien[q.id] ?? ''}
            onChange={(v) => changer(setEntretien)({ ...entretien, [q.id]: v })}
          />
        ))}
      </Carte>

      <TitreSection>Priorités</TitreSection>
      <Carte>
        {priorites.map((p, i) => (
          <ChampTexte
            key={i}
            libelle={`Priorité ${i + 1}`}
            valeur={p}
            onChange={(v) => changer(setPriorites)(priorites.map((x, j) => (j === i ? v : x)))}
          />
        ))}
        <Puces>
          <Puce libelle={paye ? '✓ Séance payée' : 'Séance payée ?'} actif={paye} onPress={() => changer(setPaye)(!paye)} />
        </Puces>
      </Carte>

      <TitreSection>Synthèse pour le compte rendu</TitreSection>
      <Carte>
        <Text selectable style={{ fontFamily: polices.texte, fontSize: 13, lineHeight: 20, color: couleurs.texte }}>
          {syntheseEvaluation(evaluation)}
        </Text>
      </Carte>

      {booster.statut === 'prevu' ? (
        <Bouton libelle="Terminer et voir le compte rendu" onPress={terminer} chargement={fin} />
      ) : (
        <>
          <Bouton libelle="Voir le compte rendu" onPress={onTermine} />
          <Bouton variante="discret" libelle="Retour à la fiche" onPress={onFermer} />
        </>
      )}
    </View>
  );
}

function CarteTest({ test, evaluation, onChange }: { test: DefinitionTest; evaluation: Evaluation; onChange: (e: Evaluation) => void }) {
  const r = evaluation.tests[test.id];
  return (
    <Carte>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SousTitre>{test.libelle}</SousTitre>
        {!r?.resultat && <Texte doux style={{ fontSize: 12 }}>À renseigner</Texte>}
      </View>
      <Puces>
        {test.resultats.map((v) => (
          <Puce key={v} libelle={v} actif={r?.resultat === v} onPress={() => onChange(choisirResultat(evaluation, test.id, v))} />
        ))}
      </Puces>
      {test.rpe && (
        <View style={{ gap: espace(1.5) }}>
          <Texte doux style={{ fontSize: 13 }}>Effort perçu en fin de test (RPE)</Texte>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const actif = r?.rpe === n;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityLabel={`RPE ${n}`}
                  accessibilityState={{ selected: actif }}
                  onPress={() => onChange(choisirRpe(evaluation, test.id, n))}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: actif ? couleurs.noir : couleurs.bordure,
                    backgroundColor: actif ? couleurs.noir : couleurs.carte,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: polices.texteGras, fontSize: 14, color: actif ? '#FFFFFF' : couleurs.texte }}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      <Texte doux style={{ fontSize: 13 }}>Observations</Texte>
      <Puces>
        {test.observations.map((o) => {
          const coche = !!r?.observations.includes(o);
          return <Puce key={o} libelle={coche ? `✓ ${o}` : o} actif={coche} onPress={() => onChange(basculerObservation(evaluation, test.id, o))} />;
        })}
      </Puces>
    </Carte>
  );
}
