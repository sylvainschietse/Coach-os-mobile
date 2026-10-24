// Historique.tsx d'origine (U06) : séances enregistrées en lecture seule, regroupées par cycle avec les libellés
// figés au moment de l'enregistrement (nom du cycle, de la séance, du programme et des exercices).
import { Text, View } from 'react-native';

import { titreClient } from '@/domain/entrainement';
import { texteSerie, type EspaceEntrainement } from '@/domain/entrainement-etat';

import { Repliable } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { ts } from './commun';

const dateParis = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const series = (n: number) => `${n} série${n > 1 ? 's' : ''}`;

export const nbSeries = (e: EspaceEntrainement) => e.realisations.reduce((n, r) => n + r.series.length, 0);

export function Historique({ espace }: { espace: EspaceEntrainement }) {
  if (!espace.realisations.length)
    return (
      <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, borderRadius: 12, padding: 24 }}>
        <Text style={[ts.texte, { textAlign: 'center', color: couleurs.texteDoux }]}>Aucune séance enregistrée pour l&apos;instant.</Text>
      </View>
    );
  const parCycle = new Map<string, EspaceEntrainement['realisations']>();
  for (const r of espace.realisations) {
    const c = r.cycleNom || 'Hors cycle';
    parCycle.set(c, [...(parCycle.get(c) ?? []), r]);
  }
  return (
    <View style={{ gap: 20 }}>
      {[...parCycle].map(([cycle, liste]) => (
        <View key={cycle} style={{ gap: 8 }}>
          <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>
            {cycle}
            {cycle !== espace.cycle?.nom && cycle !== 'Hors cycle' && <Text style={[ts.doux, { fontSize: 12 }]}>{'  '}terminé · lecture seule</Text>}
          </Text>
          {liste.map((r) => {
            const lignes = [...r.series].sort((a, b) => (r.noms[a.ligneId] ?? '').localeCompare(r.noms[b.ligneId] ?? '') || a.index - b.index);
            return (
              <Repliable
                key={r.id}
                style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, backgroundColor: couleurs.carte, paddingHorizontal: 14 }}
                resume={
                  <View style={{ flexShrink: 1, paddingVertical: 4 }}>
                    <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>{dateParis(r.fin)}</Text>
                    <Text style={[ts.texte, { color: couleurs.texteDoux }]}>
                      {[titreClient(r.seanceTitre), r.note ? `ressenti ${r.note}/10` : '', series(r.series.length)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                }
              >
                <View style={{ gap: 6, paddingBottom: 12 }}>
                  {r.programmeNom && <Text style={ts.doux}>Programme : {titreClient(r.programmeNom)}</Text>}
                  {r.commentaire && <Text style={[ts.texte, { color: couleurs.texteDoux }]}>« {r.commentaire} »</Text>}
                  {lignes.map((s) => (
                    <Text key={s.id} style={[ts.mono, { color: couleurs.texte }]}>
                      {r.noms[s.ligneId] ?? 'Exercice'} · S{s.index + 1} : {texteSerie(s.valeurs)}
                    </Text>
                  ))}
                </View>
              </Repliable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
