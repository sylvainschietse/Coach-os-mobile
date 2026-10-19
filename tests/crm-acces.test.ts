/// <reference types="node" />
// Questionnaire d'accueil et CRM dans un vrai Postgres (PGlite) : rapprochement et droits.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
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

const soumettre = (lien: string, reponses: object) =>
  en('anon', null, 'select public.soumettre_questionnaire($1, $2::jsonb)', [lien, JSON.stringify(reponses)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated;
    create role anon;
  `);
  await db.exec(readFileSync(join(__dirname, '../supabase/migrations/20261019000000_prototype.sql'), 'utf8'));
  await db.exec(readFileSync(join(__dirname, '../supabase/migrations/20261019010000_crm.sql'), 'utf8'));
  await db.exec(readFileSync(join(__dirname, '../supabase/migrations/20261019020000_booster_evaluation.sql'), 'utf8'));
  await db.exec(`
    grant usage on schema public to anon;
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'),
      ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre-coach');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('questionnaire d’accueil', () => {
  it('le coach crée Julie avec son téléphone seul', async () => {
    await en('authenticated', ids.userCoach1, `insert into public.contacts (coach_id, prenom, telephone) values ($1, 'Julie', '33612345678')`, [
      ids.coach1,
    ]);
    await expect(
      en('authenticated', ids.userCoach1, `insert into public.contacts (coach_id, prenom, telephone) values ($1, 'Jules', '33612345678')`, [
        ids.coach1,
      ]),
    ).rejects.toThrow(/contacts_telephone_actif/);
  });

  it('les réponses sans compte arrivent sur la fiche de Julie, sans doublon, avec l’e-mail en plus', async () => {
    await soumettre('sylvain', { prenom: 'Julie', nom: 'Moreau', telephone: '+33 6 12 34 56 78', email: 'Julie@Exemple.fr', objectif: 'Remise en forme' });
    const { rows } = await en('authenticated', ids.userCoach1, 'select prenom, nom, email, telephone from public.contacts');
    expect(rows).toEqual([{ prenom: 'Julie', nom: 'Moreau', email: 'julie@exemple.fr', telephone: '33612345678' }]);
    const relances = await en('authenticated', ids.userCoach1, 'select modele from public.relances where faite_le is null');
    expect(relances.rows).toEqual([{ modele: 'booster' }]);
  });

  it('une personne inconnue crée une nouvelle fiche ; un e-mail différent est signalé, pas écrasé', async () => {
    await soumettre('sylvain', { prenom: 'Karim', telephone: '0611111111' });
    await soumettre('sylvain', { prenom: 'Julie', telephone: '0612345678', email: 'autre@exemple.fr' });
    const contacts = await en('authenticated', ids.userCoach1, 'select prenom, email from public.contacts order by prenom');
    expect(contacts.rows).toEqual([
      { prenom: 'Julie', email: 'julie@exemple.fr' },
      { prenom: 'Karim', email: null },
    ]);
    const { rows } = await en('authenticated', ids.userCoach1, `select alertes from public.questionnaires order by recu_le desc, alertes desc limit 1`);
    expect(rows[0].alertes).toEqual(['E-mail différent dans le questionnaire : autre@exemple.fr (fiche : julie@exemple.fr).']);
  });

  it('un lien inconnu, ou des réponses sans téléphone ni e-mail, sont refusés', async () => {
    await expect(soumettre('inconnu', { telephone: '0612345678' })).rejects.toThrow(/introuvable/);
    await expect(soumettre('sylvain', { prenom: 'Anonyme' })).rejects.toThrow(/requis/);
  });

  it('sans compte, on ne peut rien lire ; un autre coach ne voit pas les prospects de Sylvain', async () => {
    await expect(en('anon', null, 'select * from public.contacts')).rejects.toThrow(/permission/);
    const { rows } = await en('authenticated', ids.userCoach2, 'select * from public.contacts');
    expect(rows).toEqual([]);
    await soumettre('autre-coach', { prenom: 'Julie', telephone: '0612345678' });
    const autre = await en('authenticated', ids.userCoach2, 'select prenom from public.contacts');
    expect(autre.rows).toEqual([{ prenom: 'Julie' }]);
  });
});

describe('évaluation du Booster', () => {
  it('reste réservée au coach du contact', async () => {
    const { rows } = await en(
      'authenticated',
      ids.userCoach1,
      `insert into public.boosters (contact_id, date, evaluation, entretien)
       select id, now(), '{"tests":{"jambes":{"resultat":"Correct","observations":[]}}}', '{"freins":"Horaires"}'
       from public.contacts where prenom = 'Julie' limit 1 returning evaluation->'tests'->'jambes'->>'resultat' as jambes`,
    );
    expect(rows[0].jambes).toBe('Correct');
    const autre = await en('authenticated', ids.userCoach2, `select count(*)::int as n from public.boosters where evaluation is not null`);
    expect(autre.rows[0].n).toBe(0);
  });
});
