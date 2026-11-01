import { describe, expect, it } from 'vitest';

import type { RealisationLue } from '../src/domain/entrainement-etat';
import {
  cheminVideo,
  contexteSeance,
  joursRestants,
  nouvelleVideo,
  ordreCoach,
  statutVideo,
  typeVideo,
  verifierVideo,
  verifierVocal,
  videosDeLExercice,
  type VideoMouvement,
} from '../src/domain/videos-mouvement';

const maintenant = new Date('2026-11-02T10:00:00Z');
const ctx = { clientId: 'cli', realisationId: 'r1', seanceId: 's1', ligneId: 'l1', exerciceId: 'e1', exerciceNom: 'Squat', seanceTitre: 'Jambes' };
const video = (p: Partial<VideoMouvement> = {}): VideoMouvement => ({ ...nouvelleVideo('v1', ctx, { type: 'video/mp4', taille: 1000, dureeS: 41.6 }, '', maintenant), ...p });

describe('contrôles', () => {
  it('accepte une vidéo de 60 s compressée, refuse trop longue, trop lourde ou dans un autre format', () => {
    expect(verifierVideo({ type: 'video/mp4', taille: 15e6, dureeS: 60 })).toBeNull();
    expect(verifierVideo({ type: 'video/quicktime', taille: 15e6, dureeS: 61.5 })).toBeNull();
    expect(verifierVideo({ type: 'video/mp4', taille: 15e6, dureeS: 95 })).toMatch(/60 s au plus/);
    expect(verifierVideo({ type: 'video/mp4', taille: 40 * 1024 * 1024 })).toMatch(/25 Mo/);
    expect(verifierVideo({ type: 'image/png', taille: 10 })).toMatch(/format/);
    expect(verifierVocal({ type: 'audio/webm;codecs=opus', taille: 1000, dureeS: 30 })).toBeNull();
    expect(verifierVocal({ type: 'audio/mp4', taille: 1000, dureeS: 400 })).toMatch(/3 minutes/);
  });

  it('devine le type et range le fichier dans le dossier du client', () => {
    expect(typeVideo(undefined, 'file:///x/abc.MOV')).toBe('video/quicktime');
    expect(typeVideo('video/webm;codecs=vp9')).toBe('video/webm');
    expect(typeVideo(null, 'file:///x/abc')).toBe('video/mp4');
    expect(cheminVideo('cli', 'v1', 'video/quicktime')).toBe('cli/v1.mov');
  });
});

describe('cycle de vie', () => {
  it('expire 30 jours après l’envoi', () => {
    const v = video();
    expect(v.expireLe).toBe('2026-12-02T10:00:00.000Z');
    expect(v.dureeS).toBe(42);
    expect(joursRestants(v, maintenant)).toBe(30);
    expect(joursRestants(v, new Date('2026-12-01T09:00:00Z'))).toBe(1);
    expect(joursRestants(v, new Date('2026-11-02T10:00:01Z'))).toBe(30);
    expect(joursRestants(v, new Date('2026-12-05T12:00:00Z'))).toBe(0);
  });

  it('statut et ordre pour le coach : sans réponse d’abord, la plus ancienne en tête, les expirées masquées', () => {
    const a = video({ id: 'a', creeLe: '2026-11-01T10:00:00Z' });
    const b = video({ id: 'b', creeLe: '2026-10-30T10:00:00Z', vueLe: '2026-10-31T10:00:00Z' });
    const c = video({ id: 'c', reponseTexte: 'Top', reponseLe: '2026-11-01T11:00:00Z' });
    const d = video({ id: 'd', expireLe: '2026-11-01T00:00:00Z' });
    expect([statutVideo(a), statutVideo(b), statutVideo(c)]).toEqual(['nouvelle', 'vue', 'repondue']);
    expect(statutVideo(video({ reponseAudio: 'cli/v1-reponse.m4a' }))).toBe('repondue');
    expect(ordreCoach([c, a, d, b], maintenant).map((v) => v.id)).toEqual(['b', 'a', 'c']);
  });

  it('le client retrouve ses vidéos sous l’exercice, même dans une autre séance', () => {
    const autreLigne = video({ id: 'x', ligneId: 'l9', exerciceId: 'e1', creeLe: '2026-11-02T09:00:00Z' });
    const autreExo = video({ id: 'y', ligneId: 'l8', exerciceId: 'e2' });
    expect(videosDeLExercice([video(), autreLigne, autreExo], { id: 'l1', exercice: { id: 'e1' } }, maintenant).map((v) => v.id)).toEqual(['v1', 'x']);
  });

  it('montre au coach les séries de l’exercice filmé dans la séance enregistrée', () => {
    const r = {
      id: 'r1',
      note: 7,
      series: [
        { id: 's2', ligneId: 'l1', exerciceId: 'e1', index: 1, valeurs: { charge: 80, repetitions: 8 }, suggestion: {} },
        { id: 's1', ligneId: 'l1', exerciceId: 'e1', index: 0, valeurs: { charge: 80, repetitions: 10 }, suggestion: {} },
        { id: 's3', ligneId: 'l2', exerciceId: 'e2', index: 0, valeurs: { repetitions: 12 }, suggestion: {} },
      ],
    } as unknown as RealisationLue;
    const c = contexteSeance(video(), [r]);
    expect(c?.realisation.note).toBe(7);
    expect(c?.series.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(contexteSeance(video({ realisationId: 'pas-encore' }), [r])).toBeUndefined();
  });
});
