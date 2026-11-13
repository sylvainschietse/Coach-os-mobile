// Refonte de la navigation coach : tri et filtres des clients actifs, « à encaisser » d'un mois passé.
import { describe, expect, it } from 'vitest';

import { CARNET_VIDE, type Carnet } from '../src/domain/crm';
import type { CycleClient, SuiviClient } from '../src/domain/entrainement-etat';
import { aEncaisserDuMois, creerPaiement } from '../src/domain/gestion';
import { listeSuivis } from '../src/domain/liste-suivis';

const cycle = (fin: string, statut: CycleClient['statut'] = 'Actif'): CycleClient => ({
  id: `cy-${fin}`,
  suiviId: 's',
  clientId: 'x',
  ordre: 1,
  nom: 'Force',
  debut: '2026-10-01',
  fin,
  statut,
  nbResultats: 0,
});
const suivis: SuiviClient[] = [
  { clientId: 'a', nom: 'Zoé Martin', cycles: [cycle('2026-11-20')] },
  { clientId: 'b', nom: 'Élodie Roux', cycles: [] },
  { clientId: 'c', nom: 'Marc Bernard', cycles: [cycle('2026-12-30')] },
  { clientId: 'd', nom: 'Anna Klein', cycles: [cycle('2026-11-01', 'Terminé')] },
];
const jour = '2026-11-12';

describe('liste des clients actifs', () => {
  it('trie par nom sans tenir compte des accents', () => {
    expect(listeSuivis(suivis, { recherche: '', filtre: 'tous', tri: 'nom', jour }).map((p) => p.clientId)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('trie par fin de programme, ceux sans programme en cours à la fin', () => {
    expect(listeSuivis(suivis, { recherche: '', filtre: 'tous', tri: 'fin', jour }).map((p) => p.clientId)).toEqual(['a', 'c', 'd', 'b']);
  });
  it('met d’abord ceux qui n’ont pas de programme en cours', () => {
    expect(listeSuivis(suivis, { recherche: '', filtre: 'tous', tri: 'sans-programme', jour }).map((p) => p.clientId)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('filtre : en cours, sans programme, fin sous 15 jours', () => {
    const ids = (filtre: Parameters<typeof listeSuivis>[1]['filtre']) => listeSuivis(suivis, { recherche: '', filtre, tri: 'nom', jour }).map((p) => p.clientId);
    expect(ids('en-cours')).toEqual(['c', 'a']);
    expect(ids('sans-programme')).toEqual(['d', 'b']);
    expect(ids('fin-proche')).toEqual(['a']);
  });
  it('cherche dans le nom, accents compris', () => {
    expect(listeSuivis(suivis, { recherche: 'elo', filtre: 'tous', tri: 'nom', jour }).map((p) => p.clientId)).toEqual(['b']);
  });
});

describe('à encaisser d’un mois', () => {
  it('ne compte que les « En attente » datés de ce mois, dossiers actifs', () => {
    const n = { v: 0 };
    const ctx = { nouvelId: () => `p${++n.v}`, maintenant: new Date('2026-11-12T10:00:00') };
    let c: Carnet = {
      ...CARNET_VIDE,
      contacts: [
        { id: 'c', prenom: 'Inès', nom: 'Roux', statut: 'client', creeLe: '2026-09-01T10:00:00Z' },
        { id: 'z', prenom: 'Zoé', nom: '', statut: 'archive', creeLe: '2026-09-01T10:00:00Z' },
      ],
    };
    c = creerPaiement(c, { titre: 'Octobre', contactId: 'c', date: '2026-10-03', montant: 89, statut: 'En attente' }, ctx).carnet;
    c = creerPaiement(c, { titre: 'Octobre payé', contactId: 'c', date: '2026-10-05', montant: 50, statut: 'Payé' }, ctx).carnet;
    c = creerPaiement(c, { titre: 'Novembre', contactId: 'c', date: '2026-11-03', montant: 89, statut: 'En attente' }, ctx).carnet;
    c = creerPaiement(c, { titre: 'Archivé', contactId: 'z', date: '2026-10-08', montant: 40, statut: 'En attente' }, ctx).carnet;
    expect(aEncaisserDuMois(c, '2026-10')).toBe(89);
    expect(aEncaisserDuMois(c, '2026-11')).toBe(89);
    expect(aEncaisserDuMois(c, '2026-09')).toBe(0);
  });
});
