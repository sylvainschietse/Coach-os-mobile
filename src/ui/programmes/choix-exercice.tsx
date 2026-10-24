import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { depot } from '@/data';
import { familles, rechercherExercices } from '@/domain/programmes';
import type { Exercice, Mesure } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';

const MESURES_PERSO: { libelle: string; mesures: Mesure[] }[] = [
  { libelle: 'Charge et répétitions', mesures: ['charge', 'repetitions'] },
  { libelle: 'Répétitions', mesures: ['repetitions'] },
  { libelle: 'Durée', mesures: ['duree'] },
  { libelle: 'Durée et distance', mesures: ['duree', 'distance'] },
];

/** Choisir un exercice dans le catalogue (750 exercices de Sylvain), ou en créer un. */
export function ChoixExercice({
  coachId,
  onChoisir,
  onFermer,
  titre = 'Ajouter un exercice',
}: {
  /** Sans coach (côté client), on choisit seulement dans le catalogue. */
  coachId?: string;
  onChoisir: (e: Exercice) => void;
  onFermer: () => void;
  titre?: string;
}) {
  const { donnee: catalogue, erreur } = useCharger(() => depot.catalogue(), 'catalogue');
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState<string>();
  const [creation, setCreation] = useState(false);
  const [mesures, setMesures] = useState<Mesure[]>(['charge', 'repetitions']);
  const [enCours, setEnCours] = useState(false);
  const [erreurCreation, setErreurCreation] = useState<string>();

  const listeFamilles = useMemo(() => (catalogue ? familles(catalogue) : []), [catalogue]);
  const resultat = useMemo(
    () => (catalogue ? rechercherExercices(catalogue, recherche, famille) : { exercices: [], total: 0 }),
    [catalogue, recherche, famille],
  );

  async function creer() {
    if (!recherche.trim() || !coachId) return;
    setEnCours(true);
    setErreurCreation(undefined);
    try {
      onChoisir(await depot.creerExercice(coachId, { nom: recherche, mesures }));
    } catch (e) {
      setErreurCreation(e instanceof Error ? e.message : 'Création impossible');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte style={{ borderColor: couleurs.noir, borderWidth: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SousTitre>{titre}</SousTitre>
        <Pressable accessibilityRole="button" onPress={onFermer} hitSlop={12}>
          <Texte doux>Fermer</Texte>
        </Pressable>
      </View>
      <ChampTexte libelle="Rechercher" valeur={recherche} onChange={setRecherche} placeholder="squat barre, fessiers, élastique…" />
      {listeFamilles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espace(2) }}>
          <Puce libelle="Toutes" actif={!famille} onPress={() => setFamille(undefined)} />
          {listeFamilles.map((f) => (
            <Puce key={f} libelle={f} actif={famille === f} onPress={() => setFamille(famille === f ? undefined : f)} />
          ))}
        </ScrollView>
      )}
      {erreur && <Erreur message={erreur} />}
      {!catalogue && !erreur && <Chargement />}
      {catalogue && (
        <Texte doux style={{ fontSize: 13 }}>
          {resultat.total} exercice{resultat.total > 1 ? 's' : ''}
          {resultat.total > resultat.exercices.length ? ` · les ${resultat.exercices.length} premiers affichés, précise ta recherche` : ''}
        </Texte>
      )}
      <View style={{ gap: espace(1) }}>
        {resultat.exercices.map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => onChoisir(e)}
            style={({ pressed }) => ({
              paddingVertical: espace(2.5),
              paddingHorizontal: espace(2),
              borderRadius: 10,
              backgroundColor: pressed ? couleurs.rougeClair : couleurs.fond,
            })}
          >
            <Texte style={{ fontSize: 15 }}>{e.nom}</Texte>
            {(e.famille || e.muscles?.length) && (
              <Texte doux style={{ fontSize: 12 }}>
                {[e.famille, e.muscles?.join(', ')].filter(Boolean).join(' · ')}
              </Texte>
            )}
          </Pressable>
        ))}
      </View>
      {coachId && !creation && recherche.trim().length > 2 && (
        <Bouton variante="discret" libelle={`Créer « ${recherche.trim()} »`} onPress={() => setCreation(true)} />
      )}
      {creation && (
        <View style={{ gap: espace(2) }}>
          <Texte doux style={{ fontSize: 14 }}>
            Ce que le client notera pour « {recherche.trim()} » :
          </Texte>
          <Puces>
            {MESURES_PERSO.map((m) => (
              <Puce key={m.libelle} libelle={m.libelle} actif={m.mesures.join() === mesures.join()} onPress={() => setMesures(m.mesures)} />
            ))}
          </Puces>
          {erreurCreation && <Erreur message={erreurCreation} />}
          <Bouton libelle="Créer et ajouter" onPress={creer} chargement={enCours} />
        </View>
      )}
    </Carte>
  );
}
