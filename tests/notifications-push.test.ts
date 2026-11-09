/// <reference types="node" />
// Notifications envoyées par le serveur, dans un vrai Postgres (PGlite) : qui est prévenu de quoi, jamais soi-même,
// et rien pour une alerte coupée. (L'envoi au téléphone, par pg_net, n'existe pas ici : seule la ligne compte.)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ids = {
  userCoach: '10000000-0000-4000-8000-000000000001',
  userClientA: '10000000-0000-4000-8000-0000000000a1',
  userClientB: '10000000-0000-4000-8000-0000000000b1',
  coach: '20000000-0000-4000-8000-000000000001',
  clientA: '30000000-0000-4000-8000-0000000000a1',
  clientB: '30000000-0000-4000-8000-0000000000b1',
  seance: '40000000-0000-4000-8000-000000000001',
  rdv: '50000000-0000-4000-8000-000000000001',
};

let db: PGlite;

async function en(userId: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; set role authenticated; select set_config('test.uid', '${userId}', false);`);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('test.uid', '', false);`);
  }
}

async function recues(userId: string) {
  return (await db.query<{ genre: string; titre: string; corps: string; url: string }>('select genre, titre, corps, url from public.notifications where user_id = $1 order by cree_le, genre', [userId])).rows;
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
    grant select, insert, delete on storage.objects to authenticated;
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach}'), ('${ids.userClientA}'), ('${ids.userClientB}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values ('${ids.coach}', '${ids.userCoach}', 'Sylvain', 'sylvain');
    insert into public.clients (id, coach_id, prenom, nom, user_id) values
      ('${ids.clientA}', '${ids.coach}', 'Inès', 'Martin', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach}', 'Paul', '', '${ids.userClientB}');
    insert into public.seances (id, coach_id, client_id, titre) values ('${ids.seance}', '${ids.coach}', '${ids.clientA}', 'Haut du corps');
  `);
});

beforeEach(async () => {
  await db.exec('delete from public.notifications; delete from public.notifications_coupees;');
});

afterAll(async () => {
  await db.close();
});

describe('messages', () => {
  it('le coach est prévenu quand un client écrit, et le client quand le coach répond', async () => {
    await en(ids.userClientA, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'client', '  Bonjour   coach ')`, [ids.coach, ids.clientA]);
    expect(await recues(ids.userCoach)).toEqual([{ genre: 'message', titre: 'Inès Martin', corps: 'Bonjour coach', url: `/coach/messages/${ids.clientA}` }]);
    expect(await recues(ids.userClientA)).toEqual([]);
    await en(ids.userCoach, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'coach', 'Salut !')`, [ids.coach, ids.clientA]);
    expect(await recues(ids.userClientA)).toEqual([{ genre: 'message', titre: 'Sylvain', corps: 'Salut !', url: '/client/messages' }]);
  });

  it('une alerte coupée ne prévient plus', async () => {
    await en(ids.userCoach, `insert into public.notifications_coupees (genre) values ('message')`);
    await en(ids.userClientA, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'client', 'Re')`, [ids.coach, ids.clientA]);
    expect(await recues(ids.userCoach)).toEqual([]);
  });

  it('chacun ne voit et ne règle que ses alertes', async () => {
    await en(ids.userClientA, `insert into public.notifications_coupees (genre) values ('programme')`);
    expect((await en(ids.userClientB, 'select * from public.notifications_coupees')).rows).toEqual([]);
    let erreur: unknown;
    try {
      await en(ids.userClientB, `insert into public.notifications_coupees (user_id, genre) values ($1, 'message')`, [ids.userClientA]);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeDefined();
    await en(ids.userCoach, `insert into public.messages (coach_id, client_id, auteur, texte) values ($1, $2, 'coach', 'Pour toi')`, [ids.coach, ids.clientA]);
    expect((await en(ids.userClientB, 'select * from public.notifications')).rows).toEqual([]);
    expect((await en(ids.userClientA, 'select genre from public.notifications')).rows).toEqual([{ genre: 'message' }]);
  });

  it('personne ne peut écrire une notification à la main', async () => {
    let erreur: unknown;
    try {
      await en(ids.userClientA, `select public.notifier($1, 'message', 'Faux', 'faux', '/')`, [ids.userCoach]);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeDefined();
  });
});

describe('agenda', () => {
  it('séance proposée (client), acceptée (coach), déplacée puis annulée par le coach (client)', async () => {
    await db.exec(`set role authenticated; select set_config('test.uid', '${ids.userCoach}', false);
      insert into public.rendez_vous (id, debut, fin) values ('${ids.rdv}', '2099-03-10 17:00:00+00', '2099-03-10 18:00:00+00');
      insert into public.rendez_vous_participants (rendez_vous_id, client_id) values ('${ids.rdv}', '${ids.clientA}');
      reset role; select set_config('test.uid', '', false);`);
    expect(await recues(ids.userClientA)).toEqual([{ genre: 'rdv_propose', titre: 'Séance à accepter', corps: 'Mardi 10/03 à 18h00 avec Sylvain.', url: '/client' }]);

    await en(ids.userClientA, `select public.repondre_rendez_vous($1, 'confirme')`, [ids.rdv]);
    expect(await recues(ids.userCoach)).toEqual([{ genre: 'rdv_accepte', titre: 'Séance acceptée', corps: 'Inès · mardi 10/03 à 18h00', url: '/coach?onglet=agenda' }]);

    await db.exec('delete from public.notifications');
    await en(ids.userCoach, `update public.rendez_vous set debut = '2099-03-11 17:00:00+00', fin = '2099-03-11 18:00:00+00' where id = $1`, [ids.rdv]);
    expect((await recues(ids.userClientA)).map((n) => [n.genre, n.titre])).toEqual([['rdv_change', 'Séance déplacée']]);

    await db.exec('delete from public.notifications');
    await en(ids.userCoach, `select public.changer_statut_rendez_vous($1, 'annule')`, [ids.rdv]);
    expect((await recues(ids.userClientA)).map((n) => [n.genre, n.titre])).toEqual([['rdv_change', 'Séance annulée']]);
    expect(await recues(ids.userCoach)).toEqual([]);
  });

  it('le rappel part avec le mail de rappel', async () => {
    const rdv = '50000000-0000-4000-8000-000000000002';
    await db.exec(`
      insert into public.rendez_vous (id, coach_id, debut, fin, statut, lieu) values ('${rdv}', '${ids.coach}', '2099-03-10 17:00:00+00', '2099-03-10 18:00:00+00', 'confirme', 'Salle Fit');
      insert into public.rendez_vous_participants (rendez_vous_id, client_id) values ('${rdv}', '${ids.clientB}');
      delete from public.notifications;
      update public.rendez_vous set rappel_envoye_le = now() where id = '${rdv}';
    `);
    expect(await recues(ids.userClientB)).toEqual([{ genre: 'rdv_rappel', titre: 'Rappel : séance avec Sylvain', corps: 'Mardi 10/03 à 18h00 · Salle Fit', url: '/client' }]);
  });
});

describe('entraînement, programme, facture', () => {
  it('le coach est prévenu d’une séance faite par le client, pas de celle qu’il saisit lui-même', async () => {
    await db.exec(`set role authenticated; select set_config('test.uid', '${ids.userClientA}', false);
      insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin) values (gen_random_uuid(), '${ids.seance}', '${ids.clientA}', '${ids.coach}', now() - interval '45 minutes', now());
      reset role; select set_config('test.uid', '${ids.userCoach}', false);
      insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin) values (gen_random_uuid(), '${ids.seance}', '${ids.clientA}', '${ids.coach}', now() - interval '30 minutes', now());
      select set_config('test.uid', '', false);`);
    const n = await recues(ids.userCoach);
    expect(n.map((x) => [x.genre, x.titre, x.corps])).toEqual([['seance_faite', 'Inès a fait sa séance', 'Haut du corps · 45 min']]);
  });

  it('le client est prévenu d’un nouveau programme', async () => {
    await en(ids.userCoach, `insert into public.programmes (coach_id, client_id, titre) values ($1, $2, 'Force 8 semaines')`, [ids.coach, ids.clientA]);
    expect(await recues(ids.userClientA)).toEqual([
      { genre: 'programme', titre: 'Nouveau programme', corps: 'Force 8 semaines · ton coach vient de te l’envoyer.', url: '/client?onglet=programme' },
    ]);
  });
});

describe('client inactif', () => {
  it('prévient le coach le jour où le seuil est atteint, une seule fois', async () => {
    // Midi à Paris, il y a 21 et 22 jours.
    const ilYa = (j: number) => `(((now() at time zone 'Europe/Paris')::date - ${j}) + time '12:00') at time zone 'Europe/Paris'`;
    await db.exec(`update public.clients set created_at = ${ilYa(21)} where id = '${ids.clientB}'`);
    await db.exec(`update public.clients set created_at = ${ilYa(22)} where id = '${ids.clientA}'`);
    await db.exec(`delete from public.realisations; delete from public.rendez_vous;`);
    await db.query('select public._prevenir_inactifs()');
    expect((await recues(ids.userCoach)).map((n) => n.titre)).toEqual(['Paul décroche']);
  });
});
