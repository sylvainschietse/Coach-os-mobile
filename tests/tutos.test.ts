import { describe, expect, it } from 'vitest';

import { adresseTuto, ASTUCES, dureeTuto, ranger, TUTOS_PAR_DEFAUT, tutoSuivant, type Tuto } from '../src/domain/tutos';

const t = (id: string, ordre: number): Tuto => ({ id, ordre, titre: id, explication: '', dureeSecondes: 30, video: `${id}.mp4`, pour: 'tous' });

describe('tutos de la rubrique Aide', () => {
  it('l’adresse publique vient du compartiment « tutos »', () => {
    expect(adresseTuto('2-faire-sa-seance.mp4', 'https://abc.supabase.co/')).toBe('https://abc.supabase.co/storage/v1/object/public/tutos/2-faire-sa-seance.mp4');
    expect(adresseTuto('dossier/a b.mp4', 'https://abc.supabase.co')).toBe('https://abc.supabase.co/storage/v1/object/public/tutos/dossier/a%20b.mp4');
  });

  it('une adresse complète est gardée, et rien sans base ni chemin', () => {
    expect(adresseTuto('https://exemple.fr/v.mp4', undefined)).toBe('https://exemple.fr/v.mp4');
    expect(adresseTuto('v.mp4', undefined)).toBeNull();
    expect(adresseTuto(undefined, 'https://abc.supabase.co')).toBeNull();
    expect(adresseTuto('http://exemple.fr/v.mp4', undefined)).toBeNull();
  });

  it('la durée s’écrit en minutes et secondes', () => {
    expect(dureeTuto(43)).toBe('0:43');
    expect(dureeTuto(65)).toBe('1:05');
    expect(dureeTuto(-3)).toBe('0:00');
  });

  it('la liste est rangée par ordre, sans doublon', () => {
    expect(ranger([t('b', 2), t('a', 1), t('b', 3)]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('« Tuto suivant » s’arrête au dernier', () => {
    const l = [t('a', 1), t('b', 2)];
    expect(tutoSuivant(l, 'a')?.id).toBe('b');
    expect(tutoSuivant(l, 'b')).toBeNull();
    expect(tutoSuivant(l, 'z')).toBeNull();
  });

  it('les 8 tutos livrés sont rangés et chaque bulle mène à un tuto qui existe', () => {
    expect(ranger(TUTOS_PAR_DEFAUT)).toHaveLength(8);
    const ids = new Set(TUTOS_PAR_DEFAUT.map((x) => x.id));
    for (const a of Object.values(ASTUCES)) if (a.tuto) expect(ids.has(a.tuto)).toBe(true);
  });
});
