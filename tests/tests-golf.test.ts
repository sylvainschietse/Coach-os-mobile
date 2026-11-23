import { describe, expect, it } from 'vitest';

import { evaluationVide, syntheseEvaluation } from '../src/domain/evaluation';
import { changerMesure, evolution, lireMesure, syntheseGolf, testsGolfRenseignes, TESTS_GOLF } from '../src/domain/tests-golf';

describe('tests golf du Booster', () => {
  it('propose huit tests, sans charge libre (poulie pour la puissance)', () => {
    expect(TESTS_GOLF).toHaveLength(8);
    expect(TESTS_GOLF.map((t) => t.libelle).join(' ')).not.toMatch(/médecine|haltère|barre/i);
    expect(TESTS_GOLF.find((t) => t.id === 'rotationPoulie')!.champs.map((c) => c.unite)).toEqual(['kg', 'rép.', 'rép.']);
  });

  it('lit les virgules et ignore une saisie illisible', () => {
    expect(lireMesure('12,5')).toBe(12.5);
    expect(lireMesure(' 0 ')).toBe(0);
    expect(lireMesure('')).toBeUndefined();
    expect(lireMesure('abc')).toBeUndefined();
  });

  it('n’ajoute rien au compte rendu tant que le client n’est pas golfeur', () => {
    const e = evaluationVide();
    expect(syntheseEvaluation(e)).not.toContain('GOLF');
    const decoche = { actif: false, mesures: { sautVertical: { hauteur: '40' } } };
    expect(syntheseGolf(decoche)).toEqual([]);
  });

  it('écrit les mesures dans le compte rendu, avant la douleur', () => {
    let golf = changerMesure(undefined, 'rotationThoracique', 'droite', '45');
    golf = changerMesure(golf, 'rotationThoracique', 'gauche', '38');
    golf = changerMesure(golf, 'equilibreUnipodal', 'droite', '12,5');
    const lignes = syntheseEvaluation({ ...evaluationVide(), golf }).split('\n');
    expect(lignes).toContain('GOLF · ROTATION DU HAUT DU DOS (ASSIS) — vers la droite 45° | vers la gauche 38°');
    expect(lignes).toContain('GOLF · ÉQUILIBRE SUR UNE JAMBE, YEUX FERMÉS — jambe droite 12,5 s');
    expect(lignes).toContain('GOLF · SAUT VERTICAL SANS ÉLAN — non renseigné');
    // La vitesse de club est facultative : absente si elle n'a pas été mesurée.
    expect(lignes.some((l) => l.includes('VITESSE'))).toBe(false);
    expect(lignes.findIndex((l) => l.startsWith('GOLF'))).toBeLessThan(lignes.findIndex((l) => l.startsWith('DOULEUR')));
    expect(testsGolfRenseignes(golf)).toBe(2);
  });

  it('montre l’évolution avec le Booster précédent, sauf pour la charge', () => {
    const avant = { actif: true, mesures: { rotationPoulie: { chargeKg: '8', coteSwing: '10' }, toucherOrteils: { distance: '12' } } };
    const maintenant = { actif: true, mesures: { rotationPoulie: { chargeKg: '8', coteSwing: '13' }, toucherOrteils: { distance: '5' } } };
    const lignes = syntheseGolf(maintenant, avant);
    expect(lignes).toContain('GOLF · ROTATION EXPLOSIVE À LA POULIE — charge utilisée 8 kg | côté swing 13 rép. (+3 rép.)');
    expect(lignes).toContain('GOLF · TOUCHER DES ORTEILS — distance doigts-sol 5 cm (−7 cm)');
    expect(evolution(40, 40, '°')).toBe('stable');
  });
});
