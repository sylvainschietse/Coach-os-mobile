// En démo (sans base), créer une facture ne doit pas échouer en silence : le coach lit pourquoi rien ne se passe.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/supabase', () => ({ supabase: null }));

describe('factures en démo', () => {
  it('« Créer la facture » explique qu’elle est indisponible en démo', async () => {
    const { factures } = await import('@/data/factures');
    await expect(factures.facturer('paiement-1')).rejects.toThrow(/indisponible en démo/);
    await expect(factures.facturerMois('client-1', '2026-11')).rejects.toThrow(/indisponible en démo/);
  });
});
