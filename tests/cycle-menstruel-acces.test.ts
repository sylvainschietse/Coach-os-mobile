/// <reference types="node" />
// Cycle menstruel dans un vrai Postgres (PGlite) : la cliente note et efface son cycle ; sa coach ne voit que ce
// qu’elle partage (rien par défaut) ; un autre coach et un autre client ne voient rien.
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

const compter = async (user: string, table: string) => (await en(user, `select count(*)::int as n from public.${table}`)).rows[0].n;
const choix = (partage: string, actif = true) => en(ids.userClientA, `select suivi_cycle, partage_cycle from public.enregistrer_choix_cycle($1, $2)`, [actif, partage]);
const vueCoach = async (user: string) => (await en(user, `select partage, dernier_debut::text as debut from public.cycle_vue_coach($1)`, [ids.clientA])).rows;

describe('cycle menstruel', () => {
  it('la cliente accepte la politique puis active son suivi, sans partage par défaut', async () => {
    await en(ids.userClientA, `select public.enregistrer_consentement('v1', true)`);
    const c = await choix('rien');
    expect(c.rows[0]).toEqual({ suivi_cycle: true, partage_cycle: 'rien' });
    await en(ids.userClientA, `insert into public.cycle_reglages (client_id, duree_cycle) values ($1, 30)`, [ids.clientA]);
    await en(ids.userClientA, `insert into public.cycle_regles (client_id, debut, fin) values ($1, current_date - 40, current_date - 36), ($1, current_date - 10, null)`, [ids.clientA]);
    await en(ids.userClientA, `insert into public.cycle_notes (client_id, jour, symptomes) values ($1, current_date, '{crampes}')`, [ids.clientA]);
    expect(await compter(ids.userClientA, 'cycle_regles')).toBe(2);
  });

  it('refuse d’écrire pour une autre cliente ou dans le futur', async () => {
    await expect(en(ids.userClientB, `insert into public.cycle_regles (client_id, debut) values ($1, current_date)`, [ids.clientA])).rejects.toThrow();
    await expect(en(ids.userClientA, `insert into public.cycle_regles (client_id, debut) values ($1, current_date + 5)`, [ids.clientA])).rejects.toThrow();
    expect(await compter(ids.userClientB, 'cycle_regles')).toBe(0);
  });

  it('partage « rien » : la coach ne voit rien, pas même que le suivi existe', async () => {
    for (const t of ['cycle_reglages', 'cycle_regles', 'cycle_notes']) expect(await compter(ids.userCoach1, t)).toBe(0);
    expect(await vueCoach(ids.userCoach1)).toEqual([]);
    await expect(en(ids.userCoach1, `select suivi_cycle from public.consentements`)).rejects.toThrow();
    const accords = await en(ids.userCoach1, `select analyse_ia from public.consentements where client_id = $1`, [ids.clientA]);
    expect(accords.rows.length).toBeGreaterThan(0);
  });

  it('partage « phase » : le dernier début et les durées, sans historique ni notes', async () => {
    await choix('phase');
    expect(await vueCoach(ids.userCoach1)).toHaveLength(1);
    expect((await vueCoach(ids.userCoach1))[0].partage).toBe('phase');
    expect(await compter(ids.userCoach1, 'cycle_reglages')).toBe(1);
    expect(await compter(ids.userCoach1, 'cycle_regles')).toBe(0);
    expect(await compter(ids.userCoach1, 'cycle_notes')).toBe(0);
  });

  it('partage « tout » : historique et notes, en lecture seule ; jamais pour un autre coach', async () => {
    await choix('tout');
    expect(await compter(ids.userCoach1, 'cycle_regles')).toBe(2);
    expect(await compter(ids.userCoach1, 'cycle_notes')).toBe(1);
    await en(ids.userCoach1, `delete from public.cycle_regles where client_id = $1`, [ids.clientA]);
    expect(await compter(ids.userClientA, 'cycle_regles')).toBe(2);
    await expect(en(ids.userCoach1, `insert into public.cycle_notes (client_id, jour) values ($1, current_date - 1)`, [ids.clientA])).rejects.toThrow();
    expect(await vueCoach(ids.userCoach2)).toEqual([]);
    expect(await compter(ids.userCoach2, 'cycle_regles')).toBe(0);
    const espion = await en(ids.userClientB, `select public.partage_cycle_de($1) as p`, [ids.clientA]);
    expect(espion.rows[0].p).toBe('rien');
  });

  it('revoir ses autres accords garde le choix du cycle', async () => {
    const c = await en(ids.userClientA, `select suivi_cycle, partage_cycle from public.enregistrer_consentement('v2', false)`);
    expect(c.rows[0]).toEqual({ suivi_cycle: true, partage_cycle: 'tout' });
  });

  it('couper le suivi coupe le partage, et tout effacer efface tout', async () => {
    await choix('tout', false);
    expect(await compter(ids.userCoach1, 'cycle_regles')).toBe(0);
    await en(ids.userClientA, `select public.effacer_mon_cycle()`);
    for (const t of ['cycle_reglages', 'cycle_regles', 'cycle_notes']) expect(await compter(ids.userClientA, t)).toBe(0);
    const dernier = await en(ids.userClientA, `select suivi_cycle, partage_cycle, analyse_ia from public.mon_consentement()`);
    expect(dernier.rows[0]).toEqual({ suivi_cycle: false, partage_cycle: 'rien', analyse_ia: false });
  });
});
