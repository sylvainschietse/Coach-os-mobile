import { describe, expect, it } from 'vitest';

import { constats, pistes, syntheseBilan, VUES, vuesCompletes, type BilanPostural } from '../src/domain/bilan-postural';

const trouve = (b: BilanPostural, id: string) => constats(b).find((c) => c.id === id)!;

// Vue de face : le côté droit du client est à gauche de l'image.
const face = (genouDx: number) => ({
  points: {
    epauleD: { x: 100, y: 100 }, epauleG: { x: 300, y: 112 },
    eiasD: { x: 150, y: 300 }, eiasG: { x: 250, y: 300 },
    genouD: { x: 150 + genouDx, y: 450 }, genouG: { x: 250, y: 450 },
    chevilleD: { x: 150, y: 600 }, chevilleG: { x: 250, y: 600 },
  },
  observations: [],
});

describe('bilan postural', () => {
  it('chaque vue a des repères distincts', () => {
    for (const v of VUES) expect(new Set(v.reperes.map((r) => r.cle)).size).toBe(v.reperes.length);
  });

  it('détecte le genou qui rentre (valgus) et le distingue du varus', () => {
    expect(trouve({ vues: { face: face(25) } }, 'genouStatiqueD').valeur).toBeGreaterThan(6);
    expect(trouve({ vues: { face: face(-25) } }, 'genouStatiqueD').valeur).toBeLessThan(-5);
    expect(trouve({ vues: { face: face(0) } }, 'genouStatiqueD').niveau).toBe('normal');
    expect(trouve({ vues: { face: face(0) } }, 'epaules').texte).toContain('droite plus haute');
  });

  it('mesure la bascule du bassin quel que soit le sens du profil', () => {
    const profil = (sens: 1 | -1) => ({
      points: {
        oreille: { x: 200 + sens * 20, y: 50 }, c7: { x: 200, y: 100 }, t8: { x: 190 - sens * 20, y: 180 }, t12: { x: 200, y: 260 },
        l3: { x: 200 + sens * 25, y: 320 }, s2: { x: 200, y: 380 }, acromion: { x: 200, y: 120 },
        eias: { x: 200 + sens * 60, y: 350 }, eips: { x: 200 - sens * 30, y: 330 },
        trochanter: { x: 200, y: 400 }, genou: { x: 200, y: 550 }, malleole: { x: 200, y: 700 },
      },
      observations: [],
    });
    for (const s of [1, -1] as const) {
      const b = { vues: { profil: profil(s) } };
      expect(trouve(b, 'bassinSagittal').valeur).toBeCloseTo(12.5, 0);
      expect(trouve(b, 'tete').valeur).toBeGreaterThan(60);
      expect(trouve(b, 'cyphose').valeur).toBeGreaterThan(20);
    }
  });

  it('propose des pistes et un compte rendu', () => {
    const b: BilanPostural = { vues: { face: face(30), squatProfil: { points: { epaule: { x: 300, y: 100 }, hanche: { x: 200, y: 300 }, genou: { x: 280, y: 330 }, malleole: { x: 250, y: 450 } }, observations: ['Talons qui décollent'] } } };
    expect(vuesCompletes(b)).toBe(2);
    const titres = pistes(b).map((p) => p.titre);
    expect(titres).toContain('Genou qui rentre vers l’intérieur');
    expect(titres).toContain('Manque de souplesse des chevilles au squat');
    expect(syntheseBilan(b).join('\n')).toContain('POSTURE · AXE DU GENOU DROIT');
  });
});
