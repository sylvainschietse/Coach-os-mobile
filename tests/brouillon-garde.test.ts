import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}), removeItem: vi.fn(async () => {}) },
}));

const { brouillonsOuverts, demanderSortie, ecrireBrouillon, enregistrerGarde, libererBrouillon } = await import('@/lib/brouillon');

describe('« Saisie non enregistrée » : seulement pour une vraie saisie en cours', () => {
  const ouvreur = vi.fn();
  beforeEach(() => {
    brouillonsOuverts.clear();
    ouvreur.mockReset();
    enregistrerGarde(ouvreur);
  });

  it('change de page sans alerte quand rien n’a été saisi', () => {
    const suite = vi.fn();
    demanderSortie(suite);
    expect(suite).toHaveBeenCalled();
    expect(ouvreur).not.toHaveBeenCalled();
  });

  it('demande confirmation quand une saisie est en cours', () => {
    ecrireBrouillon('cle', { a: 1 });
    const suite = vi.fn();
    demanderSortie(suite);
    expect(suite).not.toHaveBeenCalled();
    expect(ouvreur).toHaveBeenCalled();
  });

  it('un brouillon repris de l’appareil, pas retouché, ne déclenche pas l’alerte', () => {
    ecrireBrouillon('cle', { a: 1 }, false);
    const suite = vi.fn();
    demanderSortie(suite);
    expect(suite).toHaveBeenCalled();
  });

  it('un écran de saisie fermé ne bloque plus les autres pages', () => {
    ecrireBrouillon('cle', { a: 1 });
    libererBrouillon('cle');
    const suite = vi.fn();
    demanderSortie(suite);
    expect(suite).toHaveBeenCalled();
    expect(ouvreur).not.toHaveBeenCalled();
  });
});
