import { describe, expect, it } from 'vitest';

import {
  cheminFichier,
  deposerVersion,
  documentsPartages,
  filtrerDocuments,
  modifierDocument,
  nomCompteRendu,
  nomPropre,
  nouveauDocument,
  verifierFichier,
} from '../src/domain/documents';

const t0 = new Date('2026-10-24T10:00:00Z');
const pdf = { nom: 'Compte rendu.pdf', type: 'application/pdf', taille: 1200 };

describe('documents (lot 2)', () => {
  it('exige un nom et un contact', () => {
    expect(() => nouveauDocument('d1', { nom: ' ', contactId: 'c1' }, t0)).toThrow('Donnez un nom');
    expect(() => nouveauDocument('d1', { nom: 'Contrat' }, t0)).toThrow('Choisissez un contact');
    const d = nouveauDocument('d1', { nom: ' Contrat ', contactId: 'c1' }, t0);
    expect(d).toMatchObject({ nom: 'Contrat', type: 'Autre', version: 1, partageClient: false, envoye: false, date: '2026-10-24' });
  });

  it('refuse les formats hors PDF / image, les fichiers vides et trop lourds', () => {
    expect(verifierFichier(pdf)).toBeUndefined();
    expect(verifierFichier({ ...pdf, type: 'application/zip' })).toMatch('Format refusé');
    expect(verifierFichier({ ...pdf, taille: 0 })).toMatch('vide');
    expect(verifierFichier({ ...pdf, taille: 11 * 1024 * 1024 })).toMatch('trop lourd');
  });

  it('chemin versionné et nom de fichier propre', () => {
    expect(nomPropre('Compte rendu Ïnès.PDF')).toBe('compte-rendu-ines.pdf');
    expect(cheminFichier('coach', 'd1', 2, 'Compte rendu.pdf')).toBe('coach/d1/v2-compte-rendu.pdf');
  });

  it('le premier fichier reste v1, les suivants ajoutent une version et annulent l’envoi confirmé', () => {
    const d = nouveauDocument('d1', { nom: 'CR', contactId: 'c1' }, t0);
    const v1 = deposerVersion(d, 'x/d1/v1-a.pdf', pdf, t0);
    expect(v1.version).toBe(1);
    const envoye = { ...v1, envoye: true };
    const v2 = deposerVersion(envoye, 'x/d1/v2-a.pdf', pdf, t0);
    expect(v2).toMatchObject({ version: 2, chemin: 'x/d1/v2-a.pdf', envoye: false });
  });

  it('Mes documents : seulement partagés, avec fichier, du bon dossier, sans commentaires', () => {
    const base = (id: string, contactId: string, extra = {}) => ({
      ...deposerVersion(nouveauDocument(id, { nom: id, contactId, commentaires: 'note interne' }, t0), `c/${id}/v1-a.pdf`, pdf, t0),
      ...extra,
    });
    const docs = [
      base('partage', 'c1', { partageClient: true }),
      base('prive', 'c1'),
      base('autre', 'c2', { partageClient: true }),
      { ...nouveauDocument('sansfichier', { nom: 'x', contactId: 'c1' }, t0), partageClient: true },
    ];
    const vus = documentsPartages(docs, ['c1']);
    expect(vus.map((d) => d.id)).toEqual(['partage']);
    expect(vus[0]).not.toHaveProperty('commentaires');
    expect(vus[0]).not.toHaveProperty('envoye');
  });

  it('modifier ne retire pas le contact et garde le reste', () => {
    const d = nouveauDocument('d1', { nom: 'CR', contactId: 'c1', type: 'Contrat' }, t0);
    expect(() => modifierDocument(d, { contactId: null }, t0)).toThrow('Choisissez un contact');
    expect(modifierDocument(d, { commentaires: '  ' }, t0)).toMatchObject({ type: 'Contrat', commentaires: undefined });
  });

  it('filtre par dossier et recherche par nom de contact', () => {
    const docs = [nouveauDocument('a', { nom: 'Contrat', contactId: 'c1' }, t0), nouveauDocument('b', { nom: 'Facture', contactId: 'c2' }, t0)];
    const contacts = [{ id: 'c1', prenom: 'Inès', nom: 'Martin' }, { id: 'c2', prenom: 'Bruno', nom: 'Lefort' }];
    expect(filtrerDocuments(docs, contacts, '', 'c2').map((d) => d.id)).toEqual(['b']);
    expect(filtrerDocuments(docs, contacts, 'inès').map((d) => d.id)).toEqual(['a']);
    expect(nomCompteRendu({ prenom: 'Inès', nom: 'Martin' })).toBe('Compte rendu Booster · Inès Martin');
  });
});
