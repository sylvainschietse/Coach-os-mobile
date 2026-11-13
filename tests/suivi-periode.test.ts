// Fiche client › Suivi : périodes parcourues avec ‹ ›, valeurs rangées par case, historique semaine par semaine.
import { describe, expect, it } from 'vitest';

import { dateCourte, decaler, fenetre, historiqueSemaines, moyenneParJour, parCase, peutAvancer, resumeSemaine } from '../src/domain/suivi-periode';

describe('périodes', () => {
  it('semaine du lundi au dimanche, sept cases', () => {
    const f = fenetre('semaine', '2026-11-05');
    expect([f.debut, f.fin, f.titre]).toEqual(['2026-11-02', '2026-11-08', '2 – 8 novembre']);
    expect(f.cases.map((c) => c.libelle).join('')).toBe('LMMJVSD');
  });
  it('semaine à cheval sur deux mois', () => {
    expect(fenetre('semaine', '2026-11-01').titre).toBe('26 octobre – 1er novembre');
  });
  it('mois : un jour par case ; année : un mois par case', () => {
    expect(fenetre('mois', '2028-02-10').cases).toHaveLength(29);
    const a = fenetre('annee', '2026-06-01');
    expect([a.cases.length, a.cases[1].fin, a.titre]).toEqual([12, '2026-02-28', '2026']);
  });
  it('jour : son nom en toutes lettres', () => {
    expect(fenetre('jour', '2026-11-12').titre).toBe('jeudi 12 novembre');
  });
  it('‹ › garde un jour qui existe', () => {
    expect(decaler('mois', '2026-03-31', -1)).toBe('2026-02-28');
    expect(decaler('mois', '2026-01-15', -1)).toBe('2025-12-15');
    expect(decaler('annee', '2028-02-29', 1)).toBe('2029-02-28');
    expect(decaler('semaine', '2026-11-12', -1)).toBe('2026-11-05');
  });
  it('pas de période dans le futur', () => {
    expect(peutAvancer('semaine', '2026-11-12', '2026-11-12')).toBe(false);
    expect(peutAvancer('semaine', '2026-11-05', '2026-11-12')).toBe(true);
    expect(peutAvancer('mois', '2026-10-31', '2026-11-12')).toBe(true);
  });
});

describe('valeurs par case', () => {
  const points = [
    { date: '2026-11-02', valeur: 6000 },
    { date: '2026-11-02', valeur: 2000 },
    { date: '2026-11-04', valeur: 9000 },
  ];
  it('une case sans relevé reste vide', () => {
    const f = fenetre('semaine', '2026-11-02');
    expect(parCase(points, f.cases, 'somme').slice(0, 3)).toEqual([8000, undefined, 9000]);
    expect(parCase(points, f.cases, 'moyenne')[0]).toBe(4000);
  });
  it('moyenne par jour renseigné', () => {
    expect(moyenneParJour(points, '2026-11-02', '2026-11-08')).toBe(8500);
    expect(moyenneParJour(points, '2026-11-09', '2026-11-15')).toBeUndefined();
  });
});

describe('historique', () => {
  it('une ligne par semaine, la plus récente d’abord', () => {
    const h = historiqueSemaines(
      { seances: ['2026-11-03', '2026-11-05'], horsProgramme: ['2026-10-28'], bilans: ['2026-11-02'], records: ['2026-11-05'], mesures: [], repasPhoto: ['2026-11-04'] },
      '2026-11-12',
      3,
    );
    expect(h.map((s) => s.lundi)).toEqual(['2026-11-09', '2026-11-02', '2026-10-26']);
    expect(resumeSemaine(h[0])).toBe('Rien de noté');
    expect(resumeSemaine(h[1])).toBe('2 séances · bilan rempli · record battu · 1 repas en photo');
    expect(resumeSemaine(h[2])).toBe('aucune séance · 1 hors programme · pas de bilan');
    expect(dateCourte('2026-11-02')).toBe('2 nov.');
  });
});
