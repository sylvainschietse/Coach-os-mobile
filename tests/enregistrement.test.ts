import { afterEach, describe, expect, it, vi } from 'vitest';

import { annonceCourante, annoncer, effacerAnnonce, estAnnulation, estLibelleEnregistrement, messageErreur } from '@/lib/enregistrement';

describe('retour après Enregistrer', () => {
  afterEach(() => {
    effacerAnnonce();
    vi.useRealTimers();
  });

  it('les libellés d’enregistrement affichent « Enregistrement… » pendant l’envoi', () => {
    expect(estLibelleEnregistrement('Enregistrer')).toBe(true);
    expect(estLibelleEnregistrement('Enregistrer le profil')).toBe(true);
    expect(estLibelleEnregistrement('Mettre à jour mon bilan')).toBe(true);
    expect(estLibelleEnregistrement('Envoyer')).toBe(false);
    expect(estLibelleEnregistrement(undefined)).toBe(false);
  });

  it('donne un message lisible, quelle que soit la forme de l’erreur', () => {
    expect(messageErreur(new Error('Droit refusé'))).toBe('Droit refusé');
    expect(messageErreur({ message: 'duplicate key', code: '23505' })).toBe('duplicate key');
    expect(messageErreur('Texte')).toBe('Texte');
    expect(messageErreur(new TypeError('Failed to fetch'))).toMatch(/connexion impossible/);
    expect(messageErreur(undefined)).toBe('erreur inconnue');
  });

  it('une annulation (partage fermé) n’est pas un échec à signaler', () => {
    expect(estAnnulation(new Error('User cancelled'))).toBe(true);
    expect(estAnnulation(new Error('Opération annulée'))).toBe(true);
    expect(estAnnulation(new Error('Droit refusé'))).toBe(false);
  });

  it('le bandeau disparaît tout seul, une erreur reste plus longtemps', () => {
    vi.useFakeTimers();
    annoncer('Enregistré');
    expect(annonceCourante()).toMatchObject({ type: 'ok', texte: 'Enregistré' });
    vi.advanceTimersByTime(2600);
    expect(annonceCourante()).toBeNull();
    annoncer('Ça n’a pas marché : réseau', 'erreur');
    vi.advanceTimersByTime(5000);
    expect(annonceCourante()).toMatchObject({ type: 'erreur' });
    vi.advanceTimersByTime(2100);
    expect(annonceCourante()).toBeNull();
  });
});
