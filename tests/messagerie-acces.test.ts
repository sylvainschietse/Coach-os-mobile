/// <reference types="node" />
// Messagerie dans un vrai Postgres (PGlite), avec un compartiment simulé : qui écrit, qui lit, qui est prévenu.
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
  msg1: '60000000-0000-4000-8000-000000000001',
  msg2: '60000000-0000-4000-8000-000000000002',
  msg3: '60000000-0000-4000-8000-000000000003',
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

const photoA = `${ids.clientA}/${ids.msg2}.jpg`;

describe('le client', () => {
  it('écrit à son coach : la ligne est rattachée à son coach et non lue', async () => {
    const { rows } = await en(
      ids.userClientA,
      `insert into public.messages (id, coach_id, client_id, auteur, texte) values ($1, $2, $3, 'client', 'Bonjour coach')
       returning coach_id, lu_le`,
      [ids.msg1, ids.coach1, ids.clientA],
    );
    expect(rows[0]).toEqual({ coach_id: ids.coach1, lu_le: null });
  });

  it('envoie une photo déposée dans son dossier', async () => {
    await en(ids.userClientA, `insert into storage.objects (bucket_id, name) values ('messagerie', $1)`, [photoA]);
    await en(
      ids.userClientA,
      `insert into public.messages (id, coach_id, client_id, auteur, piece_chemin, piece_type, piece_taille) values ($1, $2, $3, 'client', $4, 'image/jpeg', 200000)`,
      [ids.msg2, ids.coach1, ids.clientA, photoA],
    );
    expect((await en(ids.userClientA, `select count(*)::int as n from public.messages`)).rows).toEqual([{ n: 2 }]);
  });

  it('ne peut ni se faire passer pour le coach, ni écrire à un autre coach, ni antidater, ni envoyer un message vide', async () => {
    await echoue(en(ids.userClientA, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'coach', 'faux')`, [ids.coach1, ids.clientA]));
    await echoue(en(ids.userClientA, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'client', 'x')`, [ids.coach2, ids.clientB]));
    await echoue(en(ids.userClientA, `insert into public.messages (coach_id, client_id, auteur, texte, cree_le) values ($1, $2, 'client', 'x', now() - interval '1 year')`, [ids.coach1, ids.clientA]));
    await echoue(en(ids.userClientA, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'client', '   ')`, [ids.coach1, ids.clientA]));
    await echoue(en(ids.userClientA, `insert into storage.objects (bucket_id, name) values ('messagerie', $1)`, [`${ids.clientB}/x.jpg`]));
  });

  it('ne modifie pas son message après l’envoi, ne le marque pas lu lui-même', async () => {
    await echoue(en(ids.userClientA, `update public.messages set texte = 'modifié' where id = $1`, [ids.msg1]));
    const { rows } = await en(ids.userClientA, `update public.messages set lu_le = now() where id = $1 returning id`, [ids.msg1]);
    expect(rows).toEqual([]);
  });
});

describe('le coach', () => {
  it('voit le fil de son client et ses fichiers, pas un autre coach ni un autre client', async () => {
    expect((await en(ids.userCoach1, `select count(*)::int as n from public.messages`)).rows).toEqual([{ n: 2 }]);
    expect((await en(ids.userCoach2, `select count(*)::int as n from public.messages`)).rows).toEqual([{ n: 0 }]);
    expect((await en(ids.userClientB, `select count(*)::int as n from public.messages`)).rows).toEqual([{ n: 0 }]);
    expect((await en(ids.userCoach1, `select name from storage.objects where bucket_id = 'messagerie'`)).rows).toEqual([{ name: photoA }]);
    expect((await en(ids.userCoach2, `select name from storage.objects where bucket_id = 'messagerie'`)).rows).toEqual([]);
  });

  it('liste ses conversations avec le nombre de non lus', async () => {
    const { rows } = await en(ids.userCoach1, `select client_id, prenom, dernier_type, dernier_auteur, non_lus from public.conversations_coach()`);
    expect(rows).toEqual([{ client_id: ids.clientA, prenom: 'Inès', dernier_type: 'image/jpeg', dernier_auteur: 'client', non_lus: 2 }]);
  });

  it('marque les messages du client comme lus, répond, et le client voit sa réponse', async () => {
    await en(ids.userCoach1, `update public.messages set lu_le = now() where client_id = $1 and auteur = 'client'`, [ids.clientA]);
    expect((await en(ids.userCoach1, `select non_lus from public.conversations_coach()`)).rows).toEqual([{ non_lus: 0 }]);
    await en(ids.userCoach1, `insert into public.messages (id, coach_id, client_id, auteur, texte) values ($1, $2, $3, 'coach', 'Salut Inès !')`, [ids.msg3, ids.coach1, ids.clientA]);
    expect((await en(ids.userClientA, `select texte from public.messages where auteur = 'coach'`)).rows).toEqual([{ texte: 'Salut Inès !' }]);
    // Le client le marque lu.
    expect((await en(ids.userClientA, `update public.messages set lu_le = now() where id = $1 returning id`, [ids.msg3])).rows).toEqual([{ id: ids.msg3 }]);
  });

  it('n’écrit pas au client d’un autre coach', async () => {
    await echoue(en(ids.userCoach2, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'coach', 'intrus')`, [ids.coach2, ids.clientA]));
    await echoue(en(ids.userCoach1, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'coach', 'intrus')`, [ids.coach1, ids.clientB]));
  });

  it('chacun ne retire que ses propres messages', async () => {
    expect((await en(ids.userCoach1, `delete from public.messages where id = $1 returning id`, [ids.msg1])).rows).toEqual([]);
    expect((await en(ids.userClientA, `delete from public.messages where id = $1 returning id`, [ids.msg3])).rows).toEqual([]);
  });
});

describe('horaires, vidéos du mois et appareils', () => {
  it('le coach règle ses horaires de réponse, son client les lit', async () => {
    await en(ids.userCoach1, `update public.coachs set horaires_reponse = 'Sous 24 h, en semaine' where id = $1`, [ids.coach1]);
    expect((await en(ids.userClientA, `select public.horaires_de_mon_coach() as h`)).rows).toEqual([{ h: 'Sous 24 h, en semaine' }]);
  });

  it('le coach fixe les vidéos incluses, le client les lit sans pouvoir les changer', async () => {
    await en(ids.userCoach1, `update public.clients set videos_mois = 2 where id = $1`, [ids.clientA]);
    expect((await en(ids.userClientA, `select public.mes_videos_mois() as n`)).rows).toEqual([{ n: 2 }]);
    await en(ids.userClientA, `update public.clients set videos_mois = 30 where id = $1`, [ids.clientA]).catch(() => undefined);
    expect((await db.query(`select videos_mois from public.clients where id = $1`, [ids.clientA])).rows).toEqual([{ videos_mois: 2 }]);
  });

  it('un téléphone appartient au dernier compte connecté, chacun ne voit que les siens', async () => {
    await en(ids.userClientA, `select public.enregistrer_appareil('ExponentPushToken[abcdefghij]', 'android')`);
    expect((await en(ids.userClientA, `select jeton from public.appareils_push`)).rows).toEqual([{ jeton: 'ExponentPushToken[abcdefghij]' }]);
    await en(ids.userCoach1, `select public.enregistrer_appareil('ExponentPushToken[abcdefghij]', 'android')`);
    expect((await en(ids.userClientA, `select jeton from public.appareils_push`)).rows).toEqual([]);
    expect((await en(ids.userCoach1, `select count(*)::int as n from public.appareils_push`)).rows).toEqual([{ n: 1 }]);
    await echoue(en(ids.userClientA, `insert into public.appareils_push (jeton, user_id) values ('ExponentPushToken[zzzzzzzzzz]', $1)`, [ids.userCoach1]));
    await en(ids.userClientA, `select public.oublier_appareil('ExponentPushToken[abcdefghij]')`);
    expect((await db.query(`select count(*)::int as n from public.appareils_push`)).rows).toEqual([{ n: 1 }]);
  });

  it('une vidéo de plus de 30 jours est marquée effacée par son coach seulement', async () => {
    const id = '60000000-0000-4000-8000-000000000009';
    const chemin = `${ids.clientA}/${id}.mp4`;
    await db.exec(`insert into public.messages (id, coach_id, client_id, auteur, piece_chemin, piece_type, piece_taille, cree_le)
      values ('${id}', '${ids.coach1}', '${ids.clientA}', 'client', '${chemin}', 'video/mp4', 1000, now() - interval '31 days')`);
    await en(ids.userCoach2, `select public.marquer_videos_expirees(array['${id}']::uuid[])`);
    expect((await db.query(`select piece_chemin from public.messages where id = $1`, [id])).rows).toEqual([{ piece_chemin: chemin }]);
    await en(ids.userCoach1, `select public.marquer_videos_expirees(array['${id}']::uuid[])`);
    expect((await db.query(`select piece_chemin, piece_type, piece_expiree from public.messages where id = $1`, [id])).rows).toEqual([
      { piece_chemin: null, piece_type: 'video/mp4', piece_expiree: true },
    ]);
  });
});
