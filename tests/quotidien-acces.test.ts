/// <reference types="node" />
// Suivis du quotidien dans un vrai Postgres (PGlite) : chaque client ne voit et n'écrit que ses relevés,
// son coach les lit et règle les cibles, un autre coach ne voit rien.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userClientA: '10000000-0000-4000-8000-0000000000a1',
  userClientB: '10000000-0000-4000-8000-0000000000b1',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  clientA: '30000000-0000-4000-8000-0000000000a1',
  clientB: '30000000-0000-4000-8000-0000000000b1',
};

let db: PGlite;

async function en(userId: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; set role authenticated; select set_config('test.uid', '${userId}', false);`);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated;
    create role anon;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClientA}'), ('${ids.userClientB}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom, user_id) values
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach1}', 'Bruno', '${ids.userClientB}');
  `);
});

afterAll(async () => {
  await db.close();
});

const ecrire = (user: string, client: string, indicateur: string, valeur: number, jour = 'current_date') =>
  en(
    user,
    `insert into public.suivis_quotidiens (client_id, jour, indicateur, valeur) values ($1, ${jour}, $2, $3)
     on conflict (client_id, indicateur, jour) do update set valeur = excluded.valeur`,
    [client, indicateur, valeur],
  );

describe('suivis du quotidien', () => {
  it('le client note sa journée et la corrige', async () => {
    await ecrire(ids.userClientA, ids.clientA, 'pas', 8000);
    await ecrire(ids.userClientA, ids.clientA, 'pas', 8450);
    await ecrire(ids.userClientA, ids.clientA, 'cigarettes', 6);
    const lu = await en(ids.userClientA, `select indicateur, valeur::float as v from public.suivis_quotidiens order by indicateur`);
    expect(lu.rows).toEqual([{ indicateur: 'cigarettes', v: 6 }, { indicateur: 'pas', v: 8450 }]);
  });

  it('refuse d’écrire dans le dossier d’un autre client ou dans le futur', async () => {
    await expect(ecrire(ids.userClientB, ids.clientA, 'pas', 100)).rejects.toThrow();
    await expect(ecrire(ids.userClientA, ids.clientA, 'pas', 100, `current_date + 5`)).rejects.toThrow();
    await expect(ecrire(ids.userClientA, ids.clientA, 'Pas!', 100)).rejects.toThrow();
  });

  it('un client ne voit pas les relevés d’un autre', async () => {
    const lu = await en(ids.userClientB, `select count(*)::int as n from public.suivis_quotidiens`);
    expect(lu.rows[0].n).toBe(0);
  });

  it('le coach lit les relevés de ses clients sans pouvoir les modifier', async () => {
    const lu = await en(ids.userCoach1, `select count(*)::int as n from public.suivis_quotidiens where client_id = $1`, [ids.clientA]);
    expect(lu.rows[0].n).toBe(2);
    await en(ids.userCoach1, `update public.suivis_quotidiens set valeur = 0 where client_id = $1`, [ids.clientA]);
    const apres = await en(ids.userClientA, `select max(valeur)::float as m from public.suivis_quotidiens`);
    expect(apres.rows[0].m).toBe(8450);
    const autre = await en(ids.userCoach2, `select count(*)::int as n from public.suivis_quotidiens`);
    expect(autre.rows[0].n).toBe(0);
  });

  it('le coach règle les cibles de son client, pas celles d’un autre coach', async () => {
    await en(ids.userCoach1, `insert into public.reglages_quotidiens (client_id, indicateur, actif, cible, modifie_par) values ($1, 'cigarettes', true, 4, 'coach')`, [
      ids.clientA,
    ]);
    const lu = await en(ids.userClientA, `select indicateur, cible::float as cible, modifie_par from public.reglages_quotidiens`);
    expect(lu.rows).toEqual([{ indicateur: 'cigarettes', cible: 4, modifie_par: 'coach' }]);
    await expect(
      en(ids.userCoach2, `insert into public.reglages_quotidiens (client_id, indicateur, actif) values ($1, 'pas', true)`, [ids.clientA]),
    ).rejects.toThrow();
  });
});
