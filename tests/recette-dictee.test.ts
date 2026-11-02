import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import base from '@/data/aliments-base.json';
import { appliquerDictee, ingredientsPersoDepuisDictee, recetteDepuisPerso, type RecetteDictee, regimesDeLaRecette, totalRecette, trouverAliment } from '@/domain/alimentation';
import type { PersonalRecipe } from '@/domain/nutrition/personnel';
import type { Aliment, Recette } from '@/domain/types';

const aliments = base as Aliment[];
const whey: Aliment = { id: 'w1', nom: 'Whey vanille MaMarque', kcal: 380, proteines: 78, glucides: 6, lipides: 5, contient: ['lait'], source: 'coach' };
const vide: Recette = { id: 'r1', titre: '', portions: 1, ingredients: [], statut: 'brouillon', regimesConfirmes: [] } as unknown as Recette;

const lue: RecetteDictee = {
  titre: 'Crêpes protéinées',
  portions: 2,
  tempsMin: 15,
  ingredients: [
    { nom: 'Flocons d’avoine', ciqual: "Flocons d'avoine", recherche: 'flocon avoine', quantiteG: 80, kcal: 370, proteines: 13, glucides: 60, lipides: 7, contient: ['gluten'] },
    { nom: 'Œufs', ciqual: 'Oeuf cru', recherche: 'oeuf cru', quantiteG: 110, kcal: 140, proteines: 12.5, glucides: 0.5, lipides: 10, contient: ['oeuf'] },
    { nom: 'Whey vanille', recherche: 'whey vanille', quantiteG: 30, kcal: 400, proteines: 75, glucides: 8, lipides: 6, contient: ['lait'] },
    { nom: 'Sirop de yacon', recherche: 'sirop yacon', quantiteG: 10, kcal: 250, proteines: 0, glucides: 60, lipides: 0, contient: [] },
  ],
  etapes: '1. Mixer.\n2. Cuire.',
  remarque: 'Quantité de sirop estimée.',
};

describe('recette dictée', () => {
  it('relie les ingrédients à la base Ciqual, puis aux aliments du coach, sinon garde l’estimation', () => {
    const { recette, aVerifier } = appliquerDictee(vide, lue, [...aliments, whey]);
    expect(recette.titre).toBe('Crêpes protéinées');
    expect(recette.portions).toBe(2);
    expect(recette.tempsMin).toBe(15);
    expect(recette.ingredients.map((i) => i.nom)).toEqual(["Flocons d'avoine", 'Oeuf cru', 'Whey vanille MaMarque', 'Sirop de yacon']);
    expect(recette.ingredients[0].alimentId).toBeTruthy();
    expect(recette.ingredients[2].alimentId).toBe('w1');
    expect(recette.ingredients[3].alimentId).toBeUndefined();
    expect(recette.ingredients[3].kcal).toBe(250);
    expect(aVerifier).toEqual(['Sirop de yacon']);
    expect(totalRecette(recette).parPortion.kcal).toBeGreaterThan(0);
  });

  it('sans nom Ciqual, ne va pas chercher un aliment approchant dans la table', () => {
    const { aVerifier } = appliquerDictee(vide, { ...lue, ingredients: [{ ...lue.ingredients[1], ciqual: undefined, recherche: 'oeuf' }] }, aliments);
    expect(aVerifier).toEqual(['Œufs']);
  });

  it('garde ce qui était déjà écrit quand la dictée ne le dit pas', () => {
    const deja: Recette = { ...vide, titre: 'Mon bowl', portions: 4, etapes: 'Préchauffer.', ingredients: [] };
    const { recette } = appliquerDictee(deja, { ...lue, titre: '', portions: undefined, tempsMin: undefined, etapes: 'Ajouter le riz.' }, aliments);
    expect(recette.titre).toBe('Mon bowl');
    expect(recette.portions).toBe(4);
    expect(recette.etapes).toBe('Préchauffer.\nAjouter le riz.');
    expect(recette.ingredients).toHaveLength(4);
  });

  it('trouve un aliment malgré le pluriel et les petits mots', () => {
    expect(trouverAliment([whey], 'des whey')?.id).toBe('w1');
    expect(trouverAliment(aliments, 'flocons d’avoine')?.nom).toBe("Flocons d'avoine");
  });

  it('la fonction serveur connaît les mêmes noms Ciqual que l’app', () => {
    const source = readFileSync(join(__dirname, '../supabase/functions/lire-recette/noms-ciqual.ts'), 'utf8');
    const noms = source.slice(source.indexOf('`') + 1, source.lastIndexOf('`')).trim().split('\n');
    expect(new Set(noms)).toEqual(new Set(aliments.map((a) => a.nom)));
  });
});

describe('écran « Mes recettes » du client', () => {
  it('la dictée donne des ingrédients du journal, Ciqual quand on le connaît', () => {
    let n = 0;
    const { ingredients, aVerifier } = ingredientsPersoDepuisDictee(lue, [...aliments, whey], () => `e${++n}`);
    expect(ingredients[0].food).toMatchObject({ name: "Flocons d'avoine", source: 'ciqual', basis: 'g' });
    expect(ingredients[0].food.reference).toBeTruthy();
    expect(ingredients[0].amount).toBe(80);
    expect(ingredients[2].food).toMatchObject({ name: 'Whey vanille MaMarque', source: 'manual', kcal: 380 });
    expect(ingredients[3].food).toMatchObject({ name: 'Sirop de yacon', source: 'manual', kcal: 250 });
    expect(ingredients[3].food.note).toMatch(/à vérifier/);
    expect(aVerifier).toEqual(['Sirop de yacon']);
    expect(ingredients.map((i) => i.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('une recette du client arrive chez le coach au format de la banque, macros et régimes compris', () => {
    const avoine = aliments.find((a) => a.nom === "Flocons d'avoine")!;
    const perso: PersonalRecipe = {
      id: 'p1',
      name: 'Porridge',
      servings: 2,
      steps: 'Cuire.',
      ingredients: [
        { id: 'a', meal: 'Déjeuner', amount: 100, food: { name: avoine.nom, barcode: '', source: 'ciqual', reference: avoine.codeCiqual!, note: '', basis: 'g', kcal: 370, protein: 13, carbs: 60, fat: 7 } },
        { id: 'b', meal: 'Déjeuner', amount: 200, food: { name: 'Lait demi-écrémé', barcode: '', source: 'manual', reference: '', note: '', basis: 'ml', kcal: 46, protein: 3.3, carbs: 4.8, fat: 1.6 } },
      ],
    };
    const r = recetteDepuisPerso(perso, 'lea', aliments);
    expect(r).toMatchObject({ id: 'p1', clientId: 'lea', titre: 'Porridge', portions: 2, statut: 'brouillon', etapes: 'Cuire.' });
    expect(r.macrosPortion).toBeUndefined();
    expect(Math.round(totalRecette(r).parPortion.kcal)).toBe(Math.round((370 + 92) / 2));
    // Le lait, saisi à la main, est retrouvé dans Ciqual : la recette n'est pas annoncée végane.
    expect(regimesDeLaRecette(r)).not.toContain('vegan');

    const enPortions = recetteDepuisPerso(
      { ...perso, ingredients: [{ ...perso.ingredients[0], amount: 2, food: { ...perso.ingredients[0].food, basis: 'portion', kcal: 150 } }] },
      'lea',
      aliments,
    );
    expect(enPortions.macrosPortion?.kcal).toBe(150);
  });
});
