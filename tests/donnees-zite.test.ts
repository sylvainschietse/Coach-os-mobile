import { describe, expect, it } from 'vitest';

import { convientAuRegime, lireRecette, totalRecette } from '@/domain/alimentation';
import type { Aliment, Recette } from '@/domain/types';

import aliments from '../src/data/aliments-base.json';
import recettes from '../supabase/donnees/recettes-zite.json';

const base = aliments as Aliment[];
const banque = (recettes as unknown as Recette[]).map(lireRecette);
const trouver = (nom: string) => base.find((a) => a.nom === nom)!;

describe('table Ciqual importée', () => {
  it('3 339 aliments aux identifiants uniques, valeurs dans les bornes', () => {
    expect(base).toHaveLength(3339);
    expect(new Set(base.map((a) => a.id)).size).toBe(base.length);
    for (const a of base) {
      expect(a.kcal).toBeGreaterThanOrEqual(0);
      expect(a.kcal).toBeLessThanOrEqual(900);
      expect(a.codeCiqual).toBeTruthy();
    }
  });

  it('valeurs Ciqual reprises telles quelles', () => {
    expect(trouver('Poulet, filet sans peau cru')).toMatchObject({ kcal: 110, proteines: 23.4, contient: ['viande'] });
  });

  it('ce que contient l’aliment est déduit du groupe et du nom', () => {
    expect(trouver('Lait demi-écrémé, UHT').contient).toEqual(['lait']);
    expect(trouver('Tofu nature, préemballé').contient).toEqual([]);
    expect(base.find((a) => a.nom.startsWith('Laitue'))!.contient).not.toContain('lait');
  });

  it('un nutriment non mesuré est marqué inconnu, pas zéro', () => {
    const inconnus = base.filter((a) => a.valeursInconnues?.length);
    expect(inconnus.length).toBeGreaterThan(0);
    for (const a of inconnus) for (const v of a.valeursInconnues!) expect(a[v]).toBe(0);
  });
});

describe('200 recettes importées', () => {
  it('chacune garde sa source, ses valeurs publiées et arrive en brouillon', () => {
    expect(banque).toHaveLength(200);
    for (const r of banque) {
      expect(r.statut).toBe('brouillon');
      expect(r.origine?.url).toMatch(/^https:\/\//);
      expect(totalRecette(r).parPortion.kcal).toBeGreaterThan(0);
    }
  });

  it('les recettes publiées véganes le restent avec nos règles', () => {
    for (const r of banque.filter((x) => x.regimeSource === 'vegan')) expect(convientAuRegime(r, 'vegan')).toBe(true);
    for (const r of banque.filter((x) => x.regimeSource === 'vegetarien')) expect(convientAuRegime(r, 'vegetarien')).toBe(true);
  });
});
