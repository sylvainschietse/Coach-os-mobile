import { describe, expect, it } from 'vitest';

import {
  adapterAuxBesoins,
  adapterAuxRegimes,
  age,
  calculerBesoins,
  convientAuRegime,
  entreeRecette,
  erreursAliment,
  exclusionsTrouvees,
  lireProduitOff,
  objectifsDuJour,
  rechercherAliments,
  recettesPourLeClient,
  totalRecette,
  totauxDuJour,
} from '@/domain/alimentation';
import type { Aliment, ProfilNutrition, Recette } from '@/domain/types';

const profil: ProfilNutrition = {
  clientId: 'c',
  sexe: 'femme',
  naissance: '1996-05-10',
  tailleCm: 165,
  poidsKg: 65,
  activite: 'modere',
  objectif: 'perte',
  regimes: [],
};

const poulet = { nom: 'Blanc de poulet', kcal: 120, proteines: 23, glucides: 0, lipides: 2.5, contient: ['viande' as const] };
const riz = { nom: 'Riz basmati cuit', kcal: 130, proteines: 3, glucides: 28, lipides: 0.4, contient: [] };
const huile = { nom: 'Huile d’olive', kcal: 900, proteines: 0, glucides: 0, lipides: 100, contient: [] };

const recette: Recette = {
  id: 'r1',
  titre: 'Poulet riz',
  portions: 2,
  ingredients: [
    { ...poulet, quantiteG: 300 },
    { ...riz, quantiteG: 400 },
    { ...huile, quantiteG: 20 },
  ],
  statut: 'approuvee',
  regimesConfirmes: [],
};

describe('besoins', () => {
  it('calcule l’âge à la date du jour', () => {
    expect(age('1996-05-10', '2026-05-09')).toBe(29);
    expect(age('1996-05-10', '2026-05-10')).toBe(30);
  });

  it('Mifflin-St Jeor × activité, ajusté à l’objectif', () => {
    const r = calculerBesoins(profil, '2026-10-24');
    expect(r.manque).toEqual([]);
    // 10×65 + 6,25×165 − 5×30 − 161 = 1370 ; × 1,55 = 2124 ; × 0,8 = 1700
    expect(r.besoins).toMatchObject({ metabolisme: 1370, depense: 2124, kcal: 1700, proteines: 130, lipides: 55, glucides: 170 });
  });

  it('prend la dernière pesée quand le poids du profil est vide, et dit ce qui manque', () => {
    expect(calculerBesoins({ ...profil, poidsKg: undefined }, '2026-10-24', 70).besoins?.poidsKg).toBe(70);
    expect(calculerBesoins({ clientId: 'c', regimes: [] }, '2026-10-24').manque).toContain('date de naissance');
  });

  it('low carb limite les glucides à 20 % ; jamais sous le métabolisme de base', () => {
    const lc = calculerBesoins({ ...profil, regimes: ['low_carb'] }, '2026-10-24').besoins!;
    expect(lc.glucides).toBe(85);
    expect(lc.proteines * 4 + lc.glucides * 4 + lc.lipides * 9).toBeLessThanOrEqual(lc.kcal + 45);
    const sedentaire = calculerBesoins({ ...profil, activite: 'sedentaire' }, '2026-10-24').besoins!;
    expect(sedentaire.kcal).toBeGreaterThanOrEqual(sedentaire.metabolisme);
  });

  it('les objectifs du coach passent avant le calcul', () => {
    const b = calculerBesoins(profil, '2026-10-24').besoins!;
    expect(objectifsDuJour({ clientId: 'c', calories: 1900, proteinesG: 110 }, b)).toMatchObject({ source: 'coach', kcal: 1900, proteines: 110, glucides: b.glucides });
    expect(objectifsDuJour(null, b)?.source).toBe('calcul');
    expect(objectifsDuJour(null, undefined)).toBeUndefined();
  });
});

describe('recettes', () => {
  it('total et portion', () => {
    const { total, parPortion } = totalRecette(recette);
    expect(Math.round(total.kcal)).toBe(360 + 520 + 180);
    expect(Math.round(parPortion.proteines)).toBe(Math.round((69 + 12) / 2));
  });

  it('régimes déduits des ingrédients ; sans gluten seulement si confirmé', () => {
    expect(convientAuRegime(recette, 'vegetarien')).toBe(false);
    expect(convientAuRegime(recette, 'pescetarien')).toBe(false);
    expect(convientAuRegime(recette, 'sans_lactose')).toBe(true);
    expect(convientAuRegime(recette, 'sans_gluten')).toBe(false);
    expect(convientAuRegime({ ...recette, regimesConfirmes: ['sans_gluten'] }, 'sans_gluten')).toBe(true);
  });

  it('adapte pour un végétarien en gardant les protéines', () => {
    const { recette: r, adaptations, impossibles } = adapterAuxRegimes(recette, ['vegetarien']);
    expect(impossibles).toEqual([]);
    expect(adaptations).toHaveLength(1);
    expect(adaptations[0].apres.nom).toBe('Tofu ferme');
    // 300 g de poulet = 69 g de protéines ; à 15 g/100 g il faudrait 460 g, plafonné à 450 g.
    expect(adaptations[0].apres.quantiteG).toBe(450);
    expect(convientAuRegime(r, 'vegetarien')).toBe(true);
  });

  it('ajuste une portion à la cible du repas', () => {
    const { macros } = adapterAuxBesoins(recette, { kcal: 600, proteines: 45, glucides: 0, lipides: 0 });
    expect(Math.abs(macros.kcal - 600)).toBeLessThan(5);
    expect(Math.abs(macros.proteines - 45)).toBeLessThan(1);
  });

  it('écarte les recettes qui contiennent une exclusion, propose les adaptables', () => {
    expect(exclusionsTrouvees(recette, 'arachides, riz')).toEqual(['riz']);
    expect(recettesPourLeClient([recette], { ...profil, regimes: ['vegetarien'] })[0].adaptation).toBeDefined();
    expect(recettesPourLeClient([recette], { ...profil, exclusions: 'poulet' })).toHaveLength(0);
  });

  it('une recette dans le journal : macros × portions', () => {
    const e = entreeRecette(recette, 1.5, { id: 'e', clientId: 'c', date: '2026-10-24', moment: 'dejeuner' });
    expect(e.kcal).toBe(Math.round(1060 * 0.75));
    const jour = totauxDuJour([e], '2026-10-24');
    expect(jour.parMoment.find((m) => m.cle === 'dejeuner')?.entrees).toHaveLength(1);
  });
});

describe('aliments', () => {
  const base: Aliment[] = [
    { id: '1', ...riz, source: 'base' },
    { id: '2', nom: 'Galettes de riz', kcal: 380, proteines: 8, glucides: 80, lipides: 3, contient: [], source: 'base' },
    { id: '3', nom: 'Riz au lait', marque: 'Marque', kcal: 120, proteines: 3, glucides: 20, lipides: 3, contient: ['lait'], source: 'off' },
  ];
  it('recherche sans accents, les noms qui commencent par la recherche d’abord', () => {
    expect(rechercherAliments(base, 'riz').map((a) => a.id)).toEqual(['3', '1', '2']);
    expect(rechercherAliments(base, 'GALETTE').map((a) => a.id)).toEqual(['2']);
  });

  it('valide un aliment saisi à la main', () => {
    expect(erreursAliment({ nom: 'x', kcal: 100, proteines: 60, glucides: 50, lipides: 0 })).toHaveLength(1);
    expect(erreursAliment({ nom: '', kcal: undefined, proteines: 1, glucides: 1, lipides: 1 })).toHaveLength(2);
  });

  it('lit une fiche Open Food Facts', () => {
    const a = lireProduitOff('3017620422003', {
      status: 1,
      product: {
        product_name_fr: 'Pâte à tartiner',
        brands: 'Marque, Autre',
        serving_quantity: 15,
        allergens_tags: ['en:milk', 'en:nuts'],
        nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
      },
    });
    expect(a).toMatchObject({ nom: 'Pâte à tartiner', marque: 'Marque', kcal: 539, portionG: 15, contient: ['lait'], source: 'off' });
    expect(lireProduitOff('1', { status: 0 })).toBeUndefined();
    expect(lireProduitOff('1', { status: 1, product: { product_name: 'x', nutriments: { fat_100g: 1 } } })).toBeUndefined();
  });
});
