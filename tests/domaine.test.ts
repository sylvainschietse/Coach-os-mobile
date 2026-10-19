import { describe, expect, it } from 'vitest';

import { decoderBlocs, decoderCycles, MarqueurInvalide } from '../src/domain/cycles';
import { ajouterALaFile, viderLaFile } from '../src/domain/file-envoi';
import { champsPertinents } from '../src/domain/mesures';
import { dureeTotale, ecoule, etatA, lireMinuteur, planifier, resumeMinuteur, TABATA } from '../src/domain/minuteur';
import { construireRealisation, modifierSerie, validerSerie } from '../src/domain/realisation';
import { preparerSeries, suggererValeurs } from '../src/domain/suggestions';
import {
  ajouterBloc,
  ajouterLigne,
  chercherExercices,
  deplacerBloc,
  deplacerLigne,
  modifierBloc,
  modifierLigne,
  nouvelleSeance,
  problemes,
  supprimerBloc,
  supprimerLigne,
} from '../src/domain/edition';
import type { Exercice, LignePrescription, Realisation } from '../src/domain/types';

const developpe: LignePrescription = {
  id: 'l1',
  exercice: { id: 'dc', nom: 'Développé couché', mesures: ['charge', 'repetitions'] },
  series: 4,
  repetitionsMin: 8,
  repetitionsMax: 12,
  chargeIndicative: 40,
};

const infos = (id = 'r1') => {
  let n = 0;
  return {
    id,
    seanceId: 's1',
    clientId: 'c1',
    debut: '2026-10-19T10:00:00Z',
    fin: '2026-10-19T11:00:00Z',
    nouvelId: () => `serie-${++n}`,
  };
};

describe('prescription', () => {
  it('ne propose pas de distance pour un développé couché', () => {
    expect(champsPertinents(developpe.exercice)).toEqual(['charge', 'repetitions']);
  });

  it('propose les champs cardio adaptés au rameur', () => {
    expect(champsPertinents({ mesures: ['allure500', 'distance', 'duree'] })).toEqual([
      'duree',
      'distance',
      'allure500',
    ]);
  });
});

describe('suggestion de charge', () => {
  it('part de la charge indicative du coach sans historique', () => {
    expect(suggererValeurs(developpe)).toEqual({ repetitions: 8, charge: 40 });
  });

  it('augmente de 2,5 kg quand toutes les séries ont atteint le haut de la fourchette', () => {
    const historique = { exerciceId: 'dc', date: '2026-10-12', series: Array(4).fill({ charge: 50, repetitions: 12 }) };
    expect(suggererValeurs(developpe, historique).charge).toBe(52.5);
  });

  it('garde la même charge si une série est restée en dessous', () => {
    const historique = {
      exerciceId: 'dc',
      date: '2026-10-12',
      series: [
        { charge: 50, repetitions: 12 },
        { charge: 50, repetitions: 12 },
        { charge: 50, repetitions: 10 },
        { charge: 50, repetitions: 9 },
      ],
    };
    expect(suggererValeurs(developpe, historique).charge).toBe(50);
  });
});

describe('réalisation', () => {
  it("n'enregistre jamais une suggestion que le client n'a pas validée", () => {
    const series = preparerSeries(developpe);
    const realisation = construireRealisation(series, infos());
    expect(realisation.series).toHaveLength(0);
  });

  it('enregistre la suggestion seulement après validation, et les valeurs modifiées en priorité', () => {
    const [s1, s2] = preparerSeries(developpe);
    const validee = validerSerie(s1);
    const modifiee = validerSerie(modifierSerie(s2, 'charge', 42.5));
    const realisation = construireRealisation([validee, modifiee], infos());
    expect(realisation.series.map((s) => s.valeurs)).toEqual([
      { repetitions: 8, charge: 40 },
      { repetitions: 8, charge: 42.5 },
    ]);
    expect(realisation.series[0].suggestion).toEqual({ repetitions: 8, charge: 40 });
  });

  it('une série modifiée après validation redevient à valider', () => {
    const [s1] = preparerSeries(developpe);
    expect(modifierSerie(validerSerie(s1), 'repetitions', 10).validee).toBe(false);
  });

  it('ignore un commentaire vide', () => {
    const realisation = construireRealisation([], { ...infos(), commentaire: '   ' });
    expect(realisation.commentaire).toBeUndefined();
  });
});

describe("file d'envoi", () => {
  const r = (id: string): Realisation => ({ ...construireRealisation([], infos(id)) });

  it('un double appui ne crée pas deux séances', () => {
    const file = ajouterALaFile(ajouterALaFile([], r('a')), r('a'));
    expect(file).toHaveLength(1);
  });

  it('garde ce qui n’a pas pu partir et respecte l’ordre', async () => {
    const file = [r('a'), r('b'), r('c')];
    const resultat = await viderLaFile(file, async (x) => {
      if (x.id === 'b') throw new Error('réseau');
    });
    expect(resultat.envoyees).toEqual(['a']);
    expect(resultat.restante.map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('minuteur', () => {
  it('un Tabata dure 4 minutes moins le dernier repos', () => {
    const phases = planifier(TABATA);
    expect(phases).toHaveLength(15);
    expect(dureeTotale(phases)).toBe(8 * 20 + 7 * 10);
  });

  it('place le repos entre les tours', () => {
    const phases = planifier({ exercices: 2, travailS: 30, reposS: 15, tours: 2, reposEntreToursS: 60 });
    expect(phases.map((p) => `${p.type}:${p.dureeS}`)).toEqual([
      'travail:30',
      'repos:15',
      'travail:30',
      'repos:60',
      'travail:30',
      'repos:15',
      'travail:30',
    ]);
  });

  it("reste juste après une mise en arrière-plan de l'app", () => {
    const phases = planifier(TABATA);
    const debut = 1_000_000;
    const retour = debut + 95_000; // 95 s plus tard
    const etat = etatA(phases, ecoule(debut, retour, 0));
    expect(etat).toMatchObject({ statut: 'en_cours', phase: { type: 'travail', exercice: 4 }, restantS: 15 });
  });

  it('tient compte des pauses', () => {
    expect(ecoule(0, 60_000, 20_000)).toBe(40);
    expect(ecoule(0, 60_000, 0, 30_000)).toBe(30);
  });
});

describe('migration des marqueurs Zite', () => {
  it('décode les quatre variantes de cycle et garde le texte lisible', () => {
    const texte =
      'Monter la charge chaque semaine.\n[COACHOS_CYCLES:[{"series":3,"repetitions":"12-15"},{"series":4,"repetitions":"8-12"},{"series":4,"repetitions":"8-12","consignes":"Biset"},{"series":5,"repetitions":"4-6"}]]';
    const { texteLisible, variantes } = decoderCycles(texte);
    expect(texteLisible).toBe('Monter la charge chaque semaine.');
    expect(variantes).toHaveLength(4);
    expect(variantes[3]).toEqual({ series: 5, repetitions: '4-6' });
  });

  it('laisse un texte sans marqueur intact', () => {
    expect(decoderCycles('Rien à décoder')).toEqual({ texteLisible: 'Rien à décoder', variantes: [] });
  });

  it('signale un marqueur abîmé au lieu de perdre la donnée', () => {
    expect(() => decoderCycles('x [COACHOS_CYCLES:[{"series":3]]')).toThrow(MarqueurInvalide);
  });

  it('extrait les blocs des consignes', () => {
    const { texteLisible, blocs } = decoderBlocs(
      'Bien s’échauffer. [COACHOS_BLOCS:["1 · Mobilité spécifique", "2 · Abdos", "3 · Renforcement"]]',
    );
    expect(blocs).toEqual(['1 · Mobilité spécifique', '2 · Abdos', '3 · Renforcement']);
    expect(texteLisible).toBe('Bien s’échauffer.');
  });
});

describe('chrono dans la séance', () => {
  const circuit = { exercices: 2, travailS: 40, reposS: 20, tours: 3, reposEntreToursS: 60 };

  it('résume le chrono réglé par le coach', () => {
    expect(resumeMinuteur(circuit)).toBe('2 exercices · 40 s / 20 s · 3 tours · 1 min entre les tours');
    expect(resumeMinuteur(TABATA)).toBe('8 exercices · 20 s / 10 s');
  });

  it('relit le chrono transmis à l’écran minuteur, et refuse un chrono incomplet', () => {
    expect(lireMinuteur(JSON.stringify(circuit))).toEqual(circuit);
    expect(lireMinuteur({ exercices: 6, travailS: 30 })).toEqual({ exercices: 6, travailS: 30, reposS: 0, tours: 1, reposEntreToursS: 0 });
    expect(lireMinuteur({ travailS: 30 })).toBeNull();
    expect(lireMinuteur('pas du json')).toBeNull();
    expect(lireMinuteur(null)).toBeNull();
  });
});

describe('édition d’une séance par le coach', () => {
  let n = 0;
  const id = () => `id-${++n}`;
  const squat = { id: 'ex-squat', nom: 'Squat barre', mesures: ['charge', 'repetitions'] } as Exercice;
  const gainage = { id: 'ex-gainage', nom: 'Gainage planche', mesures: ['duree'] } as Exercice;

  it('part d’une séance vide avec un premier bloc, et la refuse tant qu’elle est incomplète', () => {
    const s = nouvelleSeance('client-lea', id);
    expect(s.blocs).toHaveLength(1);
    expect(problemes(s)).toEqual(['Donne un titre à la séance.', 'Le bloc « Échauffement » n’a aucun exercice.']);
  });

  it('ajoute des exercices avec une prescription adaptée à ce qu’on mesure', () => {
    let s = nouvelleSeance('client-lea', id);
    const bloc = s.blocs[0].id;
    s = ajouterLigne(ajouterLigne(s, bloc, squat, id), bloc, gainage, id);
    expect(s.blocs[0].lignes.map((l) => [l.exercice.nom, l.repetitionsMin, l.repetitionsMax, l.dureeS])).toEqual([
      ['Squat barre', 10, 12, undefined],
      ['Gainage planche', undefined, undefined, 30],
    ]);
    s = { ...s, titre: 'Jambes' };
    expect(problemes(s)).toEqual([]);
  });

  it('modifie, déplace et retire lignes et blocs', () => {
    let s = nouvelleSeance('client-lea', id);
    const b1 = s.blocs[0].id;
    s = ajouterLigne(ajouterLigne(s, b1, squat, id), b1, gainage, id);
    const [l1, l2] = s.blocs[0].lignes.map((l) => l.id);
    s = deplacerLigne(s, l2, -1);
    expect(s.blocs[0].lignes.map((l) => l.id)).toEqual([l2, l1]);
    expect(deplacerLigne(s, l2, -1)).toEqual(s);
    s = modifierLigne(s, l1, { repetitionsMin: 12, repetitionsMax: 8 });
    expect(problemes({ ...s, titre: 'X' })).toEqual(['Squat barre : le maximum de répétitions est plus petit que le minimum.']);
    s = ajouterBloc(s, id);
    const b2 = s.blocs[1].id;
    s = deplacerBloc(modifierBloc(s, b2, { titre: 'Circuit' }), b2, -1);
    expect(s.blocs.map((b) => b.titre)).toEqual(['Circuit', 'Échauffement']);
    s = supprimerLigne(supprimerBloc(s, b2), l1);
    expect(s.blocs.map((b) => b.lignes.map((l) => l.id))).toEqual([[l2]]);
  });

  it('cherche un exercice sans tenir compte des accents', () => {
    expect(chercherExercices([squat, gainage], 'GAINAGE').map((e) => e.id)).toEqual(['ex-gainage']);
    expect(chercherExercices([squat, { ...gainage, nom: 'Développé' }], 'develop').map((e) => e.nom)).toEqual(['Développé']);
  });
});
