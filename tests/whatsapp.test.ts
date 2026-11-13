import { describe, expect, it } from 'vitest';

import { lienEnvoi } from '@/domain/crm';
import { lienWhatsAppNatif } from '@/domain/whatsapp';

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
