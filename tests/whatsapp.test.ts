import { describe, expect, it } from 'vitest';

import { lienEnvoi } from '@/domain/crm';
import { lienWhatsAppNatif, lireLienWhatsApp } from '@/domain/whatsapp';

describe('lien WhatsApp sur le téléphone', () => {
  it('ouvre la conversation du client avec le message prérempli', () => {
    const wa = lienEnvoi('whatsapp', { telephone: '33712345612' }, 'Bonjour Clément, je viens de t’envoyer ton plan 💪')!;
    expect(lienWhatsAppNatif(wa)).toBe(`whatsapp://send?phone=33712345612&text=${encodeURIComponent('Bonjour Clément, je viens de t’envoyer ton plan 💪')}`);
  });
  it('garde un message sans numéro', () => {
    expect(lienWhatsAppNatif('https://wa.me/?text=Salut')).toBe('whatsapp://send?text=Salut');
  });
  it('garde un numéro sans message', () => {
    expect(lienWhatsAppNatif('https://wa.me/33612345678')).toBe('whatsapp://send?phone=33612345678');
  });
  it('laisse les autres liens tels quels', () => {
    expect(lienWhatsAppNatif('https://exemple.fr')).toBeUndefined();
    expect(lienWhatsAppNatif('tel:+33612345678')).toBeUndefined();
  });
});

describe('lien WhatsApp lu pour l’intention Android', () => {
  const message = 'Bonjour Clément, c’est Sylvain ! Je viens de t’envoyer par e-mail ton plan d’action. Jette un œil et dis-moi si tu as des questions 💪';
  it('retrouve le numéro et le message exact, accents et emoji compris', () => {
    const wa = lienEnvoi('whatsapp', { telephone: '07 12 34 56 12' }, message)!;
    expect(lireLienWhatsApp(wa)).toEqual({ telephone: '33712345612', message });
  });
  it('accepte un lien sans numéro', () => {
    expect(lireLienWhatsApp('https://wa.me/?text=Salut%20toi')).toEqual({ telephone: '', message: 'Salut toi' });
  });
  it('ignore les autres liens et un message mal encodé', () => {
    expect(lireLienWhatsApp('https://exemple.fr')).toBeUndefined();
    expect(lireLienWhatsApp('https://wa.me/33612345678?text=%E0%A4')).toBeUndefined();
  });
});
