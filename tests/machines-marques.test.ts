// Vidéos selon la marque des machines : pour un exercice sur machine, les machines Technogym et Hammer Strength
// équivalentes, quand le club du client en est équipé.
import { describe, expect, it } from 'vitest';

import { idYoutube } from '../src/domain/video';
import { MACHINES_MARQUES, machinesPour, mouvementDe, surMachine } from '../src/domain/machines-marques';

const machine = (nom: string) => ({ nom, materiel: ['Machine'] });
const deux = ['Technogym', 'Hammer Strength'];

describe('machines des marques', () => {
  it('a 63 machines Technogym et 39 Hammer Strength, chacune avec une vidéo YouTube et un mouvement', () => {
    expect(MACHINES_MARQUES.filter((m) => m.marque === 'Technogym')).toHaveLength(63);
    expect(MACHINES_MARQUES.filter((m) => m.marque === 'Hammer Strength')).toHaveLength(39);
    expect(new Set(MACHINES_MARQUES.map((m) => m.ref)).size).toBe(MACHINES_MARQUES.length);
    for (const m of MACHINES_MARQUES) {
      expect(idYoutube(m.videoUrl), m.ref).toBeTruthy();
      expect(m.mouvements.length, m.ref).toBeGreaterThan(0);
    }
  });

  it('reconnaît le mouvement dans le nom', () => {
    expect(mouvementDe('Presse à cuisses inclinée — machine')).toBe('presse-cuisses');
    expect(mouvementDe('Leg curl assis — machine')).toBe('leg-curl');
    expect(mouvementDe('Curl pupitre — machine')).toBe('curl-biceps');
    expect(mouvementDe('Mollets assis — machine')).toBe('mollets-assis');
    expect(mouvementDe('Tirage horizontal assis prise neutre — machine')).toBe('rowing');
    expect(mouvementDe('Shrug — machine')).toBeUndefined();
  });

  it('ne propose que pour un exercice sur machine', () => {
    expect(surMachine(machine('Leg extension — machine'))).toBe(true);
    expect(surMachine({ nom: 'Presse à cuisses' })).toBe(true);
    expect(surMachine({ nom: 'Curl pupitre — poulie', materiel: ['Poulie'] })).toBe(false);
    expect(surMachine({ nom: 'Leg curl — élastique', materiel: ['Élastique'] })).toBe(false);
    expect(surMachine({ nom: 'Squat arrière — Smith machine', materiel: ['Smith machine'] })).toBe(false);
    expect(surMachine({ nom: 'Développé couché — barre', materiel: ['Barre'] })).toBe(false);
  });

  it('donne les machines des marques du club, une liste par marque', () => {
    const g = machinesPour(machine('Presse à cuisses inclinée — machine'), deux);
    expect(g.map((x) => x.marque)).toEqual(['Technogym', 'Hammer Strength']);
    expect(g[0].machines.map((m) => m.ref)).toEqual(['TG-PS-12']); // la 45°, la plus proche d'une presse inclinée
    expect(g[1].machines.length).toBeGreaterThan(0);
    expect(machinesPour(machine('Presse à cuisses inclinée — machine'), ['Technogym']).map((x) => x.marque)).toEqual(['Technogym']);
  });

  it('garde les machines de la même position quand le nom la précise', () => {
    const [tg, hs] = machinesPour(machine('Leg curl couché — machine'), deux);
    expect(tg.machines.map((m) => m.ref)).toEqual(['TG-S9-20']);
    expect(hs.machines.map((m) => m.ref)).toEqual(['HS-SE-11']);
  });

  it('ne propose rien sans marque connue, pour une machine déjà de marque ou un mouvement inconnu', () => {
    expect(machinesPour(machine('Leg extension — machine'), [])).toEqual([]);
    expect(machinesPour(machine('Leg extension — machine'), ['Matrix'])).toEqual([]);
    expect(machinesPour({ nom: 'Leg extension — Technogym Pure Strength', materiel: ['Machine', 'Technogym Pure Strength'] }, deux)).toEqual([]);
    expect(machinesPour(machine('Shrug — machine'), deux)).toEqual([]);
  });
});
