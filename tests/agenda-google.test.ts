/// <reference types="node" />
// Agenda, synchro Google : droits sur les tables Google, suivi des changements à recopier, traduction des événements.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evenementGoogle, idEvenement, minuitParis, occupationsGoogle, retireDeGoogle, retourAutorise } from '../src/domain/agenda-google';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
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
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom) values ('${ids.clientA}', '${ids.coach1}', 'Inès'), ('${ids.clientB}', '${ids.coach1}', 'Bruno');
    insert into public.google_agenda (coach_id, email, refresh_token) values ('${ids.coach1}', 'sylvain@gmail.com', 'secret-1'), ('${ids.coach2}', 'autre@gmail.com', 'secret-2');
    insert into public.google_occupations (coach_id, id, debut, fin, titre) values
      ('${ids.coach1}', 'e1', now() + interval '1 day', now() + interval '1 day 1 hour', 'Dentiste'),
      ('${ids.coach2}', 'e2', now() + interval '1 day', now() + interval '1 day 1 hour', 'Perso de l’autre');
  `);
});

afterAll(async () => {
  await db.close();
});

async function rdv(clients: string[]) {
  const { rows } = await en(ids.userCoach1, `insert into public.rendez_vous (debut, fin) values (now() + interval '2 days', now() + interval '2 days 1 hour') returning id`);
  const id = rows[0].id as string;
  for (const c of clients) await en(ids.userCoach1, `insert into public.rendez_vous_participants (rendez_vous_id, client_id) values ($1, $2)`, [id, c]);
  return id;
}
const ligne = async (id: string) =>
  (await db.query<{ maj_le: string; google_synchro_le: string | null }>(`select maj_le::text, google_synchro_le::text from public.rendez_vous where id = $1`, [id])).rows[0];

describe('Synchro Google : base', () => {
  it('le jeton Google reste invisible pour le coach, qui ne voit que l’état de sa connexion', async () => {
    await expect(en(ids.userCoach1, `select refresh_token from public.google_agenda`)).rejects.toThrow();
    const { rows } = await en(ids.userCoach1, `select * from public.mon_google_agenda()`);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('sylvain@gmail.com');
    expect(rows[0]).not.toHaveProperty('refresh_token');
  });

  it('le coach lit ses seuls créneaux Google et ne peut pas en écrire', async () => {
    const { rows } = await en(ids.userCoach1, `select titre from public.google_occupations`);
    expect(rows.map((r) => r.titre)).toEqual(['Dentiste']);
    await expect(en(ids.userCoach1, `insert into public.google_occupations (coach_id, id, debut, fin) values ('${ids.coach1}', 'x', now(), now() + interval '1 hour')`)).rejects.toThrow();
    await expect(en(ids.userCoach1, `select * from public.google_connexions`)).rejects.toThrow();
  });

  it('le coach ne peut pas écrire lui-même les colonnes de la synchro', async () => {
    const id = await rdv([ids.clientA]);
    await expect(en(ids.userCoach1, `update public.rendez_vous set google_event_id = 'x' where id = $1`, [id])).rejects.toThrow();
  });

  it('une date de synchro ou d’envoi ne compte pas comme une modification ; un changement de lieu, si', async () => {
    const id = await rdv([ids.clientA]);
    await db.exec(`update public.rendez_vous set maj_le = '2026-01-01T00:00:00Z' where id = '${id}'`);
    await db.exec(`update public.rendez_vous set google_synchro_le = '2026-01-02T00:00:00Z', google_event_id = 'abc', invitation_envoyee_le = now() where id = '${id}'`);
    expect((await ligne(id)).maj_le).toMatch(/^2026-01-01/);
    await en(ids.userCoach1, `update public.rendez_vous set lieu = 'Parc' where id = $1`, [id]);
    expect(Date.parse((await ligne(id)).maj_le)).toBeGreaterThan(Date.parse('2026-01-02T00:00:00Z'));
  });

  it('ajouter une personne remet le rendez-vous dans la file de la synchro', async () => {
    const id = await rdv([ids.clientA]);
    await db.exec(`update public.rendez_vous set google_synchro_le = now() where id = '${id}'`);
    await en(ids.userCoach1, `insert into public.rendez_vous_participants (rendez_vous_id, client_id) values ($1, $2)`, [id, ids.clientB]);
    expect((await ligne(id)).google_synchro_le).toBeNull();
  });

  it('un rendez-vous supprimé laisse son événement Google à retirer', async () => {
    const id = await rdv([ids.clientA]);
    await db.exec(`update public.rendez_vous set google_event_id = 'evt123', google_synchro_le = now() where id = '${id}'`);
    await en(ids.userCoach1, `delete from public.rendez_vous where id = $1`, [id]);
    const { rows } = await db.query(`select event_id from public.google_suppressions where coach_id = $1`, [ids.coach1]);
    expect(rows).toEqual([{ event_id: 'evt123' }]);
  });
});

describe('Synchro Google : événements', () => {
  const base = { id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', type: 'seance' as const, debut: '2026-11-03T17:00:00.000Z', fin: '2026-11-03T18:00:00.000Z', lieu: 'Parc', note: '', statut: 'confirme', prenoms: ['Léa', 'Thomas'] };

  it('identifiant Google stable et valide (lettres a-v et chiffres, 5 caractères ou plus)', () => {
    const id = idEvenement(base.id);
    expect(id).toBe('1b4e28ba2fa141d2883f0016d3cca427');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it('séance : titre avec les prénoms, lieu, marque de l’app, sans lien Meet', () => {
    const e = evenementGoogle(base, 'https://exemple.fr');
    expect(e.summary).toBe('Séance · Léa et Thomas');
    expect(e.location).toBe('Parc');
    expect(e.extendedProperties.private.coachgo).toBe(base.id);
    expect(e).not.toHaveProperty('conferenceData');
    expect(e.description).toContain('Statut : confirmé');
  });

  it('visio sans lien : demande de lien Meet ; avec lien : rien à créer', () => {
    expect(evenementGoogle({ ...base, type: 'visio', lieu: '' })).toHaveProperty('conferenceData.createRequest.conferenceSolutionKey.type', 'hangoutsMeet');
    expect(evenementGoogle({ ...base, type: 'visio', lienVisio: 'https://meet.google.com/abc' })).not.toHaveProperty('conferenceData');
  });

  it('proposé : couleur à part ; annulé ou refusé : retiré de Google', () => {
    expect(evenementGoogle({ ...base, statut: 'propose' }).colorId).toBe('5');
    expect(retireDeGoogle('annule') && retireDeGoogle('refuse')).toBe(true);
    expect(retireDeGoogle('annule_tard') || retireDeGoogle('realise')).toBe(false);
  });

  it('créneaux perso : ignore les événements de l’app, annulés, « disponible » ou refusés', () => {
    const o = occupationsGoogle([
      { id: 'a', summary: 'Dentiste', start: { dateTime: '2026-11-04T09:00:00+01:00' }, end: { dateTime: '2026-11-04T10:00:00+01:00' } },
      { id: 'b', summary: 'Séance', start: { dateTime: '2026-11-04T11:00:00+01:00' }, end: { dateTime: '2026-11-04T12:00:00+01:00' }, extendedProperties: { private: { coachgo: 'x' } } },
      { id: 'c', status: 'cancelled' },
      { id: 'd', transparency: 'transparent', start: { date: '2026-11-05' }, end: { date: '2026-11-06' } },
      { id: 'e', start: { dateTime: '2026-11-04T13:00:00+01:00' }, end: { dateTime: '2026-11-04T14:00:00+01:00' }, attendees: [{ self: true, responseStatus: 'declined' }] },
      { id: 'f', summary: 'Vacances', start: { date: '2026-11-10' }, end: { date: '2026-11-12' } },
      { id: 'g', start: { dateTime: '2026-11-04T15:00:00+01:00' }, end: { dateTime: '2026-11-04T16:00:00+01:00' } },
    ]);
    expect(o.map((x) => x.id)).toEqual(['a', 'f', 'g']);
    expect(o[0]).toEqual({ id: 'a', debut: '2026-11-04T08:00:00.000Z', fin: '2026-11-04T09:00:00.000Z', titre: 'Dentiste', journee: false });
    expect(o[1]).toMatchObject({ debut: '2026-11-09T23:00:00.000Z', fin: '2026-11-11T23:00:00.000Z', journee: true });
    expect(o[2].titre).toBe('Occupé');
  });

  it('minuit à Paris, en hiver comme en été', () => {
    expect(minuitParis('2026-01-15')).toBe('2026-01-14T23:00:00.000Z');
    expect(minuitParis('2026-07-15')).toBe('2026-07-14T22:00:00.000Z');
  });

  it('retour après connexion : seulement l’app ou son site', () => {
    const site = 'https://sylvainschietse.github.io/Coach-os-mobile';
    expect(retourAutorise('coachos://coach', site)).toBe(true);
    expect(retourAutorise(`${site}/coach`, site)).toBe(true);
    expect(retourAutorise('https://sylvainschietse.github.io/Coach-os-mobile-pirate/coach', site)).toBe(false);
    expect(retourAutorise('https://exemple.com', site)).toBe(false);
  });

  it('la copie de la fonction Edge est identique', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    expect(lire('supabase/functions/_shared/agenda-google.ts')).toBe(lire('src/domain/agenda-google.ts'));
  });
});
