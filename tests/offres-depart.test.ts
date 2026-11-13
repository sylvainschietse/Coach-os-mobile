/// <reference types="node" />
// Passage aux offres des coachs : les coachs déjà inscrits retrouvent leurs formules comme offres, et chaque client garde son prix.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = '20261105000000_offres_coachs.sql';
let db: PGlite;

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
  const fichiers = readdirSync(dossier)
    .filter((x) => x.endsWith('.sql'))
    .sort();
  // La base telle qu'elle est aujourd'hui, avec un coach et ses clients…
  for (const f of fichiers.filter((x) => x < MIGRATION)) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id) values ('10000000-0000-4000-8000-000000000001');
    insert into public.coachs (id, user_id, nom) values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Sylvain');
    insert into public.clients (coach_id, prenom, acces_appli, option_nutrition, formule) values
      ('20000000-0000-4000-8000-000000000001', 'Appli seule', true, false, null),
      ('20000000-0000-4000-8000-000000000001', 'Avec nutrition', true, true, null),
      ('20000000-0000-4000-8000-000000000001', 'Hybride', true, true, 'hybride_complet'),
      ('20000000-0000-4000-8000-000000000001', 'Séances', false, false, null);
  `);
  // … puis le passage aux offres.
  for (const f of fichiers.filter((x) => x >= MIGRATION)) await db.exec(readFileSync(join(dossier, f), 'utf8'));
});

afterAll(async () => {
  await db.close();
});

describe('offres de départ', () => {
  it('le coach retrouve ses 4 formules comme offres, avec leurs prix et leur contenu', async () => {
    const { rows } = await db.query(`select nom, prix::float as prix, periodicite, nutrition, videos_mois, seances from public.offres order by ordre`);
    expect(rows).toEqual([
      { nom: 'Appli', prix: 59, periodicite: 'mois', nutrition: false, videos_mois: 0, seances: 0 },
      { nom: 'Appli + nutrition', prix: 99, periodicite: 'mois', nutrition: true, videos_mois: 0, seances: 0 },
      { nom: 'Hybride léger', prix: 149, periodicite: 'mois', nutrition: true, videos_mois: 0, seances: 1 },
      { nom: 'Hybride complet', prix: 269, periodicite: 'mois', nutrition: true, videos_mois: 2, seances: 4 },
    ]);
  });

  it('chaque client garde ce qu’il payait, sans changer ses accès', async () => {
    const { rows } = await db.query(
      `select k.prenom, o.nom as offre, k.offre_prix::float as prix, k.acces_appli, k.option_nutrition
       from public.clients k left join public.offres o on o.id = k.offre_id order by k.prenom`,
    );
    expect(rows).toEqual([
      { prenom: 'Appli seule', offre: 'Appli', prix: 59, acces_appli: true, option_nutrition: false },
      { prenom: 'Avec nutrition', offre: 'Appli + nutrition', prix: 99, acces_appli: true, option_nutrition: true },
      { prenom: 'Hybride', offre: 'Hybride complet', prix: 269, acces_appli: true, option_nutrition: true },
      { prenom: 'Séances', offre: null, prix: null, acces_appli: false, option_nutrition: false },
    ]);
  });
});
