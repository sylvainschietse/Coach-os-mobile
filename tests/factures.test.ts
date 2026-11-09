import { describe, expect, it } from 'vitest';

import { erreursEntete, factureHtml, ibanValide, mentionReglement, nettoyerIban, nettoyerPrefixe, prochainNumero, type Facture } from '@/domain/factures';

const f: Facture = {
  id: 'f1',
  numero: 'RT38',
  date: '2026-11-03',
  objet: 'Abonnement 11/2026',
  emetteur: { nom: 'SCHIETSE Sylvain', adresse: '1763 rue Edouard Herriot\n01480 Jassans', siret: '51896650200016', mentions: 'TVA non applicable, art. 293 B du CGI' },
  destinataire: { nom: 'Romain <Tisseront>', adresse: 'Route de Saint Bel' },
  lignes: [
    { libelle: 'Abonnement 11/2026', quantite: 1, prixUnitaire: 269, montant: 269 },
    { libelle: 'Remise · Merci d’être testeur', quantite: 1, prixUnitaire: -269, montant: -269 },
  ],
  total: 0,
  moyen: 'Stripe',
  payeLe: '2026-11-03',
};

describe('factures', () => {
  it('numéro : les lettres du coach, sinon les initiales du client', () => {
    expect(prochainNumero('RT', 38, 'Romain', 'Tisseront')).toBe('RT38');
    expect(prochainNumero(undefined, 1, 'Élodie', 'Martin')).toBe('EM1');
    expect(nettoyerPrefixe('bt-é 1')).toBe('BTE1');
  });

  it('mention de règlement selon le moyen et le montant', () => {
    expect(mentionReglement(f)).toBe('Offert : rien à régler.');
    expect(mentionReglement({ ...f, total: 59 })).toBe('Payée par prélèvement automatique le 03/11/2026.');
    expect(mentionReglement({ total: 120, moyen: 'Virement', payeLe: '2026-11-20' })).toBe('Payée par virement le 20/11/2026.');
    expect(mentionReglement({ total: 260 })).toBe('À régler : 260 €. Merci !');
  });

  it('la facture porte la couleur du coach, son SIRET, la remise et les mentions, sans HTML injecté', () => {
    const html = factureHtml(f, { couleur: '#1F4E9E' });
    expect(html).toContain('#1F4E9E');
    expect(html).toContain('N° RT38');
    expect(html).toContain('SIRET 518 966 502 00016');
    expect(html).toContain('Remise · Merci d’être testeur');
    expect(html).toContain('TVA non applicable');
    expect(html).toContain('Romain &lt;Tisseront&gt;');
    expect(html).not.toContain('<Tisseront>');
  });

  it('une couleur illisible retombe sur le rouge CoachGo ; le SIRET compte 14 chiffres', () => {
    expect(factureHtml(f, { couleur: 'red;}' })).toContain('#D71920');
    const e = { nom: '', adresse: '', telephone: '', siret: '123', mentions: '', couleur: 'rouge', tarifBase: '60', iban: '', bic: '' };
    expect(erreursEntete(e)).toHaveLength(2);
    expect(erreursEntete({ ...e, siret: '518 966 502 00016', couleur: '#000000' })).toEqual([]);
  });

  it('IBAN : contrôlé, imprimé lisible avec le BIC et le titulaire', () => {
    const e = { nom: '', adresse: '', telephone: '', siret: '', mentions: '', couleur: '#000000', tarifBase: '60', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'agrifrpp' };
    expect(ibanValide(nettoyerIban(e.iban))).toBe(true);
    expect(erreursEntete(e)).toEqual([]);
    expect(erreursEntete({ ...e, iban: 'FR76 3000 6000 0112 3456 7890 188' })).toHaveLength(1);
    expect(erreursEntete({ ...e, tarifBase: 'soixante' })).toHaveLength(1);
    const html = factureHtml(f, { iban: nettoyerIban(e.iban), bic: e.bic });
    expect(html).toContain('FR76 3000 6000 0112 3456 7890 189');
    expect(html).toContain('AGRIFRPP');
    expect(factureHtml(f)).not.toContain('IBAN');
  });
});
