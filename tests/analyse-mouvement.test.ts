import { describe, expect, it } from 'vitest';

import {
  anglesSquat,
  asymetries,
  carteMuscles,
  compensation,
  EXPLICATIONS,
  famille,
  morphologie,
  objectifs,
  planTravail,
  pointsForts,
  priorites,
  qualites,
  scoreMouvement,
  texteSyntheseClient,
  TRACES,
} from '../src/domain/analyse-mouvement';
import { constats, VUES, vueComplete, type BilanPostural, type SaisieVue } from '../src/domain/bilan-postural';

// Vue de face : le côté droit du client est à gauche de l'image.
const squatFace = (genouDx = 0, genouGx = 0): SaisieVue => ({
  points: {
    eiasD: { x: 150, y: 300 }, genouD: { x: 150 + genouDx, y: 450 }, chevilleD: { x: 150, y: 600 },
    eiasG: { x: 250, y: 300 }, genouG: { x: 250 - genouGx, y: 450 }, chevilleG: { x: 250, y: 600 },
  },
  observations: [],
});

// Squat sur une jambe : appui à gauche de l'image pour la jambe droite.
const unipodal = (genouVersAxe: number, chuteBassin: number, droite: boolean): SaisieVue => {
  const s = droite ? 1 : -1;
  const appui = 200 - s * 50;
  return {
    points: {
      eiasAppui: { x: appui, y: 300 }, eiasAutre: { x: appui + s * 100, y: 300 + chuteBassin },
      genou: { x: appui + s * genouVersAxe, y: 450 }, cheville: { x: appui, y: 600 },
    },
    observations: [],
  };
};

const squatProfil = (hancheY: number): SaisieVue => ({
  points: { epaule: { x: 260, y: 100 }, hanche: { x: 180, y: hancheY }, genou: { x: 300, y: 330 }, malleole: { x: 250, y: 450 } },
  observations: [],
});

describe('analyse du mouvement', () => {
  it('chaque mesure a son explication et chaque trace relie des repères existants', () => {
    const b: BilanPostural = { vues: { squatFace: squatFace(), squatProfil: squatProfil(340), unipodalDroit: unipodal(0, 0, true) } };
    for (const c of constats(b)) expect(EXPLICATIONS[famille(c.id)], c.id).toBeDefined();
    for (const v of VUES) {
      const cles = new Set(v.reperes.map((r) => r.cle));
      for (const [a, z] of TRACES[v.id]) expect(cles.has(a) && cles.has(z), `${v.id} ${a}-${z}`).toBe(true);
    }
  });

  it('les épaules sont facultatives sur une jambe, et donnent une mesure en plus', () => {
    const v = VUES.find((x) => x.id === 'unipodalDroit')!;
    const s = unipodal(0, 0, true);
    expect(vueComplete(v, s)).toBe(true);
    expect(constats({ vues: { unipodalDroit: s } }).some((c) => c.id === 'unipodalTroncD')).toBe(false);
    s.points.epauleAppui = { x: 150, y: 110 };
    s.points.epauleAutre = { x: 250, y: 90 };
    const t = constats({ vues: { unipodalDroit: s } }).find((c) => c.id === 'unipodalTroncD')!;
    expect(t.valeur).toBeGreaterThan(10);
    expect(t.niveau).toBe('marque');
  });

  it('mesure la profondeur et les angles du squat de profil', () => {
    const bas = { vues: { squatProfil: squatProfil(345) } };
    expect(constats(bas).find((c) => c.id === 'squatProfondeur')!.niveau).toBe('normal');
    expect(anglesSquat(bas)!.sousParallele).toBe(true);
    const haut = { vues: { squatProfil: squatProfil(270) } };
    expect(constats(haut).find((c) => c.id === 'squatProfondeur')!.niveau).toBe('marque');
    expect(constats(haut).find((c) => c.id === 'squatCheville')!.valeur).toBeCloseTo(22.6, 0);
  });

  it('repère un côté qui lâche sur une jambe alors que le squat à deux jambes est symétrique', () => {
    const b: BilanPostural = {
      vues: { squatFace: squatFace(-5, -2), unipodalDroit: unipodal(5, 2, true), unipodalGauche: unipodal(35, 12, false) },
    };
    const a = asymetries(b);
    const genou = a.find((x) => x.titre === 'Genou sur une jambe')!;
    expect(genou.net).toBe(true);
    expect(genou.coteFaible).toBe('G');
    expect(a.find((x) => x.titre === 'Genou au squat')!.net).toBe(false);
    expect(compensation(b)).toContain('le côté droit compense');

    const muscles = carteMuscles(b);
    expect(muscles.find((m) => m.zone === 'moyenFessier' && m.etat === 'faible')?.cote).toBe('G');
    expect(muscles.find((m) => m.zone === 'moyenFessier' && m.etat === 'fort')?.cote).toBe('D');
    expect(pointsForts(b)).toContain('Jambe droite stable sur un pied');

    expect(priorites(b).map((p) => p.titre)).toEqual(expect.arrayContaining(['Bassin qui s’affaisse sur une jambe', 'Genou qui rentre vers l’intérieur']));
    expect(objectifs(b)[0]).toMatchObject({ sens: '≤' });
    const plan = planTravail(b)!;
    expect(plan.corriger.length).toBeGreaterThan(0);
    expect(plan.renforcer.length).toBeGreaterThan(0);

    const q = qualites(b);
    expect(q.find((x) => x.cle === 'symetrie')!.note).toBeLessThan(7);
    expect(q.find((x) => x.cle === 'bassin')!.note).toBeLessThan(10);
    const score = scoreMouvement(b)!;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
    expect(texteSyntheseClient(b, 'Sylvain')).toContain('Sylvain, voici');
  });

  it('tout dans la norme : pas de priorité, des points forts, score 100', () => {
    const b: BilanPostural = { vues: { squatFace: squatFace(), unipodalDroit: unipodal(0, 0, true), unipodalGauche: unipodal(0, 0, false) } };
    expect(priorites(b)).toHaveLength(0);
    expect(planTravail(b)).toBeUndefined();
    expect(pointsForts(b)).toContain('Genoux bien alignés au squat');
    expect(scoreMouvement(b)).toBe(100);
  });

  it('lit les proportions des segments sur la photo de profil', () => {
    const profil = (cuisse: number): SaisieVue => ({
      points: {
        oreille: { x: 220, y: 50 }, c7: { x: 200, y: 100 }, t8: { x: 180, y: 180 }, t12: { x: 200, y: 260 }, l3: { x: 225, y: 320 },
        s2: { x: 200, y: 380 }, acromion: { x: 200, y: 120 }, eias: { x: 260, y: 350 }, eips: { x: 170, y: 330 },
        trochanter: { x: 200, y: 400 }, genou: { x: 200, y: 400 + cuisse }, malleole: { x: 200, y: 400 + cuisse + 200 },
      },
      observations: [],
    });
    const longues = morphologie({ vues: { profil: profil(240) } })!;
    expect(longues.source).toBe('photo de profil');
    expect(longues.cuisse).toBe(1.2);
    expect(longues.lecture[0]).toContain('Cuisses longues');
    expect(longues.conseils.length).toBeGreaterThan(0);
    expect(morphologie({ vues: { profil: profil(200) } })!.lecture[0]).toContain('proportions classiques');
  });
});
