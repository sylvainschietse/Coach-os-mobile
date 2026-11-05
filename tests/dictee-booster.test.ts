import { describe, expect, it } from 'vitest';

import { construireCompteRendu } from '../src/domain/compte-rendu';
import type { Booster, Contact } from '../src/domain/crm';
import { ajouterDicteeBooster, rangerDicteeBooster } from '../src/domain/dictee-booster';
import { redactionModele } from '../src/domain/redaction';

describe('dictée du Booster', () => {
  it('range chaque phrase dans la rubrique annoncée, jusqu’à la suivante', () => {
    const r = rangerDicteeBooster(
      'Objectif : perdre 5 kilos pour le mariage de sa sœur. Antécédents : opéré du genou en 2020. Ancien joueur de foot. ' +
        'Côté freins, il travaille en horaires décalés. Mot du coach : bravo pour ta première séance, on va faire du bon travail !',
    );
    expect(r).toEqual({
      objectif: 'Perdre 5 kilos pour le mariage de sa sœur.',
      antecedents: 'Opéré du genou en 2020. Ancien joueur de foot.',
      freins: 'Il travaille en horaires décalés.',
      mot: 'Bravo pour ta première séance, on va faire du bon travail !',
    });
  });

  it('comprend « son objectif est de… » et les petits mots d’introduction', () => {
    expect(rangerDicteeBooster('Alors son objectif est de reprendre la course. Ses attentes : un cadre et du suivi.')).toEqual({
      objectif: 'Reprendre la course.',
      attentesCoach: 'Un cadre et du suivi.',
    });
  });

  it('devine la rubrique sans annonce, et range le reste dans les observations', () => {
    expect(rangerDicteeBooster('Elle veut se muscler. Elle a mal au dos depuis sa grossesse. Très souriante')).toEqual({
      objectif: 'Elle veut se muscler.',
      antecedents: 'Elle a mal au dos depuis sa grossesse.',
      observationsCoach: 'Très souriante',
    });
  });

  it('ajoute au texte déjà écrit sans rien effacer', () => {
    const avant = { entretien: { freins: 'Peu de temps' }, mot: '' };
    expect(ajouterDicteeBooster(avant, { freins: 'Deux enfants.', mot: 'Bravo !' })).toEqual({
      entretien: { freins: 'Peu de temps\nDeux enfants.' },
      mot: 'Bravo !',
    });
  });

  it('sans questionnaire, le compte rendu reprend l’objectif dicté', () => {
    const contact: Contact = { id: 'c', prenom: 'Léa', nom: 'Martin', statut: 'booster_fait', creeLe: '2026-10-10T10:00:00Z' };
    const dicte = ajouterDicteeBooster(
      { entretien: {}, mot: '' },
      rangerDicteeBooster('Objectif : courir un 10 km en juin. Pourquoi maintenant : un défi avec ses collègues. Mot du coach : super séance, continue !'),
    );
    const booster: Booster = { id: 'b', contactId: 'c', date: '2026-11-04T16:30:00Z', statut: 'fait', priorites: [], entretien: dicte.entretien, compteRendu: dicte.mot };
    const cr = construireCompteRendu(contact, booster, undefined, 'Sylvain');
    expect(cr.sections.find((s) => s.titre === 'Ton point de départ')?.lignes).toEqual([
      'Objectif : Courir un 10 km en juin.',
      'Pourquoi maintenant : Un défi avec ses collègues.',
    ]);
    expect(cr.pdf.objectif).toBe('Courir un 10 km en juin.');
    expect(cr.pdf.pourquoi).toBe('Un défi avec ses collègues.');
    expect(cr.pdf.mot).toBe('Super séance, continue !');
    expect(redactionModele(contact, booster, undefined).regard).toContain('Ton objectif (courir un 10 km en juin)');
  });
});
