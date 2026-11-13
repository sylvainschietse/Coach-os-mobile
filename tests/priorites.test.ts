import { describe, expect, it } from 'vitest';

import { evaluationVide, type Evaluation } from '@/domain/evaluation';
import { prioritesAuto, redactionModele } from '@/domain/redaction';

const avec = (tests: Evaluation['tests'], extra: Partial<Evaluation> = {}): Evaluation => ({ ...evaluationVide(), ...extra, tests });

describe('priorités déterminées par l’application', () => {
  it('sans aucune donnée, la régularité reste la priorité de départ', () => {
    expect(prioritesAuto({ evaluation: undefined, entretien: {} }, undefined)).toEqual(['Installer la régularité']);
  });

  it('une douleur passe en premier, puis les tests les plus fragiles', () => {
    const evaluation = avec(
      {
        jambes: { resultat: 'Très limité', observations: [] },
        cardio: { resultat: 'Essoufflement marqué', observations: [] },
        mobilite: { resultat: 'Bonne', observations: [] },
      },
      { douleur: 'Oui' },
    );
    expect(prioritesAuto({ evaluation, entretien: {} }, undefined)).toEqual(['Bouger sans douleur', 'Renforcer les jambes', 'Développer ton endurance']);
  });

  it('l’objectif départage : perte de poids avec alimentation à revoir', () => {
    const evaluation = avec({ cardio: { resultat: 'Essoufflement marqué', observations: [] }, poussee: { resultat: 'Difficile', observations: [] } });
    const reponses = { objectif: 'Perdre du poids', alimentation: 'À améliorer' };
    expect(prioritesAuto({ evaluation, entretien: {} }, reponses)).toEqual(['Développer ton endurance', 'Équilibrer ton alimentation', 'Renforcer le haut du corps']);
  });

  it('les points d’appui et les tests non réalisés ne deviennent pas des priorités', () => {
    const evaluation = avec({ poussee: { resultat: 'Très à l’aise', observations: [] }, cardio: { resultat: 'Non réalisé', observations: [] } });
    expect(prioritesAuto({ evaluation, entretien: {} }, { sommeilHeures: 'Moins de 6 h' })).toEqual(['Mieux dormir pour mieux récupérer', 'Installer la régularité']);
  });

  it('chaque priorité calculée a son explication dans les textes proposés', () => {
    const evaluation = avec({ posture: { resultat: 'Asymétrie nette', observations: [] } }, { douleur: 'Oui' });
    const priorites = prioritesAuto({ evaluation, entretien: {} }, { stress: '8' });
    const r = redactionModele({ prenom: 'Nora' } as never, { evaluation, entretien: {}, priorites } as never, { stress: '8' });
    expect(priorites).toEqual(['Bouger sans douleur', 'Rééquilibrer ta posture', 'Apprendre à relâcher le stress']);
    expect(r.priorites).toHaveLength(3);
    expect(r.priorites!.every((t) => !t.startsWith('C’est l’axe'))).toBe(true);
  });
});
