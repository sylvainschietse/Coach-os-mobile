import { describe, expect, it } from 'vitest';

import {
  alertes,
  compiler,
  dureeTotale,
  etatA,
  FORMATS,
  infoFormat,
  lireFormat,
  lireReglage,
  lireSon,
  paliers,
  resume,
  signalEntre,
  SON_DEFAUT,
  type Son,
} from '../src/domain/formats-minuteur';

const sans = { preparationS: 0 } as const;

describe('formats du minuteur', () => {
  it('Tabata : 8 × 20 s / 10 s, sans le dernier repos, décompte de départ en tête', () => {
    const p = compiler(infoFormat('tabata').defaut, { preparationS: 5 });
    expect(p[0]).toMatchObject({ type: 'preparation', debutS: 0, dureeS: 5 });
    expect(p.filter((x) => x.type === 'travail')).toHaveLength(8);
    expect(dureeTotale(p)).toBe(5 + 8 * 20 + 7 * 10);
  });

  it('EMOM : un intervalle de travail par minute', () => {
    const p = compiler({ ...infoFormat('emom').defaut, tours: 12, minuteS: 60 }, sans);
    expect(p).toHaveLength(12);
    expect(p.every((x) => x.type === 'travail' && x.dureeS === 60)).toBe(true);
    expect(p[11].tour).toBe(12);
  });

  it('For time : un chrono qui monte jusqu’au temps limite', () => {
    const p = compiler({ ...infoFormat('fortime').defaut, dureeS: 900 }, sans);
    expect(p).toEqual([{ type: 'travail', debutS: 0, dureeS: 900, tour: 1, exercice: 1, montant: true }]);
  });

  it('Pyramide : monte jusqu’au sommet puis redescend, repos entre les paliers', () => {
    const r = { ...infoFormat('pyramide').defaut, travailS: 20, pasS: 10, sommetS: 50, reposS: 15 };
    expect(paliers(r)).toEqual([20, 30, 40, 50, 40, 30, 20]);
    expect(paliers({ ...r, sommetS: 45 })).toEqual([20, 30, 40, 45, 40, 30, 20]);
    const p = compiler(r, sans);
    expect(p.filter((x) => x.type === 'repos')).toHaveLength(6);
    expect(p.at(-1)?.type).toBe('travail');
  });

  it('chaque format tout prêt donne un minuteur de durée raisonnable', () => {
    for (const f of FORMATS) {
      const total = dureeTotale(compiler(f.defaut, SON_DEFAUT));
      expect(total, f.nom).toBeGreaterThan(SON_DEFAUT.preparationS);
      expect(total, f.nom).toBeLessThan(3 * 3600);
    }
  });

  it('résume un format', () => {
    expect(resume(infoFormat('tabata').defaut)).toBe('Tabata · 8 × 20 s / 10 s');
    expect(resume(infoFormat('emom').defaut)).toBe('EMOM · 12 × 1 min');
    expect(resume({ ...infoFormat('amrap').defaut, dureeS: 600 })).toBe('AMRAP · 10 min');
  });
});

describe('son du minuteur', () => {
  const r = { ...infoFormat('tabata').defaut, exercices: 2 }; // prépa 5, travail 20, repos 10, travail 20
  const son: Son = { ...SON_DEFAUT, preparationS: 5 };
  const p = compiler(r, son);

  it('bipe à 3, 2, 1 avant la fin du décompte, puis sonne au départ', () => {
    expect(signalEntre(p, son, 1.9, 2.1)).toBe('bip'); // il reste 3 s
    expect(signalEntre(p, son, 2.9, 3.1)).toBe('bip');
    expect(signalEntre(p, son, 3.9, 4.1)).toBe('bip');
    expect(signalEntre(p, son, 4.9, 5.1)).toBe('sonnerie');
    expect(signalEntre(p, son, 5.1, 5.3)).toBeNull();
  });

  it('respecte les réglages des bips travail et repos', () => {
    // Fin du premier travail à 25 s, fin du repos à 35 s.
    expect(signalEntre(p, son, 21.9, 22.1)).toBe('bip');
    expect(signalEntre(p, { ...son, bipsTravail: false }, 21.9, 22.1)).toBeNull();
    expect(signalEntre(p, { ...son, bipsRepos: false }, 31.9, 32.1)).toBeNull();
    expect(signalEntre(p, son, 31.9, 32.1)).toBe('bip');
  });

  it('sonne à la fin du minuteur, une seule fois', () => {
    const fin = dureeTotale(p);
    expect(signalEntre(p, son, fin - 0.1, fin)).toBe('sonnerie');
    expect(signalEntre(p, son, fin, fin + 1)).toBeNull();
  });

  it('programme une alerte par fin de phase, 3 s avant quand elle porte les bips', () => {
    const a = alertes(p, son, 0);
    expect(a.map((x) => x.dansS)).toEqual([2, 22, 32, 52]);
    expect(a.every((x) => x.bips)).toBe(true);
    expect(a[0]).toMatchObject({ titre: 'Go !', corps: '3, 2, 1… C’est parti' });
    expect(a.at(-1)?.titre).toBe('Terminé, bravo !');
    const sansBips = alertes(p, { ...son, bipsTravail: false, bipsRepos: false }, 0);
    expect(sansBips.map((x) => x.dansS)).toEqual([2, 25, 35, 55]);
  });

  it('reprend après une pause sans reprogrammer ce qui est passé', () => {
    expect(alertes(p, son, 30).map((x) => x.dansS)).toEqual([2, 22]);
  });

  it('relit un son ou un format abîmé sans planter', () => {
    expect(lireSon({ sonnerie: 'klaxon', preparationS: 7 })).toEqual(SON_DEFAUT);
    expect(lireReglage({ format: 'inconnu' })).toBeNull();
    expect(lireReglage({ format: 'emom', tours: 9999, minuteS: -3 })).toMatchObject({ tours: 60, minuteS: 15 });
    expect(lireFormat({ id: 'a', nom: '  ', reglage: { format: 'emom' } })).toBeNull();
    expect(lireFormat({ id: 'a', nom: 'Abdos du mardi', reglage: { format: 'emom' }, son: {} })?.son).toEqual(SON_DEFAUT);
  });

  it('l’état suit le temps écoulé', () => {
    const e = etatA(p, 6);
    expect(e.statut === 'en_cours' && e.phase.type).toBe('travail');
    expect(etatA(p, 999).statut).toBe('termine');
  });
});
