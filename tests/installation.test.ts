/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { installationSql } from '../scripts/installation-sql.mjs';

it('le fichier d’installation Supabase reprend toutes les migrations', () => {
  expect(readFileSync(join(__dirname, '../supabase/installation.sql'), 'utf8')).toBe(installationSql());
});

it('s’installe d’un seul coup sur une base vide', { timeout: 20000 }, async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create role authenticated;
    create role anon;
  `);
  await db.exec(installationSql());
  const tables = await db.query<{ n: number }>(`select count(*)::int as n from pg_tables where schemaname = 'public'`);
  expect(tables.rows[0].n).toBeGreaterThan(8);
  await db.close();
});
