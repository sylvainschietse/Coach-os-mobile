// Les réponses au questionnaire, lisibles d'un coup d'œil : ce qui est à vérifier, puis l'essentiel pour préparer la
// séance (objectif, profil, santé, leviers), et toutes les réponses en dessous pour qui veut le détail.
// Avant, elles n'étaient visibles qu'en dépliant « Questionnaire reçu le… » dans l'onglet Boosters de la fiche.
import { Text, View } from 'react-native';

import { preparerSeance } from '@/domain/briefing';
import type { Questionnaire } from '@/domain/crm';
import { reponsesParSection } from '@/domain/questionnaire';

import { couleurs, espace, polices } from '../theme';
import { Repliable, Valeur } from './dossier';

export function ReponsesQuestionnaire({ questionnaire: q }: { questionnaire: Questionnaire }) {
  const b = preparerSeance(q.reponses);
  const blocs: { titre: string; lignes: string[]; alerte?: boolean }[] = [
    { titre: 'Santé', lignes: b.sante.length ? b.sante : ['Aucune douleur ni contre-indication déclarée.'], alerte: b.sante.length > 0 },
    { titre: 'Objectif', lignes: b.objectif },
    { titre: 'Profil sportif', lignes: b.profil },
    { titre: 'Leviers à travailler', lignes: b.leviers },
    { titre: 'Motivation et attentes', lignes: b.motivation },
  ].filter((x) => x.lignes.length);
  return (
    <View style={{ gap: espace(3) }}>
      {q.alertes.map((a) => (
        <Text key={a} style={[styles.texte, styles.alerte]}>
          ⚠️ {a}
        </Text>
      ))}
      {blocs.map((x) => (
        <View key={x.titre} style={{ gap: 2 }}>
          <Text style={[styles.titre, x.alerte && { color: couleurs.rouge }]}>{x.titre}</Text>
          {x.lignes.map((l) => (
            <Text key={l} style={styles.texte}>
              • {l}
            </Text>
          ))}
        </View>
      ))}
      <Repliable resume="Toutes ses réponses">
        <View style={{ gap: espace(4) }}>
          {reponsesParSection(q.reponses, ['prenom', 'nom', 'telephone', 'email']).map((s) => (
            <View key={s.titre} style={{ gap: espace(2) }}>
              <Text style={styles.titre}>{s.titre}</Text>
              {s.lignes.map((l) => (
                <Valeur key={l.id} libelle={l.libelle} valeur={l.valeur} />
              ))}
            </View>
          ))}
        </View>
      </Repliable>
    </View>
  );
}

const styles = {
  titre: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte },
  texte: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
  alerte: { backgroundColor: couleurs.orangeClair, borderRadius: 10, padding: espace(3) },
} as const;
