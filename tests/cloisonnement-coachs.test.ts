/// <reference types="node" />
// Cloisonnement entre coachs et plafond d'appels à l'IA, dans un vrai Postgres (PGlite) : un coach ne relie jamais
// ses lignes au client, au contact ou au Booster d'un autre coach, et ne choisit pas le compte de connexion d'un client.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userClient: '10000000-0000-4000-8000-000000000003',
  userAutre: '10000000-0000-4000-8000-000000000004',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  client1: '30000000-0000-4000-8000-000000000001',
  client2: '30000000-0000-4000-8000-000000000002',
  contact1: '40000000-0000-4000-8000-000000000001',
  contact2: '40000000-0000-4000-8000-000000000002',
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
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClient}'), ('${ids.userAutre}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom, user_id) values ('${ids.client1}', '${ids.coach1}', 'Inès', '${ids.userClient}');
    insert into public.clients (id, coach_id, prenom) values ('${ids.client2}', '${ids.coach2}', 'Bruno');
    insert into public.contacts (id, coach_id, prenom, client_id) values ('${ids.contact1}', '${ids.coach1}', 'Inès', '${ids.client1}');
    insert into public.contacts (id, coach_id, prenom, client_id) values ('${ids.contact2}', '${ids.coach2}', 'Bruno', '${ids.client2}');
  `);
});

afterAll(async () => {
  await db.close();
});

const coach2 = (sql: string, params: unknown[] = []) => en('authenticated', ids.userCoach2, sql, params);
const refuse = /row-level security|violates|permission|Créer l’accès/;

describe('cloisonnement entre coachs', () => {
  it('un coach ne relie pas son contact au client d’un autre coach, mais à son propre client oui', async () => {
    await expect(coach2(`insert into public.contacts (coach_id, prenom, client_id) values ($1, 'X', $2)`, [ids.coach2, ids.client1])).rejects.toThrow(refuse);
    await expect(coach2(`update public.contacts set client_id = $1 where id = $2`, [ids.client1, ids.contact2])).rejects.toThrow(refuse);
    await coach2(`update public.contacts set client_id = $1 where id = $2`, [ids.client2, ids.contact2]);
  });

  it('Boosters, documents et relances ne renvoient qu’aux contacts du coach', async () => {
    await expect(coach2(`insert into public.boosters (coach_id, contact_id, date) values ($1, $2, now())`, [ids.coach2, ids.contact1])).rejects.toThrow(refuse);
    await expect(coach2(`insert into public.documents (coach_id, contact_id, nom) values ($1, $2, 'Plan')`, [ids.coach2, ids.contact1])).rejects.toThrow(refuse);
    await expect(
      coach2(`insert into public.relances (coach_id, contact_id, echeance, modele) values ($1, $2, current_date, 'libre')`, [ids.coach2, ids.contact1]),
    ).rejects.toThrow(refuse);
    await coach2(`insert into public.boosters (coach_id, contact_id, date) values ($1, $2, now())`, [ids.coach2, ids.contact2]);
    await coach2(`insert into public.documents (coach_id, contact_id, nom) values ($1, $2, 'Plan')`, [ids.coach2, ids.contact2]);
    await coach2(`insert into public.relances (coach_id, contact_id, echeance, modele) values ($1, $2, current_date, 'libre')`, [ids.coach2, ids.contact2]);
  });

  it('le journal du parcours (étapes et notes) reste dans le dossier du coach', async () => {
    await expect(
      coach2(`insert into public.journal_contacts (coach_id, contact_id, type, texte) values ($1, $2, 'note', 'Espion')`, [ids.coach2, ids.contact1]),
    ).rejects.toThrow(refuse);
    await expect(coach2(`insert into public.journal_contacts (coach_id, contact_id, type) values ($1, $2, 'etape')`, [ids.coach2, ids.contact2])).rejects.toThrow(
      /check/,
    );
    await coach2(`insert into public.journal_contacts (coach_id, contact_id, type, vers, sautees) values ($1, $2, 'etape', 'Client actif', '{"Booster réalisé"}')`, [
      ids.coach2,
      ids.contact2,
    ]);
    await en('authenticated', ids.userCoach1, `insert into public.journal_contacts (contact_id, type, texte) values ($1, 'note', 'Genou sensible')`, [ids.contact1]);
    const vus = await coach2('select contact_id from public.journal_contacts');
    expect(vus.rows.map((r) => r.contact_id)).toEqual([ids.contact2]);
    await expect(en('anon', null, 'select * from public.journal_contacts')).rejects.toThrow(/permission/);
  });

  it('recettes et aliments ne visent que les clients du coach', async () => {
    await expect(coach2(`insert into public.recettes (coach_id, client_id, titre) values ($1, $2, 'Soupe')`, [ids.coach2, ids.client1])).rejects.toThrow(refuse);
    await coach2(`insert into public.recettes (coach_id, client_id, titre) values ($1, $2, 'Soupe')`, [ids.coach2, ids.client2]);
  });

  it('seul le serveur relie un compte de connexion à une fiche client ; le retirer reste permis', async () => {
    await expect(coach2(`update public.clients set user_id = $1 where id = $2`, [ids.userClient, ids.client2])).rejects.toThrow(refuse);
    await expect(coach2(`insert into public.clients (coach_id, prenom, user_id) values ($1, 'Pirate', $2)`, [ids.coach2, ids.userAutre])).rejects.toThrow(refuse);
    await en('authenticated', ids.userCoach1, `update public.clients set prenom = 'Inès B.' where id = $1`, [ids.client1]);
    await en('authenticated', ids.userCoach1, `update public.clients set user_id = null where id = $1`, [ids.client1]);
    await db.exec(`update public.clients set user_id = '${ids.userClient}' where id = '${ids.client1}'`); // le serveur
  });
});

describe('plafond d’appels à l’IA', () => {
  const appel = (uid: string | null) =>
    en(uid ? 'authenticated' : 'anon', uid, 'select public.compter_appel_ia() as ok').then((r) => r.rows[0].ok);

  it('un client a 40 appels par jour, puis plus rien jusqu’au lendemain', async () => {
    for (let i = 0; i < 40; i++) expect(await appel(ids.userClient)).toBe(true);
    expect(await appel(ids.userClient)).toBe(false);
    await db.exec(`update public.usage_ia set jour = jour - 1`);
    expect(await appel(ids.userClient)).toBe(true);
  });

  it('un coach en a 200 ; un compte sans fiche n’en a aucun ; un visiteur ne peut pas appeler', async () => {
    for (let i = 0; i < 200; i++) expect(await appel(ids.userCoach1)).toBe(true);
    expect(await appel(ids.userCoach1)).toBe(false);
    expect(await appel(ids.userAutre)).toBe(false);
    await expect(appel(null)).rejects.toThrow(/permission/);
  });
});
