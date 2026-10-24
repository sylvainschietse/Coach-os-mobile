import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { erreursRecette, regimesDeLaRecette, totalRecette } from '@/domain/alimentation';
import { formaterNombre, lireNombre } from '@/domain/suivi';
import type { Recette, Regime } from '@/domain/types';

import { Bouton, Carte, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { type Auteur, ChoixAliment } from './choix-aliment';
import { libelleRegime, LigneMacros } from './commun';

/** Régimes que les ingrédients ne suffisent pas à garantir : le coach les confirme. */
const A_CONFIRMER: Regime[] = ['sans_gluten', 'sans_lactose'];

/** Créer ou modifier une recette : ingrédients pesés, macros calculées, régimes déduits. */
export function EditeurRecette({
  recette,
  auteur,
  coachId,
  onEnregistrer,
  onAnnuler,
}: {
  recette: Recette;
  auteur: Auteur;
  coachId?: string;
  onEnregistrer: (r: Recette) => Promise<void>;
  onAnnuler: () => void;
}) {
  const coach = 'coachId' in auteur;
  const [r, setR] = useState(recette);
  const [portions, setPortions] = useState(String(recette.portions));
  const [temps, setTemps] = useState(recette.tempsMin ? String(recette.tempsMin) : '');
  const [ajout, setAjout] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  const brouillon: Recette = { ...r, portions: lireNombre(portions) ?? 0, tempsMin: lireNombre(temps) };
  const { parPortion, poidsPortionG } = totalRecette({ ...brouillon, portions: Math.max(1, brouillon.portions) });
  const regimes = regimesDeLaRecette(brouillon);

  async function enregistrer() {
    const liste = erreursRecette(brouillon);
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await onEnregistrer({ ...brouillon, titre: brouillon.titre.trim(), description: brouillon.description?.trim() || undefined, etapes: brouillon.etapes?.trim() || undefined });
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
      setEnCours(false);
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <Carte>
        <ChampTexte libelle="Nom de la recette" valeur={r.titre} onChange={(titre) => setR({ ...r, titre })} />
        <ChampTexte libelle="Description (facultatif)" valeur={r.description ?? ''} onChange={(description) => setR({ ...r, description })} />
        <View style={{ flexDirection: 'row', gap: espace(3) }}>
          <View style={{ flex: 1 }}>
            <ChampTexte libelle="Portions" type="nombre" valeur={portions} onChange={setPortions} />
          </View>
          <View style={{ flex: 1 }}>
            <ChampTexte libelle="Temps (min)" type="nombre" valeur={temps} onChange={setTemps} />
          </View>
        </View>
      </Carte>

      <Carte>
        <SousTitre>Ingrédients</SousTitre>
        <Texte doux style={{ fontSize: 13 }}>Pour la recette entière ({formaterNombre(Math.max(1, brouillon.portions))} portions), poids cuits ou crus selon l’aliment choisi.</Texte>
        {r.ingredients.map((i, n) => (
          <View key={`${i.nom}-${n}`} style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2), borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2) }}>
            <Texte style={{ flex: 1, fontSize: 15 }}>{i.nom}</Texte>
            <View style={{ width: 90 }}>
              <ChampTexte
                libelle="g"
                type="nombre"
                valeur={String(i.quantiteG)}
                onChange={(t) => setR({ ...r, ingredients: r.ingredients.map((x, k) => (k === n ? { ...x, quantiteG: lireNombre(t) ?? 0 } : x)) })}
              />
            </View>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setR({ ...r, ingredients: r.ingredients.filter((_, k) => k !== n) })}>
              <Texte doux style={{ fontSize: 13 }}>Retirer</Texte>
            </Pressable>
          </View>
        ))}
        {ajout ? (
          <ChoixAliment
            titre="Ajouter un ingrédient"
            libelleBouton="Ajouter à la recette"
            auteur={auteur}
            coachId={coachId}
            onFermer={() => setAjout(false)}
            onChoisir={(a, g) => {
              setR({
                ...r,
                ingredients: [
                  ...r.ingredients,
                  { alimentId: a.id, nom: a.nom, quantiteG: g, kcal: a.kcal, proteines: a.proteines, glucides: a.glucides, lipides: a.lipides, contient: a.contient },
                ],
              });
              setAjout(false);
            }}
          />
        ) : (
          <Bouton variante="secondaire" libelle="Ajouter un ingrédient" onPress={() => setAjout(true)} />
        )}
        {r.ingredients.length > 0 && (
          <View style={{ gap: espace(1) }}>
            <Texte style={{ fontSize: 14 }}>Par portion (environ {formaterNombre(Math.round(poidsPortionG))} g) :</Texte>
            <LigneMacros m={parPortion} />
            {regimes.length > 0 && <Texte doux style={{ fontSize: 13 }}>Convient : {regimes.map(libelleRegime).join(', ')}.</Texte>}
          </View>
        )}
      </Carte>

      <Carte>
        <ChampTexte libelle="Préparation (facultatif)" valeur={r.etapes ?? ''} onChange={(etapes) => setR({ ...r, etapes })} multiligne />
      </Carte>

      {coach && (
        <Carte>
          <SousTitre>Validation</SousTitre>
          <Texte doux style={{ fontSize: 13 }}>Les clients ne voient que les recettes approuvées.</Texte>
          <Puces>
            <Puce libelle="Brouillon" actif={r.statut === 'brouillon'} onPress={() => setR({ ...r, statut: 'brouillon' })} />
            <Puce libelle="Testée et approuvée" actif={r.statut === 'approuvee'} onPress={() => setR({ ...r, statut: 'approuvee' })} />
          </Puces>
          <Texte doux style={{ fontSize: 13 }}>À confirmer toi-même (un ingrédient transformé peut en contenir) :</Texte>
          <Puces>
            {A_CONFIRMER.map((g) => (
              <Puce
                key={g}
                libelle={libelleRegime(g)}
                actif={r.regimesConfirmes.includes(g)}
                onPress={() =>
                  setR({ ...r, regimesConfirmes: r.regimesConfirmes.includes(g) ? r.regimesConfirmes.filter((x) => x !== g) : [...r.regimesConfirmes, g] })
                }
              />
            ))}
          </Puces>
        </Carte>
      )}

      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      <Bouton libelle="Enregistrer la recette" onPress={enregistrer} chargement={enCours} />
      <Bouton variante="discret" libelle="Annuler" onPress={onAnnuler} />
    </View>
  );
}
