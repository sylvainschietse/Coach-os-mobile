/// <reference types="node" />
// Newsletters dans un vrai Postgres (PGlite) : chacun ses newsletters, rien ne se modifie après l'envoi, destinataires
// par type de client, et lien « Ne plus recevoir ces nouvelles » sans compte. Données fictives.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userClient: '10000000-0000-4000-8000-000000000003',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  client: '30000000-0000-4000-8000-000000000001',
  actif: '40000000-0000-4000-8000-0000000000a1',
  veille: '40000000-0000-4000-8000-0000000000a2',
  prospect: '40000000-0000-4000-8000-0000000000a3',
  archive: '40000000-0000-4000-8000-0000000000a4',
  autreCoach: '40000000-0000-4000-8000-0000000000b1',
  newsletter: '50000000-0000-4000-8000-000000000001',
};

let db: PGlite;

async function en(role: 'anon' | 'authenticated' | 'service_role', userId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; set role ${role}; select set_config('test.uid', '${userId ?? ''}', false);`);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const coach1 = (sql: string, params: unknown[] = []) => en('authenticated', ids.userCoach1, sql, params);
const coach2 = (sql: string, params: unknown[] = []) => en('authenticated', ids.userCoach2, sql, params);

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
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update on all tables in schema public to service_role;
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClient}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, user_id, prenom, email) values ('${ids.client}', '${ids.coach1}', '${ids.userClient}', 'Inès', 'ines@appli.test');
    insert into public.contacts (id, coach_id, prenom, email, statut, statut_crm, client_id) values
      ('${ids.actif}', '${ids.coach1}', 'Inès', null, 'client', null, '${ids.client}'),
      ('${ids.veille}', '${ids.coach1}', 'Paul', 'paul@x.test', 'booster_fait', 'En veille', null),
      ('${ids.prospect}', '${ids.coach1}', 'Zoé', 'zoe@x.test', 'prospect', null, null),
      ('${ids.archive}', '${ids.coach1}', 'Max', 'max@x.test', 'archive', 'En veille', null),
      ('${ids.autreCoach}', '${ids.coach2}', 'Léo', 'leo@x.test', 'client', null, null);
  `);
});

afterAll(async () => {
  await db.close();
});

const destinataires = async () =>
  (await en('service_role', null, `select contact_id, prenom, email, user_id from public.destinataires_newsletter($1) order by prenom`, [ids.newsletter])).rows;

describe('newsletters', () => {
  it('le coach programme une newsletter ; un autre coach ne la voit pas', async () => {
    await coach1(
      `insert into public.newsletters (id, rubrique, objet, chapeau, message, cibles, par_email, par_notif, envoi_le, etat)
       values ($1, 'Conseil', 'Le squat', 'Intro', 'Texte', array['clients'], true, true, now() + interval '1 day', 'programmee')`,
      [ids.newsletter],
    );
    expect((await coach1('select count(*)::int n from public.newsletters')).rows[0].n).toBe(1);
    expect((await coach2('select count(*)::int n from public.newsletters')).rows[0].n).toBe(0);
    await coach2(`update public.newsletters set objet = 'Piraté' where id = $1`, [ids.newsletter]);
    expect((await coach1('select objet from public.newsletters')).rows[0].objet).toBe('Le squat');
  });

  it('le coach ne peut ni se déclarer « envoyée » ni toucher aux compteurs', async () => {
    await expect(coach1(`update public.newsletters set etat = 'envoyee' where id = $1`, [ids.newsletter])).rejects.toThrow();
    await expect(coach1(`update public.newsletters set nb_emails = 999 where id = $1`, [ids.newsletter])).rejects.toThrow();
    await expect(coach1(`update public.newsletters set message = '' where id = $1`, [ids.newsletter])).rejects.toThrow();
  });

  it('clients actifs : le client du coach, avec l’e-mail de sa fiche client ; ni prospect, ni archivé, ni autre coach', async () => {
    expect(await destinataires()).toEqual([{ contact_id: ids.actif, prenom: 'Inès', email: 'ines@appli.test', user_id: ids.userClient }]);
  });

  it('en veille : la personne rangée « En veille », jamais un dossier archivé', async () => {
    await coach1(`update public.newsletters set cibles = array['veille'] where id = $1`, [ids.newsletter]);
    expect((await destinataires()).map((d) => d.prenom)).toEqual(['Paul']);
    await coach1(`update public.newsletters set cibles = array['clients', 'veille'] where id = $1`, [ids.newsletter]);
    expect((await destinataires()).map((d) => d.prenom)).toEqual(['Inès', 'Paul']);
  });

  it('les destinataires restent réservés au serveur', async () => {
    await expect(coach1(`select * from public.destinataires_newsletter($1)`, [ids.newsletter])).rejects.toThrow();
  });

  it('le lien de désabonnement marche sans compte et rend le nom du coach', async () => {
    const jeton = (await coach1(`select jeton_newsletter j from public.contacts where id = $1`, [ids.veille])).rows[0].j;
    expect((await en('anon', null, `select public.desabonner_newsletter($1) as c`, [jeton])).rows[0].c).toBe('Sylvain');
    expect((await coach1(`select newsletter_coupee_le is not null as d from public.contacts where id = $1`, [ids.veille])).rows[0].d).toBe(true);
    await expect(en('anon', null, `select public.desabonner_newsletter($1)`, ['00000000-0000-4000-8000-000000000000'])).rejects.toThrow(/Lien inconnu/);
    // Le coach peut le réabonner à sa demande ; un autre coach, non.
    await coach2(`select public.reabonner_newsletter($1)`, [ids.veille]);
    expect((await coach1(`select newsletter_coupee_le is not null as d from public.contacts where id = $1`, [ids.veille])).rows[0].d).toBe(true);
    await coach1(`select public.reabonner_newsletter($1)`, [ids.veille]);
    expect((await coach1(`select newsletter_coupee_le from public.contacts where id = $1`, [ids.veille])).rows[0].newsletter_coupee_le).toBeNull();
  });

  it('une fois partie, la newsletter ne se modifie plus et ne s’efface plus', async () => {
    await db.exec(`update public.newsletters set etat = 'envoyee', envoyee_le = now() where id = '${ids.newsletter}'`);
    await coach1(`update public.newsletters set objet = 'Changé' where id = $1`, [ids.newsletter]);
    await coach1(`delete from public.newsletters where id = $1`, [ids.newsletter]);
    expect((await coach1('select objet from public.newsletters')).rows).toEqual([{ objet: 'Le squat' }]);
  });

  it('une personne ne reçoit jamais deux fois la même newsletter', async () => {
    await en('service_role', null, `insert into public.newsletters_envois (newsletter_id, contact_id) values ($1, $2)`, [ids.newsletter, ids.actif]);
    await expect(en('service_role', null, `insert into public.newsletters_envois (newsletter_id, contact_id) values ($1, $2)`, [ids.newsletter, ids.actif])).rejects.toThrow();
    expect((await coach1('select count(*)::int n from public.newsletters_envois')).rows[0].n).toBe(1);
    expect((await coach2('select count(*)::int n from public.newsletters_envois')).rows[0].n).toBe(0);
  });

  it('la notification passe par le serveur seul', async () => {
    await expect(coach1(`select public.notifier_newsletter($1, 'T', 'C')`, [ids.userClient])).rejects.toThrow();
    await en('service_role', null, `select public.notifier_newsletter($1, 'Le squat', 'Intro')`, [ids.userClient]);
    const n = await en('authenticated', ids.userClient, `select genre, titre, url from public.notifications`);
    expect(n.rows).toEqual([{ genre: 'newsletter', titre: 'Le squat', url: '/client' }]);
  });
});
