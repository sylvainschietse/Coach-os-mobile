// Questionnaire guidé : lieu d'entraînement, matériel et nouveaux champs du profil alimentaire.
import { describe, expect, it } from 'vitest';

import { blankPreferences, preferences } from '../src/domain/nutrition/calcul';
import { choisirSalle, materielPourProgramme } from '../src/domain/salle-sport';

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
