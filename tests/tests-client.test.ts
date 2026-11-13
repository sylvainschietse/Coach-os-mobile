import { describe, expect, it } from 'vitest';

import { golfAvant, mesureAvant, resumeTest, syntheseTest, testClientVide, testVide, type TestClient } from '../src/domain/tests-client';

const t = (id: string, date: string, extra: Partial<TestClient> = {}): TestClient => ({ ...testVide(id, 'c', date), ...extra });

describe('tests d’un client suivi', () => {
  it('un test sans rien de saisi est vide', () => {
    expect(testClientVide(testVide('a', 'c', '2026-11-13'))).toBe(true);
    expect(testClientVide(t('a', '2026-11-13', { mesures: { posture: [{ libelle: 'Épaules', angle: 3 }] } }))).toBe(false);
  });

  it('retrouve la même mesure au test précédent, sans tenir compte des majuscules', () => {
    const tests = [
      t('1', '2026-10-01', { mesures: { mobilite: [{ libelle: 'Rotation des hanches', angle: 30 }] } }),
      t('2', '2026-10-20', { mesures: { mobilite: [{ libelle: 'rotation des hanches ', angle: 34 }] } }),
    ];
    expect(mesureAvant(tests, { id: '3', date: '2026-11-13' }, 'mobilite', 'Rotation des hanches')).toBe(34);
    expect(mesureAvant(tests, { id: '2', date: '2026-10-20' }, 'mobilite', 'Rotation des hanches')).toBe(30);
    expect(mesureAvant(tests, { id: '3', date: '2026-11-13' }, 'posture', 'Rotation des hanches')).toBeUndefined();
  });

  it('prend le dernier test golf comme référence', () => {
    const golf = { actif: true, mesures: { sautVertical: { hauteur: '40' } } };
    const tests = [t('1', '2026-09-01', { golf }), t('2', '2026-10-01'), t('3', '2026-10-15', { golf })];
    expect(golfAvant(tests, { id: 'n', date: '2026-11-13' })?.id).toBe('3');
  });

  it('résume et rédige le test', () => {
    const x = t('1', '2026-11-13', {
      golf: { actif: true, mesures: { sautVertical: { hauteur: '40' } } },
      mesures: { posture: [{ libelle: 'Inclinaison des épaules', angle: 3 }] },
      notes: 'RAS',
    });
    expect(resumeTest(x)).toBe('1 test golf · 1 mesure vidéo');
    expect(syntheseTest(x)).toContain('POSTURE — Inclinaison des épaules 3°');
    expect(syntheseTest(x)).toContain('GOLF · SAUT VERTICAL SANS ÉLAN — meilleur saut 40 cm');
  });
});
