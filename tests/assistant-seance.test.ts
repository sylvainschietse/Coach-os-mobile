import { describe, expect, it } from 'vitest';

import { blocsProposes } from '../src/domain/assistant-seance';

let n = 0;
const id = () => `id-${++n}`;

describe('assistant de création de séance', () => {
  it('convertit la proposition en blocs pour l’éditeur', () => {
    const blocs = blocsProposes(
      {
        blocs: [
          { titre: 'Gainage en alternance', lignes: [{ exercice: { id: 'e1', nom: 'Dead bug', mesures: ['duree'] }, series: 4, dureeS: 20, recuperationS: 10, phase: 'Principal' }] },
          { titre: 'Référence', lignes: [{ exercice: { id: 'e2', nom: 'Squat barre', mesures: ['charge', 'repetitions'] }, series: 4, repetitions: '6–8', recuperationS: 150, rir: 2, phase: 'Principal' }] },
        ],
      },
      id,
    );
    expect(blocs).toHaveLength(2);
    expect(blocs[0].lignes[0]).toMatchObject({ dureeS: 20, repetitions: undefined, series: 4 });
    expect(blocs[1].lignes[0]).toMatchObject({ repetitions: '6–8', repetitionsMin: 6, repetitionsMax: 8, rir: 2, recuperationS: 150 });
  });

  it('ramène les valeurs hors bornes et écarte les lignes sans exercice', () => {
    const blocs = blocsProposes(
      {
        blocs: [
          {
            titre: '',
            lignes: [
              { exercice: { id: 'e1', nom: 'Rowing haltère', mesures: ['inconnue'] }, series: 12, repetitions: '10', recuperationS: 900, rir: 9, phase: 'Bizarre' },
              { exercice: { id: 'e2', nom: '' }, series: 3 },
            ],
          },
          { titre: 'Vide', lignes: [] },
        ],
      },
      id,
    );
    expect(blocs).toHaveLength(1);
    expect(blocs[0].titre).toBe('Bloc 1');
    expect(blocs[0].lignes).toHaveLength(1);
    expect(blocs[0].lignes[0]).toMatchObject({ series: 8, recuperationS: 600, rir: 5, phase: 'Principal' });
    expect(blocs[0].lignes[0].exercice.mesures).toEqual(['charge', 'repetitions']);
  });
});
