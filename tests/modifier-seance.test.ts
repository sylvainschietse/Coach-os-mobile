import { describe, expect, it } from 'vitest';

import { changementsSeance, demandeModification, fusionnerBlocs } from '../src/domain/modifier-seance';
import type { Bloc, LignePrescription } from '../src/domain/types';

const ex = (id: string, nom: string) => ({ id, nom, mesures: [] });
const ligne = (id: string, exId: string, nom: string, series = 4, repetitions = '10', autre: Partial<LignePrescription> = {}): LignePrescription => ({
  id,
  exercice: ex(exId, nom),
  series,
  repetitions,
  ...autre,
});

const actuels: Bloc[] = [
  {
    id: 'b1',
    titre: 'Renforcement',
    format: 'Superset',
    lignes: [
      ligne('l1', 'dc', 'Développé couché', 4, '10', { elastique: { couleur: 'Rouge', sens: 'resistance' } as never }),
      ligne('l2', 'ro', 'Rowing haltère', 4, '10', { tempo: '3-1-1-0' }),
    ],
  },
  { id: 'b2', titre: 'Gainage', lignes: [ligne('l3', 'pl', 'Planche', 3, undefined as never, { dureeS: 30 })] },
];

describe('modifier une séance en la dictant', () => {
  it('envoie la séance actuelle et la consigne', () => {
    const d = demandeModification('Pecs', actuels, 'remplace le développé couché par des pompes');
    expect(d).toContain('Développé couché : 4 × 10');
    expect(d).toContain('Planche : 3 × 30 s');
    expect(d).toContain('Modification demandée par le coach : remplace le développé couché par des pompes');
  });

  it('séance vide : la consigne seule', () => {
    expect(demandeModification('Pecs', [], 'pecs 45 min')).toBe('Séance « Pecs ». pecs 45 min');
  });

  it('remplace un exercice et garde les réglages du reste', () => {
    const proposes: Bloc[] = [
      { id: 'n1', titre: 'Renforcement', lignes: [ligne('x1', 'po', 'Pompes'), ligne('x2', 'ro', 'Rowing haltère')] },
      { id: 'n2', titre: 'Gainage', lignes: [ligne('x3', 'pl', 'Planche', 3, undefined as never, { dureeS: 40 })] },
    ];
    const f = fusionnerBlocs(actuels, proposes);
    expect(f[0].id).toBe('b1');
    expect(f[0].format).toBe('Superset');
    expect(f[0].lignes[1]).toBe(actuels[0].lignes[1]);
    expect(f[1].lignes[0].id).toBe('l3');
    expect(f[1].lignes[0].dureeS).toBe(40);
    expect(changementsSeance(actuels, f)).toEqual({ retires: ['Développé couché'], ajoutes: ['Pompes'], modifies: ['Planche'] });
  });
});
