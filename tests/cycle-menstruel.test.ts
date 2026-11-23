import { describe, expect, it } from 'vitest';

import {
  analyser,
  calendrier,
  dureeCycleEstimee,
  erreurReglages,
  filtrerPourCoach,
  phaseRetrospective,
  phrasePrevision,
  reglagesParDefaut,
  situation,
  type Regles,
} from '@/domain/cycle-menstruel';
import { decalerJour } from '@/domain/quotidien';

const r = (debut: string, fin?: string): Regles => ({ clientId: 'c', debut, fin });
const base = reglagesParDefaut('c');

describe('prévision des règles', () => {
  it('sans historique, prend la durée déclarée', () => {
    const s = situation('2026-11-13', [r('2026-11-01')], base)!;
    expect(s.jourCycle).toBe(13);
    expect(s.prochaines).toBe('2026-11-29');
    expect(s.dansJours).toBe(16);
    expect(s.fiable).toBe(false);
    expect(phrasePrevision(s)).toBe('dans 16 jours, vers le 29 nov.');
  });

  it('apprend la durée réelle des cycles passés', () => {
    const regles = [r('2026-08-01'), r('2026-08-31'), r('2026-09-30'), r('2026-10-30')];
    expect(dureeCycleEstimee(regles, base)).toBe(30);
    const s = situation('2026-11-13', regles, base)!;
    expect(s.prochaines).toBe('2026-11-29');
    expect(s.fiable).toBe(true);
    // Cycles très réguliers : fourchette étroite.
    expect(s.fourchette).toEqual(['2026-11-28', '2026-11-30']);
  });

  it('ignore un écart aberrant (mois oublié)', () => {
    expect(dureeCycleEstimee([r('2026-06-01'), r('2026-08-28'), r('2026-09-26')], base)).toBe(29);
  });

  it('signale un retard, puis se recale quand les règles sont notées', () => {
    const regles = [r('2026-10-01')];
    const enRetard = situation('2026-11-01', regles, base)!;
    expect(enRetard.retard).toBe(3);
    expect(phrasePrevision(enRetard)).toMatch(/^3 jours de retard/);
    const recale = situation('2026-11-01', [...regles, r('2026-11-01')], base)!;
    expect(recale.retard).toBeUndefined();
    expect(recale.phase).toBe('regles');
    expect(recale.jourCycle).toBe(1);
  });

  it('donne la phase du jour', () => {
    const regles = [r('2026-11-01', '2026-11-04')];
    expect(situation('2026-11-03', regles, base)!.phase).toBe('regles');
    expect(situation('2026-11-05', regles, base)!.phase).toBe('folliculaire');
    expect(situation('2026-11-14', regles, base)!.phase).toBe('ovulation');
    expect(situation('2026-11-20', regles, base)!.phase).toBe('luteale');
  });

  it('pas de prévision sans règles notées ou en mode sans prévision', () => {
    expect(situation('2026-11-13', [], base)).toBeUndefined();
    expect(situation('2026-11-13', [r('2026-11-01')], { ...base, sansPrevision: true })).toBeUndefined();
  });

  it('vérifie les durées déclarées', () => {
    expect(erreurReglages({ dureeCycle: 28, dureeRegles: 5 })).toBeUndefined();
    expect(erreurReglages({ dureeCycle: 60, dureeRegles: 5 })).toMatch(/cycle/);
    expect(erreurReglages({ dureeCycle: 28, dureeRegles: 0 })).toMatch(/règles/);
  });
});

describe('phases relues avec le recul', () => {
  it('place l’ovulation 14 jours avant les règles suivantes', () => {
    const regles = [r('2026-10-01'), r('2026-11-02')]; // cycle de 32 jours
    expect(phaseRetrospective('2026-10-19', regles, base)).toBe('ovulation'); // jour 19 = 32 − 14 + 1
    expect(phaseRetrospective('2026-10-10', regles, base)).toBe('folliculaire');
    expect(phaseRetrospective('2026-10-28', regles, base)).toBe('luteale');
    expect(phaseRetrospective('2026-09-20', regles, base)).toBeUndefined();
  });

  it('remplit un mois de calendrier, passé et prévu', () => {
    const jours = calendrier('2026-11', '2026-11-13', [r('2026-10-04'), r('2026-11-01')], base);
    expect(jours).toHaveLength(30);
    expect(jours[0]).toMatchObject({ jour: '2026-11-01', phase: 'regles', prevu: false });
    expect(jours[28]).toMatchObject({ jour: '2026-11-29', phase: 'regles', prevu: true });
  });
});

describe('entraînement selon la phase', () => {
  const regles = [r('2026-08-01'), r('2026-08-29'), r('2026-09-26'), r('2026-10-24')];
  const seance = (jour: string, charge: number, note: number) => ({
    debut: `${jour}T08:00:00Z`,
    fin: `${jour}T09:00:00Z`,
    note,
    series: [{ id: 's', exerciceId: 'squat', ligneId: 'l', index: 0, valeurs: { charge, repetitions: 5 }, suggestion: {} }],
  });

  it('attend au moins deux cycles complets', () => {
    const a = analyser(regles.slice(0, 2), base, [], [seance('2026-08-10', 60, 6)]);
    expect(a.pret).toBe(false);
    expect(a.constats).toEqual([]);
  });

  it('compare la force, l’énergie et le ressenti par phase', () => {
    const seances = [];
    const energie = [];
    for (const debut of ['2026-08-01', '2026-08-29', '2026-09-26']) {
      seances.push(seance(decalerJour(debut, 1), 55, 8)); // règles
      seances.push(seance(decalerJour(debut, 8), 65, 6)); // folliculaire
      seances.push(seance(decalerJour(debut, 22), 58, 7)); // lutéale
      for (let i = 0; i < 4; i++) energie.push({ jour: decalerJour(debut, i), valeur: 2 });
      for (let i = 6; i < 10; i++) energie.push({ jour: decalerJour(debut, i), valeur: 4 });
    }
    const a = analyser(regles, base, energie, seances);
    expect(a.cycles).toBe(3);
    expect(a.pret).toBe(true);
    const folli = a.phases.find((p) => p.phase === 'folliculaire')!;
    expect(folli.seances).toBe(3);
    expect(folli.energie).toBe(4);
    expect(a.constats[0]).toMatch(/plus forte en phase folliculaire que pendant tes règles/);
    expect(a.constats.some((c) => /énergie est la plus haute en phase folliculaire/.test(c))).toBe(true);
    expect(a.constats.some((c) => /plus dures pendant tes règles/.test(c))).toBe(true);
  });
});

describe('progression régulière', () => {
  it('des charges qui montent chaque semaine ne passent pas pour un effet du cycle', () => {
    const regles = [r('2026-08-01'), r('2026-08-29'), r('2026-09-26'), r('2026-10-24')];
    const seances = Array.from({ length: 28 }, (_, i) => {
      const jour = decalerJour('2026-08-01', i * 3);
      return {
        debut: `${jour}T08:00:00Z`,
        fin: `${jour}T09:00:00Z`,
        series: [{ id: 's', exerciceId: 'squat', ligneId: 'l', index: 0, valeurs: { charge: 40 + i, repetitions: 5 }, suggestion: {} }],
      };
    });
    const a = analyser(regles, base, [], seances);
    expect(a.pret).toBe(true);
    for (const p of a.phases) expect(Math.abs(p.force ?? 0)).toBeLessThan(3);
    expect(a.constats.some((c) => /plus forte/.test(c))).toBe(false);
  });
});

describe('ce que voit la coach', () => {
  const donnees = { regles: [r('2026-09-01'), r('2026-10-01')], notes: [{ clientId: 'c', jour: '2026-10-02', symptomes: ['crampes' as const] }] };

  it('rien par défaut, ni quand le suivi est éteint', () => {
    expect(filtrerPourCoach(null, donnees)).toBeNull();
    expect(filtrerPourCoach({ actif: true, partage: 'rien' }, donnees)).toBeNull();
    expect(filtrerPourCoach({ actif: false, partage: 'tout' }, donnees)).toBeNull();
  });

  it('la phase seule : le dernier début, sans historique ni notes', () => {
    const v = filtrerPourCoach({ actif: true, partage: 'phase' }, donnees)!;
    expect(v.regles.map((x) => x.debut)).toEqual(['2026-10-01']);
    expect(v.notes).toEqual([]);
  });

  it('tout : l’historique et les notes', () => {
    const v = filtrerPourCoach({ actif: true, partage: 'tout' }, donnees)!;
    expect(v.regles).toHaveLength(2);
    expect(v.notes).toHaveLength(1);
  });
});
