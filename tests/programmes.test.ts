import { describe, expect, it } from 'vitest';

import { mesuresPour } from '../scripts/import-exercices.mjs';
import {
  attribuerModele,
  deplacer,
  dupliquerSeance,
  erreursSeance,
  lireDate,
  nettoyerSeance,
  nouvelleLigne,
  rechercherExercices,
  resumeLigne,
} from '../src/domain/programmes';
import type { Exercice, Programme } from '../src/domain/types';

const compteur = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const catalogue: Exercice[] = [
  { id: '1', nom: 'Squat — barre', mesures: ['charge', 'repetitions'], famille: 'Squat et presse', materiel: ['Barre'], muscles: ['Quadriceps'] },
  { id: '2', nom: 'Hip thrust — haltères', mesures: ['charge', 'repetitions'], famille: 'Hanche', materiel: ['Haltères'], muscles: ['Fessiers'] },
  { id: '3', nom: 'Gainage planche', mesures: ['duree'], famille: 'Gainage', materiel: ['Poids du corps'] },
  { id: '4', nom: 'Front squat — barre', mesures: ['charge', 'repetitions'], famille: 'Squat et presse', materiel: ['Barre'] },
];

describe('catalogue', () => {
  it('cherche sans accents, par muscle ou matériel, et met en premier les noms qui commencent par la recherche', () => {
    expect(rechercherExercices(catalogue, 'fessier').exercices.map((e) => e.id)).toEqual(['2']);
    expect(rechercherExercices(catalogue, 'squat').exercices.map((e) => e.id)).toEqual(['1', '4']);
    expect(rechercherExercices(catalogue, 'barre front').exercices.map((e) => e.id)).toEqual(['4']);
    expect(rechercherExercices(catalogue, '', 'Gainage').total).toBe(1);
  });

  it('déduit ce que le client note de la famille et du matériel', () => {
    expect(mesuresPour({ famille: 'Squat et presse', materiel: ['Barre'] })).toEqual(['charge', 'repetitions']);
    expect(mesuresPour({ famille: 'Tirages verticaux', materiel: ['Barre de traction', 'Poids du corps'] })).toEqual(['charge', 'repetitions']);
    expect(mesuresPour({ famille: 'Tirages verticaux', materiel: ['Poids du corps'] })).toEqual(['repetitions']);
    expect(mesuresPour({ famille: 'Gainage', materiel: ['Poids du corps'] })).toEqual(['duree']);
    expect(mesuresPour({ famille: 'Cardio et déplacements', materiel: ['Rameur'] })).toEqual(['duree', 'distance']);
  });
});

describe('séances', () => {
  it('propose une prescription de départ selon l’exercice', () => {
    const id = compteur();
    expect(nouvelleLigne(catalogue[0], id)).toMatchObject({ series: 3, repetitionsMin: 10, repetitionsMax: 12, recuperationS: 90 });
    expect(nouvelleLigne(catalogue[2], id)).toMatchObject({ series: 3, dureeS: 30, repetitionsMin: undefined });
  });

  it('refuse une séance sans titre, sans exercice ou incohérente', () => {
    expect(erreursSeance({ titre: ' ', blocs: [{ id: 'b', titre: 'A', lignes: [] }] })).toEqual([
      'Donne un titre à la séance.',
      'Ajoute au moins un exercice.',
    ]);
    const ligne = { ...nouvelleLigne(catalogue[0], compteur()), repetitionsMin: 12, repetitionsMax: 8 };
    expect(erreursSeance({ titre: 'Jambes', blocs: [{ id: 'b', titre: 'A', lignes: [ligne] }] })).toEqual([
      'Squat — barre : les répétitions minimum dépassent le maximum.',
    ]);
  });

  it('retire les blocs vides et déplace sans sortir de la liste', () => {
    const id = compteur();
    const s = nettoyerSeance({ titre: ' Jambes ', blocs: [{ id: 'b1', titre: 'Vide', lignes: [] }, { id: 'b2', titre: 'A', lignes: [nouvelleLigne(catalogue[0], id)] }] });
    expect(s.titre).toBe('Jambes');
    expect(s.blocs.map((b) => b.id)).toEqual(['b2']);
    expect(deplacer([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(deplacer([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  });

  it('dupliquer donne de nouveaux identifiants à tout', () => {
    const id = compteur();
    const original = { id: 's', clientId: 'c', titre: 'A', blocs: [{ id: 'b', titre: 'B', lignes: [nouvelleLigne(catalogue[0], id)] }] };
    const copie = dupliquerSeance(original, 'c2', id, 'A (copie)');
    expect(copie.clientId).toBe('c2');
    expect(copie.id).not.toBe('s');
    expect(copie.blocs[0].id).not.toBe('b');
    expect(copie.blocs[0].lignes[0].id).not.toBe(original.blocs[0].lignes[0].id);
    expect(copie.blocs[0].lignes[0].exercice.id).toBe('1');
  });

  it('attribuer un modèle copie ses séances et les répartit dans la semaine', () => {
    const id = compteur();
    const modele: Programme = {
      id: 'm',
      titre: 'Reprise',
      seancesParSemaine: 2,
      seances: ['A', 'B', 'C'].map((t) => ({ id: t, titre: t, blocs: [{ id: `b${t}`, titre: 'X', lignes: [nouvelleLigne(catalogue[0], id)] }] })),
    };
    const { programme, seances } = attribuerModele(modele, 'lea', '2026-10-26', id);
    expect(programme).toMatchObject({ clientId: 'lea', titre: 'Reprise' });
    expect(programme.id).not.toBe('m');
    expect(seances.map((s) => [s.titre, s.datePrevue, s.programmeId === programme.id])).toEqual([
      ['A', '2026-10-26', true],
      ['B', '2026-10-29', true],
      ['C', '2026-11-02', true],
    ]);
    expect(attribuerModele(modele, 'lea', undefined, id).seances[0].datePrevue).toBeUndefined();
  });

  it('lit les dates à la française', () => {
    const maintenant = new Date(2026, 9, 20);
    expect(lireDate('26/10', maintenant)).toBe('2026-10-26');
    expect(lireDate('05/01', maintenant)).toBe('2027-01-05');
    expect(lireDate('26/10/2026', maintenant)).toBe('2026-10-26');
    expect(lireDate('31/02', maintenant)).toBeUndefined();
    expect(lireDate('demain', maintenant)).toBeUndefined();
  });

  it('résume une ligne comme le coach l’écrirait', () => {
    expect(resumeLigne({ ...nouvelleLigne(catalogue[0], compteur()), series: 4, repetitionsMin: 8, repetitionsMax: 12, chargeIndicative: 42.5, rir: 2 })).toBe(
      '4 × 8-12 · 42,5 kg · RIR 2 · récup 1 min 30',
    );
  });
});

describe('familles', () => {
  it('suivent l’ordre d’Airtable', async () => {
    const { familles } = await import('../src/domain/programmes');
    expect(familles(catalogue)).toEqual(['Squat et presse', 'Hanche', 'Gainage']);
  });
});
