import { describe, expect, it } from 'vitest';

import { modelesImportes } from '@/data/modeles-demo';
import {
  activer,
  annuler,
  bibliotheque,
  corbeille,
  deplacer,
  detailProgramme,
  enregistrer,
  espaceClient,
  fusionnerSeance,
  planifier,
  restaurerLigne,
  texteSerie,
  verifierCorbeille,
  verifierCycle,
  type CycleStocke,
  type Etat,
} from '@/domain/entrainement-etat';

const COACH = 'coach-sylvain';
const MODELE = 'rec0a3UFdHP6Mwh7P';
const JOUR = '2026-10-24';

function etat(cycles: Partial<CycleStocke>[] = []): Etat {
  const { programmes, seances } = modelesImportes(COACH);
  return {
    programmes,
    seances,
    suivis: [{ id: 's1', clientId: 'lea', debut: '2026-10-01', dureeMois: 3 }],
    cycles: cycles.map((c, i) => ({
      id: `c${i + 1}`,
      suiviId: 's1',
      clientId: 'lea',
      ordre: i + 1,
      nom: `Cycle ${i + 1}`,
      debut: '2026-10-14',
      fin: '2026-11-17',
      statut: 'Brouillon',
      ...c,
    })),
    planifications: [],
    realisations: [],
  };
}

describe('modèles importés d’Airtable', () => {
  it('donne les 95 modèles, leurs 272 séances et 2 655 lignes avec les exercices du catalogue', () => {
    const { programmes, seances } = modelesImportes(COACH);
    expect(programmes).toHaveLength(95);
    expect(seances).toHaveLength(272);
    expect(seances.reduce((n, s) => n + s.blocs.reduce((m, b) => m + b.lignes.length, 0), 0)).toBe(2655);
    const s3 = seances.find((s) => s.titre === 'MOD-SAL-13-4-S3 · Dos · Triceps')!;
    const rowing = s3.blocs[2].lignes[0];
    expect(rowing.exercice.nom).toBe('Rowing buste penché — barre');
    expect(rowing).toMatchObject({ series: 3, repetitions: '12–15', rir: 3, phase: 'Principal' });
    expect(rowing.cycles?.[1].repetitions).toBe('8–12');
    expect(seances.every((s) => s.blocs.every((b) => b.lignes.every((l) => !l.exercice.id.startsWith('ex-EXO') || l.exercice.nom !== l.exercice.id.slice(3))))).toBe(true);
  });

  it('range la bibliothèque et le détail comme l’app d’origine', () => {
    const e = etat();
    const liste = bibliotheque(e, COACH);
    expect(liste).toHaveLength(95);
    expect(liste.filter((p) => p.seanceSeule)).toHaveLength(4);
    const d = detailProgramme(e, MODELE);
    expect(d.seances.map((s) => s.ordre)).toEqual([1, 2, 3, 4]);
    expect(bibliotheque(e, 'autre-coach')).toHaveLength(0);
  });
});

describe('éditeur : retirer, restaurer, corbeille', () => {
  it('retire une ligne enlevée et la restaure dans son bloc', () => {
    const e = etat();
    const s = { ...e.seances.find((x) => x.programmeId === MODELE)!, coachId: COACH };
    const ligne = s.blocs[0].lignes[0];
    const sans = { ...s, blocs: s.blocs.map((b, i) => (i === 0 ? { ...b, lignes: b.lignes.slice(1) } : b)) };
    const apres = fusionnerSeance(s, sans, COACH);
    expect(apres.retraits?.map((r) => r.ligne.id)).toEqual([ligne.id]);
    const restauree = restaurerLigne(apres, ligne.id);
    expect(restauree.retraits).toEqual([]);
    expect(restauree.blocs[0].lignes.map((l) => l.id)).toContain(ligne.id);
  });

  it('protège un programme lié à un cycle et met le reste à la corbeille', () => {
    const e = etat([{ programmeId: MODELE }]);
    expect(() => verifierCorbeille(e, [{ kind: 'programme', id: MODELE }])).toThrow(/lié à un dossier client/);
    const autre = e.programmes.find((p) => p.id !== MODELE)!;
    expect(() => verifierCorbeille(e, [{ kind: 'programme', id: autre.id }])).not.toThrow();
    const supprime = { ...e, programmes: e.programmes.map((p) => (p.id === autre.id ? { ...p, supprimeLe: '2026-10-24T10:00:00Z' } : p)) };
    expect(corbeille(supprime, COACH)).toEqual([{ kind: 'programme', id: autre.id, nom: autre.titre }]);
    expect(bibliotheque(supprime, COACH)).toHaveLength(94);
  });
});

describe('cycles clients', () => {
  it('refuse une activation par enregistrement et un programme changé sur un cycle terminé', () => {
    expect(() => verifierCycle(undefined, { ...etat([{}]).cycles[0], statut: 'Actif', programmeId: MODELE })).toThrow(/Activer/);
    const fini = { ...etat([{ statut: 'Terminé', programmeId: MODELE }]).cycles[0] };
    expect(() => verifierCycle(fini, { ...fini, programmeId: 'autre' })).toThrow(/figé/);
  });

  it('active un cycle Prêt dans ses dates et termine l’ancien', () => {
    const e = etat([{ statut: 'Actif', programmeId: MODELE, debut: '2026-09-01', fin: '2026-10-13' }, { statut: 'Prêt', programmeId: MODELE }]);
    const cycles = activer(e, 'c2', JOUR);
    expect(cycles.map((c) => c.statut)).toEqual(['Terminé', 'Actif']);
    expect(() => activer(e, 'c2', '2026-12-01')).toThrow(/hors du cycle/);
    expect(() => activer(etat([{ statut: 'Prêt' }]), 'c1', JOUR)).toThrow(/aucun programme/);
    expect(() => activer(etat([{}]), 'c1', JOUR)).toThrow(/Brouillon/);
  });

  it('déplace un cycle et renumérote', () => {
    const e = etat([{}, {}, {}]);
    expect(deplacer(e, 'c3', -1).sort((a, b) => a.ordre - b.ordre).map((c) => c.id)).toEqual(['c1', 'c3', 'c2']);
    expect(deplacer(e, 'c1', -1)).toBe(e.cycles);
  });
});

describe('côté client', () => {
  const actif = () => etat([{ statut: 'Terminé', debut: '2026-09-01', fin: '2026-10-13' }, { statut: 'Actif', programmeId: MODELE }, { statut: 'Prêt' }]);

  it('ne montre que les cycles Actif et Terminé, avec la semaine en cours', () => {
    const v = espaceClient(actif(), 'lea', JOUR);
    expect(v.planning.map((c) => c.statut)).toEqual(['Terminé', 'Actif']);
    expect(v.cycle).toMatchObject({ id: 'c2', etat: 'en_cours', semaine: 2, nbSemaines: 5 });
    expect(v.seances).toHaveLength(4);
    expect(v.suivi?.fin).toBe('2026-12-31');
    expect(espaceClient(etat([{ statut: 'Prêt', programmeId: MODELE }]), 'lea', JOUR).seances).toEqual([]);
  });

  it('planifie sans doublon, dans les dates, et annule un créneau prévu', () => {
    const e = actif();
    const seanceId = espaceClient(e, 'lea', JOUR).seances[0].id;
    const d = { cycleId: 'c2', seanceId, date: '2026-10-26', envoiId: 'envoi-0001' };
    const p1 = planifier(e, 'lea', d, JOUR);
    expect(p1).toHaveLength(1);
    expect(planifier({ ...e, planifications: p1 }, 'lea', d, JOUR)).toBe(p1);
    expect(() => planifier({ ...e, planifications: p1 }, 'lea', { ...d, envoiId: 'envoi-0002' }, JOUR)).toThrow(/déjà prévue/);
    expect(() => planifier(e, 'lea', { ...d, date: '2026-10-20' }, JOUR)).toThrow(/date à venir/);
    expect(() => planifier(e, 'lea', { ...d, cycleId: 'c3' }, JOUR)).toThrow(/activer ce cycle/);
    expect(() => planifier(e, 'paul', d, JOUR)).toThrow(/hors de votre dossier/);
    expect(annuler({ ...e, planifications: p1 }, 'lea', p1[0].id)[0].statut).toBe('Annulée');
  });

  it('enregistre une séance une seule fois, fige les libellés et marque le calendrier', () => {
    const e = actif();
    const s = espaceClient(e, 'lea', JOUR).seances[0];
    const l = s.blocs[2].lignes[0];
    const plan = planifier(e, 'lea', { cycleId: 'c2', seanceId: s.id, date: JOUR, envoiId: 'envoi-0003' }, JOUR);
    const r = {
      id: 'r1',
      clientId: 'lea',
      seanceId: s.id,
      cycleId: 'c2',
      debut: `${JOUR}T09:00:00Z`,
      fin: `${JOUR}T10:00:00Z`,
      note: 7,
      series: [{ id: 's1', ligneId: l.id, exerciceId: l.exercice.id, index: 1, valeurs: { charge: 40, repetitions: 12 }, suggestion: {} }],
    };
    const un = enregistrer({ ...e, planifications: plan }, r, JOUR);
    expect(un.resultat).toBe('enregistree');
    expect(un.etat.realisations[0]).toMatchObject({ seanceTitre: s.titre, cycleNom: 'Cycle 2', noms: { [l.id]: l.exercice.nom } });
    expect(un.etat.planifications[0]).toMatchObject({ statut: 'Réalisée', realisationId: 'r1' });
    const deux = enregistrer({ ...e, ...un.etat }, r, JOUR);
    expect(deux.resultat).toBe('doublon');
    expect(deux.etat.realisations).toHaveLength(1);
    expect(() => enregistrer(e, { ...r, id: 'r2', series: [], note: undefined }, JOUR)).toThrow(/au moins un résultat/);
    expect(() => enregistrer(e, { ...r, id: 'r3', cycleId: 'c1' }, JOUR)).toThrow(/pas en cours/);
    const sansCreneau = enregistrer(e, { ...r, id: 'r4' }, JOUR);
    expect(sansCreneau.etat.planifications[0]).toMatchObject({ statut: 'Réalisée', date: JOUR });
  });

  it('écrit les séries comme l’app d’origine, cardio et statique compris', () => {
    expect(texteSerie({ charge: 60, repetitions: 10 })).toBe('60 kg × 10');
    expect(texteSerie({ duree: 45 })).toBe('45 s');
    expect(texteSerie({ distance: 500, allure500: 125 })).toBe('500 m · 2:05 / 500 m');
  });
});
