// Règles du lot 4 côté téléphone (mode démo) : semaines, réponses du bilan, synthèse, objectifs, photos.
import { describe, expect, it } from 'vitest';

import {
  appliquerObjectif,
  atteint,
  erreurObjectif,
  erreurReponses,
  imageValide,
  photoVisible,
  progression,
  semainesProposees,
  semaineValide,
  syntheseAutomatique,
  trierBilansCoach,
  type BilanHebdo,
  type ReponsesBilan,
} from '../src/domain/suivi-hebdo';

const r = (x: Partial<ReponsesBilan> = {}): ReponsesBilan => ({ energie: 7, sommeil: 7, stress: 3, motivation: 8, seances: 3, difficultes: '', douleurs: '', victoire: '', ...x });

describe('bilan de la semaine', () => {
  it('semaines : 8 lundis jusqu’à la semaine en cours, jamais une semaine future', () => {
    const s = semainesProposees('2026-10-24');
    expect(s[0]).toBe('2026-10-19');
    expect(s).toHaveLength(8);
    expect(semaineValide('2026-10-19', '2026-10-24')).toBe(true);
    expect(semaineValide('2026-10-26', '2026-10-24')).toBe(false);
    expect(semaineValide('2026-10-20', '2026-10-24')).toBe(false);
  });

  it('les quatre scores et les séances sont obligatoires', () => {
    expect(erreurReponses(r())).toBeNull();
    expect(erreurReponses(r({ sommeil: 0 }))).toMatch('Complétez');
    expect(erreurReponses(r({ seances: 31 }))).toMatch('Complétez');
    expect(erreurReponses(r({ victoire: 'x'.repeat(1001) }))).toMatch('trop longue');
  });

  it('une douleur passe le bilan « à vérifier » ; « aucune gêne » non', () => {
    expect(syntheseAutomatique(r({ douleurs: 'Genou' }), null, 3).aRevoir).toBe(true);
    expect(syntheseAutomatique(r({ douleurs: 'Aucune gêne.' }), null, 3).aRevoir).toBe(false);
    expect(syntheseAutomatique(r({ seances: 1 }), null, 3).priorite).toMatch('Bloquer dans ton agenda les 3 créneaux');
  });

  it('énergie ou sommeil ≤ 3 et stress ≥ 8 passent le bilan « à vérifier », pas les valeurs voisines', () => {
    expect(syntheseAutomatique(r({ energie: 3 }), null, 3).aRevoir).toBe(true);
    expect(syntheseAutomatique(r({ sommeil: 3 }), null, 3).aRevoir).toBe(true);
    expect(syntheseAutomatique(r({ stress: 8 }), null, 3).aRevoir).toBe(true);
    expect(syntheseAutomatique(r({ energie: 4, sommeil: 4, stress: 7 }), null, 3).aRevoir).toBe(false);
    expect(syntheseAutomatique(r({ stress: 9 }), null, 3).sourceRetour).toBe('Automatique');
  });

  it('la file du coach montre d’abord ce qui est à vérifier', () => {
    const b = (id: string, semaine: string, aRevoir: boolean, reponduLe = 'x') => ({ id, semaine, aRevoir, reponduLe }) as BilanHebdo;
    expect(trierBilansCoach([b('a', '2026-10-19', false), b('b', '2026-10-12', true), b('c', '2026-10-05', false, '')]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('objectifs', () => {
  const nouveau = { titre: 'Courir 5 km', unite: 'km' as const, depart: 2, cible: 5, echeance: '' };

  it('progression bornée de 0 à 100, dans les deux sens', () => {
    expect(progression(2, 5, 3.5)).toBe(50);
    expect(progression(80, 70, 85)).toBe(0);
    expect(atteint(80, 70, 69)).toBe(true);
    expect(erreurObjectif({ ...nouveau, cible: 2 })).toMatch('différente');
  });

  it('création idempotente, version périmée refusée, atteinte posée puis retirée', () => {
    let l = appliquerObjectif([], 'c', 'envoi-1', { action: 'creer', objectif: nouveau }, undefined, '2026-10-24T10:00:00Z');
    expect(appliquerObjectif(l, 'c', 'envoi-1', { action: 'creer', objectif: nouveau })).toBe(l);
    const id = l[0].id;
    l = appliquerObjectif(l, 'c', 'v1', { action: 'progresser', valeur: 5, version: l[0].modifieLe }, id, '2026-10-24T11:00:00Z');
    expect(l[0].atteintLe).toBe('2026-10-24T11:00:00Z');
    expect(() => appliquerObjectif(l, 'c', 'v2', { action: 'progresser', valeur: 4, version: '2026-10-24T10:00:00Z' }, id)).toThrow('a changé');
    l = appliquerObjectif(l, 'c', 'v3', { action: 'progresser', valeur: 4, version: l[0].modifieLe }, id, '2026-10-24T12:00:00Z');
    expect(l[0].atteintLe).toBe('');
    expect(() => appliquerObjectif(l, 'autre', 'v4', { action: 'archiver', version: l[0].modifieLe }, id)).toThrow('hors de votre dossier');
  });
});

describe('photos', () => {
  it('le coach ne voit que les photos partagées ; seul un JPEG est accepté', () => {
    expect(photoVisible({ partage: false }, false)).toBe(false);
    expect(photoVisible({ partage: false }, true)).toBe(true);
    expect(imageValide('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(imageValide('data:image/png;base64,iVBOR')).toBe(false);
  });
});
