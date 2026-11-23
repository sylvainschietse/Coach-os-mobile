// Exercices choisis pendant un test (Poussée, Tirage, Jambes, Centre du corps, ou au choix) : le coach touche les
// exercices proposés ou en ajoute un autre, choisit comment le mesurer (répétitions, temps, distance, calories,
// annotation) et peut noter une variante pour l'adapter au client. Sous chaque valeur : la dernière fois.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ajouterExercice,
  basculerPropose,
  ecartExercice,
  exerciceAvant,
  exercicesDe,
  EXERCICES_PROPOSES,
  formaterValeur,
  libelleCategorie,
  modifierExercice,
  retirerExercice,
  TYPES_MESURE,
  valeurInvalide,
  type CategorieExercice,
  type ExerciceTest,
} from '@/domain/exercices-test';
import { nouvelId } from '@/lib/identifiant';

import { Puce, Puces } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { Libelle, Saisie } from './dossier';

const COURT: Record<string, string> = { reps: 'Rép.', temps: 'Temps', distance: 'Distance', calories: 'Cal', note: 'Annotation' };

export function ExercicesTest({
  categorie,
  exercices,
  onChange,
  avant,
  titre,
}: {
  categorie: CategorieExercice;
  /** Tous les exercices du test (toutes catégories) : seuls ceux de la catégorie s'affichent. */
  exercices: ExerciceTest[] | undefined;
  onChange: (e: ExerciceTest[]) => void;
  /** Exercices de la fois précédente, pour l'écart. */
  avant?: { date: string; exercices: ExerciceTest[] };
  titre?: string;
}) {
  const choisis = exercicesDe(exercices, categorie);
  const proposes = EXERCICES_PROPOSES[categorie];
  const estChoisi = (nom: string) => choisis.some((x) => x.nom.trim().toLowerCase() === nom.toLowerCase());
  return (
    <View style={styles.bloc}>
      <Libelle>{titre ?? (categorie === 'libre' ? 'Exercices au choix' : `${libelleCategorie(categorie)} — exercices`)}</Libelle>
      <Puces>
        {proposes.map((p) => (
          <Puce key={p.nom} libelle={p.nom} actif={estChoisi(p.nom)} onPress={() => onChange(basculerPropose(exercices, categorie, p.nom, nouvelId))} />
        ))}
        <Puce libelle="+ Autre exercice" onPress={() => onChange(ajouterExercice(exercices, categorie, nouvelId()))} />
      </Puces>
      {choisis.map((x) => (
        <LigneExercice
          key={x.id}
          x={x}
          libre={!proposes.some((p) => p.nom === x.nom)}
          avant={avant ? { date: avant.date, x: exerciceAvant(avant.exercices, x) } : undefined}
          onChange={(patch) => onChange(modifierExercice(exercices, x.id, patch))}
          onRetirer={() => onChange(retirerExercice(exercices, x.id))}
        />
      ))}
    </View>
  );
}

function LigneExercice({
  x,
  libre,
  avant,
  onChange,
  onRetirer,
}: {
  x: ExerciceTest;
  libre: boolean;
  avant?: { date: string; x: ExerciceTest | undefined };
  onChange: (patch: Partial<ExerciceTest>) => void;
  onRetirer: () => void;
}) {
  const m = TYPES_MESURE.find((t) => t.id === x.mesure)!;
  const ecart = ecartExercice(x, avant?.x);
  const aide = avant?.x?.valeur.trim()
    ? `${avant.date} : ${formaterValeur(avant.x.mesure, avant.x.valeur)}${avant.x.variante?.trim() ? ` (${avant.x.variante.trim()})` : ''}${ecart ? ` · ${ecart}` : ''}`
    : undefined;
  return (
    <View style={styles.carte}>
      <View style={styles.entete}>
        {libre ? (
          <View style={{ flex: 1 }}>
            <Saisie libelle="Nom de l’exercice" valeur={x.nom} placeholder="Ex. : Kettlebell swing" onChange={(nom) => onChange({ nom })} />
          </View>
        ) : (
          <Text style={styles.nom}>{x.nom}</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${x.nom || 'cet exercice'}`} onPress={onRetirer} hitSlop={8}>
          <Text style={styles.retirer}>Retirer</Text>
        </Pressable>
      </View>
      <View style={{ gap: espace(2) }}>
        <Text style={styles.petit}>Mesuré en</Text>
        <Puces>
          {TYPES_MESURE.map((t) => (
            <Puce key={t.id} libelle={COURT[t.id]} actif={x.mesure === t.id} onPress={() => onChange({ mesure: t.id })} />
          ))}
        </Puces>
      </View>
      <View style={styles.saisies}>
        <View style={x.mesure === 'note' ? styles.pleine : styles.moitie}>
          <Saisie
            libelle={x.mesure === 'note' ? 'Annotation' : `${m.libelle} (${m.unite})`}
            long={x.mesure === 'note'}
            type={x.mesure === 'temps' || x.mesure === 'note' ? undefined : 'nombre'}
            valeur={x.valeur}
            placeholder={m.exemple}
            onChange={(valeur) => onChange({ valeur })}
            erreur={valeurInvalide(x) ? (x.mesure === 'temps' ? 'En secondes (45) ou minutes:secondes (1:30).' : 'Un nombre, par exemple 12 ou 12,5.') : undefined}
            aide={aide}
          />
        </View>
        <View style={x.mesure === 'note' ? styles.pleine : styles.moitie}>
          <Saisie
            libelle="Variante / charge"
            valeur={x.variante ?? ''}
            placeholder="8 kg, sur les genoux, élastique…"
            onChange={(variante) => onChange({ variante })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: espace(3) },
  carte: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: 14, gap: espace(3), backgroundColor: couleurs.carte },
  entete: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: espace(3) },
  nom: { flex: 1, fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  retirer: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge, paddingVertical: 2 },
  petit: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  saisies: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) },
  moitie: { flexBasis: 160, flexGrow: 1, minWidth: 0 },
  pleine: { flexBasis: '100%', minWidth: 0 },
});
