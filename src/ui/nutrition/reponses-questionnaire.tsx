// Côté coach : les réponses du questionnaire guidé du client, lisibles d'un coup d'œil (fiche client › Nutrition ›
// Questionnaire et objectifs). Les mêmes données servent au formulaire complet, que le coach peut corriger.
import { Text, View } from 'react-native';

import type { Preferences } from '@/domain/nutrition/calcul';
import { libelleObjectif } from '@/domain/objectifs-coaching';
import { salleDe } from '@/domain/salle-sport';

import { ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';
import { doux } from './commun';

const ACTIVITE: Record<string, string> = {
  faible: 'Assis la plupart du temps',
  legere: 'Bouge un peu',
  moderee: 'Actif',
  elevee: 'Très physique',
};
const REGIME: Record<string, string> = {
  aucun: 'Mange de tout',
  vegetarien: 'Végétarien',
  vegetalien: 'Végétalien',
  pescetarien: 'Pescétarien',
  autre: 'Autre régime',
};
const kg = (n: number) => `${n.toLocaleString('fr-FR')} kg`;

export function ReponsesQuestionnaire({ prefs, nom, enregistre }: { prefs: Preferences; nom: string; enregistre: boolean }) {
  if (!enregistre)
    return (
      <View style={[ts.carte, { padding: 16, gap: 6 }]}>
        <Text style={ts.titre}>Questionnaire de {nom}</Text>
        <Text style={ts.texte}>Pas encore rempli. Il lui est proposé en haut de sa nutrition (« Mes objectifs en 2 minutes »).</Text>
      </View>
    );
  const ecart = prefs.poids && prefs.poidsVise ? Math.round((prefs.poidsVise - prefs.poids) * 10) / 10 : null;
  const lignes: [string, string][] = [
    ['Objectif', libelleObjectif(prefs)],
    [
      'Mensurations',
      [prefs.age ? `${prefs.age} ans` : '', prefs.taille ? `${prefs.taille} cm` : '', prefs.poids ? kg(prefs.poids) : ''].filter(Boolean).join(' · ') || '—',
    ],
    [
      'Poids visé',
      prefs.poidsVise ? `${kg(prefs.poidsVise)}${ecart ? ` (${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} kg)` : ' (garder son poids)'}` : '—',
    ],
    ['Au quotidien', [ACTIVITE[prefs.activite] ?? '—', `${prefs.seances} séance${prefs.seances > 1 ? 's' : ''} par semaine`].join(' · ')],
    ['S’entraîne', [salleDe(prefs.salle)?.libelle, prefs.club.trim()].filter(Boolean).join(' ') || '—'],
    ...(prefs.marques.length ? ([['Machines', prefs.marques.join(', ')]] as [string, string][]) : []),
    ['Matériel', prefs.materiel.length ? prefs.materiel.join(', ') : '—'],
    ['Alimentation', `${REGIME[prefs.regime] ?? prefs.regime} · ${prefs.repas} repas par jour`],
  ];
  if (prefs.allergies.trim()) lignes.push(['Allergies', prefs.allergies.trim()]);
  if (prefs.specifique) lignes.push(['À noter', 'Suivi nutritionnel spécifique (grossesse, allaitement ou suivi médical)']);
  return (
    <View style={[ts.carte, { padding: 16, gap: 10 }]}>
      <Text style={ts.titre}>Questionnaire de {nom}</Text>
      {lignes.map(([l, v]) => (
        <View key={l} style={{ flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 8 }}>
          <Text style={[doux, { width: 100, flexShrink: 0, fontSize: 13, fontFamily: polices.texteMoyen }]}>{l}</Text>
          <Text style={[ts.texte, { flex: 1, fontFamily: l === 'Objectif' ? polices.texteGras : polices.texte }]}>{v}</Text>
        </View>
      ))}
      <Text style={doux}>Réponses de {nom}, modifiables plus bas dans son profil alimentaire. Le lieu et le matériel sont repris quand tu lui crées un programme.</Text>
    </View>
  );
}
