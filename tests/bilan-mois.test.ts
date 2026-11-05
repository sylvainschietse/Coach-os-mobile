// Bilan du mois du coach (domain/bilan-mois.ts).
import { describe, expect, it } from 'vitest';

import type { RendezVous } from '../src/domain/agenda';
import { chiffresDuMois, decalerMois, ecart, evolutionAnnuelle, evolutionMensuelle, moisParDefaut, moisParis, sourcePaiement, type Donnees } from '../src/domain/bilan-mois';
import type { Paiement } from '../src/domain/gestion';

const p = (id: string, x: Partial<Paiement>): Paiement => ({ id, titre: id, devise: 'EUR', creeLe: '2026-01-01T00:00:00Z', ...x });
const rdv = (id: string, debut: string, statut: RendezVous['statut'], qui: string[], type: RendezVous['type'] = 'seance'): RendezVous => ({
  id,
  type,
  debut,
  fin: debut,
  lieu: '',
  note: '',
  statut,
  compte: statut === 'realise',
  participants: qui.map((clientId) => ({ clientId, prenom: clientId, nom: '', decompte: true })),
});

const donnees: Donnees = {
  contacts: [
    { id: 'c-lea', prenom: 'Léa', nom: 'Martin', clientId: 'lea' },
    { id: 'c-tom', prenom: 'Thomas', nom: 'Bernard', clientId: 'tom' },
    { id: 'c-ines', prenom: 'Inès', nom: 'Roux' },
  ],
  paiements: [
    p('a1', { contactId: 'c-lea', date: '2026-10-01', montant: 79, statut: 'Payé', reference: 'abonnement:2026-10:x' }),
    p('a2', { contactId: 'c-tom', date: '2026-10-01', montant: 0, statut: 'Payé', reference: 'abonnement:2026-10:y' }),
    p('k1', { contactId: 'c-tom', date: '2026-10-12', montant: 450, statut: 'Payé', reference: 'pack:z' }),
    p('s1', { contactId: 'c-ines', date: '2026-10-20', montant: 55, statut: 'En attente', reference: 'seance:r:ines' }),
    p('m1', { contactId: 'c-ines', date: '2026-10-21', montant: 30, statut: 'Payé' }),
    p('r1', { contactId: 'c-ines', date: '2026-10-22', montant: 30, statut: 'Remboursé' }),
    p('v1', { contactId: 'c-lea', date: '2026-09-01', montant: 79, statut: 'Payé', reference: 'abonnement:2026-09:x' }),
    p('old', { contactId: 'c-lea', date: '2025-03-01', montant: 200, statut: 'Payé' }),
  ],
  rendezVous: [
    rdv('1', '2026-10-05T16:00:00Z', 'realise', ['lea']),
    rdv('2', '2026-10-07T16:00:00Z', 'realise', ['lea', 'tom']),
    rdv('3', '2026-10-09T16:00:00Z', 'absent', ['tom']),
    rdv('4', '2026-10-10T16:00:00Z', 'realise', ['lea'], 'appel'),
    // 31 octobre 23 h 30 à Paris : reste en octobre.
    rdv('5', '2026-10-31T22:30:00Z', 'realise', ['tom'], 'visio'),
    rdv('6', '2026-11-02T16:00:00Z', 'confirme', ['lea']),
  ],
};

describe('bilan du mois', () => {
  it('compte encaissé, à encaisser, remboursé et le détail par source', () => {
    const c = chiffresDuMois(donnees, '2026-10');
    expect(c.encaisse).toBe(559);
    expect(c.aEncaisser).toBe(55);
    expect(c.rembourse).toBe(30);
    expect(c.parSource).toEqual([
      { source: 'abonnement', montant: 79, nombre: 2 },
      { source: 'pack', montant: 450, nombre: 1 },
      { source: 'autre', montant: 30, nombre: 1 },
    ]);
    expect(c.abonnementsRegles).toBe(1);
    expect(c.abonnementsOfferts).toBe(1);
    expect(c.packsVendus).toBe(1);
  });

  it('compte les séances réalisées (salle et visio), les absences et les personnes vues', () => {
    const c = chiffresDuMois(donnees, '2026-10');
    expect(c.seancesRealisees).toBe(3);
    expect(c.seancesManquees).toBe(1);
    expect(c.clientsVus).toBe(2);
  });

  it('repère les nouveaux clients et classe les meilleurs', () => {
    const c = chiffresDuMois(donnees, '2026-10');
    // Léa a payé en 2025 ; Thomas et Inès commencent en octobre.
    expect(c.nouveauxClients).toBe(2);
    expect(c.meilleursClients.map((x) => [x.nom, x.montant, x.seances])).toEqual([
      ['Thomas Bernard', 450, 2],
      ['Léa Martin', 79, 2],
      ['Inès Roux', 30, 0],
    ]);
  });

  it('dessine les douze mois et les années', () => {
    const mois = evolutionMensuelle(donnees, 2026);
    expect(mois).toHaveLength(12);
    expect(mois[8]).toMatchObject({ cle: '2026-09', encaisse: 79, seances: 0 });
    expect(mois[9]).toMatchObject({ cle: '2026-10', encaisse: 559, seances: 3, clients: 2 });
    expect(evolutionAnnuelle(donnees, new Date(2026, 10, 5))).toEqual([
      { cle: '2025', encaisse: 200, seances: 0, clients: 0 },
      { cle: '2026', encaisse: 638, seances: 3, clients: 2 },
    ]);
  });

  it('mois, mois par défaut et écarts', () => {
    expect(moisParis('2026-10-31T22:30:00Z')).toBe('2026-10');
    expect(decalerMois('2026-01', -1)).toBe('2025-12');
    expect(moisParDefaut(new Date(2026, 10, 3))).toBe('2026-10');
    expect(moisParDefaut(new Date(2026, 10, 15))).toBe('2026-11');
    expect(ecart(110, 100)).toBe(10);
    expect(ecart(5, 0)).toBeNull();
    expect(sourcePaiement({ reference: 'achat:1' })).toBe('achat');
    expect(sourcePaiement({})).toBe('autre');
  });
});
