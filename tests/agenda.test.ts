import { describe, expect, it } from 'vitest';

import {
  annulableEnLigne,
  boostersDansPeriode,
  chevauchements,
  clientsInactifs,
  cleJour,
  erreursRendezVous,
  grilleMois,
  lundiDe,
  nomsParticipants,
  packsBientotFinis,
  repeter,
  versIso,
  type RendezVous,
} from '@/domain/agenda';

const rdv = (id: string, debut: string, fin: string, statut: RendezVous['statut'] = 'confirme', clients: string[] = ['a']): RendezVous => ({
  id,
  type: 'seance',
  debut,
  fin,
  lieu: '',
  note: '',
  statut,
  compte: false,
  participants: clients.map((c) => ({ clientId: c, prenom: c.toUpperCase(), nom: '', decompte: false })),
});

describe('agenda', () => {
  it('repère les chevauchements, temps tampon compris, sans compter les annulés', () => {
    const existants = [
      rdv('1', '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z'),
      rdv('2', '2026-11-03T19:00:00Z', '2026-11-03T20:00:00Z', 'annule'),
    ];
    expect(chevauchements({ debut: '2026-11-03T18:00:00Z', fin: '2026-11-03T19:00:00Z' }, existants).map((r) => r.id)).toEqual([]);
    expect(chevauchements({ debut: '2026-11-03T18:00:00Z', fin: '2026-11-03T19:00:00Z' }, existants, 15).map((r) => r.id)).toEqual(['1']);
    expect(chevauchements({ debut: '2026-11-03T19:30:00Z', fin: '2026-11-03T20:30:00Z' }, existants)).toEqual([]);
    expect(chevauchements({ debut: '2026-11-03T17:30:00Z', fin: '2026-11-03T18:30:00Z' }, existants, 0, '1')).toEqual([]);
  });

  it('répète un rendez-vous chaque semaine à la même heure locale', () => {
    const serie = repeter({ debut: versIso('2026-10-20', '18:30'), fin: versIso('2026-10-20', '19:30') }, 3);
    expect(serie.map((s) => cleJour(s.debut))).toEqual(['2026-10-20', '2026-10-27', '2026-11-03']);
    expect(serie.every((s) => new Date(s.debut).getHours() === 18 && new Date(s.debut).getMinutes() === 30)).toBe(true);
    expect(serie.every((s) => new Date(s.fin).getTime() - new Date(s.debut).getTime() === 3600_000)).toBe(true);
  });

  it('le client annule en ligne jusqu’au délai, ensuite non', () => {
    const r = { statut: 'confirme' as const, annulableJusquAu: '2026-11-02T18:00:00Z' };
    expect(annulableEnLigne(r, new Date('2026-11-02T17:59:00Z'))).toBe(true);
    expect(annulableEnLigne(r, new Date('2026-11-02T18:01:00Z'))).toBe(false);
    expect(annulableEnLigne({ ...r, statut: 'annule' }, new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });

  it('semaine et mois commencent le lundi', () => {
    expect(cleJour(lundiDe(new Date(2026, 10, 1)))).toBe('2026-10-26');
    const mois = grilleMois(new Date(2026, 10, 15));
    expect(mois.length % 7).toBe(0);
    expect(cleJour(mois[0])).toBe('2026-10-26');
    expect(cleJour(mois.at(-1)!)).toBe('2026-12-06');
  });

  it('vérifie la saisie', () => {
    expect(erreursRendezVous({ clientIds: [], jour: '2026-11-03', heure: '25:00', duree: 60, type: 'visio', lienVisio: 'meet.google.com/x' })).toHaveLength(3);
    expect(erreursRendezVous({ clientIds: ['a'], jour: '2026-11-03', heure: '7:30', duree: 45, type: 'seance' })).toEqual([]);
  });

  it('nomme un duo', () => {
    expect(nomsParticipants(rdv('1', '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z', 'confirme', ['ines', 'bruno']))).toBe('INES et BRUNO');
  });

  it('signale les packs presque finis', () => {
    const soldes = [
      { clientId: 'a', prenom: 'A', restantes: 5, total: 11 },
      { clientId: 'b', prenom: 'B', restantes: 1, total: 11 },
      { clientId: 'c', prenom: 'C', restantes: 0, total: 0 },
    ];
    expect(packsBientotFinis(soldes, 2).map((s) => s.clientId)).toEqual(['b']);
  });

  it('signale les clients sans rendez-vous ni séance depuis 3 semaines', () => {
    const maintenant = new Date('2026-11-01T12:00:00Z');
    const clients = [
      { id: 'a', prenom: 'A', nom: '', derniereSeance: { fin: '2026-10-01T10:00:00Z' } },
      { id: 'b', prenom: 'B', nom: '', derniereSeance: { fin: '2026-10-01T10:00:00Z' } },
      { id: 'c', prenom: 'C', nom: '' },
      { id: 'd', prenom: 'D', nom: '' },
    ];
    const r = [
      rdv('1', '2026-11-05T10:00:00Z', '2026-11-05T11:00:00Z', 'confirme', ['b']),
      rdv('2', '2026-10-28T10:00:00Z', '2026-10-28T11:00:00Z', 'realise', ['c']),
      rdv('3', '2026-09-28T10:00:00Z', '2026-09-28T11:00:00Z', 'realise', ['d']),
    ];
    expect(clientsInactifs(clients, r, 21, maintenant).map((c) => [c.id, c.depuisJours])).toEqual([
      ['d', 34],
      ['a', 31],
    ]);
  });
});

describe('Boosters dans l’agenda', () => {
  const du = new Date(2026, 10, 9);
  const au = new Date(2026, 10, 16);
  const contact = { prenom: 'Sophie', nom: 'Martin' };
  const boosters = [
    { id: 'b1', contactId: 'c1', date: new Date(2026, 10, 12, 18, 30).toISOString(), statut: 'prevu' as const, contact },
    { id: 'b2', contactId: 'c1', date: new Date(2026, 10, 10, 9, 0).toISOString(), statut: 'fait' as const, nom: 'Bilan de rentrée', contact },
    { id: 'b3', contactId: 'c1', date: new Date(2026, 10, 11, 9, 0).toISOString(), statut: 'annule' as const, contact },
    { id: 'b4', contactId: 'c1', date: new Date(2026, 10, 16, 9, 0).toISOString(), statut: 'prevu' as const, contact },
  ];

  it('montre les Boosters prévus et faits de la période, à leur heure, dans l’ordre', () => {
    const liste = boostersDansPeriode(boosters, du, au);
    expect(liste.map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(new Date(liste[1].debut).getHours()).toBe(18);
    expect(new Date(liste[1].debut).getMinutes()).toBe(30);
    expect(new Date(liste[1].fin).getTime() - new Date(liste[1].debut).getTime()).toBe(60 * 60_000);
  });

  it('nomme le Booster comme dans le CRM, ou d’après le contact', () => {
    const liste = boostersDansPeriode(boosters, du, au);
    expect(liste[0]).toMatchObject({ titre: 'Bilan de rentrée', fait: true });
    expect(liste[1]).toMatchObject({ titre: 'Booster · Sophie Martin', fait: false });
  });
});
