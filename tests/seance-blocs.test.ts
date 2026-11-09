import { describe, expect, it } from 'vitest';

import { consigneBloc, dureeSeance, enTeteBloc, similaires, texteRemplacements, titreBloc, tonnage } from '../src/domain/seance-blocs';
import type { Exercice, LignePrescription } from '../src/domain/types';

const exo = (id: string, nom: string, muscles: string[], famille?: string, materiel: string[] = []): Exercice => ({ id, nom, mesures: ['charge', 'repetitions'], muscles, famille, materiel });
const ligne = (id: string, nom: string, extra: Partial<LignePrescription> = {}): LignePrescription => ({ id, exercice: exo(`e-${id}`, nom, []), series: 3, ...extra });

describe('exercices similaires', () => {
  const rowing = exo('r', 'Rowing poulie basse', ['Dos', 'Biceps'], 'Tirages horizontaux', ['Poulie']);
  const catalogue = [
    rowing,
    exo('a', 'Rowing haltère un bras', ['Dos', 'Biceps'], 'Tirages horizontaux', ['Haltère']),
    exo('b', 'Rowing machine', ['Dos', 'Biceps'], 'Tirages horizontaux', ['Poulie']),
    exo('c', 'Tirage horizontal TRX', ['Dos'], 'Tirages horizontaux', ['TRX']),
    exo('d', 'Squat', ['Quadriceps'], 'Squat et presse', ['Barre']),
    exo('e', 'Curl biceps', ['Biceps'], 'Bras', ['Haltère']),
  ];

  it('propose d’abord les mêmes muscles et la même famille, avec un autre matériel en tête', () => {
    expect(similaires(catalogue, rowing, 4).map((e) => e.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('ne propose ni l’exercice lui-même ni un exercice sans rapport', () => {
    const ids = similaires(catalogue, rowing, 10).map((e) => e.id);
    expect(ids).not.toContain('r');
    expect(ids).not.toContain('d');
  });

  it('sans muscles ni famille connus, ne propose rien (le client cherche par nom)', () => {
    expect(similaires(catalogue, { id: 'x', nom: 'Exercice maison' })).toEqual([]);
  });
});

describe('en-tête et consigne d’un bloc', () => {
  it('superset de deux exercices', () => {
    const b = { format: 'Superset' as const, lignes: [ligne('1', 'Développé'), ligne('2', 'Rowing', { recuperationS: 90 })] };
    expect(enTeteBloc(b)).toBe('Superset · 3 tours');
    expect(consigneBloc(b)).toBe('A puis B sans pause, 1 min 30 de repos après chaque tour.');
  });

  it('exercice seul : nombre de séries, pas de consigne d’enchaînement', () => {
    const b = { lignes: [ligne('1', 'Squat', { series: 4 })] };
    expect(enTeteBloc(b)).toBe('4 séries');
    expect(consigneBloc(b)).toBeUndefined();
  });

  it('bloc classique à plusieurs exercices : pas d’enchaînement', () => {
    const b = { format: 'Classique' as const, lignes: [ligne('1', 'Squat'), ligne('2', 'Fentes')] };
    expect(enTeteBloc(b)).toBe('2 exercices');
    expect(consigneBloc(b)).toBeUndefined();
  });

  it('sans format, le titre du coach dit s’il faut enchaîner', () => {
    const lignes = [ligne('1', 'A', { series: 4 }), ligne('2', 'B', { series: 4 })];
    expect(enTeteBloc({ titre: '4 · Compléments en superset', lignes })).toBe('Superset · 4 tours');
    expect(enTeteBloc({ titre: '4 · Compléments', lignes })).toBe('2 exercices');
    expect(consigneBloc({ titre: '4 · Compléments', lignes })).toBeUndefined();
  });

  it('titre sans numéro d’ordre', () => {
    expect(titreBloc('4 · Compléments en superset')).toBe('Compléments en superset');
    expect(titreBloc('Échauffement')).toBe('Échauffement');
  });
});

describe('bilan', () => {
  it('tonnage : charge × répétitions des séries saisies, virgule acceptée', () => {
    expect(tonnage({ 'a:1': { charge: '22,5', repetitions: '10' }, 'a:2': { charge: '20', repetitions: '' }, 'b:1': { duree: '30' } })).toBe(225);
  });

  it('remplacements expliqués au coach', () => {
    const l = [ligne('1', 'Rowing poulie basse'), ligne('2', 'Squat')];
    expect(texteRemplacements(l, { '1': { exercice: { id: 'c', nom: 'Tirage horizontal TRX' }, raison: 'Machine prise' } })).toBe(
      '⇄ Rowing poulie basse → Tirage horizontal TRX (Machine prise)',
    );
  });

  it('durée de la séance', () => {
    const debut = '2026-11-09T18:00:00.000Z';
    expect(dureeSeance(debut, new Date('2026-11-09T18:52:10Z').getTime())).toBe('52 min');
    expect(dureeSeance(debut, new Date('2026-11-09T19:05:00Z').getTime())).toBe('1 h 05');
  });
});

describe('circuit au chrono', () => {
  it('deux exercices au temps, même nombre de tours : un circuit, même sans le mot dans le titre', () => {
    const lignes = [ligne('1', 'Dead bug', { series: 4, dureeS: 20, recuperationS: 10 }), ligne('2', 'Planche', { series: 4, dureeS: 20, recuperationS: 10 })];
    expect(enTeteBloc({ titre: '2 · Abdos · 4 min · 20/10', lignes })).toBe('Circuit · 4 tours');
  });
});
