import { describe, expect, it } from 'vitest';

import { facturesDeLAnnee, facturesHtml, facturesParClient, recapAnnuelHtml, type Facture } from '@/domain/factures';
import { emailFacture, messageWhatsAppFacture, nomFichierFacture, nomFichierFacturesClient, prenomEmetteur } from '@/domain/factures-envoi';

const f: Facture = {
  id: 'f1',
  numero: 'YC253',
  date: '2026-11-09',
  objet: "Séances d'octobre 2026",
  emetteur: { nom: 'SCHIETSE Sylvain', telephone: '06 48 64 08 45' },
  destinataire: { nom: 'Angelo Callegaro' },
  lignes: [],
  total: 400,
};
const sig = {
  prenom: 'Sylvain',
  telephone: '06 48 64 08 45',
  email: 'sylvain.schietse@gmail.com',
};

describe('envoi des factures', () => {
  it('donne un nom de fichier lisible', () => {
    expect(nomFichierFacture(f)).toBe("Facture YC253 - Angelo Callegaro - Séances d'octobre 2026.pdf");
    expect(nomFichierFacture({ ...f, objet: 'Pack 10/10 : séances' })).toBe('Facture YC253 - Angelo Callegaro - Pack 10 10 séances.pdf');
  });

  it('retrouve le prénom du coach', () => {
    expect(prenomEmetteur('SCHIETSE Sylvain')).toBe('Sylvain');
    expect(prenomEmetteur('Sylvain Schietse')).toBe('Sylvain Schietse');
  });

  it('écrit un e-mail sobre, au prénom du client, avec la signature', () => {
    const m = emailFacture(f, 'Angelo', sig);
    expect(m.sujet).toBe("Ta facture YC253 · Séances d'octobre 2026");
    expect(m.corps).toContain('Bonjour Angelo,');
    expect(m.corps).toContain("ta facture YC253 (séances d'octobre 2026), d’un montant de 400 €");
    expect(m.corps).toContain('à régler par virement');
    expect(m.corps).toContain('Très cordialement,');
    expect(m.corps.endsWith('Sylvain\nCoach sportif\n06 48 64 08 45\nsylvain.schietse@gmail.com')).toBe(true);
  });

  it('dit quand la facture est déjà réglée ou offerte', () => {
    expect(emailFacture({ ...f, payeLe: '2026-11-09' }, 'Angelo', sig).corps).toContain('déjà réglée');
    expect(messageWhatsAppFacture({ ...f, total: 0 }, 'Angelo', sig)).toContain('offerte');
  });

  it('prépare le message WhatsApp', () => {
    const m = messageWhatsAppFacture({ ...f, objet: 'Pack 10 séances' }, 'Angelo', sig);
    expect(m.startsWith('Bonjour Angelo,')).toBe(true);
    expect(m).toContain('ta facture YC253 (pack 10 séances)');
    expect(m.endsWith('Merci et à bientôt,\nSylvain')).toBe(true);
  });
});

describe('factures réunies', () => {
  const g = { ...f, id: 'f2', numero: 'YC252', date: '2026-10-01' };
  const autre = { ...f, id: 'f3', numero: 'BT1', clientId: 'c2', destinataire: { nom: 'Benjamin Tisseront' } };

  it('met toutes les factures dans un seul document, de la plus ancienne à la plus récente', () => {
    const html = facturesHtml([f, g]);
    expect(html.match(/<div class="page">/g)).toHaveLength(2);
    expect(html.indexOf('YC252')).toBeLessThan(html.indexOf('YC253'));
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(facturesHtml([])).toBe('');
  });

  it('range les factures par client et nomme le fichier', () => {
    const groupes = facturesParClient([{ ...f, clientId: 'c1' }, autre, { ...g, clientId: 'c1' }]);
    expect(groupes.map((x) => [x.nom, x.factures.length])).toEqual([
      ['Angelo Callegaro', 2],
      ['Benjamin Tisseront', 1],
    ]);
    expect(nomFichierFacturesClient('Angelo Callegaro')).toBe('Factures - Angelo Callegaro.pdf');
  });
});

describe('récapitulatif annuel', () => {
  const payee = (id: string, payeLe: string | undefined, total = 400) => ({ ...f, id, numero: id, payeLe, total });
  it('ne garde que les factures réglées pendant l’année', () => {
    const liste = [payee('A', '2025-12-30'), payee('B', '2026-01-04'), payee('C', undefined), payee('D', '2026-03-01', 0), payee('E', '2026-02-01', 120)];
    expect(facturesDeLAnnee(liste, 2026).map((x) => x.numero)).toEqual(['B', 'E']);
    const html = recapAnnuelHtml(liste, 2026, { nom: 'Angelo Callegaro' }, {}, new Date(2027, 0, 5));
    expect(html).toContain('Total réglé en 2026');
    expect(html).toContain('520 €');
    expect(html).toContain('Fait le 05/01/2027');
    expect(html).not.toContain('>A<');
  });
});
