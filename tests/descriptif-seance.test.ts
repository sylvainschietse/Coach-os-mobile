// Descriptif automatique d'une séance créée par le coach.
import { describe, expect, it } from 'vitest';

import { descriptifSeance } from '@/domain/descriptif-seance';
import type { Bloc, LignePrescription, Seance } from '@/domain/types';

const ligne = (nom: string, l: Partial<LignePrescription> = {}): LignePrescription => ({
  id: nom,
  exercice: { id: nom, nom, mesures: ['charge', 'repetitions'] },
  series: 3,
  ...l,
});
const seance = (blocs: Bloc[], s: Partial<Seance> = {}): Seance => ({ id: 's', titre: 'Jambes', blocs, ...s });

describe('descriptifSeance', () => {
  it('ne dit rien pour une séance vide', () => {
    expect(descriptifSeance(seance([{ id: 'b', titre: 'Renforcement', lignes: [] }]))).toBe('');
  });

  it('décrit un superset et rappelle ce que c’est, avec le tempo et le RIR', () => {
    const t = descriptifSeance(
      seance(
        [
          { id: 'e', titre: 'Échauffement', lignes: [ligne('Vélo', { series: 1, dureeS: 600 })] },
          {
            id: 'r',
            titre: 'Renforcement',
            format: 'Superset',
            tempo: '3-1-1-0',
            contraction: 'Excentrique lente',
            description: 'Charge modérée.',
            lignes: [ligne('Squat', { series: 4, repetitionsMin: 8, repetitionsMax: 10, rir: 2 }), ligne('Rowing', { series: 4, repetitionsMin: 8, repetitionsMax: 10, recuperationS: 90 })],
          },
        ],
        { dureeMin: 45 },
      ),
    );
    expect(t).toContain('2 parties : échauffement et renforcement');
    expect(t).toContain('environ 45 minutes');
    expect(t).toContain('En superset : Squat puis Rowing, sans pause entre les exercices. 4 tours. Récupération de 90 s après chaque tour.');
    expect(t).toContain('Tempo 3-1-1-0. Contraction : excentrique lente. Charge modérée.');
    expect(t).toContain('développement musculaire');
    expect(t).toMatch(/Superset : deux exercices/);
    expect(t).toMatch(/Tempo : la vitesse/);
    expect(t).toMatch(/Excentrique lente : on freine/);
    expect(t).toMatch(/RIR \(répétitions en réserve\)/);
    expect(t).not.toMatch(/Biset :/);
  });

  it('reprend l’objectif écrit par le coach plutôt que de le deviner', () => {
    const t = descriptifSeance(seance([{ id: 'b', titre: 'Force', lignes: [ligne('Squat', { repetitionsMin: 3 }), ligne('Dips', { repetitionsMin: 3 })] }], { objectif: 'Préparer le trail' }));
    expect(t).toContain('Objectif : Préparer le trail.');
    expect(t).not.toContain('visent surtout la force');
  });
});
