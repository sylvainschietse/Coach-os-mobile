/// <reference types="node" />
// Lot 5 dans un vrai Postgres (PGlite) : profil alimentaire et objectifs du coach, semaine choisie par le client,
// journal et recettes personnelles. Versions, double envoi et droits d'accès.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { blankPreferences, nutritionToday } from '../src/domain/nutrition/calcul';
import { monday } from '../src/domain/nutrition/recettes';

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

const prefs = (p: Partial<ReturnType<typeof blankPreferences>> = {}) =>
  JSON.stringify({ ...blankPreferences(), sexe: 'femme', age: 34, poids: 62, taille: 168, activite: 'moderee', ...p });
const profil = (user: string, client: string, action: string, version: string, envoi: string, p: string | null = null, o: object | null = null) =>
  en(user, `select public.enregistrer_profil_alimentaire($1, $2, $3::jsonb, $4::jsonb, $5, $6)`, [client, action, p, o && JSON.stringify(o), version, envoi]);
const lireProfil = async (client: string) =>
  (await db.query<{ preferences: any; objectifs: any; version: string }>(`select * from public.profils_alimentaires where client_id = $1`, [client])).rows[0];
const semaine = monday();
const repas = { recipeId: 'r1', variantId: 'original', portions: 1, slot: 'lunch' };
const plan = (n = 1) => JSON.stringify(Array.from({ length: 7 }, (_, i) => (i === 0 ? Array(n).fill(repas) : [])));

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
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach1}', 'Bruno', '${ids.userClientB}');
    insert into public.mensurations (client_id, date, poids_kg) values ('${ids.clientA}', '${nutritionToday()}'::date - 10, 64);
  `);
});

afterAll(async () => {
  await db.close();
});

describe('profil alimentaire', () => {
  it('le coach ne fixe pas d’objectifs avant que le client ait enregistré son profil', async () => {
    await expect(profil(ids.userCoach1, ids.clientA, 'coach', '', 'envoi-coach-0', null, { calories: 2000 })).rejects.toThrow(/d’abord enregistrer/);
  });

  it('le client enregistre ; le poids rejoint Mesures une seule fois, et l’âge garde sa date de saisie', async () => {
    await profil(ids.userClientA, ids.clientA, 'preferences', '', 'envoi-client-1', prefs());
    // Double envoi : rien de plus.
    await profil(ids.userClientA, ids.clientA, 'preferences', '', 'envoi-client-1', prefs());
    const p = await lireProfil(ids.clientA);
    expect(p.preferences.ageSaisiLe).toBe(nutritionToday());
    expect(p.preferences.poids).toBe(62);
    const m = await db.query<{ poids_kg: string; envoi_id: string }>(`select poids_kg, envoi_id from public.mensurations where client_id = $1 order by date`, [ids.clientA]);
    expect(m.rows.map((r) => Number(r.poids_kg))).toEqual([64, 62]);
    expect(m.rows[1].envoi_id).toBe('nutrition:envoi-client-1');

    // Même poids : aucune nouvelle mesure.
    await profil(ids.userClientA, ids.clientA, 'preferences', p.version, 'envoi-client-2', prefs({ objectif: 'perte' }));
    expect((await db.query(`select 1 from public.mensurations where client_id = $1`, [ids.clientA])).rows).toHaveLength(2);
  });

  it('une version périmée est refusée', async () => {
    await expect(profil(ids.userClientA, ids.clientA, 'preferences', 'ancienne', 'envoi-client-3', prefs())).rejects.toThrow(/Le profil a changé/);
  });

  it('seul le coach du client fixe ou retire les objectifs, avec une répartition de 100 %', async () => {
    const v = (await lireProfil(ids.clientA)).version;
    const objectif = { calories: 1900, proteinesPct: 25, lipidesPct: 30, glucidesPct: 45, note: 'Point de départ' };
    await expect(profil(ids.userClientA, ids.clientA, 'coach', v, 'envoi-x-1', null, objectif)).rejects.toThrow(/Réservé au coach/);
    await expect(profil(ids.userCoach2, ids.clientA, 'coach', v, 'envoi-x-2', null, objectif)).rejects.toThrow(/Réservé au coach/);
    await expect(profil(ids.userCoach1, ids.clientA, 'coach', v, 'envoi-x-3', null, { ...objectif, glucidesPct: 50 })).rejects.toThrow(/100 %/);
    await profil(ids.userCoach1, ids.clientA, 'coach', v, 'envoi-x-4', null, objectif);
    const p = await lireProfil(ids.clientA);
    expect(p.objectifs.calories).toBe(1900);
    expect(p.preferences.objectif).toBe('perte');
    await profil(ids.userCoach1, ids.clientA, 'auto', p.version, 'envoi-x-5');
    expect((await lireProfil(ids.clientA)).objectifs).toBeNull();
  });

  it('chacun ne lit que son dossier, et personne n’écrit la table directement', async () => {
    expect((await en(ids.userClientA, `select client_id from public.profils_alimentaires`)).rows).toHaveLength(1);
    expect((await en(ids.userClientB, `select client_id from public.profils_alimentaires`)).rows).toHaveLength(0);
    expect((await en(ids.userCoach1, `select client_id from public.profils_alimentaires`)).rows).toHaveLength(1);
    expect((await en(ids.userCoach2, `select client_id from public.profils_alimentaires`)).rows).toHaveLength(0);
    await expect(en(ids.userClientB, `select public.enregistrer_profil_alimentaire($1, 'preferences', $2::jsonb, null, '', 'envoi-b-0001')`, [ids.clientA, prefs()])).rejects.toThrow(
      /hors de votre dossier/,
    );
    await expect(en(ids.userClientA, `update public.profils_alimentaires set objectifs = '{}'`)).rejects.toThrow(/permission/);
  });
});

describe('semaine choisie par le client', () => {
  it('enregistre, refuse une version périmée et ignore un double envoi', async () => {
    const v1 = (await en(ids.userClientA, `select public.enregistrer_plan_alimentaire($1, $2::date, $3::jsonb, '', 'plan-envoi-1') as v`, [ids.clientA, semaine, plan()])).rows[0]
      .v as string;
    const encore = (await en(ids.userClientA, `select public.enregistrer_plan_alimentaire($1, $2::date, $3::jsonb, '', 'plan-envoi-1') as v`, [ids.clientA, semaine, plan(2)]))
      .rows[0].v;
    expect(encore).toBe(v1);
    await expect(en(ids.userCoach1, `select public.enregistrer_plan_alimentaire($1, $2::date, $3::jsonb, '', 'plan-envoi-2')`, [ids.clientA, semaine, plan(2)])).rejects.toThrow(
      /a été modifié/,
    );
    // Le coach du client peut aussi le modifier, comme dans l'original.
    await en(ids.userCoach1, `select public.enregistrer_plan_alimentaire($1, $2::date, $3::jsonb, $4, 'plan-envoi-3')`, [ids.clientA, semaine, plan(2), v1]);
    const r = await en(ids.userClientA, `select plan from public.plans_alimentaires where client_id = $1`, [ids.clientA]);
    expect((r.rows[0].plan as unknown[][])[0]).toHaveLength(2);
  });

  it('refuse un autre jour qu’un lundi, plus de 12 repas par jour, des portions hors limites et un autre dossier', async () => {
    const mardi = new Date(`${semaine}T12:00:00Z`);
    mardi.setUTCDate(mardi.getUTCDate() + 1);
    const appel = (user: string, client: string, s: string, p: string) =>
      en(user, `select public.enregistrer_plan_alimentaire($1, $2::date, $3::jsonb, '', 'plan-envoi-x')`, [client, s, p]);
    await expect(appel(ids.userClientB, ids.clientB, mardi.toISOString().slice(0, 10), plan())).rejects.toThrow(/lundi/);
    await expect(appel(ids.userClientB, ids.clientB, semaine, plan(13))).rejects.toThrow(/12 éléments/);
    await expect(appel(ids.userClientB, ids.clientB, semaine, JSON.stringify([[{ ...repas, portions: 5 }], [], [], [], [], [], []]))).rejects.toThrow(/inconnue/);
    await expect(appel(ids.userClientB, ids.clientA, semaine, plan())).rejects.toThrow(/hors de votre dossier/);
    await expect(appel(ids.userCoach2, ids.clientB, semaine, plan())).rejects.toThrow(/hors de votre dossier/);
  });
});

describe('journal et recettes personnelles', () => {
  const entree = (id: string) => ({
    id,
    meal: 'Déjeuner',
    amount: 100,
    food: { name: 'Riz cuit', barcode: '', source: 'manual', reference: '', note: '', basis: 'g', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  });
  const ecrire = (user: string, client: string, type: string, date: string | null, donnees: unknown[], version: number, envoi: string) =>
    en(user, `select public.enregistrer_alimentation_personnelle($1, $2, $3::date, $4::jsonb, $5, $6) as v`, [client, type, date, JSON.stringify(donnees), version, envoi]);

  it('le journal est rangé par jour et versionné', async () => {
    const jour = nutritionToday();
    expect((await ecrire(ids.userClientA, ids.clientA, 'diary', jour, [entree('a')], 0, 'journal-envoi-1')).rows[0].v).toBe(1);
    expect((await ecrire(ids.userClientA, ids.clientA, 'diary', jour, [entree('a')], 0, 'journal-envoi-1')).rows[0].v).toBe(1);
    await expect(ecrire(ids.userClientA, ids.clientA, 'diary', jour, [], 0, 'journal-envoi-2')).rejects.toThrow(/ont changé/);
    expect((await ecrire(ids.userClientA, ids.clientA, 'diary', '2026-01-05', [entree('b')], 0, 'journal-envoi-3')).rows[0].v).toBe(1);
    expect((await ecrire(ids.userClientA, ids.clientA, 'recipes', null, [], 0, 'recettes-envoi-1')).rows[0].v).toBe(1);
    const lignes = await en(ids.userClientA, `select type, cle, version from public.alimentation_personnelle order by cle`);
    expect(lignes.rows).toEqual([
      { type: 'diary', cle: '2026-01-05', version: 1 },
      { type: 'diary', cle: jour, version: 1 },
      { type: 'recipes', cle: 'library', version: 1 },
    ]);
  });

  it('le coach lit et peut écrire, les autres non', async () => {
    expect((await en(ids.userCoach1, `select 1 from public.alimentation_personnelle`)).rows).toHaveLength(3);
    expect((await en(ids.userCoach2, `select 1 from public.alimentation_personnelle`)).rows).toHaveLength(0);
    expect((await en(ids.userClientB, `select 1 from public.alimentation_personnelle`)).rows).toHaveLength(0);
    await expect(ecrire(ids.userClientB, ids.clientA, 'recipes', null, [], 1, 'recettes-envoi-2')).rejects.toThrow(/hors de votre dossier/);
    await expect(ecrire(ids.userClientA, ids.clientA, 'diary', null, [], 0, 'journal-envoi-4')).rejects.toThrow(/Date manquante/);
    expect((await ecrire(ids.userCoach1, ids.clientA, 'recipes', null, [], 1, 'recettes-envoi-3')).rows[0].v).toBe(2);
  });
});
