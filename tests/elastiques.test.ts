import { describe, expect, it } from 'vitest';

import catalogue from '@/data/catalogue-demo.json';
import {
  COULEURS_ELASTIQUE,
  couleursProposees,
  elastiqueDepuis,
  exercicesAvecElastique,
  lireElastique,
  lireReglagesElastiques,
  REGLAGES_ELASTIQUES,
  texteElastique,
  usageElastique,
} from '@/domain/elastiques';
import { rechercherExercices, resumeLigne } from '@/domain/programmes';
import type { Exercice } from '@/domain/types';

const ex = (nom: string, materiel: string[]) => ({ nom, materiel });

describe('usageElastique', () => {
  it('propose l’aide sur les mouvements au poids du corps qu’un élastique allège', () => {
    expect(usageElastique(ex('Traction pronation stricte — poids du corps', ['Barre de traction']))).toBe('aide');
    expect(usageElastique(ex('Dips buste vertical — poids du corps', ['Poids du corps']))).toBe('aide');
    expect(usageElastique(ex('Dips buste incliné', ['Barres parallèles']))).toBe('aide');
    expect(usageElastique(ex('Squat pistol — poids du corps', ['Poids du corps']))).toBe('aide');
    expect(usageElastique(ex('Nordic curl — poids du corps', ['Poids du corps']))).toBe('aide');
    expect(usageElastique(ex('Pompe — poids du corps', ['Poids du corps']))).toBe('aide');
    expect(usageElastique(ex('Traction assistée élastique — élastique', ['Élastique']))).toBe('aide');
  });

  it('propose la résistance quand l’élastique fait le mouvement ou le durcit', () => {
    expect(usageElastique(ex('Pull-apart — élastique', ['Élastique']))).toBe('resistance');
    expect(usageElastique(ex('Monster walk mini-band', ['Mini-band']))).toBe('resistance');
    expect(usageElastique(ex('Squat poids du corps', ['Poids du corps']))).toBe('resistance');
    expect(usageElastique(ex('Pont fessier — poids du corps', ['Poids du corps']))).toBe('resistance');
  });

  it('ne propose rien quand un élastique n’a pas sa place', () => {
    expect(usageElastique(ex('Développé couché — barre', ['Barre', 'Banc']))).toBeUndefined();
    expect(usageElastique(ex('Traction — machine', ['Machine']))).toBeUndefined();
    expect(usageElastique(ex('Planche avant-bras', ['Poids du corps']))).toBeUndefined();
    expect(usageElastique(ex('Rétraction cervicale', ['Aucun']))).toBeUndefined();
    expect(usageElastique(ex('Squat cosaque mobilité', ['Aucun']))).toBeUndefined();
  });

  it('trouve dans le catalogue au moins les tractions, dips et exercices élastiques', () => {
    const { aide, resistance } = exercicesAvecElastique(catalogue as Exercice[]);
    expect(aide.length).toBeGreaterThan(25);
    expect(resistance.length).toBeGreaterThan(55);
    expect(aide.map((e) => e.nom)).toContain('Dips assistés — élastique');
  });
});

describe('réglages et ligne', () => {
  it('relit les réglages en gardant les couleurs de départ pour ce qui manque', () => {
    const r = lireReglagesElastiques({ couleurs: [{ cle: 'rouge', force: '5–15 kg', active: false }, { cle: 'inconnue', force: 'x' }] });
    expect(r.couleurs).toHaveLength(COULEURS_ELASTIQUE.length);
    expect(r.couleurs.find((c) => c.cle === 'rouge')).toMatchObject({ force: '5–15 kg', active: false, hex: '#D32F2F' });
    expect(lireReglagesElastiques(null)).toEqual(REGLAGES_ELASTIQUES);
  });

  it('propose les couleurs actives et garde celle déjà choisie', () => {
    const r = lireReglagesElastiques({ couleurs: [{ cle: 'rouge', active: false }] });
    expect(couleursProposees(r).some((c) => c.cle === 'rouge')).toBe(false);
    expect(couleursProposees(r, 'rouge').some((c) => c.cle === 'rouge')).toBe(true);
  });

  it('écrit ce que lit le client et refuse une valeur abîmée', () => {
    const e = elastiqueDepuis(COULEURS_ELASTIQUE[1], 'aide');
    expect(texteElastique(e)).toBe('Élastique rouge · aide ≈ 7–16 kg');
    expect(lireElastique(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(lireElastique({ couleur: 'rose', sens: 'aide' })).toBeUndefined();
    expect(lireElastique({ couleur: 'rouge', sens: 'autre' })).toBeUndefined();
  });

  it('cite l’élastique dans le résumé de la ligne', () => {
    const l = { id: 'l', exercice: { id: 'e', nom: 'Traction', mesures: ['repetitions' as const] }, series: 3, repetitionsMin: 6, elastique: elastiqueDepuis(COULEURS_ELASTIQUE[2], 'aide') };
    expect(resumeLigne(l)).toContain('élastique noir');
  });

  it('sort les tractions quand on cherche « élastique »', () => {
    const noms = rechercherExercices(catalogue as Exercice[], 'élastique traction', undefined, 100).exercices.map((e) => e.nom);
    expect(noms).toContain('Traction pronation stricte — poids du corps');
  });
});
