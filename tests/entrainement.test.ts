// Règles d'entraînement reprises de l'app d'origine (trainingCycles, prescription, trainingSources, copie, suivi).
import { describe, expect, it } from 'vitest';

import {
  appliquerCycle,
  avancementCycle,
  casesLigne,
  collectionDe,
  comparerDeuxDernieres,
  consignesDuCycle,
  copierProgramme,
  correspondRecherche,
  cyclesValides,
  etatCycle,
  finSuivi,
  formatDeLigne,
  lirePourcentage,
  lireObjectif,
  lireRepetitions,
  objectifValide,
  objectifsPour,
  remplacerExercice,
  secondesAllure,
  semaineDe,
  sourceEntrainement,
  suggestionPourcentage,
  texteObjectif,
  titreClient,
  typeExercice,
} from '@/domain/entrainement';
import type { LignePrescription, Programme, Seance } from '@/domain/types';

const variante = (series: number, repetitions: string, rir: number) => ({
  series,
  repetitions,
  recuperationS: 150,
  rir,
  chargeIntensite: 'Charge à ajuster au RIR cible',
  tempo: 'Contrôlé',
  consignes: `Cycle ${repetitions}`,
  progressionPrevue: `Progression ${repetitions}`,
});
const CYCLES = [variante(3, '12–15', 3), variante(3, '8–12', 2), variante(3, '8–12', 2), variante(3, '6–8', 2)];
const rowing = { id: 'ex-1', nom: 'Rowing buste penché — barre', mesures: ['charge', 'repetitions'] as const, famille: 'Tirages horizontaux' };
const ligne: LignePrescription = {
  id: 'l1',
  exercice: { ...rowing, mesures: [...rowing.mesures] },
  series: 4,
  repetitions: '10–12',
  repetitionsMin: 10,
  repetitionsMax: 12,
  rir: 3,
  progression: 'S1 : calibrer à 4 RIR',
  cycles: CYCLES,
};

describe('quatre cycles', () => {
  it('cycle 1 garde les réglages du coach et retire les variantes', () => {
    const l = appliquerCycle(ligne, 1);
    expect(l.series).toBe(4);
    expect(l.repetitions).toBe('10–12');
    expect(l.cycles).toBeUndefined();
  });

  it('cycle 3 applique sa variante', () => {
    const l = appliquerCycle(ligne, 3);
    expect([l.series, l.repetitions, l.repetitionsMin, l.repetitionsMax, l.rir, l.progression]).toEqual([3, '8–12', 8, 12, 2, 'Progression 8–12']);
    expect(l.cycles).toBeUndefined();
  });

  it('variantes incomplètes : ligne inchangée', () => {
    expect(cyclesValides(CYCLES.slice(0, 3))).toBe(false);
    expect(appliquerCycle({ ...ligne, cycles: CYCLES.slice(0, 3) }, 3).repetitions).toBe('10–12');
  });

  it('remplacer l’exercice retire les variantes de l’ancien mouvement', () => {
    const l = remplacerExercice(ligne, { id: 'ex-2', nom: 'Tirage horizontal', mesures: ['charge'] });
    expect(l.cycles).toBeUndefined();
    expect(appliquerCycle(l, 3).repetitions).toBe('10–12');
  });

  it('consignes de séance : la phrase de choix devient le cycle retenu', () => {
    const texte =
      'Répéter la séance pendant 5 semaines. Les prescriptions affichées par défaut correspondent au cycle 1. Les cycles 2–4 se choisissent lors de la duplication ou de l’attribution en copie. Pas de passage automatique.';
    expect(consignesDuCycle(texte, 2)).toBe(
      'Répéter la séance pendant 5 semaines. 2 · Progression des charges · Réglages enregistrés dans cette copie. Pas de passage automatique.',
    );
  });

  it('lit les répétitions prescrites', () => {
    expect(lireRepetitions('6–8 par côté')).toEqual({ min: 6, max: 8 });
    expect(lireRepetitions('10')).toEqual({ min: 10, max: 10 });
    expect(lireRepetitions('AMRAP')).toBeUndefined();
  });
});

describe('prescription selon la famille', () => {
  it('un rowing de musculation reste de la force ; le rameur est du cardio', () => {
    expect(typeExercice('Rowing buste penché — barre', 'Tirages horizontaux')).toBe('force');
    expect(typeExercice('Rameur', 'Cardio et déplacements', ['Rameur'])).toBe('rameur');
    expect(typeExercice('SkiErg')).toBe('skierg');
    expect(typeExercice('Planche latérale', 'Gainage')).toBe('statique');
    expect(typeExercice('Farmer walk', 'Portés et maintien')).toBe('porte');
    expect(typeExercice('Vélo assis', '', 'Vélo')).toBe('velo');
    expect(typeExercice('Développé couché — barre')).toBe('force');
  });

  it('objectifs proposés par famille', () => {
    expect(objectifsPour('rameur')).toEqual(['temps', 'distance', 'calories', 'watts', 'allure500']);
    expect(objectifsPour('velo')).toEqual(['temps', 'distance', 'calories', 'vitesse', 'watts']);
    expect(objectifsPour('course')).toContain('allureKm');
    expect(objectifsPour('statique')).toEqual(['temps']);
  });

  it('allure 2:05 au 500 m relue sans conversion', () => {
    expect(secondesAllure('2:05')).toBe(125);
    expect(objectifValide('allure500', '2:05')).toBe(true);
    expect(objectifValide('allure500', '125')).toBe(false);
    const charge = texteObjectif('allure500', '2:05');
    expect(charge).toBe('2:05 / 500 m');
    expect(lireObjectif({ chargeIntensite: charge })).toEqual({ type: 'allure500', valeur: '2:05' });
    expect(lireObjectif({ chargeIntensite: '20 cal' })).toEqual({ type: 'calories', valeur: '20' });
    expect(lireObjectif({ distanceM: 500 })).toEqual({ type: 'distance', valeur: '500' });
    expect(objectifValide('calories', '20,5')).toBe(false);
  });

  it('format de travail et cases affichées', () => {
    expect(formatDeLigne({}, 'statique')).toBe('temps');
    expect(formatDeLigne({}, 'rameur')).toBe('objectif');
    expect(formatDeLigne({}, 'force')).toBe('reps');
    const cases = casesLigne({ ...ligne, recuperationS: 150, chargeIntensite: '2:05 / 500 m' });
    expect(cases).toContainEqual(['Récup.', '150 s']);
    expect(cases).toContainEqual(['Objectif', '2:05 / 500 m']);
  });
});

describe('collections et recherche', () => {
  it('classe selon le code', () => {
    expect(collectionDe('MOD-SAL-13-4 · Débutant · Prise de muscle · 4 séances')).toBe('Fondamentaux');
    expect(collectionDe('REF-NIP-2 · Essentiel salle · 2 séances · Adaptation Coach OS')).toBe('Références');
    expect(collectionDe('CAL-BASE-2 · Bases au poids du corps · 2 séances')).toBe('Calisthénie');
    expect(collectionDe('Séance seule · Séance Sylvain 1')).toBe('Mes créations');
    expect(sourceEntrainement('REF-NIP-2 · Essentiel salle · 2 séances')?.author).toBe('Jeff Nippard');
  });

  it('recherche sans accents, y compris l’auteur', () => {
    expect(correspondRecherche('REF-BWS-3 · Pousser · Tirer · Jambes · 3 séances', 'jeremy ethier')).toBe(true);
    expect(correspondRecherche('CAL-PPL-3 · Pousser · Tirer · Jambes', 'calisthenie')).toBe(true);
    expect(correspondRecherche('MOD-SAL-13-4 · Débutant', 'debutant')).toBe(true);
  });

  it('titre montré au client sans codes internes', () => {
    expect(titreClient('MOD-SAL-13-4-S3 · Dos · Triceps')).toBe('Dos · Triceps');
    expect(titreClient('Copie · Léa · Cycle 1 · MOD-SAL-13-4 · Débutant')).toBe('Léa · Cycle 1 · Débutant');
  });
});

describe('copies', () => {
  let n = 0;
  const id = () => `id-${++n}`;
  const modele: Programme = {
    id: 'm1',
    titre: 'MOD-SAL-13-4',
    niveau: 'Débutant',
    seancesParSemaine: 4,
    dureeSemaines: 5,
    consignes: '4 cycles proposés',
    materiel: 'Salle',
    seances: [],
  };
  const seance: Seance = {
    id: 's1',
    titre: 'MOD-SAL-13-4-S3 · Dos · Triceps',
    programmeId: 'm1',
    ordre: 3,
    dominante: 'Dos · Triceps',
    blocs: [{ id: 'b1', titre: '3 · Mouvement de référence', lignes: [ligne] }],
  };

  it('copie pour un client : cycle choisi, indépendante, consignes préfixées', () => {
    const { programme, seances } = copierProgramme(modele, [seance], { titre: 'Copie · Léa · Cycle 1 · MOD', cycle: 2, clientId: 'lea' }, id);
    expect(programme).toMatchObject({ clientId: 'lea', statut: 'Brouillon', modeleOrigineId: 'm1', cycleApplique: 2 });
    expect(programme.consignes).toBe('2 · Progression des charges · Cycle de 5 semaines.\n4 cycles proposés');
    const l = seances[0].blocs[0].lignes[0];
    expect([seances[0].clientId, seances[0].programmeId, l.repetitions, l.cycles]).toEqual(['lea', programme.id, '8–12', undefined]);
    expect([seances[0].id, seances[0].blocs[0].id, l.id]).not.toContain('s1');
    // Le modèle n'a pas bougé.
    expect(seance.blocs[0].lignes[0].cycles).toHaveLength(4);
  });

  it('dupliquer dans la bibliothèque : nouveau modèle avec ses critères', () => {
    const { programme } = copierProgramme(modele, [seance], { titre: 'MOD · Copie', cycle: 1 }, id);
    expect(programme.clientId).toBeUndefined();
    expect(programme).toMatchObject({ materiel: 'Salle', consignes: '4 cycles proposés', version: 'coachos-free' });
  });
});

describe('suivi et cycles', () => {
  it('fin du suivi en mois calendaires', () => {
    expect(finSuivi('2026-10-10', 3)).toBe('2027-01-09');
    expect(finSuivi('2026-01-31', 1)).toBe('2026-02-27');
  });

  it('état temporel distinct du statut', () => {
    const c = { debut: '2026-10-01', fin: '2026-11-04' };
    expect(etatCycle(c, '2026-09-30')).toBe('a_venir');
    expect(etatCycle(c, '2026-10-15')).toBe('en_cours');
    expect(etatCycle(c, '2026-11-05')).toBe('depasse');
    expect(avancementCycle(c, '2026-10-15')).toEqual({ etat: 'en_cours', nbSemaines: 5, semaine: 3 });
    expect(semaineDe('2026-10-01', '2026-10-01')).toBe(1);
  });
});

describe('pourcentage du 1RM', () => {
  const refs = [{ exerciceId: 'squat', charge: 100, repetitions: 5, date: '2026-10-01' }];

  it('suggestion arrondie au pas de 2,5 kg avec Epley', () => {
    const s = suggestionPourcentage('squat', '70-75 % 1RM', '', refs)!;
    expect(s.rm).toBe(116.67);
    expect([s.chargeMin, s.chargeMax, s.estime]).toEqual([80, 87.5, true]);
  });

  it('sans référence : pas de faux 0 kg', () => {
    const s = suggestionPourcentage('autre', '70 %', '', refs)!;
    expect([s.rm, s.chargeMin]).toEqual([null, null]);
  });

  it('un pourcentage de fréquence cardiaque n’est pas un % du 1RM', () => {
    expect(lirePourcentage('Zone 2', 'Rester à 70 % de la FC max')).toBeNull();
    expect(lirePourcentage('Charge à ajuster au RIR cible')).toBeNull();
  });
});

describe('comparaison de deux séances', () => {
  const s = (date: string, series: number[]) => ({
    date,
    cycleCle: 'c1',
    cycleNom: 'Cycle 1',
    exercices: [{ ligneId: 'l1', nom: 'Rowing', series: series.map((n) => ({ n, texte: `${40 + n} kg × 10` })) }],
  });

  it('deux réalisations complètes, série par série', () => {
    const r = comparerDeuxDernieres([s('2026-10-01', [1, 2, 3]), s('2026-10-08', [1, 2, 3]), s('2026-09-20', [1])]);
    expect(r.comparables).toHaveLength(1);
    expect(r.comparables[0].ancienne.date).toBe('2026-10-01');
    expect(r.comparables[0].limite).toBe(false);
  });

  it('signale des séries différentes', () => {
    const r = comparerDeuxDernieres([s('2026-10-01', [1, 2, 3]), s('2026-10-08', [1, 2])]);
    expect(r.comparables[0].limite).toBe(true);
    expect(r.comparables[0].lignes[2]).toEqual({ n: 3, ancienne: '43 kg × 10', recente: '—' });
  });
});
