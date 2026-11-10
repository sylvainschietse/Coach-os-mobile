import { describe, expect, it } from 'vitest';

import { emailFacture, messageWhatsAppFacture, nomFichierFacture, prenomEmetteur } from '@/domain/factures-envoi';
import type { Facture } from '@/domain/factures';

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
