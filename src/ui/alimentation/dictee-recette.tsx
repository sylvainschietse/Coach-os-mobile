// Recette dictée : on raconte la recette à voix haute (ou on la colle), l'IA remplit les champs de l'éditeur.
// Rien n'est enregistré ici : la personne relit et corrige dans l'éditeur, puis enregistre.
import { useState } from 'react';
import { View } from 'react-native';

import { alimentation } from '@/data/alimentation';
import type { RecetteDictee } from '@/domain/alimentation';

import { Bouton, Carte, ChampTexte, Erreur, SousTitre, Texte } from '../composants';
import { BoutonDictee } from '../dictee';
import { espace } from '../theme';
import { useAccordIa } from './photo';

export function DicteeRecette({ onRemplir }: { onRemplir: (lue: RecetteDictee) => Promise<void> }) {
  const [ouverte, setOuverte] = useState(false);
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const accord = useAccordIa();

  if (!ouverte) return <Bouton variante="secondaire" libelle="Dicter ma recette" onPress={() => setOuverte(true)} />;

  async function remplir() {
    setEnCours(true);
    setErreur(undefined);
    try {
      await onRemplir(await alimentation.lireRecetteDictee(texte));
      setTexte('');
      setOuverte(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Je n’ai pas réussi à lire la recette. Remplis les champs à la main.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte>
      <SousTitre>Dicter ma recette</SousTitre>
      <Texte doux style={{ fontSize: 13 }}>
        Raconte-la comme à quelqu’un : le nom, pour combien de personnes, les ingrédients avec leurs quantités, puis les étapes. Tu peux aussi coller une recette.
      </Texte>
      <ChampTexte
        libelle="Ta recette"
        valeur={texte}
        onChange={setTexte}
        multiligne
        placeholder="Crêpes protéinées pour 2 : 80 g de flocons d’avoine, 2 œufs, 200 ml de lait… On mixe tout, on laisse reposer 10 minutes."
      />
      <BoutonDictee valeur={texte} onChange={setTexte} desactive={enCours} />
      {accord.refuse ? (
        <View style={{ gap: espace(2) }}>
          <Texte doux style={{ fontSize: 13 }}>
            Pour remplir la recette, le texte est lu par une IA (Claude, d’Anthropic). Il n’est pas conservé. Tu peux retirer ton accord à tout moment dans « Mes données ».
          </Texte>
          {accord.erreur && <Erreur message={accord.erreur} />}
          <Bouton libelle="J’accepte l’analyse par l’IA" onPress={accord.accepter} chargement={accord.envoi} />
        </View>
      ) : (
        <>
          <Texte doux style={{ fontSize: 12 }}>
            Le texte est lu par Claude (Anthropic) pour remplir les champs, puis oublié.
          </Texte>
          <Bouton libelle="Remplir la recette" onPress={remplir} chargement={enCours} desactive={texte.trim().length < 10} />
        </>
      )}
      {erreur && <Erreur message={erreur} />}
      <Bouton variante="discret" libelle="Fermer" onPress={() => setOuverte(false)} />
    </Carte>
  );
}
