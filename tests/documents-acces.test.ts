/// <reference types="node" />
// Documents du CRM et « Mes documents » du client dans un vrai Postgres (PGlite), avec un compartiment simulé.
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
  contactA: '40000000-0000-4000-8000-0000000000a1',
  contactB: '40000000-0000-4000-8000-0000000000b1',
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
    -- Ce que Supabase Storage fournit : compartiments, objets sous RLS, et storage.foldername.
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
    insert into public.contacts (id, coach_id, prenom, telephone, statut, client_id) values
      ('${ids.contactA}', '${ids.coach1}', 'Inès', '33655443399', 'client', '${ids.clientA}'),
      ('${ids.contactB}', '${ids.coach1}', 'Bruno', '33600000001', 'client', '${ids.clientB}');
  `);
});

afterAll(async () => {
  await db.close();
});

const cheminA = `${ids.coach1}/doc-a/v1-compte-rendu.pdf`;

describe('documents du coach', () => {
  it('le coach crée un compte rendu versionné, une seule ligne par Booster', async () => {
    await en(ids.userCoach1, `insert into storage.objects (bucket_id, name) values ('documents', $1)`, [cheminA]);
    const { rows } = await en(
      ids.userCoach1,
      `insert into public.documents (contact_id, nom, type, chemin, nom_fichier, type_fichier, taille, commentaires)
       values ($1, 'Compte rendu Booster', 'Plan d''action', $2, 'compte-rendu.pdf', 'application/pdf', 1200, 'Note interne') returning version`,
      [ids.contactA, cheminA],
    );
    expect(rows[0].version).toBe(1);
  });

  it('un coach ne dépose pas dans le dossier d’un autre et ne voit pas ses documents', async () => {
    await expect(en(ids.userCoach2, `insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${ids.coach1}/x/v1.pdf`])).rejects.toThrow();
    expect((await en(ids.userCoach2, `select count(*)::int as n from public.documents`)).rows[0].n).toBe(0);
    expect((await en(ids.userCoach2, `select count(*)::int as n from storage.objects`)).rows[0].n).toBe(0);
  });

  it('refuse un type de document hors de la liste d’origine', async () => {
    await expect(en(ids.userCoach1, `insert into public.documents (nom, type) values ('X', 'Ordonnance')`)).rejects.toThrow();
  });
});

describe('Mes documents du client', () => {
  it('rien tant que le coach n’a pas partagé', async () => {
    expect((await en(ids.userClientA, `select * from public.documents_partages_avec_moi()`)).rows).toHaveLength(0);
    expect((await en(ids.userClientA, `select count(*)::int as n from storage.objects`)).rows[0].n).toBe(0);
  });

  it('le client voit le document partagé, sans les commentaires, et peut lire ce fichier seulement', async () => {
    await en(ids.userCoach1, `update public.documents set partage_client = true where chemin = $1`, [cheminA]);
    const { rows } = await en(ids.userClientA, `select * from public.documents_partages_avec_moi()`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nom: 'Compte rendu Booster', type: 'Plan d’action'.replace('’', "'"), chemin: cheminA });
    expect(rows[0]).not.toHaveProperty('commentaires');
    expect((await en(ids.userClientA, `select name from storage.objects`)).rows).toEqual([{ name: cheminA }]);
    // Aucun accès direct à la table (commentaires internes compris).
    expect((await en(ids.userClientA, `select count(*)::int as n from public.documents`)).rows[0].n).toBe(0);
  });

  it('un autre client du même coach ne voit ni le document ni le fichier', async () => {
    expect((await en(ids.userClientB, `select * from public.documents_partages_avec_moi()`)).rows).toHaveLength(0);
    expect((await en(ids.userClientB, `select count(*)::int as n from storage.objects`)).rows[0].n).toBe(0);
  });

  it('une nouvelle version remplace le fichier servi ; l’ancien n’est plus lisible par le client', async () => {
    const v2 = `${ids.coach1}/doc-a/v2-compte-rendu.pdf`;
    await en(ids.userCoach1, `insert into storage.objects (bucket_id, name) values ('documents', $1)`, [v2]);
    await en(ids.userCoach1, `update public.documents set version = 2, chemin = $1 where chemin = $2`, [v2, cheminA]);
    const { rows } = await en(ids.userClientA, `select version, chemin from public.documents_partages_avec_moi()`);
    expect(rows).toEqual([{ version: 2, chemin: v2 }]);
    expect((await en(ids.userClientA, `select name from storage.objects`)).rows).toEqual([{ name: v2 }]);
  });
});
