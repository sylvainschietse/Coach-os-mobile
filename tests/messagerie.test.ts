import { describe, expect, it } from 'vitest';

import { bilanVideos } from '@/domain/abonnements';
import {
  apercu,
  cheminPiece,
  debutMois,
  heureMessage,
  nouveauMessage,
  ordreConversations,
  verifierEnvoi,
  verifierPiece,
  videoAPurger,
  videosEnvoyeesDuMois,
} from '@/domain/messagerie';

const maintenant = new Date('2026-11-15T10:00:00Z');

describe('messagerie', () => {
  it('refuse un message vide, trop long ou un fichier non pris en charge', () => {
    expect(verifierEnvoi('  ')).toMatch(/Écris un message/);
    expect(verifierEnvoi('x'.repeat(2001))).toMatch(/trop long/);
    expect(verifierEnvoi('Bonjour')).toBeNull();
    expect(verifierPiece({ type: 'application/pdf', taille: 10 })).toMatch(/pas pris en charge/);
    expect(verifierPiece({ type: 'image/gif', taille: 10 })).toMatch(/pas pris en charge/);
    expect(verifierPiece({ type: 'video/mp4', taille: 30 * 1024 * 1024 })).toMatch(/25 Mo/);
    expect(verifierPiece({ type: 'video/mp4', taille: 1000, dureeS: 90 })).toMatch(/60 s/);
    expect(verifierPiece({ type: 'image/jpeg', taille: 1000 })).toBeNull();
    expect(verifierPiece({ type: 'audio/mp4', taille: 1000, dureeS: 45 })).toBeNull();
  });

  it('range la pièce jointe dans le dossier du client', () => {
    expect(cheminPiece('c1', 'm1', 'image/jpeg')).toBe('c1/m1.jpg');
    expect(cheminPiece('c1', 'm1', 'video/quicktime')).toBe('c1/m1.mov');
    const m = nouveauMessage('m1', 'c1', 'client', '  Salut  ', { type: 'video/mp4;codecs=avc1', taille: 10, dureeS: 12.4 }, maintenant);
    expect(m).toMatchObject({ texte: 'Salut', pieceChemin: 'c1/m1.mp4', pieceType: 'video/mp4', pieceDureeS: 12 });
  });

  it('résume un message pour une liste ou une notification', () => {
    expect(apercu({ texte: 'Bonjour\n  coach' })).toBe('Bonjour coach');
    expect(apercu({ pieceType: 'image/jpeg' })).toBe('Photo');
    expect(apercu({ pieceType: 'audio/mp4' })).toBe('Message vocal');
    expect(apercu({ texte: 'a'.repeat(100) }, 10)).toBe(`${'a'.repeat(9)}…`);
  });

  it('compte les vidéos du client du mois (heure de Paris), messages et vidéos de mouvement', () => {
    const messages = [
      { auteur: 'client' as const, pieceType: 'video/mp4', creeLe: '2026-11-02T08:00:00Z' },
      { auteur: 'client' as const, pieceType: 'image/jpeg', creeLe: '2026-11-03T08:00:00Z' },
      { auteur: 'coach' as const, pieceType: 'video/mp4', creeLe: '2026-11-04T08:00:00Z' },
      // 31 octobre 23 h 30 UTC = 1er novembre 0 h 30 à Paris : compte pour novembre.
      { auteur: 'client' as const, pieceType: 'video/mp4', creeLe: '2026-10-31T23:30:00Z' },
      { auteur: 'client' as const, pieceType: 'video/mp4', creeLe: '2026-10-20T08:00:00Z' },
    ];
    expect(videosEnvoyeesDuMois(messages, [{ creeLe: '2026-11-10T08:00:00Z' }], maintenant)).toBe(3);
    expect(debutMois(maintenant)).toBe('2026-11-01');
  });

  it('indique les vidéos restantes et le montant à facturer', () => {
    expect(bilanVideos(1, 2)).toEqual({ envoyees: 1, incluses: 2, restantes: 1, enPlus: 0, aFacturer: 0 });
    expect(bilanVideos(4, 2)).toEqual({ envoyees: 4, incluses: 2, restantes: 0, enPlus: 2, aFacturer: 30 });
  });

  it('efface les vidéos de plus de 30 jours, pas les photos', () => {
    expect(videoAPurger({ pieceChemin: 'c/v.mp4', pieceType: 'video/mp4', creeLe: '2026-10-10T10:00:00Z' } as never, maintenant)).toBe(true);
    expect(videoAPurger({ pieceChemin: 'c/v.jpg', pieceType: 'image/jpeg', creeLe: '2026-10-10T10:00:00Z' } as never, maintenant)).toBe(false);
    expect(videoAPurger({ pieceChemin: 'c/v.mp4', pieceType: 'video/mp4', creeLe: '2026-11-10T10:00:00Z' } as never, maintenant)).toBe(false);
  });

  it('affiche l’heure, « hier » ou la date', () => {
    expect(heureMessage('2026-11-15T08:05:00Z', maintenant)).toBe('09:05');
    expect(heureMessage('2026-11-14T08:05:00Z', maintenant)).toBe('hier 09:05');
    expect(heureMessage('2026-11-03T08:05:00Z', maintenant)).toMatch(/^3 nov\.? 09:05$/);
  });

  it('met les fils non lus en premier, puis les plus récents', () => {
    const c = (clientId: string, nonLus: number, le?: string) => ({ clientId, prenom: clientId, nom: '', nonLus, dernier: le ? { auteur: 'client' as const, le } : undefined });
    expect(ordreConversations([c('a', 0, '2026-11-15'), c('b', 1, '2026-11-01'), c('c', 0), c('d', 0, '2026-11-16')]).map((x) => x.clientId)).toEqual(['b', 'd', 'a', 'c']);
  });
});
