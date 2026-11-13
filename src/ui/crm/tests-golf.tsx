// Tests golf dans la rubrique Tests du Booster : une case « Client golfeur », puis huit tests chiffrés avec leur
// protocole, et le résultat du Booster précédent sous chaque mesure pour suivre l'évolution.
import { StyleSheet, Text, View } from 'react-native';

import {
  changerMesure,
  evolution,
  formaterMesure,
  lireMesure,
  TESTS_GOLF,
  testsGolfRenseignes,
  type EvaluationGolf,
  type FamilleGolf,
} from '@/domain/tests-golf';

import { couleurs, espace, polices } from '../theme';
import { CaseACocher, Cellule, Saisie } from './dossier';

export interface GolfPrecedent {
  /** Date ISO du Booster précédent. */
  date: string;
  golf: EvaluationGolf;
}

export function TestsGolf({
  golf,
  precedent,
  onChange,
}: {
  golf: EvaluationGolf | undefined;
  precedent?: GolfPrecedent;
  onChange: (g: EvaluationGolf) => void;
}) {
  const actif = !!golf?.actif;
  const dateAvant = precedent ? new Date(precedent.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  let famille: FamilleGolf | undefined;
  return (
    <>
      <Cellule pleine>
        <View style={styles.encart}>
          <CaseACocher libelle="Client golfeur : ajouter les tests golf" valeur={actif} onChange={(v) => onChange({ actif: v, mesures: golf?.mesures ?? {} })} />
          <Text style={styles.aide}>
            {actif
              ? `${testsGolfRenseignes(golf)} test${testsGolfRenseignes(golf) > 1 ? 's' : ''} sur ${TESTS_GOLF.length} renseigné${testsGolfRenseignes(golf) > 1 ? 's' : ''}.${precedent ? ` Sous chaque mesure : le résultat du Booster du ${dateAvant}.` : ''}`
              : precedent
                ? `Tests golf déjà faits au Booster du ${dateAvant} : coche la case pour les refaire et voir l’évolution.`
                : 'Mobilité, équilibre, puissance de rotation à la poulie et vitesse de swing, avec des mesures chiffrées.'}
          </Text>
        </View>
      </Cellule>
      {actif &&
        TESTS_GOLF.flatMap((t) => {
          const titreFamille = t.famille !== famille;
          famille = t.famille;
          return [
            ...(titreFamille
              ? [
                  <Cellule key={`famille-${t.famille}`} pleine>
                    <Text style={styles.famille}>{`Golf · ${t.famille}`}</Text>
                  </Cellule>,
                ]
              : []),
            <Cellule key={`golf-${t.id}`} pleine>
              <View style={styles.test}>
                <Text style={styles.titre}>{t.facultatif ? `${t.libelle} (facultatif)` : t.libelle}</Text>
                <Text style={styles.protocole}>{t.protocole}</Text>
                {t.repere && <Text style={styles.repere}>{`Repère : ${t.repere}`}</Text>}
                <View style={styles.mesures}>
                  {t.champs.map((c) => {
                    const valeur = golf?.mesures[t.id]?.[c.cle] ?? '';
                    const n = lireMesure(valeur);
                    const avant = lireMesure(precedent?.golf.mesures[t.id]?.[c.cle]);
                    const aide =
                      avant === undefined
                        ? undefined
                        : `Avant : ${formaterMesure(avant, c.unite)}${n !== undefined && c.cle !== 'chargeKg' ? ` · ${evolution(n, avant, c.unite)}` : ''}`;
                    return (
                      <View key={c.cle} style={styles.mesure}>
                        <Saisie
                          libelle={`${c.libelle} (${c.unite})`}
                          type="nombre"
                          valeur={valeur}
                          onChange={(v) => onChange(changerMesure(golf, t.id, c.cle, v))}
                          erreur={valeur.trim() && n === undefined ? 'Un nombre, par exemple 42 ou 12,5.' : undefined}
                          aide={aide}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            </Cellule>,
          ];
        })}
    </>
  );
}

const styles = StyleSheet.create({
  encart: { backgroundColor: couleurs.vertClair, borderRadius: 12, padding: 14, gap: espace(1) },
  aide: { fontFamily: polices.texte, fontSize: 12, lineHeight: 18, color: couleurs.texteDoux },
  famille: { fontFamily: polices.texteGras, fontSize: 13, letterSpacing: 0.5, color: couleurs.vert, textTransform: 'uppercase', marginTop: espace(2) },
  test: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: 14, gap: espace(2), backgroundColor: couleurs.carte },
  titre: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  protocole: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
  repere: { fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.vert },
  mesures: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) },
  mesure: { flexBasis: 140, flexGrow: 1, minWidth: 0 },
});
