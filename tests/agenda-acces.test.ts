/// <reference types="node" />
// Agenda : rendez-vous à une ou plusieurs personnes, réponses du client, décompte des packs et paiements à l'unité (PGlite).
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
  clientSeances: '30000000-0000-4000-8000-0000000000c1',
  clientD: '30000000-0000-4000-8000-0000000000d1',
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
    grant usage on schema storage to authenticated;
    grant select, insert on storage.objects to authenticated;
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClientA}'), ('${ids.userClientB}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom, user_id) values
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach1}', 'Bruno', '${ids.userClientB}');
    insert into public.clients (id, coach_id, prenom, acces_appli) values ('${ids.clientSeances}', '${ids.coach1}', 'Marc', false);
    insert into public.clients (id, coach_id, prenom, tarif_seance) values ('${ids.clientD}', '${ids.coach1}', 'Dana', 50);
  `);
});

afterAll(async () => {
  await db.close();
});

/** Rendez-vous créé par le coach 1, dans `heures` heures, pour ces clients. */
async function rdv(clients: string[], heures: number, type = 'seance') {
  const { rows } = await en(
    ids.userCoach1,
    `insert into public.rendez_vous (type, debut, fin) values ($1, now() + make_interval(hours => $2), now() + make_interval(hours => $2 + 1)) returning id, jeton`,
    [type, heures],
  );
  const id = rows[0].id as string;
  for (const c of clients) await en(ids.userCoach1, `insert into public.rendez_vous_participants (rendez_vous_id, client_id) values ($1, $2)`, [id, c]);
  return { id, jeton: rows[0].jeton as string };
}
const statut = async (id: string) => (await db.query<{ statut: string }>(`select statut from public.rendez_vous where id = $1`, [id])).rows[0].statut;
const faites = async (pack: string) => (await db.query<{ n: number }>(`select seances_faites as n from public.packs_seances where id = $1`, [pack])).rows[0].n;
const total = async (client: string) =>
  (await db.query<{ n: number }>(`select coalesce(sum(seances_faites), 0)::int as n from public.packs_seances where client_id = $1`, [client])).rows[0].n;
async function pack(client: string, total = 11) {
  const { rows } = await en(ids.userCoach1, `insert into public.packs_seances (client_id, seances_total, achete_le) values ($1, $2, '2026-10-01') returning id`, [client, total]);
  return rows[0].id as string;
}
const paiements = async (rdvId: string) =>
  (await db.query<{ titre: string; montant: string; statut: string }>(`select titre, montant::text, statut from public.paiements where reference like $1 order by titre`, [`seance:${rdvId}:%`])).rows;

describe('accès aux rendez-vous', () => {
  it('le client ne voit que les rendez-vous où il est inscrit, l’autre coach aucun', async () => {
    const a = await rdv([ids.clientA], 72);
    await rdv([ids.clientB], 72);
    expect((await en(ids.userClientA, `select id from public.rendez_vous`)).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await en(ids.userCoach2, `select id from public.rendez_vous`)).rows).toHaveLength(0);
  });

  it('un coach ne peut pas inscrire le client d’un autre coach ni changer le statut directement', async () => {
    const { rows } = await en(ids.userCoach2, `insert into public.rendez_vous (debut, fin) values (now() + interval '1 day', now() + interval '25 hours') returning id`);
    await expect(en(ids.userCoach2, `insert into public.rendez_vous_participants values ($1, $2)`, [rows[0].id, ids.clientA])).rejects.toThrow();
    const a = await rdv([ids.clientA], 72);
    await expect(en(ids.userCoach1, `update public.rendez_vous set statut = 'realise' where id = $1`, [a.id])).rejects.toThrow();
  });

  it('le client confirme, puis annule plus de 24 h avant', async () => {
    const a = await rdv([ids.clientA], 72);
    await en(ids.userClientA, `select public.repondre_rendez_vous($1, 'confirme')`, [a.id]);
    expect(await statut(a.id)).toBe('confirme');
    await en(ids.userClientA, `select public.repondre_rendez_vous($1, 'annule')`, [a.id]);
    expect(await statut(a.id)).toBe('annule');
  });

  it('à moins de 24 h, l’annulation en ligne est refusée', async () => {
    const a = await rdv([ids.clientA], 10);
    await expect(en(ids.userClientA, `select public.repondre_rendez_vous($1, 'annule')`, [a.id])).rejects.toThrow(/appelle ton coach/);
    await expect(en(ids.userClientB, `select public.repondre_rendez_vous($1, 'confirme')`, [a.id])).rejects.toThrow(/introuvable/);
  });

  it('le lien du mail fonctionne sans compte', async () => {
    const a = await rdv([ids.clientA, ids.clientB], 72);
    await db.exec('set role anon;');
    try {
      const { rows } = await db.query<{ prenoms: string; coach: string }>(`select prenoms, coach from public.rendez_vous_par_jeton($1)`, [a.jeton]);
      expect(rows[0]).toEqual({ prenoms: 'Bruno et Inès', coach: 'Sylvain' });
      await db.query(`select public.repondre_par_jeton($1, 'refuse')`, [a.jeton]);
      await expect(db.query(`select * from public.rendez_vous`)).rejects.toThrow();
    } finally {
      await db.exec('reset role;');
    }
    expect(await statut(a.id)).toBe('refuse');
  });

  it('changer l’heure demande une nouvelle confirmation', async () => {
    const a = await rdv([ids.clientA], 72);
    await en(ids.userClientA, `select public.repondre_rendez_vous($1, 'confirme')`, [a.id]);
    await en(ids.userCoach1, `update public.rendez_vous set debut = debut + interval '1 hour', fin = fin + interval '1 hour' where id = $1`, [a.id]);
    expect(await statut(a.id)).toBe('propose');
  });
});

describe('comptage des séances', () => {
  it('une séance réalisée se décompte du pack, et revient si le coach l’annule', async () => {
    const p = await pack(ids.clientSeances);
    const a = await rdv([ids.clientSeances], 72);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [a.id]);
    expect(await faites(p)).toBe(1);
    // Repasser en réalisé ne décompte pas deux fois.
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [a.id]);
    expect(await faites(p)).toBe(1);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'annule')`, [a.id]);
    expect(await faites(p)).toBe(0);
  });

  it('un couple sur un pack partagé : une seule séance décomptée, qu’ils viennent à un ou à deux', async () => {
    const p = await pack(ids.clientA);
    await en(ids.userCoach1, `insert into public.packs_partages (pack_id, client_id) values ($1, $2)`, [p, ids.clientB]);
    const deux = await rdv([ids.clientA, ids.clientB], 72);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [deux.id]);
    expect(await faites(p)).toBe(1);
    const seul = await rdv([ids.clientB], 96);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [seul.id]);
    expect(await faites(p)).toBe(2);
    expect(await paiements(deux.id)).toEqual([]);
    // Le partenaire voit le pack partagé.
    expect((await en(ids.userClientB, `select id from public.packs_seances where id = $1`, [p])).rows).toHaveLength(1);
  });

  it('à l’unité à deux, chacun paie la moitié de son tarif ; seul, son tarif entier', async () => {
    await db.exec(`update public.packs_seances set seances_faites = seances_total where client_id in ('${ids.clientA}', '${ids.clientB}')`);
    await db.exec(`update public.clients set tarif_seance = 50 where id = '${ids.clientD}'`);
    const duo = await rdv([ids.clientD, ids.clientSeances], 120);
    await db.exec(`update public.packs_seances set seances_faites = seances_total where client_id = '${ids.clientSeances}'`);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [duo.id]);
    const lignes = await paiements(duo.id);
    expect(lignes.map((l) => [l.montant, l.statut])).toEqual([
      ['25.00', 'En attente'],
      ['30.00', 'En attente'],
    ]);
    expect(lignes[0].titre).toMatch(/· Dana \(à 2\)$/);
    const solo = await rdv([ids.clientD], 144);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [solo.id]);
    expect((await paiements(solo.id)).map((l) => l.montant)).toEqual(['50.00']);
    // Annulé par le coach : les lignes encore en attente disparaissent.
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'annule')`, [duo.id]);
    expect(await paiements(duo.id)).toEqual([]);
  });

  it('annulation tardive : décomptée ou offerte au choix du coach ; un appel ne compte jamais', async () => {
    const p = await pack(ids.clientD, 1);
    const a = await rdv([ids.clientD], 5);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'annule_tard', false)`, [a.id]);
    expect(await faites(p)).toBe(0);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'annule_tard', true)`, [a.id]);
    expect(await faites(p)).toBe(1);
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'annule_tard', false)`, [a.id]);
    const appel = await rdv([ids.clientD], 30, 'appel');
    await en(ids.userCoach1, `select public.changer_statut_rendez_vous($1, 'realise')`, [appel.id]);
    expect(await faites(p)).toBe(0);
    expect(await paiements(appel.id)).toEqual([]);
  });

  it('les rendez-vous terminés se clôturent tout seuls et un rendez-vous compté ne se supprime pas', async () => {
    const avant = await total(ids.clientD);
    const a = await rdv([ids.clientD], 72);
    await db.exec(`update public.rendez_vous set debut = now() - interval '2 hours', fin = now() - interval '1 hour' where id = '${a.id}'`);
    expect((await en(ids.userCoach1, `select public.cloturer_mes_rendez_vous() as n`)).rows[0].n).toBeGreaterThanOrEqual(1);
    expect(await statut(a.id)).toBe('realise');
    expect(await total(ids.clientD)).toBe(avant + 1);
    await en(ids.userCoach1, `delete from public.rendez_vous where id = $1`, [a.id]);
    expect(await statut(a.id)).toBe('realise');
  });
});
