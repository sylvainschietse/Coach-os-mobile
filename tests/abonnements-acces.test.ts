/// <reference types="node" />
// Abonnements : accès appli, option nutrition et packs de séances, vérifiés dans un vrai Postgres (PGlite).
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
  clientSeances: '30000000-0000-4000-8000-0000000000c1',
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
    grant usage on schema storage to authenticated;
    grant select, insert on storage.objects to authenticated;
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClientA}'), ('${ids.userClientB}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom, user_id) values
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach1}', 'Bruno', '${ids.userClientB}');
    insert into public.clients (id, coach_id, prenom, acces_appli) values ('${ids.clientSeances}', '${ids.coach1}', 'Marc', false);
    insert into public.recettes (coach_id, titre, statut) values ('${ids.coach1}', 'Bowl poulet', 'approuvee');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('accès appli et option nutrition', () => {
  it('un nouveau client a l’appli sans l’option nutrition', async () => {
    const { rows } = await en(ids.userCoach1, `select acces_appli, option_nutrition from public.clients where id = $1`, [ids.clientSeances]);
    expect(rows[0]).toEqual({ acces_appli: false, option_nutrition: false });
  });

  it('sans l’option nutrition, le client ne lit ni n’ajoute de recettes', async () => {
    expect((await en(ids.userClientA, `select id from public.recettes`)).rows).toHaveLength(0);
    await expect(
      en(ids.userClientA, `insert into public.recettes (coach_id, client_id, titre) values ($1, $2, 'Perso')`, [ids.coach1, ids.clientA]),
    ).rejects.toThrow();
    await en(ids.userCoach1, `update public.clients set option_nutrition = true where id = $1`, [ids.clientA]);
    expect((await en(ids.userClientA, `select titre from public.recettes`)).rows).toEqual([{ titre: 'Bowl poulet' }]);
    expect((await en(ids.userClientA, `select public.mon_option_nutrition() as o`)).rows[0].o).toBe(true);
  });

  it('le client ne peut pas s’ouvrir l’option lui-même', async () => {
    await en(ids.userClientB, `update public.clients set option_nutrition = true, acces_appli = true where id = $1`, [ids.clientB]);
    const { rows } = await en(ids.userCoach1, `select option_nutrition from public.clients where id = $1`, [ids.clientB]);
    expect(rows[0].option_nutrition).toBe(false);
  });

  it('accès coupé : le client ne lit plus sa fiche, mais sait que son accès est suspendu', async () => {
    await en(ids.userCoach1, `update public.clients set acces_appli = false where id = $1`, [ids.clientA]);
    expect((await en(ids.userClientA, `select id from public.clients`)).rows).toHaveLength(0);
    expect((await en(ids.userClientA, `select id from public.recettes`)).rows).toHaveLength(0);
    expect((await en(ids.userClientA, `select public.mon_acces_suspendu() as p`)).rows[0].p).toBe('Inès');
    expect((await en(ids.userClientB, `select public.mon_acces_suspendu() as p`)).rows[0].p).toBeNull();
    await en(ids.userCoach1, `update public.clients set acces_appli = true where id = $1`, [ids.clientA]);
    expect((await en(ids.userClientA, `select id from public.clients`)).rows).toHaveLength(1);
  });
});

describe('packs de séances', () => {
  it('le coach vend un pack de 10 + 1 offerte et décompte les séances, même pour un client sans appli', async () => {
    const { rows } = await en(ids.userCoach1, `insert into public.packs_seances (client_id, seances_total, prix) values ($1, 11, 600) returning id, coach_id`, [
      ids.clientSeances,
    ]);
    expect(rows[0].coach_id).toBe(ids.coach1);
    const maj = await en(ids.userCoach1, `update public.packs_seances set seances_faites = seances_faites + 1 where id = $1 returning seances_faites`, [rows[0].id]);
    expect(maj.rows[0].seances_faites).toBe(1);
  });

  it('refuse de décompter plus de séances que le pack n’en contient', async () => {
    await expect(en(ids.userCoach1, `insert into public.packs_seances (client_id, seances_total, seances_faites) values ($1, 1, 2)`, [ids.clientA])).rejects.toThrow();
  });

  it('le client voit ses packs sans pouvoir les modifier, les autres ne voient rien', async () => {
    await en(ids.userCoach1, `insert into public.packs_seances (client_id, seances_total, prix) values ($1, 11, 600)`, [ids.clientA]);
    expect((await en(ids.userClientA, `select seances_total from public.packs_seances`)).rows).toEqual([{ seances_total: 11 }]);
    expect((await en(ids.userClientA, `update public.packs_seances set seances_faites = 0 returning id`)).rows).toHaveLength(0);
    expect((await en(ids.userClientB, `select id from public.packs_seances`)).rows).toHaveLength(0);
    expect((await en(ids.userCoach2, `select id from public.packs_seances`)).rows).toHaveLength(0);
    await expect(en(ids.userCoach2, `insert into public.packs_seances (client_id, seances_total) values ($1, 1)`, [ids.clientA])).rejects.toThrow();
  });
});
