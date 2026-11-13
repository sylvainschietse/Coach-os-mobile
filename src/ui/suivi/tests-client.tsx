// Onglet « Tests » de la fiche d'un client : tests golf et mesures vidéo, datés, hors Booster.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { depot } from '@/data';
import { jourLocal } from '@/domain/crm';
import { golfAvant, mesureAvant, postureAvant, resumeTest, testClientVide, testVide, type TestClient } from '@/domain/tests-client';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, Texte } from '../composants';
import { MesuresVideoTest } from '../crm/mesures-video-test';
import { Grille, Cellule, Saisie } from '../crm/dossier';
import { TestsGolf } from '../crm/tests-golf';
import { ChampDate } from '../date-heure';
import { BilanPosturalSection } from './bilan-postural';
import { couleurs, espace, polices } from '../theme';

const dateLisible = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function TestsClient({ clientId, prenom, ouvrirNouveau }: { clientId: string; prenom?: string; ouvrirNouveau?: boolean }) {
  const charge = useCharger(() => depot.testsClient(clientId), `tests-client-${clientId}`);
  const [edite, setEdite] = useState<TestClient | null>(() => (ouvrirNouveau ? testVide(nouvelId(), clientId, jourLocal(new Date())) : null));
  if (charge.erreur) return <Erreur message={charge.erreur} onReessayer={charge.recharger} />;
  if (!charge.donnee) return <Chargement />;
  const tests = charge.donnee;

  if (edite)
    return (
      <EditeurTest
        test={edite}
        tests={tests}
        existant={tests.some((t) => t.id === edite.id)}
        onFermer={() => {
          setEdite(null);
          charge.recharger();
        }}
      />
    );

  return (
    <View style={{ gap: espace(4), marginTop: espace(4) }}>
      <Texte doux>
        {`Tests golf et angles mesurés en vidéo (mobilité, posture)${prenom ? ` pour ${prenom}` : ''}. Chaque test montre l’écart avec le précédent.`}
      </Texte>
      <View style={{ alignSelf: 'flex-start' }}>
        <Bouton libelle="Nouveau test" onPress={() => setEdite(testVide(nouvelId(), clientId, jourLocal(new Date())))} />
      </View>
      {tests.length === 0 && <Texte doux>Aucun test pour l’instant.</Texte>}
      {tests.map((t) => (
        <Pressable key={t.id} accessibilityRole="button" onPress={() => setEdite(t)}>
          <Carte style={{ gap: espace(1) }}>
            <Text style={styles.date}>{dateLisible(t.date)}</Text>
            <Text style={styles.resume}>{resumeTest(t)}</Text>
          </Carte>
        </Pressable>
      ))}
    </View>
  );
}

function EditeurTest({ test, tests, existant, onFermer }: { test: TestClient; tests: TestClient[]; existant: boolean; onFermer: () => void }) {
  const [t, setT] = useState(test);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const precedent = golfAvant(tests, t);
  const avantPosture = postureAvant(tests, t);
  const maj = (patch: Partial<TestClient>) => setT((x) => ({ ...x, ...patch }));

  const agir = async (action: () => Promise<void>) => {
    setOccupe(true);
    setErreur(undefined);
    try {
      await action();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement non confirmé');
      setOccupe(false);
    }
  };

  return (
    <View style={{ gap: espace(4), marginTop: espace(4) }}>
      <Grille>
        <Cellule>
          <ChampDate libelle="Date du test" jour={t.date} onChange={(date) => maj({ date })} />
        </Cellule>
        <Cellule pleine>
          <BilanPosturalSection
            bilan={t.posture}
            avant={avantPosture?.posture}
            dateAvant={avantPosture ? dateLisible(avantPosture.date) : undefined}
            onChange={(posture) => maj({ posture })}
          />
        </Cellule>
        {(['mobilite', 'posture'] as const).map((f) => (
          <Cellule key={f} pleine>
            <MesuresVideoTest
              test={f}
              libelle={f === 'mobilite' ? 'Mobilité' : 'Posture'}
              mesures={t.mesures[f] ?? []}
              onChange={(m) => maj({ mesures: { ...t.mesures, [f]: m } })}
              avant={(libelle) => mesureAvant(tests, t, f, libelle)}
            />
          </Cellule>
        ))}
        <TestsGolf
          golf={t.golf}
          precedent={precedent?.golf ? { date: `${precedent.date}T12:00:00`, golf: precedent.golf } : undefined}
          onChange={(golf) => maj({ golf })}
        />
        <Cellule pleine>
          <Saisie libelle="Notes" long dictee valeur={t.notes ?? ''} onChange={(notes) => maj({ notes })} />
        </Cellule>
      </Grille>
      {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <View style={styles.pied}>
        <Bouton
          libelle="Enregistrer le test"
          chargement={occupe}
          desactive={occupe || testClientVide(t) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)}
          onPress={() => agir(() => depot.enregistrerTestClient(t))}
        />
        <Bouton variante="discret" libelle="Annuler" onPress={onFermer} desactive={occupe} />
        {existant && <Bouton variante="discret" libelle="Supprimer ce test" onPress={() => agir(() => depot.supprimerTestClient(t.id))} desactive={occupe} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  date: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  resume: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  pied: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
});
