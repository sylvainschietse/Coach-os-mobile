// Questionnaire guidé : lieu d'entraînement, matériel et nouveaux champs du profil alimentaire.
import { describe, expect, it } from 'vitest';

import { blankPreferences, preferences } from '../src/domain/nutrition/calcul';
import { choisirObjectif, libelleObjectif, OBJECTIFS_COACHING } from '../src/domain/objectifs-coaching';
import { avecClub, choisirMarques, choisirSalle, materielPourProgramme, normerClub } from '../src/domain/salle-sport';

describe('lieu et matériel', () => {
  it('coche le matériel habituel d’une salle', () => {
    const m = choisirSalle('basic-fit', []);
    expect(m).toContain('Machines guidées');
    expect(m).toContain('Barre et disques');
  });
  it('garde le matériel ajouté à la main en changeant de lieu', () => {
    const salle = choisirSalle('basic-fit', []);
    const maison = choisirSalle('maison', [...salle, 'Élastiques'], 'basic-fit');
    expect(maison).toEqual(['Élastiques', 'Tapis']);
  });
  it('prépare le champ « Matériel disponible » du programme', () => {
    expect(materielPourProgramme('maison', [])).toBe('À la maison · poids du corps');
    expect(materielPourProgramme('on-air', ['Haltères', 'Banc'])).toBe('On Air · Haltères, Banc');
    expect(materielPourProgramme('', [])).toBe('');
  });
});

describe('profil alimentaire', () => {
  it('lit un ancien profil sans poids visé ni salle', () => {
    const { poidsVise: _p, salle: _s, materiel: _m, ...ancien } = blankPreferences();
    const lu = preferences.parse(ancien);
    expect(lu.poidsVise).toBeNull();
    expect(lu.salle).toBe('');
    expect(lu.materiel).toEqual([]);
  });
  it('garde le poids visé et le matériel', () => {
    const lu = preferences.parse({ ...blankPreferences(), poidsVise: 74, salle: 'basic-fit', materiel: ['Haltères'] });
    expect(lu).toMatchObject({ poidsVise: 74, salle: 'basic-fit', materiel: ['Haltères'] });
  });
});

describe('objectifs du questionnaire', () => {
  it('règle le sens des calories selon l’objectif', () => {
    const p = blankPreferences();
    expect(choisirObjectif(p, 'perte')).toMatchObject({ objectif: 'perte', objectifCoaching: 'perte' });
    expect(choisirObjectif(p, 'reeducation')).toMatchObject({ objectif: 'maintien', objectifCoaching: 'reeducation' });
    expect(choisirObjectif(p, 'muscle').objectif).toBe('muscle');
  });
  it('passe la grossesse en suivi spécifique, et l’enlève si on change d’avis', () => {
    const g = choisirObjectif(blankPreferences(), 'grossesse');
    expect(g.specifique).toBe(true);
    expect(choisirObjectif(g, 'sante').specifique).toBe(false);
  });
  it('efface la précision en changeant d’objectif', () => {
    const r = { ...choisirObjectif(blankPreferences(), 'reeducation'), objectifPrecision: 'genou' };
    expect(libelleObjectif(r)).toBe('Rééducation (genou)');
    expect(choisirObjectif(r, 'preparation').objectifPrecision).toBe('');
  });
  it('lit un ancien profil sans objectif du questionnaire', () => {
    expect(libelleObjectif({ ...blankPreferences(), objectif: 'muscle' })).toBe('Prise de muscle');
    expect(OBJECTIFS_COACHING.length).toBeGreaterThanOrEqual(10);
  });
});

describe('club et marques', () => {
  it('Wellness Sport Club coche Technogym et Hammer Strength', () => {
    expect(choisirMarques('wellness', [])).toEqual(['Technogym', 'Hammer Strength']);
    expect(choisirMarques('basic-fit', ['Technogym', 'Matrix'], 'wellness')).toEqual(['Matrix']);
    expect(avecClub('wellness')).toBe(true);
    expect(avecClub('maison')).toBe(false);
  });
  it('reconnaît le même club malgré les accents et les espaces', () => {
    expect(normerClub('  Lyon  Part-Dieu ')).toBe(normerClub('lyon part dieu'));
    expect(normerClub('Écully')).toBe('ecully');
  });
  it('décrit le lieu pour le programme', () => {
    expect(materielPourProgramme('wellness', ['Haltères'], 'Lyon', ['Technogym'])).toBe('Wellness Sport Club Lyon (Technogym) · Haltères');
  });
});
