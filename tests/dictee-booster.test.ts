import { describe, expect, it } from 'vitest';

import { construireCompteRendu } from '../src/domain/compte-rendu';
import type { Booster, Contact } from '../src/domain/crm';
import { ajouterDicteeBooster, rangementPropre, rangerDicteeBooster } from '../src/domain/dictee-booster';
import { redactionModele } from '../src/domain/redaction';

describe('dictée du Booster (sans IA)', () => {
  it('range chaque phrase dans la rubrique annoncée, jusqu’à la suivante', () => {
    const r = rangerDicteeBooster(
      'Objectif : perdre 5 kilos pour le mariage de sa sœur. Antécédents : opéré du genou en 2020. Ancien joueur de foot. ' +
        'Côté freins, il travaille en horaires décalés.',
    );
    expect(r).toEqual({
      objectif: 'Perdre 5 kilos pour le mariage de sa sœur.',
      antecedents: 'Opéré du genou en 2020. Ancien joueur de foot.',
      freins: 'Il travaille en horaires décalés.',
    });
  });

  it('comprend « son objectif est de… » et les petits mots d’introduction', () => {
    expect(rangerDicteeBooster('Alors son objectif est de reprendre la course. Ses attentes : un cadre et du suivi.')).toEqual({
      objectif: 'Reprendre la course.',
      attentesCoach: 'Un cadre et du suivi.',
    });
  });

  it('ne devine pas : sans rubrique annoncée, tout va dans les observations', () => {
    expect(rangerDicteeBooster('Elle veut se muscler. Bravo pour ta séance, tu as été top.')).toEqual({
      observationsCoach: 'Elle veut se muscler. Bravo pour ta séance, tu as été top.',
    });
  });

  it('ajoute au texte déjà écrit sans rien effacer, et ignore une rubrique inconnue', () => {
    expect(ajouterDicteeBooster({ freins: 'Peu de temps' }, rangementPropre({ freins: 'Deux enfants.', mot: 'Bravo !', objectif: '  ' }))).toEqual({
      freins: 'Peu de temps\nDeux enfants.',
    });
  });

  it('sans questionnaire, le compte rendu reprend l’objectif dicté', () => {
    const contact: Contact = { id: 'c', prenom: 'Léa', nom: 'Martin', statut: 'booster_fait', creeLe: '2026-10-10T10:00:00Z' };
    const entretien = ajouterDicteeBooster({}, rangerDicteeBooster('Objectif : courir un 10 km en juin. Pourquoi maintenant : un défi avec ses collègues.'));
    const booster: Booster = { id: 'b', contactId: 'c', date: '2026-11-04T16:30:00Z', statut: 'fait', priorites: [], entretien };
    const cr = construireCompteRendu(contact, booster, undefined, 'Sylvain');
    expect(cr.sections.find((s) => s.titre === 'Ton point de départ')?.lignes).toEqual([
      'Objectif : Courir un 10 km en juin.',
      'Pourquoi maintenant : Un défi avec ses collègues.',
    ]);
    expect(cr.pdf.objectif).toBe('Courir un 10 km en juin.');
    expect(cr.pdf.mot).toBeUndefined();
    expect(redactionModele(contact, booster, undefined).regard).toContain('Ton objectif (courir un 10 km en juin)');
  });
});
