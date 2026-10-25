import { View } from 'react-native';

import { depot } from '@/data';
import { champsPertinents, formaterValeur } from '@/domain/mesures';
import type { Mesure, RealisationDetail, SerieRealisee } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';

import { Carte, Chargement, Erreur, SousTitre, Texte } from './composants';
import { couleurs, espace } from './theme';

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function parExercice(r: RealisationDetail) {
  const groupes = new Map<string, SerieRealisee[]>();
  r.series.forEach((s) => groupes.set(s.exerciceId, [...(groupes.get(s.exerciceId) ?? []), s]));
  return [...groupes.entries()];
}

function ligneSerie(s: SerieRealisee) {
  const mesures = champsPertinents({ mesures: Object.keys(s.valeurs) as Mesure[] });
  const texte = mesures.map((m) => formaterValeur(m, s.valeurs[m])).join(' × ');
  const corrige = s.suggestion.charge !== undefined && s.suggestion.charge !== s.valeurs.charge;
  return { texte, corrige };
}

/** Ce que le coach voit d'un client : ses séances réalisées, série par série, et son ressenti. */
export function DetailClient({ clientId }: { clientId: string }) {
  const { donnee: realisations, erreur, recharger } = useCharger(() => depot.realisationsDuClient(clientId), clientId);
  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
  if (!realisations) return <Chargement />;
  if (realisations.length === 0) return <Texte doux>Aucune séance réalisée pour l’instant.</Texte>;

  return (
    <View style={{ gap: espace(4) }}>
      {realisations.map((r) => (
        <Carte key={r.id}>
          <SousTitre>{r.seanceTitre}</SousTitre>
          <Texte doux style={{ fontSize: 14 }}>{dateHeure(r.fin)}</Texte>
          {r.commentaire && (
            <View style={{ backgroundColor: couleurs.rougeClair, borderRadius: 10, padding: espace(3) }}>
              <Texte style={{ fontSize: 15 }}>« {r.commentaire} »</Texte>
            </View>
          )}
          {parExercice(r).map(([exerciceId, series]) => (
            <View key={exerciceId} style={{ gap: espace(1), marginTop: espace(1) }}>
              <Texte style={{ fontWeight: '600' }}>{r.exercices[exerciceId] ?? 'Exercice'}</Texte>
              {series.map((s) => {
                const { texte, corrige } = ligneSerie(s);
                return (
                  <Texte key={s.id} doux style={{ fontSize: 14 }}>
                    Série {s.index + 1} : {texte}
                    {corrige ? `  (suggestion : ${formaterValeur('charge', s.suggestion.charge)})` : ''}
                  </Texte>
                );
              })}
            </View>
          ))}
          {r.series.length === 0 && <Texte doux>Aucune série validée.</Texte>}
        </Carte>
      ))}
    </View>
  );
}
