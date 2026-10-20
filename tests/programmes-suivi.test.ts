/// <reference types="node" />
// Programmes, séances créées par le coach, mensurations, records et nutrition dans un vrai Postgres (PGlite).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userLea: '10000000-0000-4000-8000-000000000011',
  userThomas: '10000000-0000-4000-8000-000000000012',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  lea: '30000000-0000-4000-8000-000000000011',
  thomas: '30000000-0000-4000-8000-000000000012',
  exo: '40000000-0000-4000-8000-000000000001',
  exo2: '40000000-0000-4000-8000-000000000002',
  modele: '50000000-0000-4000-8000-000000000001',
  seance: '60000000-0000-4000-8000-000000000001',
  bloc: '70000000-0000-4000-8000-000000000001',
  ligne1: '80000000-0000-4000-8000-000000000001',
  ligne2: '80000000-0000-4000-8000-000000000002',
};

let db: PGlite;

async function en(userId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; set role authenticated; select set_config('test.uid', '${userId ?? ''}', false);`);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}

const seance = (lignes: object[], extra: object = {}) => ({
  id: ids.seance,
  clientId: ids.lea,
  titre: 'Haut du corps',
  ordre: 1,
  blocs: [{ id: ids.bloc, titre: 'Renforcement', lignes }],
  ...extra,
});
const enregistrer = (user: string, s: object) => en(user, 'select public.enregistrer_seance($1::jsonb) as id', [JSON.stringify(s)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated;
    create role anon;
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dossier, f), 'utf8'));
  }
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userLea}'), ('${ids.userThomas}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, user_id, prenom) values
      ('${ids.lea}', '${ids.coach1}', '${ids.userLea}', 'Léa'), ('${ids.thomas}', '${ids.coach1}', '${ids.userThomas}', 'Thomas');
    insert into public.exercices (id, coach_id, nom, mesures, ref_externe, famille) values
      ('${ids.exo}', '${ids.coach1}', 'Développé couché — barre', '{charge,repetitions}', 'EXO-0001', 'Développés et pompes'),
      ('${ids.exo2}', '${ids.coach1}', 'Gainage planche', '{duree}', 'EXO-0002', 'Gainage');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('catalogue d’exercices', () => {
  it('les clients de Sylvain voient ses exercices, un autre coach non', async () => {
    expect((await en(ids.userLea, 'select nom from public.exercices order by nom')).rows).toHaveLength(2);
    expect((await en(ids.userCoach2, 'select nom from public.exercices')).rows).toEqual([]);
  });
});

describe('programmes et séances', () => {
  it('le coach crée une séance complète pour Léa ; Léa la voit, Thomas non', async () => {
    await enregistrer(
      ids.userCoach1,
      seance([
        { id: ids.ligne1, exerciceId: ids.exo, series: 4, repetitionsMin: 8, repetitionsMax: 12, chargeIndicative: 40, recuperationS: 90 },
        { id: ids.ligne2, exerciceId: ids.exo2, series: 3, dureeS: 40 },
      ]),
    );
    const { rows } = await en(ids.userLea, 'select l.ordre, l.series, l.charge_indicative from public.lignes l order by ordre');
    expect(rows).toEqual([
      { ordre: 1, series: 4, charge_indicative: '40' },
      { ordre: 2, series: 3, charge_indicative: null },
    ]);
    expect((await en(ids.userThomas, 'select id from public.seances')).rows).toEqual([]);
  });

  it('modifier la séance garde les lignes conservées, retire les autres et réordonne', async () => {
    await enregistrer(
      ids.userCoach1,
      seance(
        [
          { id: ids.ligne2, exerciceId: ids.exo2, series: 2, dureeS: 60 },
          { id: ids.ligne1, exerciceId: ids.exo, series: 4, repetitionsMin: 8 },
        ],
        { titre: 'Haut du corps v2' },
      ),
    );
    expect((await en(ids.userCoach1, 'select id, ordre from public.lignes order by ordre')).rows).toEqual([
      { id: ids.ligne2, ordre: 1 },
      { id: ids.ligne1, ordre: 2 },
    ]);
    await enregistrer(ids.userCoach1, seance([{ id: ids.ligne2, exerciceId: ids.exo2, series: 2, dureeS: 60 }], { titre: 'Haut du corps v2' }));
    expect((await en(ids.userCoach1, 'select id from public.lignes where not retiree')).rows).toEqual([{ id: ids.ligne2 }]);
    expect((await en(ids.userCoach1, 'select titre from public.seances')).rows).toEqual([{ titre: 'Haut du corps v2' }]);
  });

  it('un modèle de programme n’est visible par aucun client', async () => {
    await en(ids.userCoach1, `insert into public.programmes (id, coach_id, titre, modele_seances) values ($1, $2, 'Remise en forme', '[{"titre":"A"}]')`, [
      ids.modele,
      ids.coach1,
    ]);
    expect((await en(ids.userLea, 'select id from public.programmes')).rows).toEqual([]);
    await expect(
      en(ids.userCoach2, `insert into public.programmes (coach_id, client_id, titre) values ($1, $2, 'Vol')`, [ids.coach2, ids.lea]),
    ).rejects.toThrow(/row-level security/);
  });

  it('un autre coach ne peut ni lire ni écraser la séance', async () => {
    expect((await en(ids.userCoach2, 'select id from public.seances')).rows).toEqual([]);
    await expect(enregistrer(ids.userCoach2, seance([]))).rejects.toThrow();
    expect((await en(ids.userCoach1, 'select count(*)::int n from public.lignes where not retiree')).rows).toEqual([{ n: 1 }]);
  });

  it('retirer un exercice déjà réalisé garde ce que le client a fait', async () => {
    const r = '90000000-0000-4000-8000-000000000001';
    await en(ids.userLea, `insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin) values ($1, $2, $3, $4, now(), now())`, [
      r,
      ids.seance,
      ids.lea,
      ids.coach1,
    ]);
    await en(ids.userLea, `insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs)
      values ('91000000-0000-4000-8000-000000000001', $1, $2, $3, 0, '{"duree":60}')`, [r, ids.ligne2, ids.exo2]);
    await enregistrer(ids.userCoach1, { id: ids.seance, clientId: ids.lea, titre: 'Autre', blocs: [] });
    expect((await en(ids.userCoach1, 'select retire from public.blocs')).rows).toEqual([{ retire: true }]);
    expect((await en(ids.userCoach1, 'select retiree from public.lignes where id = $1', [ids.ligne2])).rows).toEqual([{ retiree: true }]);
    const series = await en(ids.userCoach1, 'select ligne_id, valeurs from public.series_realisees');
    expect(series.rows).toEqual([{ ligne_id: ids.ligne2, valeurs: { duree: 60 } }]);
    // Remis dans la séance, il redevient actif.
    await enregistrer(ids.userCoach1, seance([{ id: ids.ligne2, exerciceId: ids.exo2, series: 2 }]));
    expect((await en(ids.userCoach1, 'select retiree from public.lignes where id = $1', [ids.ligne2])).rows).toEqual([{ retiree: false }]);
  });
});

describe('mensurations, records et nutrition', () => {
  it('Léa saisit ses mensurations et son record ; Sylvain les voit ; Thomas non', async () => {
    await en(ids.userLea, `insert into public.mensurations (client_id, date, poids_kg, tour_taille_cm) values ($1, '2026-10-20', 64.5, 72)`, [ids.lea]);
    await en(ids.userLea, `insert into public.records (client_id, exercice_id, libelle, valeur, unite, repetitions) values ($1, $2, 'Développé couché', 50, 'kg', 1)`, [
      ids.lea,
      ids.exo,
    ]);
    expect((await en(ids.userCoach1, 'select poids_kg from public.mensurations')).rows).toEqual([{ poids_kg: '64.5' }]);
    expect((await en(ids.userCoach1, 'select valeur from public.records')).rows).toEqual([{ valeur: '50' }]);
    expect((await en(ids.userThomas, 'select id from public.mensurations')).rows).toEqual([]);
    expect((await en(ids.userCoach2, 'select id from public.records')).rows).toEqual([]);
  });

  it('Léa ne peut pas écrire au nom de Thomas, ni une mesure vide', async () => {
    await expect(en(ids.userLea, `insert into public.mensurations (client_id, poids_kg) values ($1, 80)`, [ids.thomas])).rejects.toThrow(
      /row-level security/,
    );
    await expect(en(ids.userLea, `insert into public.mensurations (client_id) values ($1)`, [ids.lea])).rejects.toThrow(/mensuration_non_vide/);
  });

  it('le plan nutrition est écrit par le coach, lu par la cliente, qui tient son journal', async () => {
    await en(ids.userCoach1, `insert into public.plans_nutrition (client_id, calories, proteines_g, conseils) values ($1, 2000, 110, 'Légumes à chaque repas')`, [ids.lea]);
    await expect(en(ids.userLea, `update public.plans_nutrition set calories = 3000 where client_id = $1 returning 1`, [ids.lea])).resolves.toMatchObject({
      rows: [],
    });
    expect((await en(ids.userLea, 'select calories from public.plans_nutrition')).rows).toEqual([{ calories: 2000 }]);
    await en(ids.userLea, `insert into public.journal_nutrition (client_id, date, respect, eau_l) values ($1, '2026-10-20', 4, 1.5)`, [ids.lea]);
    expect((await en(ids.userCoach1, 'select respect from public.journal_nutrition')).rows).toEqual([{ respect: 4 }]);
    expect((await en(ids.userThomas, 'select calories from public.plans_nutrition')).rows).toEqual([]);
  });
});
