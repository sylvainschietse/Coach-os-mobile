/// <reference types="node" />
// Sécurité : un visiteur sans compte n'appelle que les fonctions faites pour lui, dans un vrai Postgres (PGlite).
// Comme dans Supabase, toute nouvelle fonction est d'abord ouverte aux visiteurs (anon) : chaque fonction
// « security definer » doit le leur retirer nommément, sauf la courte liste des fonctions publiques ci-dessous.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Les seules fonctions qu'un visiteur peut appeler : questionnaire public, réponse à un rendez-vous par le lien du mail,
// désinscription des newsletters.
const PUBLIQUES = [
  'soumettre_questionnaire',
  'recevoir_questionnaire_externe',
  'noter_erreur_questionnaire',
  'rendez_vous_par_jeton',
  'repondre_par_jeton',
  'desabonner_newsletter',
];

const ids = {
  userCoach: '10000000-0000-4000-8000-000000000001',
  coach: '20000000-0000-4000-8000-000000000001',
  client: '30000000-0000-4000-8000-000000000001',
};

let db: PGlite;

async function en(role: 'anon' | 'authenticated', userId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; set role ${role}; select set_config('test.uid', '${userId ?? ''}', false);`);
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
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to authenticated;
    grant select, insert on storage.objects to authenticated;
    -- Comme Supabase : les fonctions créées ensuite sont ouvertes aux visiteurs et aux comptes connectés.
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values ('${ids.coach}', '${ids.userCoach}', 'Sylvain', 'sylvain');
    insert into public.clients (id, coach_id, prenom) values ('${ids.client}', '${ids.coach}', 'Inès');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('fonctions ouvertes aux visiteurs', () => {
  it('un visiteur n’appelle aucune fonction « security definer » hors de la liste publique', async () => {
    const { rows } = await db.query<{ nom: string }>(`
      select p.proname as nom from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(rows.map((r) => r.nom).filter((n) => !PUBLIQUES.includes(n))).toEqual([]);
  });

  it('un visiteur ne crée plus de facture, le coach toujours', async () => {
    await expect(en('anon', null, `select public.facturer_mois($1, '2026-11')`, [ids.client])).rejects.toThrow(/permission denied/);
    const { rows } = await en('authenticated', ids.userCoach, `select public.facturer_mois($1, '2026-11') as id`, [ids.client]);
    expect(rows[0].id).toBeNull(); // rien à facturer ce mois-là, mais l'appel est permis
  });

  it('les fonctions des déclencheurs ne sont appelables par personne', async () => {
    const { rows } = await db.query<{ nom: string }>(`
      select p.proname as nom from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype = 'trigger'::regtype and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
      order by 1`);
    expect(rows.map((r) => r.nom)).toEqual([]);
  });

  it('le questionnaire public reste ouvert aux visiteurs', async () => {
    await en('anon', null, `select public.soumettre_questionnaire('sylvain', '{"prenom":"Zoé","telephone":"0600000009"}'::jsonb)`);
    const { rows } = await db.query(`select 1 from public.contacts where telephone = '33600000009'`);
    expect(rows).toHaveLength(1);
  });
});
