/// <reference types="node" />
// Corrections du deuxième audit de sécurité (méthode Cloudflare), dans un vrai Postgres (PGlite) : l'e-mail confirmé suit
// sur la fiche, le client ne peut que lire ses tests, le questionnaire ne complète plus une fiche existante, le journal
// d'erreurs ne se remplit plus, et le lien vidéo d'un exercice est une adresse web.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lienAutorise } from '@/domain/liens';

const ids = {
  userCoach: '10000000-0000-4000-8000-000000000001',
  userMarc: '10000000-0000-4000-8000-000000000002',
  userTheo: '10000000-0000-4000-8000-000000000003',
  coach: '20000000-0000-4000-8000-000000000001',
  marc: '30000000-0000-4000-8000-000000000002',
  theo: '30000000-0000-4000-8000-000000000003',
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
    insert into auth.users (id, email) values ('${ids.userMarc}', 'marc@exemple.fr');
    insert into public.clients (id, coach_id, prenom, email, user_id) values ('${ids.marc}', '${ids.coach}', 'Marc', 'marc@exemple.fr', '${ids.userMarc}');
    insert into public.contacts (coach_id, prenom, email, client_id) values ('${ids.coach}', 'Marc', 'marc@exemple.fr', '${ids.marc}');
    insert into auth.users (id, email) values ('${ids.userTheo}', 'theo@exemple.fr');
    insert into public.clients (id, coach_id, prenom, email, email_connexion, user_id)
      values ('${ids.theo}', '${ids.coach}', 'Théo', 'papa@exemple.fr', 'theo@exemple.fr', '${ids.userTheo}');
    insert into public.contacts (coach_id, prenom, email, client_id) values ('${ids.coach}', 'Théo', 'papa@exemple.fr', '${ids.theo}');
  `);
});

afterAll(async () => {
  await db.close();
});

const soumettre = (reponses: Record<string, string>) =>
  en('anon', null, `select public.soumettre_questionnaire('sylvain', $1::jsonb)`, [JSON.stringify(reponses)]);

describe('adresse de connexion à part (un enfant, factures au parent)', () => {
  it('le changement d’e-mail du compte ne touche que l’adresse de connexion, pas celle du parent', async () => {
    await db.exec(`update auth.users set email = 'Theo.Nouveau@exemple.fr' where id = '${ids.userTheo}'`);
    expect((await db.query(`select email, email_connexion from public.clients where id = $1`, [ids.theo])).rows).toEqual([
      { email: 'papa@exemple.fr', email_connexion: 'theo.nouveau@exemple.fr' },
    ]);
    expect((await db.query(`select email from public.contacts where client_id = $1`, [ids.theo])).rows).toEqual([{ email: 'papa@exemple.fr' }]);
  });

  it('refuse une adresse de connexion mal écrite', async () => {
    await expect(db.exec(`update public.clients set email_connexion = 'pas une adresse' where id = '${ids.theo}'`)).rejects.toThrow();
  });
});

describe('changement d’e-mail d’un client', () => {
  it('une fois le nouvel e-mail confirmé, la fiche client et la fiche contact suivent', async () => {
    await db.exec(`update auth.users set email = 'Marc.Nouveau@exemple.fr' where id = '${ids.userMarc}'`);
    expect((await db.query(`select email from public.clients where id = $1`, [ids.marc])).rows).toEqual([{ email: 'marc.nouveau@exemple.fr' }]);
    expect((await db.query(`select email from public.contacts where client_id = $1`, [ids.marc])).rows).toEqual([{ email: 'marc.nouveau@exemple.fr' }]);
  });
});

describe('tests du client', () => {
  it('le client lit ses tests mais ne peut pas les supprimer ; le coach, si', async () => {
    await db.exec(`insert into public.evaluations_client (client_id, notes) values ('${ids.marc}', 'Squat : 90°')`);
    expect((await en('authenticated', ids.userMarc, `select notes from public.evaluations_client`)).rows).toEqual([{ notes: 'Squat : 90°' }]);
    await en('authenticated', ids.userMarc, `delete from public.evaluations_client`);
    expect((await db.query(`select count(*)::int as n from public.evaluations_client`)).rows).toEqual([{ n: 1 }]);
    await en('authenticated', ids.userCoach, `delete from public.evaluations_client`);
    expect((await db.query(`select count(*)::int as n from public.evaluations_client`)).rows).toEqual([{ n: 0 }]);
  });
});

describe('questionnaire public sur une fiche existante', () => {
  it('le téléphone et le nom donnés ne sont pas recopiés : le coach est alerté', async () => {
    await en('authenticated', ids.userCoach, `insert into public.contacts (coach_id, prenom, nom, email) values ($1, 'Julie', 'Martin', 'julie@exemple.fr')`, [ids.coach]);
    await soumettre({ prenom: 'Pirate', nom: 'X', telephone: '06 99 99 99 99', email: 'julie@exemple.fr' });
    const fiche = await db.query(`select prenom, nom, telephone from public.contacts where email = 'julie@exemple.fr'`);
    expect(fiche.rows).toEqual([{ prenom: 'Julie', nom: 'Martin', telephone: null }]);
    const q = await db.query<{ alertes: string[] }>(`select alertes from public.questionnaires order by recu_le desc limit 1`);
    expect(q.rows[0].alertes).toEqual([
      'Téléphone donné dans le questionnaire : 33699999999. Il n’a pas été ajouté à la fiche : vérifie-le avec la personne avant de l’ajouter.',
      'Nom donné dans le questionnaire : Pirate X (fiche : Julie Martin). À vérifier.',
    ]);
  });
});

describe('journal des erreurs du questionnaire', () => {
  const noter = (cle: string) => en('anon', null, `select public.noter_erreur_questionnaire('sylvain', $1, 'erreur')`, [cle]);
  const nombre = async () => (await db.query<{ n: number }>(`select count(*)::int as n from public.journal_automatisations`)).rows[0].n;

  it('au plus 30 erreurs nouvelles par heure', async () => {
    for (let i = 0; i < 31; i++) await noter(`spam:${i}`);
    expect(await nombre()).toBe(30);
  });

  it('au-delà de 200, les plus anciennes laissent la place : une vraie erreur reste visible', async () => {
    await db.exec(`
      insert into public.journal_automatisations (coach_id, flux, cle, etat, maj_le)
      select '${ids.coach}', 'questionnaire', 'vieux:' || i, 'erreur', now() - interval '2 hours' - i * interval '1 minute'
      from generate_series(1, 200) i;
      update public.journal_automatisations set maj_le = now() - interval '2 hours' where cle like 'spam:%';
    `);
    await noter('tally:vraie-erreur');
    expect(await nombre()).toBe(200);
    expect((await db.query(`select count(*)::int as n from public.journal_automatisations where cle = 'tally:vraie-erreur'`)).rows).toEqual([{ n: 1 }]);
  });
});

describe('liens', () => {
  it('le lien vidéo d’un nouvel exercice doit être une adresse web', async () => {
    await expect(db.exec(`insert into public.exercices (nom, mesures, video_url) values ('Test', array['repetitions'], 'javascript:alert(1)')`)).rejects.toThrow(/video_url_web/);
    await db.exec(`insert into public.exercices (nom, mesures, video_url) values ('Test', array['repetitions'], 'https://youtu.be/abc')`);
  });

  it('l’appli n’ouvre que les liens web, téléphone, e-mail, SMS et WhatsApp', () => {
    for (const ok of ['https://youtu.be/abc', 'http://exemple.fr', 'tel:+33600000001', 'mailto:a@b.fr', 'sms:+33600000001', 'whatsapp://send?phone=33600000001'])
      expect(lienAutorise(ok)).toBe(true);
    for (const non of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'intent://x'])
      expect(lienAutorise(non)).toBe(false);
  });
});
