import { describe, expect, it } from 'vitest';

import {
  aImporter,
  DEFINITION,
  erreurCible,
  erreurValeur,
  formaterHeure,
  formaterValeur,
  indicateursDuClient,
  INDICATEURS,
  lireHeure,
  lireValeur,
  resumer,
  type Releve,
} from '../src/domain/quotidien';
import { erreursTaille, imc } from '../src/domain/suivi';

const r = (jour: string, indicateur: Releve['indicateur'], valeur: number): Releve => ({ clientId: 'c', jour, indicateur, valeur, source: 'saisie' });

describe('suivis du quotidien', () => {
  it('propose les douze suivis, les pas en tête', () => {
    expect(INDICATEURS).toHaveLength(12);
    expect(INDICATEURS[0].cle).toBe('pas');
    expect(new Set(INDICATEURS.map((d) => d.cle)).size).toBe(12);
  });

  it('applique les réglages du client sur les valeurs par défaut', () => {
    const suivis = indicateursDuClient([{ clientId: 'c', indicateur: 'cigarettes', actif: true, cible: 3 }, { clientId: 'c', indicateur: 'pas', actif: false }]);
    const cig = suivis.find((s) => s.def.cle === 'cigarettes')!;
    expect(cig).toMatchObject({ actif: true, cible: 3, cibleParDefaut: false });
    expect(suivis.find((s) => s.def.cle === 'pas')).toMatchObject({ actif: false, cible: 8000, cibleParDefaut: true });
    expect(suivis.find((s) => s.def.cle === 'alcool')!.actif).toBe(false);
  });

  it('lit l’heure du dernier écran sans couper la nuit à minuit', () => {
    expect(lireHeure('22:30')).toBe(22.5);
    expect(lireHeure('23h')).toBe(23);
    expect(lireHeure('0:45')).toBe(24.75);
    expect(lireHeure('25:00')).toBeNaN();
    expect(lireHeure('')).toBeUndefined();
    expect(formaterHeure(24.75)).toBe('00:45');
    expect(erreurValeur(DEFINITION.dernier_ecran, lireHeure('14:00'))).toMatch(/entre 18:00 et 06:00/);
  });

  it('lit les nombres au clavier français et contrôle les bornes', () => {
    expect(lireValeur(DEFINITION.eau, '1,5')).toBe(1.5);
    expect(lireValeur(DEFINITION.pas, '8 450')).toBe(8450);
    expect(lireValeur(DEFINITION.pas, '')).toBeUndefined();
    expect(erreurValeur(DEFINITION.eau, 12)).toMatch(/entre 0 et 10/);
    expect(erreurValeur(DEFINITION.energie, 3.5)).toMatch(/note de 1 à 5/);
    expect(erreurValeur(DEFINITION.pas, 12000)).toBeUndefined();
    // Cible hebdomadaire : jusqu'à 7 fois le maximum d'une journée.
    expect(erreurCible(DEFINITION.alcool, 100)).toBeUndefined();
  });

  it('formate chaque valeur avec son unité', () => {
    expect(formaterValeur(DEFINITION.pas, 8450)).toBe(`${(8450).toLocaleString('fr-FR')} pas`);
    expect(formaterValeur(DEFINITION.energie, 4)).toBe('4/5');
    expect(formaterValeur(DEFINITION.dernier_ecran, 23.25)).toBe('23:15');
  });

  it('résume les 7 derniers jours sans compter les jours vides comme des zéros', () => {
    const s = indicateursDuClient([]).find((x) => x.def.cle === 'pas')!;
    const releves = [r('2026-10-29', 'pas', 9000), r('2026-10-28', 'pas', 7000), r('2026-10-20', 'pas', 5000), r('2026-10-29', 'eau', 2)];
    const res = resumer(s, releves, '2026-10-29', 30);
    expect(res.points).toHaveLength(30);
    expect(res.points[29]).toEqual({ jour: '2026-10-29', valeur: 9000 });
    expect(res.joursNotes7).toBe(2);
    expect(res.moyenne7).toBe(8000);
    expect(res.joursAtteints7).toBe(1);
    expect(res.tendance).toBe(3000);
  });

  it('compte l’alcool sur la semaine en cours', () => {
    const s = indicateursDuClient([]).find((x) => x.def.cle === 'alcool')!;
    // 2026-10-29 est un jeudi : la semaine commence le lundi 26.
    const res = resumer(s, [r('2026-10-25', 'alcool', 4), r('2026-10-26', 'alcool', 2), r('2026-10-29', 'alcool', 1)], '2026-10-29');
    expect(res.totalSemaine).toBe(3);
  });
});

describe('taille et IMC', () => {
  it('calcule l’IMC avec la dernière pesée', () => {
    expect(imc(70, 175)).toBe(22.9);
    expect(imc(undefined, 175)).toBeUndefined();
    expect(imc(70, undefined)).toBeUndefined();
  });
  it('contrôle la taille', () => {
    expect(erreursTaille(172)).toEqual([]);
    expect(erreursTaille(1.72)).toHaveLength(1);
    expect(erreursTaille(undefined)).toHaveLength(1);
  });
});

describe('lecture sur le téléphone', () => {
  const tel = (jour: string, valeur: number): Releve => ({ ...r(jour, 'pas', valeur), source: 'telephone' });
  it('remplit un jour vide et met à jour une lecture précédente', () => {
    expect(aImporter([], '2026-10-29', 'pas', 9000)).toBe(true);
    expect(aImporter([tel('2026-10-29', 4000)], '2026-10-29', 'pas', 9000)).toBe(true);
    expect(aImporter([tel('2026-10-29', 9000)], '2026-10-29', 'pas', 9000)).toBe(false);
  });
  it('ne remplace jamais une saisie à la main ni par du vide', () => {
    expect(aImporter([r('2026-10-29', 'pas', 7000)], '2026-10-29', 'pas', 9000)).toBe(false);
    expect(aImporter([], '2026-10-29', 'pas', null)).toBe(false);
  });
});
