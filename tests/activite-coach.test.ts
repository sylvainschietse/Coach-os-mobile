import { describe, expect, it } from 'vitest';

import { bornesPeriode, filtrerActivite, phraseSport, quandCourt, type EvenementActivite } from '@/domain/activite-coach';

const maintenant = new Date(2026, 10, 9, 22, 0); // lundi 9 novembre 2026, 22 h

describe('bornesPeriode', () => {
  it('aujourd’hui : de minuit à maintenant', () => {
    const { du, au } = bornesPeriode('jour', maintenant);
    expect(du).toEqual(new Date(2026, 10, 9));
    expect(au).toEqual(maintenant);
  });
  it('hier : la journée d’hier entière, sans aujourd’hui', () => {
    const { du, au } = bornesPeriode('hier', maintenant);
    expect(du).toEqual(new Date(2026, 10, 8));
    expect(au).toEqual(new Date(2026, 10, 9));
  });
  it('7 j : aujourd’hui et les 6 jours d’avant', () => {
    expect(bornesPeriode('7j', maintenant).du).toEqual(new Date(2026, 10, 3));
  });
  it('1 mois : même jour du mois précédent', () => {
    expect(bornesPeriode('1m', maintenant).du).toEqual(new Date(2026, 9, 9));
  });
});

describe('filtrerActivite', () => {
  const e = (id: string, quand: Date): EvenementActivite => ({ id, genre: 'seance', quand: quand.toISOString(), qui: 'Léa', quoi: 'a fait Jambes' });
  it('garde la période, le plus récent d’abord, sans doublon', () => {
    const { du, au } = bornesPeriode('hier', maintenant);
    const liste = [e('a', new Date(2026, 10, 8, 9)), e('b', new Date(2026, 10, 8, 18)), e('b', new Date(2026, 10, 8, 18)), e('c', new Date(2026, 10, 9, 8)), e('d', new Date(2026, 10, 7, 23))];
    expect(filtrerActivite(liste, du, au).map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('quandCourt', () => {
  it('heure seule aujourd’hui, « hier », jour de la semaine, puis la date', () => {
    expect(quandCourt(new Date(2026, 10, 9, 10, 12).toISOString(), maintenant)).toBe('10 h 12');
    expect(quandCourt(new Date(2026, 10, 8, 18).toISOString(), maintenant)).toBe('hier 18 h');
    expect(quandCourt(new Date(2026, 10, 7, 9).toISOString(), maintenant)).toBe('sam. 9 h');
    expect(quandCourt(new Date(2026, 9, 12, 9).toISOString(), maintenant)).toBe('12/10');
  });
});

describe('phraseSport', () => {
  it('distance en km quand elle est connue, sinon la durée', () => {
    expect(phraseSport('course', '', 8240, 2700)).toBe('a couru 8,2 km');
    expect(phraseSport('marche', '', null, 1800)).toBe('a marché 30 min');
    expect(phraseSport('autre', 'Padel', null, 3600)).toBe('a fait Padel · 60 min');
  });
});
