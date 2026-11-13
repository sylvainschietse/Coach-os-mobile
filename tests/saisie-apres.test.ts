import { describe, expect, it } from 'vitest';

import { lireDicteeSimple, remplirDepuisDictee, seanceDetaillee, type LigneADicter } from '../src/domain/saisie-apres';

const LIGNES: LigneADicter[] = [
  { id: 'tirage', nom: 'Tirage vertical', series: 4, mesures: ['charge', 'repetitions'] },
  { id: 'pompes', nom: 'Pompes diamant', series: 3, mesures: ['charge', 'repetitions'] },
  { id: 'triceps', nom: 'Extension triceps poulie', series: 3, mesures: ['charge', 'repetitions'] },
  { id: 'gainage', nom: 'Gainage', series: 3, mesures: ['duree', 'charge'] },
];

describe('saisie après la séance', () => {
  it('une charge dite une fois vaut pour les séries suivantes', () => {
    const r = remplirDepuisDictee(LIGNES, { lignes: [{ ligneId: 'tirage', series: [{ charge: 50, repetitions: 10 }, { repetitions: 10 }, { repetitions: 9 }, { repetitions: 8 }] }] });
    expect(r.vals['tirage:1']).toEqual({ charge: '50', repetitions: '10' });
    expect(r.vals['tirage:4']).toEqual({ charge: '50', repetitions: '8' });
    expect(r.manques).toEqual([]);
    expect(r.dictees).toEqual(['tirage']);
  });

  it('signale les séries dont il manque le chiffre, et laisse « comme prévu » vide', () => {
    const r = remplirDepuisDictee(LIGNES, {
      lignes: [
        { ligneId: 'gainage', series: [{ duree: 40 }, { duree: 40 }] },
        { ligneId: 'pompes', series: [] },
      ],
    });
    expect(r.manques).toEqual(['gainage:3']);
    expect(r.vals['gainage:2']).toEqual({ duree: '40' });
    expect(Object.keys(r.vals).some((k) => k.startsWith('pompes'))).toBe(false);
    expect(r.dictees).toEqual(['pompes', 'gainage']);
  });

  it('lit une dictée simple sans IA', () => {
    const d = lireDicteeSimple(
      'La mobilité ok. Tirage 50 kilos, 10, 10, 9, 8. Les pompes j’en ai fait 12, 10 et 8. Triceps poulie 22,5 kg 12 12 10. Le gainage comme prévu.',
      LIGNES,
    );
    const tirage = d.lignes.find((l) => l.ligneId === 'tirage')!;
    expect(tirage.series).toEqual([{ repetitions: 10, charge: 50 }, { repetitions: 10 }, { repetitions: 9 }, { repetitions: 8 }]);
    expect(d.lignes.find((l) => l.ligneId === 'pompes')!.series.map((s) => s.repetitions)).toEqual([12, 10, 8]);
    expect(d.lignes.find((l) => l.ligneId === 'triceps')!.series[0]).toEqual({ repetitions: 12, charge: 22.5 });
    expect(d.lignes.find((l) => l.ligneId === 'gainage')!.series).toEqual([]);
    const r = remplirDepuisDictee(LIGNES, d);
    expect(r.vals['triceps:3']).toEqual({ charge: '22,5', repetitions: '10' });
  });

  it('une séance est détaillée quand chaque exercice a une série', () => {
    expect(seanceDetaillee(['a', 'b'], [{ ligneId: 'a' }, { ligneId: 'b' }])).toBe(true);
    expect(seanceDetaillee(['a', 'b'], [{ ligneId: 'a' }])).toBe(false);
    expect(seanceDetaillee([], [])).toBe(false);
  });
});
