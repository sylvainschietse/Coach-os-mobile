/// <reference types="node" />
// Le fichier de démonstration se charge sans erreur dans le schéma.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('crée une séance complète pour chaque client de démonstration', async () => {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create role authenticated;
    insert into auth.users (email) values ('coach@demo.coachos.fr'), ('lea@demo.coachos.fr'), ('thomas@demo.coachos.fr');
  `);
  await db.exec(readFileSync(join(__dirname, '../supabase/migrations/20261019000000_prototype.sql'), 'utf8'));
  await db.exec(readFileSync(join(__dirname, '../supabase/seed.sql'), 'utf8'));
  const { rows } = await db.query(
    `select (select count(*)::int from public.seances) as seances,
            (select count(*)::int from public.lignes) as lignes,
            (select count(*)::int from public.blocs where minuteur is not null)
              + (select count(*)::int from public.lignes where minuteur is not null) as chronos`,
  );
  expect(rows[0]).toEqual({ seances: 2, lignes: 16, chronos: 4 });
  await db.close();
}, 60_000);
