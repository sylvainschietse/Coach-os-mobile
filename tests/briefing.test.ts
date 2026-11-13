import { describe, expect, it } from 'vitest';

import { preparerSeance } from '../src/domain/briefing';

describe('préparation de la séance', () => {
  it('met la santé en premier et reprend les précisions', () => {
    const b = preparerSeance({ douleur: 'Oui', douleurDetail: 'Genou gauche', contreIndication: 'Oui', contreIndicationDetail: 'Asthme' });
    expect(b.sante).toEqual(['Douleur ou blessure : Genou gauche', 'Contre-indication médicale : Asthme']);
  });

  it('ne garde comme leviers que les habitudes à travailler', () => {
    const b = preparerSeance({ sommeilHeures: 'Moins de 6 h', sommeilQualite: '7', stress: '8', eau: 'Plus de 2 L', fruitsLegumes: 'Oui' });
    expect(b.leviers).toEqual(['Sommeil : moins de 6 h par nuit', 'Stress : 8/10']);
  });

  it('remplace « Autre » par la précision donnée', () => {
    const b = preparerSeance({ objectif: 'Autre', objectifAutre: 'Courir un semi', activiteReguliere: 'Oui', activites: 'Vélo, Autre', activitesAutre: 'Padel' });
    expect(b.objectif[0]).toBe('Courir un semi');
    expect(b.profil[0]).toBe('Pratique : Vélo, Padel');
  });
});
