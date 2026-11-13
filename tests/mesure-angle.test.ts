import { describe, expect, it } from 'vitest';

import { evaluationVide, syntheseEvaluation } from '../src/domain/evaluation';
import { angleAvecAxe, angleTroisPoints, calculerAngle, MESURES_MOBILITE, MESURES_POSTURE } from '../src/domain/mesure-angle';
import { TESTS_GOLF } from '../src/domain/tests-golf';

describe('mesure d’angle en vidéo', () => {
  it('calcule l’angle au sommet', () => {
    expect(angleTroisPoints({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
    expect(angleTroisPoints({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45);
    expect(angleTroisPoints({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(180);
  });

  it('mesure l’écart avec la verticale ou l’horizontale, quel que soit l’ordre des points', () => {
    expect(angleAvecAxe({ x: 0, y: 0 }, { x: 0, y: 10 }, 'verticale')).toBe(0);
    expect(angleAvecAxe({ x: 0, y: 10 }, { x: 10, y: 0 }, 'verticale')).toBeCloseTo(45);
    expect(angleAvecAxe({ x: 0, y: 0 }, { x: 100, y: 5 }, 'horizontale')).toBeCloseTo(2.86, 1);
    expect(angleAvecAxe({ x: 100, y: 5 }, { x: 0, y: 0 }, 'horizontale')).toBeCloseTo(2.86, 1);
  });

  it('attend le bon nombre de points, puis arrondit au degré', () => {
    expect(calculerAngle('trois-points', [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeUndefined();
    expect(calculerAngle('verticale', [{ x: 0, y: 0 }, { x: 10, y: 17.32 }])).toBe(30);
  });

  it('chaque façon de mesurer nomme autant de points qu’il en faut', () => {
    for (const m of [...MESURES_MOBILITE, ...MESURES_POSTURE]) expect(m.points).toHaveLength(m.mode === 'trois-points' ? 3 : 2);
    expect(TESTS_GOLF.filter((t) => t.video).map((t) => t.id)).toEqual(['rotationThoracique', 'rotationHanches']);
  });

  it('met les mesures vidéo dans le compte rendu', () => {
    const e = { ...evaluationVide(), tests: { posture: { observations: [], resultat: 'Légère asymétrie', mesures: [{ libelle: 'Inclinaison des épaules', angle: 3 }] } } };
    expect(syntheseEvaluation(e)).toContain('POSTURE — Légère asymétrie | mesures vidéo : Inclinaison des épaules 3°');
  });
});
