/// <reference types="node" />
// Lot 6 : coachings, tâches, paiements et bilans du coach dans un vrai Postgres (PGlite).
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
  contactA: '40000000-0000-4000-8000-0000000000a1',
  contactB: '40000000-0000-4000-8000-0000000000b1',
  contactAutre: '40000000-0000-4000-8000-0000000000c2',
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
    -- Ce que Supabase Storage fournit : compartiments, objets sous RLS, et storage.foldername.
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
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClientA}'), ('${ids.userClientB}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom, user_id) values
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach1}', 'Bruno', '${ids.userClientB}');
    insert into public.contacts (id, coach_id, prenom, telephone, statut, client_id) values
      ('${ids.contactA}', '${ids.coach1}', 'Inès', '33655443399', 'client', '${ids.clientA}'),
      ('${ids.contactB}', '${ids.coach1}', 'Bruno', '33600000001', 'client', '${ids.clientB}'),
      ('${ids.contactAutre}', '${ids.coach2}', 'Zoé', '33600000002', 'prospect', null);
  `);
});

afterAll(async () => {
  await db.close();
});


const COACHING = '50000000-0000-4000-8000-000000000001';

describe('coachings, paiements et bilans du coach', () => {
  it('le coach crée un coaching, un paiement non renseigné reste null et la devise est EUR', async () => {
    await en(ids.userCoach1, `insert into public.coachings (id, contact_id, nom, statut, formule) values ($1, $2, 'Coaching · Inès', 'Actif', 'Essentiel')`, [
      COACHING,
      ids.contactA,
    ]);
    const { rows } = await en(
      ids.userCoach1,
      `insert into public.paiements (titre, contact_id, coaching_id, date, statut) values ('Acompte', $1, $2, '2026-10-25', 'En attente')
       returning montant, devise`,
      [ids.contactA, COACHING],
    );
    expect(rows[0]).toEqual({ montant: null, devise: 'EUR' });
    const p = await en(ids.userCoach1, `update public.paiements set montant = 150.5, statut = 'Payé' where titre = 'Acompte' returning montant::text`);
    expect(p.rows[0].montant).toBe('150.50');
  });

  it('refuse un statut, une formule ou un montant hors des choix d’origine', async () => {
    await expect(en(ids.userCoach1, `insert into public.coachings (contact_id, nom, statut) values ($1, 'X', 'Fini')`, [ids.contactA])).rejects.toThrow();
    await expect(en(ids.userCoach1, `insert into public.paiements (titre, montant) values ('X', -5)`)).rejects.toThrow();
    await expect(en(ids.userCoach1, `insert into public.paiements (titre, moyen) values ('X', 'Bitcoin')`)).rejects.toThrow();
  });

  it('un bilan garde « Non évalué » distinct d’une note et refuse un pilier inconnu ou une note hors 1–10', async () => {
    const { rows } = await en(
      ids.userCoach1,
      `insert into public.bilans_coach (contact_id, date, poids, piliers, priorites) values ($1, '2026-10-25', 64.5, '{"Force": 7, "Sommeil": null}', '{"Dormir 7 h"}')
       returning piliers`,
      [ids.contactA],
    );
    expect(rows[0].piliers).toEqual({ Force: 7, Sommeil: null });
    await expect(en(ids.userCoach1, `insert into public.bilans_coach (contact_id, date, piliers) values ($1, '2026-10-25', '{"Force": 0}')`, [ids.contactA])).rejects.toThrow();
    await expect(en(ids.userCoach1, `insert into public.bilans_coach (contact_id, date, piliers) values ($1, '2026-10-25', '{"Chance": 5}')`, [ids.contactA])).rejects.toThrow();
  });

  it('un autre coach ne voit rien et ne peut ni modifier ni rattacher une ligne à ses contacts', async () => {
    for (const t of ['coachings', 'paiements', 'bilans_coach']) {
      expect((await en(ids.userCoach2, `select id from public.${t}`)).rows).toHaveLength(0);
      expect((await en(ids.userCoach2, `delete from public.${t} returning id`)).rows).toHaveLength(0);
    }
    // Rattacher son paiement au coaching d'un autre coach.
    await expect(en(ids.userCoach2, `insert into public.paiements (titre, coaching_id) values ('Vol', $1)`, [COACHING])).rejects.toThrow();
    // Le coach 1 ne peut pas créer un coaching sur le contact du coach 2.
    await expect(en(ids.userCoach1, `insert into public.coachings (contact_id, nom) values ($1, 'X')`, [ids.contactAutre])).rejects.toThrow();
  });

  it('le client n’a aucun accès à ces tables', async () => {
    for (const t of ['coachings', 'paiements', 'bilans_coach']) expect((await en(ids.userClientA, `select id from public.${t}`)).rows).toHaveLength(0);
  });
});

describe('tâches (relances)', () => {
  it('une tâche reprend les champs d’origine et ne peut viser que les liens du coach', async () => {
    const { rows } = await en(
      ids.userCoach1,
      `insert into public.relances (contact_id, echeance, modele, titre, coaching_id, priorite, statut_tache, responsable)
       values ($1, '2026-10-26', 'tache', 'Appeler Inès', $2, 'Haute', 'En cours', 'Sylvain') returning statut_tache`,
      [ids.contactA, COACHING],
    );
    expect(rows[0].statut_tache).toBe('En cours');
    await expect(
      en(ids.userCoach1, `insert into public.relances (contact_id, echeance, modele, priorite) values ($1, '2026-10-26', 'tache', 'Urgente')`, [ids.contactA]),
    ).rejects.toThrow();
    // Contact du coach 1, coaching inexistant chez le coach 2 : refusé pour le coach 2.
    await expect(
      en(ids.userCoach2, `insert into public.relances (contact_id, echeance, modele, coaching_id) values ($1, '2026-10-26', 'tache', $2)`, [ids.contactAutre, COACHING]),
    ).rejects.toThrow();
  });

  it('supprimer un coaching garde ses paiements et tâches, sans lien', async () => {
    await en(ids.userCoach1, `delete from public.coachings where id = $1`, [COACHING]);
    const p = await en(ids.userCoach1, `select coaching_id from public.paiements where titre = 'Acompte'`);
    expect(p.rows).toEqual([{ coaching_id: null }]);
    const t = await en(ids.userCoach1, `select coaching_id from public.relances where titre = 'Appeler Inès'`);
    expect(t.rows).toEqual([{ coaching_id: null }]);
  });
});
