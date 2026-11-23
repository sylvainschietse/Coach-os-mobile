/// <reference types="node" />
// Activités sportives dans un vrai Postgres (PGlite) : envoi par le client, renvoi sans doublon, lecture par le coach,
// cloisonnement entre clients et coachs, activité retirée.
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

const course = (r: Record<string, unknown> = {}) => ({
  source: 'health_connect',
  idExterne: 'hc-1',
  sport: 'course',
  titre: 'Sortie du matin',
  debut: '2026-10-28T06:30:00Z',
  dureeS: 3070,
  distanceM: 10000,
  deniveleM: 85,
  fcMoy: 152,
  fcMax: 176,
  appareil: 'com.garmin.android.apps.connectmobile',
  ...r,
});
const envoyer = (user: string, lot: unknown[]) => en(user, `select public.enregistrer_activites($1::jsonb) as n`, [JSON.stringify(lot)]);

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

describe('activités sportives', () => {
  it('le client envoie ses courses ; un nouvel envoi met à jour sans dupliquer', async () => {
    expect((await envoyer(ids.userClientA, [course(), course({ idExterne: 'hc-2', sport: 'velo', distanceM: 40000, dureeS: 5400 })])).rows[0].n).toBe(2);
    expect((await envoyer(ids.userClientA, [course({ distanceM: 10050 })])).rows[0].n).toBe(1);
    const { rows } = await en(ids.userClientA, `select id_externe, distance_m, coach_id from public.activites_sport order by id_externe`);
    expect(rows).toEqual([
      { id_externe: 'hc-1', distance_m: 10050, coach_id: ids.coach1 },
      { id_externe: 'hc-2', distance_m: 40000, coach_id: ids.coach1 },
    ]);
  });

  it('le coach voit les activités de ses clients, pas celles des autres', async () => {
    await envoyer(ids.userClientB, [course({ idExterne: 'hc-b' })]);
    expect((await en(ids.userCoach1, `select count(*)::int as n from public.activites_sport`)).rows[0].n).toBe(2);
    expect((await en(ids.userCoach2, `select id_externe from public.activites_sport`)).rows).toEqual([{ id_externe: 'hc-b' }]);
    expect((await en(ids.userClientB, `select count(*)::int as n from public.activites_sport`)).rows[0].n).toBe(1);
  });

  it('écriture directe refusée, valeurs hors bornes refusées', async () => {
    await expect(en(ids.userClientA, `delete from public.activites_sport`)).rejects.toThrow();
    await expect(en(ids.userClientA, `update public.activites_sport set distance_m = 0`)).rejects.toThrow();
    await expect(envoyer(ids.userClientA, [course({ idExterne: 'x', fcMoy: 400 })])).rejects.toThrow();
    await expect(envoyer(ids.userClientA, [course({ idExterne: 'y', debut: '2099-01-01T00:00:00Z' })])).rejects.toThrow('Date de début invalide');
    await expect(envoyer(ids.userCoach1, [course()])).rejects.toThrow('hors de ton dossier');
  });

  it('une activité retirée disparaît et ne revient pas au prochain envoi', async () => {
    const id = (await en(ids.userClientA, `select id from public.activites_sport where id_externe = 'hc-2'`)).rows[0].id;
    await expect(en(ids.userClientB, `select public.retirer_activite($1)`, [id])).rejects.toThrow('introuvable');
    await en(ids.userClientA, `select public.retirer_activite($1)`, [id]);
    expect((await envoyer(ids.userClientA, [course({ idExterne: 'hc-2', sport: 'velo' })])).rows[0].n).toBe(0);
    expect((await en(ids.userClientA, `select id_externe from public.activites_sport`)).rows).toEqual([{ id_externe: 'hc-1' }]);
    expect((await en(ids.userCoach1, `select id_externe from public.activites_sport`)).rows).toEqual([{ id_externe: 'hc-1' }]);
  });
});

describe('activités libres', () => {
  const idLibre = '40000000-0000-4000-8000-000000000001';
  const maintenant = new Date(Date.now() - 2 * 3600e3).toISOString();
  const libre = (r: Record<string, unknown> = {}) => ({
    id: idLibre,
    sport: 'musculation',
    titre: 'Séance de musculation',
    debut: maintenant,
    dureeS: 3600,
    ressenti: 7,
    calories: 320,
    note: 'Bonne séance',
    exercices: [{ exerciceId: null, nom: 'Squat', series: [{ repetitions: 10, charge: 40 }, { repetitions: 8, charge: 45 }] }],
    ...r,
  });
  const ajouter = (user: string, a: unknown) => en(user, `select public.enregistrer_activite_libre($1::jsonb) as id`, [JSON.stringify(a)]);

  it('le client ajoute une séance libre, la corrige sans la dupliquer, et son coach la voit', async () => {
    expect((await ajouter(ids.userClientA, libre())).rows[0].id).toBe(idLibre);
    await ajouter(ids.userClientA, libre({ titre: 'Muscu jambes', ressenti: 8 }));
    const { rows } = await en(ids.userCoach1, `select source, sport, titre, ressenti, calories, note, exercices from public.activites_sport where id = $1`, [idLibre]);
    expect(rows).toEqual([
      {
        source: 'manuel',
        sport: 'musculation',
        titre: 'Muscu jambes',
        ressenti: 8,
        calories: 320,
        note: 'Bonne séance',
        exercices: [{ exerciceId: null, nom: 'Squat', series: [{ repetitions: 10, charge: 40 }, { repetitions: 8, charge: 45 }] }],
      },
    ]);
    expect((await en(ids.userCoach2, `select count(*)::int as n from public.activites_sport where id = $1`, [idLibre])).rows[0].n).toBe(0);
  });

  it('les nouveaux types d’activité sont acceptés (cours collectif, aquatique, raquette…)', async () => {
    for (const [i, sport] of ['cours', 'yoga', 'aquatique', 'raquette', 'sport_co', 'combat', 'danse', 'glisse'].entries()) {
      const id = `40000000-0000-4000-8000-00000000010${i}`;
      await ajouter(ids.userClientA, libre({ id, sport, titre: sport, exercices: [] }));
    }
    expect((await en(ids.userClientA, `select count(*)::int as n from public.activites_sport where source = 'manuel'`)).rows[0].n).toBe(9);
  });

  it('un autre client ne peut ni modifier ni retirer l’activité ; une activité importée ne peut pas être réécrite', async () => {
    await expect(ajouter(ids.userClientB, libre({ titre: 'piratée' }))).rejects.toThrow('introuvable');
    const hc = (await en(ids.userClientA, `select id from public.activites_sport where id_externe = 'hc-1'`)).rows[0].id;
    await expect(ajouter(ids.userClientA, libre({ id: hc }))).rejects.toThrow('introuvable');
    await expect(ajouter(ids.userCoach1, libre({ id: '40000000-0000-4000-8000-000000000999' }))).rejects.toThrow('hors de ton dossier');
  });

  it('valeurs invalides refusées', async () => {
    const id = '40000000-0000-4000-8000-000000000002';
    await expect(ajouter(ids.userClientA, libre({ id, ressenti: 11 }))).rejects.toThrow();
    await expect(ajouter(ids.userClientA, libre({ id, dureeS: 10 }))).rejects.toThrow('Durée invalide');
    await expect(ajouter(ids.userClientA, libre({ id, debut: '2099-01-01T00:00:00Z' }))).rejects.toThrow('futur');
    await expect(ajouter(ids.userClientA, libre({ id, sport: 'quidditch' }))).rejects.toThrow();
    await expect(ajouter(ids.userClientA, libre({ id, exercices: [{ nom: 'Squat', series: [{ repetitions: 'dix' }] }] }))).rejects.toThrow('Série invalide');
    await expect(ajouter(ids.userClientA, libre({ id, exercices: [{ nom: 'Squat', series: [{ poids: 10 }] }] }))).rejects.toThrow('Série invalide');
    await expect(ajouter(ids.userClientA, libre({ id, exercices: [{ nom: '', series: [] }] }))).rejects.toThrow('Exercice invalide');
  });

  it('une activité libre retirée ne peut plus être modifiée', async () => {
    await en(ids.userClientA, `select public.retirer_activite($1)`, [idLibre]);
    await expect(ajouter(ids.userClientA, libre())).rejects.toThrow('introuvable');
    expect((await en(ids.userCoach1, `select count(*)::int as n from public.activites_sport where id = $1`, [idLibre])).rows[0].n).toBe(0);
  });
});
