// Séance en direct : règles de saisie du coach (séries, repos chronométré, envoi, résumé) et enregistrement en démo.
import { describe, expect, it } from 'vitest';

import type { Etat, RealisationLue } from '../src/domain/entrainement-etat';
import {
  ajouterExercice,
  ajouterSerie,
  bilan,
  changerRepos,
  cocher,
  construireEnvoi,
  depuisSeance,
  derniereFaite,
  derniereFois,
  enregistrerDirect,
  exercicesRecents,
  lireDuree,
  resumeSeries,
  saisir,
  seanceVierge,
} from '../src/domain/seance-direct';
import type { Exercice, Seance } from '../src/domain/types';

let n = 0;
const id = () => `id-${++n}`;
const tirage: Exercice = { id: 'ex-tirage', nom: 'Tirage vertical — machine', mesures: ['charge', 'repetitions'] };
const gainage: Exercice = { id: 'ex-gainage', nom: 'Gainage', mesures: ['duree'] };
const T0 = Date.parse('2026-11-27T10:00:00Z');

const historique: RealisationLue[] = [
  {
    id: 'r1',
    clientId: 'lea',
    seanceId: 's1',
    debut: '2026-11-12T09:00:00Z',
    fin: '2026-11-12T10:00:00Z',
    seanceTitre: 'Dos',
    noms: {},
    series: [0, 1, 2].map((index) => ({ id: `h${index}`, ligneId: 'l1', exerciceId: 'ex-tirage', index, valeurs: { charge: 45, repetitions: 10 }, suggestion: {} })),
  },
];

describe('saisie', () => {
  it('ajoute un exercice avec une série, puis une série préremplie avec la précédente', () => {
    let s = ajouterExercice(seanceVierge('lea', T0), tirage, id);
    const e = s.exercices[0];
    s = saisir(s, e.ligneId, e.series[0].id, 'charge', '47,5 kg');
    s = saisir(s, e.ligneId, e.series[0].id, 'repetitions', '10');
    s = ajouterSerie(s, e.ligneId, id);
    expect(s.exercices[0].series.map((x) => x.valeurs)).toEqual([
      { charge: '47,5', repetitions: '10' },
      { charge: '47,5', repetitions: '10' },
    ]);
  });

  it('chronomètre le repos entre deux séries cochées du même exercice, modifiable ensuite', () => {
    let s = ajouterExercice(seanceVierge('lea', T0), tirage, id);
    const l = s.exercices[0].ligneId;
    s = ajouterSerie(ajouterSerie(s, l, id), l, id);
    const [a, b, c] = s.exercices[0].series.map((x) => x.id);
    s = cocher(s, l, a, T0 + 60_000);
    s = cocher(s, l, b, T0 + 152_000);
    expect(s.exercices[0].series.map((x) => x.reposS)).toEqual([undefined, 92, undefined]);
    expect(derniereFaite(s)).toMatchObject({ serieId: b, numero: 2 });
    // Une pause de plus de 15 minutes n'est pas un repos.
    s = cocher(s, l, c, T0 + 152_000 + 20 * 60_000);
    expect(s.exercices[0].series[2].reposS).toBeUndefined();
    s = changerRepos(s, l, c, '1:45');
    expect(s.exercices[0].series[2].reposS).toBe(105);
    // Décocher puis recocher garde le repos corrigé.
    s = cocher(cocher(s, l, c, T0), l, c, T0 + 999_000);
    expect(s.exercices[0].series[2].reposS).toBe(105);
  });

  it('une série cochée sans rien taper reprend les valeurs de la précédente', () => {
    let s = ajouterExercice(seanceVierge('lea', T0), tirage, id);
    const l = s.exercices[0].ligneId;
    s = saisir(s, l, s.exercices[0].series[0].id, 'charge', '40');
    s = { ...s, exercices: [{ ...s.exercices[0], series: [...s.exercices[0].series, { id: 'vide', valeurs: {}, faite: false }] }] };
    s = cocher(s, l, 'vide', T0);
    expect(s.exercices[0].series[1].valeurs).toEqual({ charge: '40' });
  });

  it('lit les durées de repos', () => {
    expect(lireDuree('1:32')).toBe(92);
    expect(lireDuree('90')).toBe(90);
    expect(lireDuree('abc')).toBeUndefined();
  });
});

describe('départ depuis une séance du programme', () => {
  const seance: Seance = {
    id: 's1',
    titre: 'Dos',
    blocs: [{ id: 'b1', titre: 'Principal', lignes: [{ id: 'l1', exercice: tirage, series: 3, repetitions: '10', recuperationS: 90 }] }],
  };
  it('reprend les exercices prévus, avec autant de séries vides', () => {
    const s = depuisSeance('lea', seance, T0, id, { cycleId: 'c1' });
    expect(s).toMatchObject({ seanceId: 's1', cycleId: 'c1', titre: 'Dos' });
    expect(s.exercices[0]).toMatchObject({ ligneId: 'l1', prevu: true, recuperationS: 90 });
    expect(s.exercices[0].series).toHaveLength(3);
  });
});

describe('envoi et résumé', () => {
  it('n’envoie que les séries cochées ou remplies, en chiffres', () => {
    let s = ajouterExercice(ajouterExercice(seanceVierge('lea', T0), tirage, id), gainage, id);
    const [t, g] = s.exercices;
    s = saisir(s, t.ligneId, t.series[0].id, 'charge', '50,5');
    s = saisir(s, t.ligneId, t.series[0].id, 'repetitions', '8');
    s = ajouterSerie(s, t.ligneId, id);
    s = saisir(s, t.ligneId, s.exercices[0].series[1].id, 'charge', '');
    s = saisir(s, t.ligneId, s.exercices[0].series[1].id, 'repetitions', '');
    const envoi = construireEnvoi(s, { id: 'r9', fin: T0 + 52 * 60_000, seanceDirecteId: 'sd', blocId: 'bd', commentaire: '  ' });
    expect(envoi.exercices).toEqual([{ ligneId: t.ligneId, exerciceId: 'ex-tirage', nom: tirage.nom, mesures: ['charge', 'repetitions'], series: [{ id: t.series[0].id, valeurs: { charge: 50.5, repetitions: 8 }, reposS: undefined }] }]);
    expect(envoi.commentaire).toBeUndefined();
    expect(g).toBeDefined();
    const b = bilan(envoi, s, historique);
    expect(b).toMatchObject({ dureeMin: 52, nbExercices: 1, nbSeries: 1, tonnage: 404 });
    expect(b.lignes[0]).toMatchObject({ resume: '1 × 8 à 50,5 kg', record: true });
  });

  it('résume les séries comme un coach les dit', () => {
    expect(resumeSeries([{ charge: 45, repetitions: 10 }, { charge: 45, repetitions: 10 }, { charge: 45, repetitions: 10 }])).toBe('3 × 10 à 45 kg');
    expect(resumeSeries([{ charge: 40, repetitions: 10 }, { charge: 45, repetitions: 8 }])).toBe('2 séries · 8 à 10 reps · 40 à 45 kg');
    expect(resumeSeries([{ duree: 45 }, { duree: 45 }, { duree: 45 }])).toBe('3 × 45 s');
  });

  it('retrouve la dernière fois et les exercices déjà faits', () => {
    expect(derniereFois(historique, 'ex-tirage')).toMatchObject({ texte: '3 × 10 à 45 kg' });
    expect(derniereFois(historique, 'ex-gainage')).toBeUndefined();
    expect(exercicesRecents(historique)).toEqual(['ex-tirage']);
  });
});

describe('enregistrement en démo', () => {
  const etat: Etat = {
    programmes: [{ id: 'p1', titre: 'Programme', coachId: 'coach' }],
    seances: [{ id: 's1', titre: 'Dos', programmeId: 'p1', coachId: 'coach', blocs: [{ id: 'b1', titre: 'Principal', lignes: [{ id: 'l1', exercice: tirage, series: 3 }] }] }],
    suivis: [],
    cycles: [{ id: 'c1', suiviId: 'su', clientId: 'lea', ordre: 1, nom: 'Cycle 1', debut: '2026-11-01', fin: '2026-12-31', statut: 'Actif', programmeId: 'p1' } as Etat['cycles'][number]],
    planifications: [],
    realisations: [],
  };

  it('séance du programme : réalisation rattachée, exercice ajouté rangé à part, calendrier coché', () => {
    const envoi = {
      id: 'r1',
      clientId: 'lea',
      titre: 'Dos',
      debut: '2026-11-27T09:00:00Z',
      fin: '2026-11-27T10:00:00Z',
      seanceId: 's1',
      cycleId: 'c1',
      seanceDirecteId: 'sd',
      blocId: 'bd',
      exercices: [
        { ligneId: 'l1', exerciceId: 'ex-tirage', nom: tirage.nom, series: [{ id: 'x1', valeurs: { charge: 50, repetitions: 10 } }] },
        { ligneId: 'l-ajout', exerciceId: 'ex-gainage', nom: 'Gainage', mesures: ['duree' as const], series: [{ id: 'x2', valeurs: { duree: 45 }, reposS: 60 }] },
      ],
    };
    const { etat: suite, resultat } = enregistrerDirect(etat, envoi, 'coach');
    expect(resultat).toBe('enregistree');
    expect(suite.realisations[0]).toMatchObject({ seanceId: 's1', cycleId: 'c1', programmeNom: 'Programme', noms: { l1: tirage.nom, 'l-ajout': 'Gainage' } });
    expect(suite.realisations[0].series[1]).toMatchObject({ ligneId: 'l-ajout', reposS: 60 });
    expect(suite.seances).toHaveLength(1);
    expect(suite.seances[0].blocs[0].lignes.map((l) => l.id)).toEqual(['l-ajout']);
    expect(suite.planifications).toMatchObject([{ seanceId: 's1', statut: 'Réalisée', realisationId: 'r1', date: '2026-11-27' }]);
    const encore = enregistrerDirect({ ...etat, realisations: suite.realisations }, envoi, 'coach');
    expect(encore.resultat).toBe('doublon');
  });

  it('séance vierge : comptée dans le cycle en cours, sans créneau', () => {
    const envoi = {
      id: 'r3',
      clientId: 'lea',
      titre: 'Séance en direct · 27 novembre',
      debut: '2026-11-27T09:00:00Z',
      fin: '2026-11-27T10:00:00Z',
      cycleId: 'c1',
      seanceDirecteId: 'sd3',
      blocId: 'bd3',
      exercices: [{ ligneId: 'l3', exerciceId: 'ex-tirage', nom: tirage.nom, series: [{ id: 'x3', valeurs: { charge: 50, repetitions: 8 } }] }],
    };
    const { etat: suite } = enregistrerDirect(etat, envoi, 'coach');
    expect(suite.realisations[0]).toMatchObject({ seanceId: 'sd3', cycleId: 'c1', programmeId: 'p1' });
    expect(suite.planifications).toEqual([]);
  });

  it('refuse une séance vide', () => {
    expect(() =>
      enregistrerDirect(etat, { id: 'r2', clientId: 'lea', titre: 'X', debut: '2026-11-27T09:00:00Z', fin: '2026-11-27T10:00:00Z', seanceDirecteId: 'sd2', blocId: 'bd2', exercices: [] }, 'coach'),
    ).toThrow(/au moins une série/);
  });
});
