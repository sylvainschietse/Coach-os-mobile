import { describe, expect, it } from 'vitest';

import { construireCompteRendu } from '../src/domain/compte-rendu';
import type { Booster, Contact } from '../src/domain/crm';
import { appliquerRedaction, dossierRedaction, redactionModele } from '../src/domain/redaction';

const contact: Contact = { id: 'c', prenom: 'Léa', nom: 'Martin', email: 'lea@exemple.fr', statut: 'booster_fait', creeLe: '2026-10-10T10:00:00Z' };
const booster: Booster = {
  id: 'b',
  contactId: 'c',
  date: '2026-10-20T16:30:00Z',
  statut: 'fait',
  priorites: ['Mieux dormir'],
  evaluation: {
    tests: {
      jambes: { resultat: 'Difficile', observations: ['Genoux instables'] },
      mobilite: { resultat: 'Légèrement limitée', observations: ['Hanches'] },
      poussee: { resultat: 'Non réalisé', observations: [] },
      tirage: { observations: [] },
    },
  },
};

describe('textes développés du compte rendu', () => {
  it('explique chaque test évalué, sans commenter un test non réalisé ou vide', () => {
    const r = redactionModele(contact, booster, { sommeilHeures: 'Moins de 6 h', eau: 'Moins de 1 L', seancesPossibles: '3 séances' });
    expect(Object.keys(r.tests ?? {})).toEqual(['jambes', 'mobilite']);
    expect(r.tests?.jambes).toContain('genoux');
    expect(r.tests?.mobilite).toBe(
      'Ta mobilité est légèrement limitée, surtout au niveau des hanches. Quelques moments de mobilité ciblée dans tes séances suffiront à gagner en aisance.',
    );
    expect(r.priorites?.[0]).toContain('sommeil');
    expect(r.semaine?.[0]).toBe('Planifier tes 3 séances de la semaine dans ton agenda');
    expect(r.semaine).toContain('Te coucher 15 minutes plus tôt que d’habitude');
    expect(r.regard).not.toMatch(/\d+ ?\/ ?\d+|score/i);
  });

  it('donne à l’IA les faits sans coordonnées, avec les champs vides marqués', () => {
    const dossier = dossierRedaction(contact, booster, undefined);
    expect(dossier).toContain('Prénom du client : Léa');
    expect(dossier).not.toContain('Martin');
    expect(dossier).not.toContain('lea@exemple.fr');
    expect(dossier).toContain('TIRAGE — non renseigné');
    expect(dossier).toContain('POUSSÉE — Non réalisé');
  });

  it('range les priorités générées dans leurs champs sans écraser celles du coach', () => {
    const r = appliquerRedaction(booster, { titresPriorites: ['Autre chose', 'Gainage', 'Bouger plus'], priorites: ['a', 'b', 'c'], regard: 'x', source: 'ia' });
    expect(r.priorites).toEqual(['Mieux dormir', 'Gainage', 'Bouger plus']);
    expect(r.redaction).toEqual({ priorites: ['a', 'b', 'c'], regard: 'x', source: 'ia' });
  });

  it('préfère les textes retouchés par le coach à ceux du modèle', () => {
    const cr = construireCompteRendu(contact, { ...booster, redaction: { regard: 'Mon regard.', tests: { jambes: 'À moi.' } } }, undefined, 'Sylvain');
    expect(cr.pdf.regard).toBe('Mon regard.');
    expect(cr.pdf.tests.find((t) => t.libelle === 'Jambes')?.explication).toBe('À moi.');
    // Un champ jamais retouché garde le texte proposé.
    expect(cr.pdf.semaine.length).toBeGreaterThan(0);
  });
});
