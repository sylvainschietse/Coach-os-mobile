import { describe, expect, it } from 'vitest';

import { CARNET_VIDE, creerContact, devenirClient, modifierContact, planifierBooster, type Carnet, type Contexte } from '../src/domain/crm';
import {
  ajouterNote,
  compterEtapes,
  duree,
  etapeApres,
  etapesSautees,
  filtrerHistorique,
  historique,
  journaliserEtapes,
  parMois,
  resumeParcours,
  statutPourEtape,
  supprimerNote,
} from '../src/domain/historique';

function contexte(iso = '2026-11-10T09:00:00'): Contexte {
  let n = 0;
  return { nouvelId: () => `id-${++n}`, maintenant: new Date(iso) };
}

function julie(ctx = contexte()) {
  const r = creerContact(CARNET_VIDE, { prenom: 'Julie', telephone: '06 12 34 56 78', source: 'Bouche à Oreille' }, ctx);
  if ('doublon' in r) throw new Error('inattendu');
  return { carnet: r.carnet, id: r.contact.id };
}

describe('étapes du parcours', () => {
  it('compte les étapes du milieu quand on avance de plus d’une case, jamais « En réflexion »', () => {
    expect(etapesSautees('Nouveau Prospect', 'Booster planifié')).toEqual([]);
    expect(etapesSautees('Nouveau Prospect', 'Client actif')).toEqual(['Booster planifié', 'Booster réalisé']);
    expect(etapesSautees('Booster planifié', 'Client actif')).toEqual(['Booster réalisé']);
    expect(etapesSautees('Booster réalisé', 'Client actif')).toEqual([]);
    expect(etapesSautees('Nouveau Prospect', 'En réflexion')).toEqual(['Booster planifié', 'Booster réalisé']);
    // Reculer, ou partir d'un dossier mis de côté : rien de sauté.
    expect(etapesSautees('Client actif', 'Nouveau Prospect')).toEqual([]);
    expect(etapesSautees('En veille', 'Client actif')).toEqual([]);
  });

  it('propose l’étape d’après sur le chemin principal', () => {
    expect(etapeApres('Nouveau Prospect')).toBe('Booster planifié');
    expect(etapeApres('Booster réalisé')).toBe('Client actif');
    expect(etapeApres('En réflexion')).toBe('Client actif');
    expect(etapeApres('Client actif')).toBeUndefined();
    expect(etapeApres('Perdu')).toBeUndefined();
  });

  it('le statut redevient automatique quand on choisit l’étape où le dossier est déjà ; « Client actif » reste explicite', () => {
    expect(statutPourEtape({ statut: 'booster_prevu' }, 'Booster planifié')).toBeUndefined();
    expect(statutPourEtape({ statut: 'prospect' }, 'Booster réalisé')).toBe('Booster réalisé');
    expect(statutPourEtape({ statut: 'booster_fait' }, 'Client actif')).toBe('Client actif');
    expect(statutPourEtape({ statut: 'client' }, 'Client actif')).toBeUndefined();
  });

  it('compte les dossiers par étape, sans les clients ni les archivés', () => {
    const n = compterEtapes([
      { statut: 'prospect' },
      { statut: 'prospect', statutCrm: 'En réflexion' },
      { statut: 'booster_prevu' },
      { statut: 'client' },
      { statut: 'archive', statutAvantArchive: 'prospect' },
    ]);
    expect(Object.fromEntries(n)).toEqual({ 'Nouveau Prospect': 1, 'En réflexion': 1, 'Booster planifié': 1 });
  });
});

describe('journal', () => {
  it('note chaque changement d’étape avec les étapes sautées, quelle que soit l’action', () => {
    const ctx = contexte();
    const { carnet, id } = julie(ctx);
    const planifie = planifierBooster(carnet, id, '2026-11-12T17:00:00.000Z', ctx);
    let c = journaliserEtapes(carnet, planifie, ctx);
    expect(c.journal).toMatchObject([{ type: 'etape', contactId: id, depuis: 'Nouveau Prospect', vers: 'Booster planifié' }]);
    expect(c.journal[0].sautees).toBeUndefined();

    // Cliente directement depuis « Booster planifié » : « Booster réalisé » est sauté.
    const cliente = devenirClient(c, id, 'client-1', ctx);
    c = journaliserEtapes(c, cliente, ctx);
    expect(c.journal[1]).toMatchObject({ depuis: 'Booster planifié', vers: 'Client actif', sautees: ['Booster réalisé'] });
  });

  it('ne note rien quand l’étape ne change pas, ni pour un contact créé', () => {
    const ctx = contexte();
    const { carnet, id } = julie(ctx);
    expect(journaliserEtapes(CARNET_VIDE, carnet, ctx).journal).toEqual([]);
    const renomme = modifierContact(carnet, id, { nom: 'Martin' });
    expect(journaliserEtapes(carnet, renomme, ctx)).toBe(renomme);
  });

  it('ajoute et retire une note du coach ; une note vide est refusée', () => {
    const ctx = contexte();
    const { carnet, id } = julie(ctx);
    expect(() => ajouterNote(carnet, id, '   ', ctx)).toThrow(/note/);
    const c = ajouterNote(carnet, id, '  Genou sensible  ', ctx);
    expect(c.journal).toMatchObject([{ type: 'note', texte: 'Genou sensible', contactId: id }]);
    expect(supprimerNote(c, c.journal[0].id).journal).toEqual([]);
  });
});

describe('historique et résumé du dossier', () => {
  function parcoursComplet(): { c: Carnet; id: string } {
    const ctx = contexte('2026-08-18T10:00:00');
    const { carnet, id } = julie(ctx);
    let c: Carnet = {
      ...carnet,
      questionnaires: [{ id: 'q', contactId: id, recuLe: '2026-08-18T12:00:00.000Z', reponses: {}, alertes: [] }],
      journal: [
        { id: 'e1', contactId: id, quand: '2026-08-19T10:00:00.000Z', type: 'etape', depuis: 'Nouveau Prospect', vers: 'Booster planifié' },
        { id: 'e2', contactId: id, quand: '2026-08-27T10:00:00.000Z', type: 'etape', depuis: 'Booster planifié', vers: 'Client actif', sautees: ['Booster réalisé'] },
      ],
      paiements: [
        { id: 'p', titre: 'Abonnement novembre', contactId: id, date: '2026-11-01', montant: 120, devise: 'EUR', moyen: 'Virement', statut: 'Payé', creeLe: '2026-11-01T08:00:00Z' },
        { id: 'p2', titre: 'Abonnement décembre', contactId: id, date: '2026-12-01', montant: 120, devise: 'EUR', statut: 'En attente', creeLe: '2026-11-01T08:00:00Z' },
      ],
      bilans: [{ id: 'b', contactId: id, date: '2026-11-02', piliers: {}, synthese: 'Bonne régularité', priorites: [], creeLe: '', modifieLe: '' }],
    };
    c = { ...c, contacts: c.contacts.map((x) => ({ ...x, statut: 'client' as const, clientId: 'client-1' })) };
    c = ajouterNote(c, id, 'Genou droit sensible', contexte('2026-11-20T19:00:00'));
    return { c, id };
  }

  it('rassemble arrivée, questionnaire, étapes (sautées comprises), paiements reçus, bilans et notes, du plus récent au plus ancien', () => {
    const { c, id } = parcoursComplet();
    const lignes = historique(c, id);
    expect(lignes.map((l) => l.titre)).toEqual([
      'Genou droit sensible',
      'Bilan',
      'Paiement reçu · 120 €',
      'Passage en client',
      'Booster réalisé',
      'Passé en « Booster planifié »',
      'Questionnaire reçu',
      'Arrivée · Bouche à Oreille',
    ]);
    expect(lignes.find((l) => l.titre === 'Booster réalisé')?.sautee).toBe(true);
    expect(lignes.find((l) => l.titre === 'Passage en client')?.fort).toBe(true);
    expect(filtrerHistorique(lignes, 'notes').map((l) => l.titre)).toEqual(['Genou droit sensible']);
    expect(filtrerHistorique(lignes, 'paiements')).toHaveLength(1);
    expect(parMois(lignes).map((g) => g.mois)).toEqual(['novembre 2026', 'août 2026']);
  });

  it('résume le dossier : depuis quand client, et d’où il vient', () => {
    const { c, id } = parcoursComplet();
    expect(resumeParcours(c, id, new Date('2026-11-27T09:00:00'))).toBe('Client depuis 3 mois · Bouche à Oreille');
    const { carnet, id: p } = julie(contexte('2026-11-23T09:00:00'));
    expect(resumeParcours(carnet, p, new Date('2026-11-27T09:00:00'))).toBe('Nouveau prospect · contact depuis 4 jours · Bouche à Oreille');
  });

  it('écrit les durées simplement', () => {
    const now = new Date('2026-11-27T12:00:00');
    expect(duree('2026-11-27T08:00:00', now)).toBe('aujourd’hui');
    expect(duree('2026-11-26T08:00:00', now)).toBe('1 jour');
    expect(duree('2026-11-06', now)).toBe('3 semaines');
    expect(duree('2025-10-01', now)).toBe('1 an');
  });
});
