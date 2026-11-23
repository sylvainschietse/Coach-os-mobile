import { describe, expect, it } from 'vitest';

import { syntheseEvaluation, TESTS } from '@/domain/evaluation';
import {
  ajouterExercice,
  basculerPropose,
  ecartExercice,
  exercicesRenseignes,
  formaterValeur,
  lireValeur,
  modifierExercice,
  resumeExercices,
  valeurInvalide,
  type ExerciceTest,
} from '@/domain/exercices-test';
import { resumeTest, syntheseTest, testClientVide, testVide } from '@/domain/tests-client';

let n = 0;
const id = () => `e${++n}`;

describe('exercices des tests', () => {
  it('toucher un exercice proposé l’ajoute avec sa mesure habituelle, le retoucher le retire', () => {
    let l = basculerPropose(undefined, 'core', 'Planche', id);
    expect(l).toMatchObject([{ categorie: 'core', nom: 'Planche', mesure: 'temps', valeur: '' }]);
    l = basculerPropose(l, 'poussee', 'Pompes', id);
    expect(l).toHaveLength(2);
    expect(basculerPropose(l, 'core', 'Planche', id)).toMatchObject([{ nom: 'Pompes' }]);
  });

  it('plusieurs exercices par catégorie et un exercice libre à nommer', () => {
    let l = basculerPropose(undefined, 'jambes', 'Squat', id);
    l = basculerPropose(l, 'jambes', 'Chaise contre le mur', id);
    l = ajouterExercice(l, 'libre', 'x');
    expect(exercicesRenseignes(l)).toBe(2);
    l = modifierExercice(l, 'x', { nom: 'Rameur', mesure: 'calories', valeur: '20' });
    expect(exercicesRenseignes(l)).toBe(3);
    expect(resumeExercices(l, 'libre')).toBe('Rameur : 20 cal');
  });

  it('lit et affiche chaque façon de mesurer', () => {
    expect(lireValeur('temps', '1:30')).toBe(90);
    expect(lireValeur('reps', '12,5')).toBe(12.5);
    expect(lireValeur('note', '12')).toBeUndefined();
    expect(formaterValeur('temps', '90')).toBe('1 min 30 s');
    expect(formaterValeur('temps', '45')).toBe('45 s');
    expect(formaterValeur('distance', '1500')).toBe('1,5 km');
    expect(formaterValeur('reps', '12')).toBe('12 rép.');
    expect(formaterValeur('note', ' Bonne technique ')).toBe('Bonne technique');
    expect(valeurInvalide({ mesure: 'reps', valeur: 'douze' })).toBe(true);
    expect(valeurInvalide({ mesure: 'note', valeur: 'douze' })).toBe(false);
  });

  it('donne l’écart avec la dernière fois si la mesure est la même', () => {
    const avant: ExerciceTest = { id: 'a', categorie: 'core', nom: 'Planche', mesure: 'temps', valeur: '45' };
    expect(ecartExercice({ ...avant, id: 'b', valeur: '1:00' }, avant)).toBe('+15 s');
    expect(ecartExercice({ ...avant, id: 'b', valeur: '45' }, avant)).toBe('stable');
    expect(ecartExercice({ ...avant, id: 'b', mesure: 'reps', valeur: '10' }, avant)).toBeUndefined();
    expect(resumeExercices([{ ...avant, id: 'b', valeur: '60', variante: 'sur les genoux' }], 'core', [avant])).toBe(
      'Planche (sur les genoux) : 1 min (+15 s)',
    );
  });

  it('Centre du corps fait partie des tests du Booster et la synthèse reprend les exercices', () => {
    expect(TESTS.map((t) => t.id)).toContain('core');
    const texte = syntheseEvaluation({
      tests: { core: { resultat: 'Correct', observations: ['Bas du dos creusé'] } },
      exercices: [
        { id: '1', categorie: 'core', nom: 'Planche', mesure: 'temps', valeur: '50' },
        { id: '2', categorie: 'poussee', nom: 'Pompes', mesure: 'reps', valeur: '8', variante: 'sur les genoux' },
        { id: '3', categorie: 'libre', nom: 'Vélo', mesure: 'calories', valeur: '15' },
      ],
    });
    expect(texte).toContain('CENTRE DU CORPS — Correct | Bas du dos creusé | exercices : Planche : 50 s');
    expect(texte).toContain('POUSSÉE — non renseigné | exercices : Pompes (sur les genoux) : 8 rép.');
    expect(texte).toContain('EXERCICES AU CHOIX — Vélo : 15 cal');
  });

  it('fiche client : un test avec seulement des exercices s’enregistre et se résume', () => {
    const t = { ...testVide('t', 'c', '2026-11-13'), exercices: [{ id: '1', categorie: 'tirage' as const, nom: 'Rowing haltère', mesure: 'reps' as const, valeur: '10', variante: '12 kg' }] };
    expect(testClientVide(t)).toBe(false);
    expect(resumeTest(t)).toBe('1 exercice');
    expect(syntheseTest(t)).toBe('TIRAGE — Rowing haltère (12 kg) : 10 rép.');
  });
});
