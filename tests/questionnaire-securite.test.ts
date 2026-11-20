/// <reference types="node" />
// Sécurité du questionnaire public, dans un vrai Postgres (PGlite) : l'e-mail d'un inconnu n'arrive jamais sur une fiche,
// un compte n'est plus relié tout seul à une fiche client par son e-mail, et le formulaire a un anti-spam.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach: '10000000-0000-4000-8000-000000000001',
  userMarc: '10000000-0000-4000-8000-000000000002',
  userPirate: '10000000-0000-4000-8000-000000000003',
  coach: '20000000-0000-4000-8000-000000000001',
  client: '30000000-0000-4000-8000-000000000001',
  marc: '30000000-0000-4000-8000-000000000002',
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

const soumettre = (reponses: Record<string, string>) =>
  en('anon', null, `select public.soumettre_questionnaire('sylvain', $1::jsonb)`, [JSON.stringify(reponses)]);

describe('questionnaire public', () => {
  it('l’e-mail d’un inconnu n’est pas recopié sur la fiche d’un prospect qui n’en a pas : le coach est alerté', async () => {
    await en('authenticated', ids.userCoach, `insert into public.contacts (coach_id, prenom, telephone) values ($1, 'Julie', '33612345678')`, [ids.coach]);
    await soumettre({ prenom: 'Julie', telephone: '06 12 34 56 78', email: 'pirate@exemple.fr' });
    const fiche = await db.query(`select email from public.contacts where telephone = '33612345678'`);
    expect(fiche.rows).toEqual([{ email: null }]);
    const q = await db.query<{ alertes: string[] }>(`select alertes from public.questionnaires order by recu_le desc limit 1`);
    expect(q.rows[0].alertes).toEqual([
      'E-mail donné dans le questionnaire : pirate@exemple.fr. Il n’a pas été ajouté à la fiche : vérifie-le avec la personne avant de l’ajouter.',
    ]);
  });

  it('une personne nouvelle garde l’e-mail qu’elle donne sur sa nouvelle fiche', async () => {
    await soumettre({ prenom: 'Karim', telephone: '0611111111', email: 'karim@exemple.fr' });
    const fiche = await db.query(`select email from public.contacts where telephone = '33611111111'`);
    expect(fiche.rows).toEqual([{ email: 'karim@exemple.fr' }]);
  });

  it('au-delà de 20 réponses en une heure, les suivantes sont refusées', async () => {
    await db.exec(`delete from public.questionnaires`);
    for (let i = 0; i < 20; i++) await soumettre({ prenom: `P${i}`, telephone: `06200000${String(i).padStart(2, '0')}` });
    await expect(soumettre({ prenom: 'Spam', telephone: '0630000000' })).rejects.toThrow(/Trop de réponses/);
    // Une heure plus tard, ça repart.
    await db.exec(`update public.questionnaires set recu_le = now() - interval '2 hours'`);
    await soumettre({ prenom: 'Zoé', telephone: '0630000001' });
  });
});

describe('connexion d’un client', () => {
  const rattacher = (uid: string) => en('authenticated', uid, 'select public.rattacher_mon_compte() as id');

  it('un compte vérifié avec l’e-mail d’une fiche client n’y est plus relié tout seul', async () => {
    await db.exec(`
      insert into public.clients (id, coach_id, prenom, email) values ('${ids.marc}', '${ids.coach}', 'Marc', 'marc@exemple.fr');
      insert into auth.users (id, email, email_confirmed_at) values ('${ids.userPirate}', 'marc@exemple.fr', now());
    `);
    expect((await rattacher(ids.userPirate)).rows[0].id).toBeNull();
    const fiche = await db.query(`select user_id from public.clients where id = $1`, [ids.marc]);
    expect(fiche.rows).toEqual([{ user_id: null }]);
  });

  it('un compte relié par le coach (« Créer l’accès ») retrouve sa fiche', async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values ('${ids.userMarc}', 'marc2@exemple.fr', now());
      update public.clients set user_id = '${ids.userMarc}' where id = '${ids.marc}';
    `);
    expect((await rattacher(ids.userMarc)).rows[0].id).toBe(ids.marc);
    expect((await rattacher(ids.userCoach)).rows[0].id).toBeNull();
    await expect(en('anon', null, 'select public.rattacher_mon_compte()')).rejects.toThrow(/permission/);
  });
});
