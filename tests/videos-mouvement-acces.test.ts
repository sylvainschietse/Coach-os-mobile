/// <reference types="node" />
// Vidéos de mouvement dans un vrai Postgres (PGlite), avec un compartiment simulé : qui envoie, qui voit, qui répond.
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
  videoA: '50000000-0000-4000-8000-0000000000a1',
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

const echoue = async (p: Promise<unknown>) => {
  let erreur: unknown;
  try {
    await p;
  } catch (e) {
    erreur = e;
  }
  expect(erreur).toBeDefined();
};

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
    grant select, insert, delete on storage.objects to authenticated;
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

const cheminA = `${ids.clientA}/${ids.videoA}.mp4`;

describe('envoi par le client', () => {
  it('le client dépose sa vidéo dans son dossier et la ligne est rattachée à son coach, pour 30 jours', async () => {
    await en(ids.userClientA, `insert into storage.objects (bucket_id, name) values ('videos-mouvement', $1)`, [cheminA]);
    const { rows } = await en(
      ids.userClientA,
      `insert into public.videos_mouvement (id, exercice_nom, chemin, type_fichier, taille, duree_s, commentaire)
       values ($1, 'Squat', $2, 'video/mp4', 12000000, 42, 'Mon dos ?')
       returning coach_id, client_id, round(extract(epoch from expire_le - cree_le) / 86400) as jours`,
      [ids.videoA, cheminA],
    );
    expect(rows[0]).toEqual({ coach_id: ids.coach1, client_id: ids.clientA, jours: '30' });
  });

  it('pas de dépôt dans le dossier d’un autre client, ni de ligne à son nom', async () => {
    await echoue(en(ids.userClientA, `insert into storage.objects (bucket_id, name) values ('videos-mouvement', $1)`, [`${ids.clientB}/x.mp4`]));
    await echoue(
      en(ids.userClientA, `insert into public.videos_mouvement (client_id, coach_id, exercice_nom, chemin, type_fichier, taille) values ($1, $2, 'Squat', $3, 'video/mp4', 10)`, [
        ids.clientB,
        ids.coach2,
        `${ids.clientB}/y.mp4`,
      ]),
    );
  });

  it('refuse un fichier trop lourd, trop long, ou une réponse préremplie', async () => {
    const inserer = (extra: string, valeurs: string) =>
      en(ids.userClientA, `insert into public.videos_mouvement (exercice_nom, chemin, type_fichier, taille${extra}) values ('Squat', $1, 'video/mp4', ${valeurs})`, [
        `${ids.clientA}/${Math.random()}.mp4`,
      ]);
    await echoue(inserer('', '30000000'));
    await echoue(inserer(', duree_s', '1000, 300'));
    await echoue(inserer(', reponse_texte', `1000, 'Parfait'`));
    await echoue(inserer(', expire_le', `1000, now() + interval '90 days'`));
  });

  it('le client ne modifie rien après l’envoi', async () => {
    await en(ids.userClientA, `update public.videos_mouvement set reponse_texte = 'auto-réponse' where id = $1`, [ids.videoA]).catch(() => undefined);
    const { rows } = await db.query(`select reponse_texte from public.videos_mouvement where id = $1`, [ids.videoA]);
    expect(rows[0]).toEqual({ reponse_texte: null });
  });
});

describe('le coach', () => {
  it('voit les vidéos de ses clients et lit leurs fichiers, pas un autre coach', async () => {
    expect((await en(ids.userCoach1, `select id from public.videos_mouvement`)).rows).toEqual([{ id: ids.videoA }]);
    expect((await en(ids.userCoach2, `select id from public.videos_mouvement`)).rows).toEqual([]);
    expect((await en(ids.userCoach1, `select name from storage.objects where bucket_id = 'videos-mouvement'`)).rows).toEqual([{ name: cheminA }]);
    expect((await en(ids.userCoach2, `select name from storage.objects where bucket_id = 'videos-mouvement'`)).rows).toEqual([]);
    expect((await en(ids.userClientB, `select id from public.videos_mouvement`)).rows).toEqual([]);
  });

  it('répond par écrit et par un vocal déposé dans le dossier du client', async () => {
    const vocal = `${ids.clientA}/${ids.videoA}-reponse-1.m4a`;
    await en(ids.userCoach1, `insert into storage.objects (bucket_id, name) values ('videos-mouvement', $1)`, [vocal]);
    const { rows } = await en(
      ids.userCoach1,
      `update public.videos_mouvement set reponse_texte = 'Descends plus bas', reponse_audio = $2, reponse_audio_type = 'audio/mp4',
         reponse_audio_duree_s = 35, reponse_le = now(), vue_le = now() where id = $1 returning reponse_texte`,
      [ids.videoA, vocal],
    );
    expect(rows).toEqual([{ reponse_texte: 'Descends plus bas' }]);
    // Le client lit la réponse et le vocal.
    expect((await en(ids.userClientA, `select reponse_texte, reponse_audio from public.videos_mouvement`)).rows).toEqual([{ reponse_texte: 'Descends plus bas', reponse_audio: vocal }]);
    expect((await en(ids.userClientA, `select count(*)::int as n from storage.objects where bucket_id = 'videos-mouvement'`)).rows).toEqual([{ n: 2 }]);
  });

  it('ne change ni le fichier ni la date d’effacement, et un autre coach ne répond pas', async () => {
    await echoue(en(ids.userCoach1, `update public.videos_mouvement set chemin = 'x/y.mp4' where id = $1`, [ids.videoA]));
    await echoue(en(ids.userCoach1, `update public.videos_mouvement set expire_le = now() + interval '1 year' where id = $1`, [ids.videoA]));
    const { rows } = await en(ids.userCoach2, `update public.videos_mouvement set reponse_texte = 'intrus' where id = $1 returning id`, [ids.videoA]);
    expect(rows).toEqual([]);
    await echoue(en(ids.userCoach2, `insert into storage.objects (bucket_id, name) values ('videos-mouvement', $1)`, [`${ids.clientA}/intrus.m4a`]));
  });
});

describe('effacement à 30 jours', () => {
  it('une vidéo expirée disparaît pour le client, le coach la voit encore pour effacer ses fichiers', async () => {
    await db.exec(`alter table public.videos_mouvement disable trigger all;
      update public.videos_mouvement set cree_le = now() - interval '31 days', expire_le = now() - interval '1 day' where id = '${ids.videoA}';
      alter table public.videos_mouvement enable trigger all;`);
    expect((await en(ids.userClientA, `select id from public.videos_mouvement`)).rows).toEqual([]);
    const { rows } = await en(ids.userCoach1, `select id from public.videos_mouvement where expire_le <= now()`);
    expect(rows).toEqual([{ id: ids.videoA }]);
    await en(ids.userCoach1, `delete from storage.objects where bucket_id = 'videos-mouvement' and name like $1`, [`${ids.clientA}/%`]);
    expect((await en(ids.userCoach1, `delete from public.videos_mouvement where id = $1 returning id`, [ids.videoA])).rows).toEqual([{ id: ids.videoA }]);
    expect((await db.query(`select count(*)::int as n from storage.objects`)).rows).toEqual([{ n: 0 }]);
  });
});
