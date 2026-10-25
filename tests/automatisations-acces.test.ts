/// <reference types="node" />
// Lot 6 : réception Tally rejouable et journal d'envoi des comptes rendus dans un vrai Postgres (PGlite). Données fictives.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  contact: '40000000-0000-4000-8000-0000000000a1',
  document: '60000000-0000-4000-8000-000000000001',
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

const recevoir = (lien: string, envoi: string, reponses: object) =>
  en('anon', null, 'select public.recevoir_questionnaire_externe($1, $2, $3::jsonb) as r', [lien, envoi, JSON.stringify(reponses)]);
const coach = (sql: string, params: unknown[] = []) => en('authenticated', ids.userCoach1, sql, params);

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
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dossier, f), 'utf8'));
  await db.exec(`
    grant usage on schema public to anon;
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.contacts (id, coach_id, prenom, telephone, email) values
      ('${ids.contact}', '${ids.coach1}', 'Inès', '33655443399', 'ines@exemple.test');
    insert into public.documents (id, coach_id, contact_id, nom, type, version) values
      ('${ids.document}', '${ids.coach1}', '${ids.contact}', 'Compte rendu · Inès', 'Plan d''action', 2);
  `);
});

afterAll(async () => {
  await db.close();
});

describe('réception Tally', () => {
  const reponses = { prenom: 'Nora', nom: 'Test', telephone: '06 11 22 33 44', email: 'nora@exemple.test', source: 'Tally', objectif: 'Énergie' };

  it('une réponse crée la fiche et le questionnaire, marqués Tally', async () => {
    expect((await recevoir('sylvain', 'tally:abc123', reponses)).rows[0].r).toBe('recu');
    const q = await coach(`select q.envoi_id, q.source, c.prenom from public.questionnaires q join public.contacts c on c.id = q.contact_id`);
    expect(q.rows).toEqual([{ envoi_id: 'tally:abc123', source: 'tally', prenom: 'Nora' }]);
  });

  it('la même réponse rejouée ne crée ni fiche ni questionnaire de plus', async () => {
    expect((await recevoir('sylvain', 'tally:abc123', reponses)).rows[0].r).toBe('deja_recu');
    expect((await coach('select count(*)::int n from public.questionnaires')).rows[0].n).toBe(1);
    expect((await coach(`select count(*)::int n from public.contacts where prenom = 'Nora'`)).rows[0].n).toBe(1);
  });

  it('même téléphone et nouvel e-mail : la fiche existante est complétée, aucune nouvelle fiche', async () => {
    expect((await recevoir('sylvain', 'tally:ines2', { prenom: 'Inès', telephone: '+33 6 55 44 33 99', email: 'ines.pro@exemple.test' })).rows[0].r).toBe('recu');
    const c = await coach(`select id, email from public.contacts where telephone = '33655443399'`);
    expect(c.rows).toHaveLength(1);
    // La fiche avait déjà un e-mail : il n'est pas écrasé, la différence est signalée au coach.
    expect(c.rows[0].email).toBe('ines@exemple.test');
    const q = await coach(`select contact_id, alertes from public.questionnaires where envoi_id = 'tally:ines2'`);
    expect(q.rows[0].contact_id).toBe(ids.contact);
    expect(String(q.rows[0].alertes)).toMatch(/E-mail différent/);
  });

  it('refuse un identifiant de réponse qui ne vient pas de Tally et un lien inconnu', async () => {
    await expect(recevoir('sylvain', 'autre:1', reponses)).rejects.toThrow(/Identifiant/);
    await expect(recevoir('inconnu', 'tally:zz', reponses)).rejects.toThrow(/introuvable/);
  });

  it('une réponse sans téléphone ni e-mail est notée en erreur, puis réglée par la reprise', async () => {
    await expect(recevoir('sylvain', 'tally:sans', { prenom: 'Lou' })).rejects.toThrow(/Téléphone ou e-mail/);
    await en('anon', null, `select public.noter_erreur_questionnaire('sylvain', 'tally:sans', 'Téléphone ou e-mail requis')`);
    await en('anon', null, `select public.noter_erreur_questionnaire('sylvain', 'tally:sans', 'Téléphone ou e-mail requis')`);
    const j = await coach(`select etat, tentatives from public.journal_automatisations where cle = 'tally:sans'`);
    expect(j.rows).toEqual([{ etat: 'erreur', tentatives: 2 }]);
    expect((await recevoir('sylvain', 'tally:sans', { prenom: 'Lou', email: 'lou@exemple.test' })).rows[0].r).toBe('recu');
    expect((await coach(`select count(*)::int n from public.journal_automatisations where cle = 'tally:sans'`)).rows[0].n).toBe(0);
  });

  it('le journal est lisible par son coach seulement, et personne ne l’écrit directement', async () => {
    await en('anon', null, `select public.noter_erreur_questionnaire('sylvain', 'tally:x9', 'Format inattendu')`);
    expect((await en('authenticated', ids.userCoach2, 'select count(*)::int n from public.journal_automatisations')).rows[0].n).toBe(0);
    await expect(en('anon', null, 'select * from public.journal_automatisations')).rejects.toThrow(/permission/);
    await expect(
      coach(`insert into public.journal_automatisations (coach_id, flux, cle, etat) values ($1, 'compte_rendu', 'x', 'envoye')`, [ids.coach1]),
    ).rejects.toThrow(/permission/);
  });
});

describe('envoi du compte rendu par Make', () => {
  const reserver = (user: string, version: number, relancer = false) =>
    en('authenticated', user, 'select public.reserver_envoi_compte_rendu($1, $2, $3) as r', [ids.document, version, relancer]).then((x) => x.rows[0].r);
  const noter = (user: string, version: number, etat: string, detail = '') =>
    en('authenticated', user, 'select public.noter_envoi_compte_rendu($1, $2, $3, $4)', [ids.document, version, etat, detail]);
  const envoye = async () => (await coach('select envoye from public.documents where id = $1', [ids.document])).rows[0].envoye;
  const etat = async () =>
    (await coach(`select etat from public.journal_automatisations where document_id = $1 and version = 2`, [ids.document])).rows[0]?.etat;

  it('pas d’envoi sans PDF, ni pour une ancienne version', async () => {
    await expect(reserver(ids.userCoach1, 2)).rejects.toThrow(/Générez le PDF/);
    await db.exec(`update public.documents set chemin = '${ids.coach1}/cr.pdf' where id = '${ids.document}'`);
    await expect(reserver(ids.userCoach1, 1)).rejects.toThrow(/version courante/);
  });

  it('un crédit Make épuisé est noté « bloqué » et se relance seulement à la demande', async () => {
    expect(await reserver(ids.userCoach1, 2)).toBe('ok');
    await noter(ids.userCoach1, 2, 'bloque', 'HTTP 429');
    expect(await reserver(ids.userCoach1, 2)).toBe('bloque');
    expect(await reserver(ids.userCoach1, 2, true)).toBe('ok');
  });

  it('un accusé de réception Make ne coche pas « Envoyé », et bloque tout nouvel envoi', async () => {
    await noter(ids.userCoach1, 2, 'transmis', 'Make a reçu la demande');
    expect(await envoye()).toBe(false);
    expect(await reserver(ids.userCoach1, 2, true)).toBe('transmis');
  });

  it('l’envoi confirmé coche « Envoyé » ; un échec noté ensuite ne le défait pas et rien ne repart', async () => {
    await noter(ids.userCoach1, 2, 'envoye', 'sent=true');
    expect(await envoye()).toBe(true);
    await noter(ids.userCoach1, 2, 'echec', 'HTTP 500');
    expect(await etat()).toBe('envoye');
    expect(await reserver(ids.userCoach1, 2, true)).toBe('envoye');
  });

  it('un autre coach ne peut ni réserver ni noter cet envoi, un visiteur non plus', async () => {
    await expect(reserver(ids.userCoach2, 2)).rejects.toThrow(/introuvable/);
    await expect(noter(ids.userCoach2, 2, 'echec')).rejects.toThrow(/introuvable/);
    await expect(en('anon', null, `select public.noter_envoi_compte_rendu($1, 2, 'envoye', '')`, [ids.document])).rejects.toThrow(/permission/);
  });

  it('une transmission interrompue (« en cours » depuis plus de 15 minutes) se relance à la demande, pas avant', async () => {
    await db.exec(`insert into public.documents (id, coach_id, contact_id, nom, type, chemin) values
      ('60000000-0000-4000-8000-000000000002', '${ids.coach1}', '${ids.contact}', 'Bilan · Inès', 'Bilan', 'x/b.pdf')`);
    const r = (relancer: boolean) =>
      coach(`select public.reserver_envoi_compte_rendu('60000000-0000-4000-8000-000000000002', 1, $1) as r`, [relancer]).then((x) => x.rows[0].r);
    expect(await r(false)).toBe('ok');
    expect(await r(true)).toBe('en_cours');
    await db.exec(`update public.journal_automatisations set maj_le = now() - interval '20 minutes' where cle like '60000000-0000-4000-8000-000000000002:%'`);
    expect(await r(false)).toBe('en_cours');
    expect(await r(true)).toBe('ok');
  });

  it('on ne note pas un résultat sans transmission réservée', async () => {
    await expect(noter(ids.userCoach1, 7, 'envoye')).rejects.toThrow(/Aucune transmission/);
  });
});
