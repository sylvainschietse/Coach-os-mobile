/// <reference types="node" />
// Vérifie les règles d'accès de la base dans un vrai Postgres (PGlite, en mémoire).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userLea: '10000000-0000-4000-8000-000000000011',
  userThomas: '10000000-0000-4000-8000-000000000012',
  userZoe: '10000000-0000-4000-8000-000000000021',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  lea: '30000000-0000-4000-8000-000000000011',
  thomas: '30000000-0000-4000-8000-000000000012',
  zoe: '30000000-0000-4000-8000-000000000021',
  exo: '40000000-0000-4000-8000-000000000001',
  seanceLea: '50000000-0000-4000-8000-000000000011',
  seanceThomas: '50000000-0000-4000-8000-000000000012',
  blocLea: '60000000-0000-4000-8000-000000000011',
  ligneLea: '70000000-0000-4000-8000-000000000011',
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

const realisation = (id: string, clientId: string, seanceId: string, coachId: string) =>
  [
    `insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin)
     values ($1, $2, $3, $4, now() - interval '1 hour', now()) on conflict (id) do nothing`,
    [id, seanceId, clientId, coachId],
  ] as const;

beforeAll(async () => {
  db = new PGlite();
  // Ce que Supabase fournit : le schéma auth, auth.uid() et le rôle authenticated.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated;
  `);
  const migration = readFileSync(join(__dirname, '../supabase/migrations/20261019000000_prototype.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(`
    insert into auth.users (id) values
      ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userLea}'), ('${ids.userThomas}'), ('${ids.userZoe}');
    insert into public.coachs (id, user_id, nom) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre coach');
    insert into public.clients (id, coach_id, user_id, prenom) values
      ('${ids.lea}', '${ids.coach1}', '${ids.userLea}', 'Léa'),
      ('${ids.thomas}', '${ids.coach1}', '${ids.userThomas}', 'Thomas'),
      ('${ids.zoe}', '${ids.coach2}', '${ids.userZoe}', 'Zoé');
    insert into public.exercices (id, nom, mesures) values ('${ids.exo}', 'Développé couché', '{charge,repetitions}');
    insert into public.seances (id, coach_id, client_id, titre) values
      ('${ids.seanceLea}', '${ids.coach1}', '${ids.lea}', 'Séance Léa'),
      ('${ids.seanceThomas}', '${ids.coach1}', '${ids.thomas}', 'Séance Thomas');
    insert into public.blocs (id, seance_id, ordre, titre) values ('${ids.blocLea}', '${ids.seanceLea}', 1, 'Renforcement');
    insert into public.lignes (id, bloc_id, ordre, exercice_id, series) values
      ('${ids.ligneLea}', '${ids.blocLea}', 1, '${ids.exo}', 4);
  `);
});

afterAll(async () => {
  await db.close();
});

describe('accès client', () => {
  it('Léa voit sa séance et pas celle de Thomas', async () => {
    const { rows } = await en(ids.userLea, 'select titre from public.seances');
    expect(rows.map((r) => r.titre)).toEqual(['Séance Léa']);
  });

  it('Léa ne voit que sa propre fiche client', async () => {
    const { rows } = await en(ids.userLea, 'select prenom from public.clients');
    expect(rows.map((r) => r.prenom)).toEqual(['Léa']);
  });

  it('Léa ne peut pas enregistrer une séance au nom de Thomas', async () => {
    const [sql, params] = realisation('80000000-0000-4000-8000-000000000001', ids.thomas, ids.seanceThomas, ids.coach1);
    await expect(en(ids.userLea, sql, [...params])).rejects.toThrow(/row-level security/);
  });

  it("Léa ne peut pas rattacher sa séance à un autre coach", async () => {
    const [sql, params] = realisation('80000000-0000-4000-8000-000000000002', ids.lea, ids.seanceLea, ids.coach2);
    await expect(en(ids.userLea, sql, [...params])).rejects.toThrow(/row-level security/);
  });

  it('un double envoi de la même séance ne crée qu’une ligne', async () => {
    const id = '80000000-0000-4000-8000-000000000003';
    const [sql, params] = realisation(id, ids.lea, ids.seanceLea, ids.coach1);
    await en(ids.userLea, sql, [...params]);
    await en(ids.userLea, sql, [...params]);
    await en(ids.userLea, `insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs)
      values ('90000000-0000-4000-8000-000000000001', $1, '${ids.ligneLea}', '${ids.exo}', 0, '{"charge":40,"repetitions":10}')
      on conflict (id) do nothing`, [id]);
    const { rows } = await db.query('select count(*)::int as n from public.realisations where id = $1', [id]);
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('un client archivé perd l’accès', async () => {
    await db.exec(`update public.clients set actif = false where id = '${ids.thomas}'`);
    const { rows } = await en(ids.userThomas, 'select titre from public.seances');
    expect(rows).toEqual([]);
    await db.exec(`update public.clients set actif = true where id = '${ids.thomas}'`);
  });

  it('sans connexion, rien n’est visible', async () => {
    const { rows } = await en(null, 'select id from public.seances');
    expect(rows).toEqual([]);
  });
});

describe('accès coach', () => {
  it('Sylvain retrouve la séance réalisée par Léa et ses séries', async () => {
    const { rows } = await en(
      ids.userCoach1,
      `select r.client_id, s.valeurs from public.realisations r
       join public.series_realisees s on s.realisation_id = r.id`,
    );
    expect(rows).toEqual([{ client_id: ids.lea, valeurs: { charge: 40, repetitions: 10 } }]);
  });

  it("un autre coach ne voit ni les clients ni les résultats de Sylvain", async () => {
    const clients = await en(ids.userCoach2, 'select prenom from public.clients');
    expect(clients.rows.map((r) => r.prenom)).toEqual(['Zoé']);
    const realisations = await en(ids.userCoach2, 'select id from public.realisations');
    expect(realisations.rows).toEqual([]);
  });

  it("un coach ne peut pas créer une séance pour le client d'un autre coach", async () => {
    await expect(
      en(ids.userCoach2, `insert into public.seances (coach_id, client_id, titre) values ($1, $2, 'Intrusion')`, [
        ids.coach2,
        ids.lea,
      ]),
    ).rejects.toThrow(/row-level security/);
  });
});
