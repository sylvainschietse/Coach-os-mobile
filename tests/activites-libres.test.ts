// Activités libres : contrôles, catalogue d'activités, dictée d'une séance et transformation en modèle pour le coach.
import { describe, expect, it } from 'vitest';

import { erreursActiviteLibre, preparerActiviteLibre, resumeSeries, seanceDepuisActivite, type ActiviteLibre } from '../src/domain/activites';
import { activiteConnue, CATALOGUE_ACTIVITES, chercherActivites, estimerCalories } from '../src/domain/catalogue-activites';
import { lireDictee } from '../src/domain/dictee-seance';
import { assiduite, semainesDuCycle } from '../src/domain/suivi-entrainement';
import type { Exercice } from '../src/domain/types';

const catalogue: Exercice[] = [
  { id: 'sqc', nom: 'Squat vers chaise', mesures: ['repetitions'], famille: 'Squat et presse' },
  { id: 'sq', nom: 'Squat arrière — barre', mesures: ['charge', 'repetitions'], famille: 'Squat et presse' },
  { id: 'sq2', nom: 'Squat goblet — haltères', mesures: ['charge', 'repetitions'], famille: 'Squat et presse' },
  { id: 'dc', nom: 'Développé couché — barre', mesures: ['charge', 'repetitions'], famille: 'Développés et pompes' },
  { id: 'po', nom: 'Pompes', mesures: ['repetitions'], famille: 'Développés et pompes' },
  { id: 'gp', nom: 'Gainage planche', mesures: ['duree'], famille: 'Gainage' },
  { id: 'tr', nom: 'Traction pronation', mesures: ['charge', 'repetitions'], famille: 'Tirages verticaux' },
];

const base = (r: Partial<ActiviteLibre> = {}): ActiviteLibre => ({
  id: 'a1',
  sport: 'cours',
  titre: 'RPM',
  debut: new Date(Date.now() - 3600e3).toISOString(),
  dureeS: 2700,
  note: '',
  exercices: [],
  ...r,
});

describe('contrôles', () => {
  it('une activité complète passe', () => expect(erreursActiviteLibre(base({ ressenti: 7 }))).toEqual([]));
  it('durée, ressenti et date dans le futur refusés', () => {
    expect(erreursActiviteLibre(base({ dureeS: 0 }))).toContain('Indique une durée entre 1 minute et 24 heures.');
    expect(erreursActiviteLibre(base({ ressenti: 12 }))).toContain('Le ressenti va de 1 à 10.');
    expect(erreursActiviteLibre(base({ debut: new Date(Date.now() + 864e5).toISOString() }))).toContain('Une activité ne peut pas être dans le futur.');
  });
  it('le nettoyage retire les séries et exercices vides', () => {
    const p = preparerActiviteLibre(base({ titre: ' RPM ', exercices: [{ nom: 'Squat', series: [{ repetitions: 10 }, {}] }, { nom: 'Vide', series: [{}] }] }));
    expect(p.titre).toBe('RPM');
    expect(p.exercices).toEqual([{ nom: 'Squat', series: [{ repetitions: 10 }] }]);
  });
  it('résumé des séries', () => {
    expect(resumeSeries([{ repetitions: 10, charge: 40 }, { repetitions: 8, charge: 45 }])).toBe('2 séries · 8 à 10 reps · 40 à 45 kg');
    expect(resumeSeries([{ duree: 45 }, { duree: 45 }, { duree: 45 }])).toBe('3 séries · 45 s');
  });
});

describe('catalogue d’activités', () => {
  it('contient les cours de salle, le yoga, l’aquatique et les sports demandés', () => {
    for (const n of ['Body Pump', 'Body Attack', 'Body Combat', 'RPM', 'Pilates reformer', 'Pilates ballon', 'Stretching', 'Aquagym', 'Aquabike', 'Aqua tonus', 'Padel', 'Stand up paddle', 'Tennis', 'Football', 'Badminton', 'CrossFit', 'Hyrox'])
      expect(activiteConnue(n), n).toBeDefined();
    expect(CATALOGUE_ACTIVITES.length).toBeGreaterThan(200);
    expect(new Set(CATALOGUE_ACTIVITES.map((a) => a.nom)).size).toBe(CATALOGUE_ACTIVITES.length);
  });
  it('recherche sans accents et par mots-clés', () => {
    expect(chercherActivites('spinning').map((a) => a.nom)).toContain('RPM');
    expect(chercherActivites('pilates')[0].sport).toBe('yoga');
    expect(chercherActivites('pilates').map((a) => a.nom)).toEqual(expect.arrayContaining(['Pilates reformer', 'Pilates ballon', 'Aqua Pilates']));
    expect(chercherActivites('aqua')[0].sport).toBe('aquatique');
    expect(chercherActivites('irox')[0].nom).toBe('Hyrox');
  });
});

describe('dictée d’une séance', () => {
  it('« 3 séries de 10 squats à 40 kilos, puis développé couché 4 fois 8 à 30 kg »', () => {
    const l = lireDictee('3 séries de 10 squats à 40 kilos, puis développé couché 4 fois 8 à 30 kg', catalogue);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ exerciceId: 'sq', nom: 'Squat arrière — barre' });
    expect(l[0].series).toEqual(Array(3).fill({ repetitions: 10, charge: 40 }));
    expect(l[1]).toMatchObject({ exerciceId: 'dc' });
    expect(l[1].series).toEqual(Array(4).fill({ repetitions: 8, charge: 30 }));
  });
  it('nombres en toutes lettres, durées et exercices sans charge', () => {
    const l = lireDictee('trois séries de douze pompes. Ensuite gainage planche 3 fois 45 secondes', catalogue);
    expect(l[0]).toMatchObject({ exerciceId: 'po', series: Array(3).fill({ repetitions: 12 }) });
    expect(l[1]).toMatchObject({ exerciceId: 'gp', series: Array(3).fill({ duree: 45 }) });
  });
  it('« tractions 4x6 » et un exercice inconnu gardé tel quel', () => {
    const l = lireDictee('tractions 4x6, puis 20 burpees', catalogue);
    expect(l[0]).toMatchObject({ exerciceId: 'tr', series: Array(4).fill({ repetitions: 6 }) });
    expect(l[1]).toMatchObject({ exerciceId: undefined, nom: 'Burpees', series: [{ repetitions: 20 }] });
  });
  it('le matériel dit est respecté', () => {
    expect(lireDictee('squat goblet 3x12 à 16 kg', catalogue)[0]).toMatchObject({ exerciceId: 'sq2', series: Array(3).fill({ repetitions: 12, charge: 16 }) });
  });
  it('rien de reconnu', () => expect(lireDictee('', catalogue)).toEqual([]));
});

describe('séance libre → modèle du coach', () => {
  it('une ligne par exercice de la bibliothèque, séries, fourchette et charge max ; les autres dans les consignes', () => {
    let n = 0;
    const { seance, ignores } = seanceDepuisActivite(
      {
        titre: 'Muscu jambes',
        sport: 'musculation',
        dureeS: 3600,
        note: 'Repos 2 min',
        exercices: [
          { exerciceId: 'sq', nom: 'Squat arrière — barre', series: [{ repetitions: 10, charge: 40 }, { repetitions: 8, charge: 45 }, { repetitions: 8, charge: 45 }] },
          { exerciceId: 'gp', nom: 'Gainage planche', series: [{ duree: 45 }, { duree: 60 }] },
          { nom: 'Burpees', series: [{ repetitions: 20 }] },
        ],
      },
      catalogue,
      () => `id${++n}`,
      'prog',
    );
    expect(ignores).toEqual(['Burpees']);
    expect(seance).toMatchObject({ titre: 'Muscu jambes', programmeId: 'prog', dureeMin: 60 });
    expect(seance.consignes).toBe('Repos 2 min\n\nAussi fait par le client : Burpees.');
    const [squat, gainage] = seance.blocs[0].lignes;
    expect(squat).toMatchObject({ series: 3, repetitions: '8–10', repetitionsMin: 8, repetitionsMax: 10, chargeIndicative: 45 });
    expect(squat.exercice.id).toBe('sq');
    expect(gainage).toMatchObject({ series: 2, dureeS: 60 });
  });
});

describe('vue Entraînement du coach', () => {
  it('les activités libres ont leur pastille, hors assiduité', () => {
    const semaines = semainesDuCycle({
      cycle: { debut: '2026-10-26', fin: '2026-11-08' },
      planifications: [],
      realisations: [],
      seancesParSemaine: 2,
      jour: '2026-11-02',
      libres: [{ id: 'l1', titre: 'RPM', date: '2026-10-28' }],
    });
    expect(semaines[0].pastilles.map((p) => p.statut)).toEqual(['libre', 'manquee', 'manquee']);
    expect(semaines[0].pastilles[0]).toMatchObject({ activiteId: 'l1', titre: 'RPM' });
    expect(assiduite(semaines)).toMatchObject({ faites: 0, manquees: 2, aVenir: 2 });
  });
});

describe('dépense estimée', () => {
  it('MET de l’activité × poids × durée, ajustée par l’effort', () => {
    // RPM : 500 kcal en 45 min selon Les Mills (9,5 MET × 70 kg × 0,75 h)
    expect(estimerCalories({ sport: 'cours', titre: 'RPM', dureeS: 2700 })).toBe(499);
    expect(estimerCalories({ sport: 'cours', titre: 'RPM', dureeS: 2700 }, 60)).toBe(428);
    // BODYCOMBAT : 570 kcal en 55 min selon Les Mills
    expect(estimerCalories({ sport: 'cours', titre: 'Body Combat', dureeS: 3300 })).toBe(571);
    // Effort 10/10 : +20 %
    expect(estimerCalories({ sport: 'cours', titre: 'RPM', dureeS: 2700, ressenti: 10 })).toBe(599);
    // Nom libre inconnu : la valeur du type d'activité (yoga 3 MET)
    expect(estimerCalories({ sport: 'yoga', titre: 'Yoga du rire', dureeS: 3600 })).toBe(210);
    expect(estimerCalories({ sport: 'yoga', dureeS: 0 })).toBeUndefined();
  });
});
