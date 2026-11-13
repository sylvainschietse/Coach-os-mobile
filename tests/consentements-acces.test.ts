/// <reference types="node" />
// RGPD dans un vrai Postgres (PGlite) : l'accord du client est daté, gardé en historique et visible de lui et de son coach seuls.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accordAttendu, VERSION_POLITIQUE } from '../src/domain/consentement';

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
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach2}', 'Bruno', '${ids.userClientB}');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('consentements', () => {
  it('sans accord, mon_consentement ne renvoie rien d’exploitable', async () => {
    const { rows } = await en(ids.userClientA, 'select * from public.mon_consentement()');
    expect(rows[0].version).toBeNull();
  });

  it('le client enregistre son accord, daté, pour la version de la politique', async () => {
    const { rows } = await en(ids.userClientA, 'select * from public.enregistrer_consentement($1, false)', [VERSION_POLITIQUE]);
    expect(rows[0]).toMatchObject({ client_id: ids.clientA, coach_id: ids.coach1, version: VERSION_POLITIQUE, donnees_sante: true, analyse_ia: false });
    expect(rows[0].accepte_le).toBeTruthy();
  });

  it('un changement d’avis ajoute une ligne : l’historique reste', async () => {
    await en(ids.userClientA, 'select public.enregistrer_consentement($1, true)', [VERSION_POLITIQUE]);
    const dernier = await en(ids.userClientA, 'select * from public.mon_consentement()');
    expect(dernier.rows[0].analyse_ia).toBe(true);
    const tous = await en(ids.userClientA, 'select analyse_ia from public.consentements order by accepte_le, id');
    expect(tous.rows).toHaveLength(2);
  });

  it('le client ne peut ni écrire directement, ni modifier, ni effacer son historique', async () => {
    await expect(
      en(ids.userClientA, `insert into public.consentements (client_id, coach_id, version, donnees_sante, analyse_ia)
        values ('${ids.clientA}', '${ids.coach1}', 'x', true, true)`),
    ).rejects.toThrow();
    await expect(en(ids.userClientA, 'update public.consentements set analyse_ia = false')).rejects.toThrow();
    await expect(en(ids.userClientA, 'delete from public.consentements')).rejects.toThrow();
  });

  it('le coach voit les accords de ses clients, pas ceux des autres', async () => {
    await en(ids.userClientB, 'select public.enregistrer_consentement($1, false)', [VERSION_POLITIQUE]);
    const coach1 = await en(ids.userCoach1, 'select distinct client_id from public.consentements');
    expect(coach1.rows.map((r) => r.client_id)).toEqual([ids.clientA]);
    const clientB = await en(ids.userClientB, 'select distinct client_id from public.consentements');
    expect(clientB.rows.map((r) => r.client_id)).toEqual([ids.clientB]);
  });

  it('un coach ne peut pas enregistrer d’accord à la place d’un client', async () => {
    await expect(en(ids.userCoach1, 'select public.enregistrer_consentement($1, true)', [VERSION_POLITIQUE])).rejects.toThrow(/clients connectés/);
  });

  it('une nouvelle version de la politique redemande l’accord', () => {
    const c = { version: VERSION_POLITIQUE, donneesSante: true, analyseIa: false, accepteLe: '2026-10-30T10:00:00Z' };
    expect(accordAttendu(null)).toBe(true);
    expect(accordAttendu(c)).toBe(false);
    expect(accordAttendu({ ...c, version: '2020-01-01' })).toBe(true);
  });
});
