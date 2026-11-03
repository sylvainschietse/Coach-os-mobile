/// <reference types="node" />
// Factures : numérotation par client, émission au prélèvement Stripe, lecture coach et client, dans un vrai Postgres (PGlite).
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
    insert into public.clients (id, coach_id, prenom, nom, acces_appli) values ('${ids.clientSeances}', '${ids.coach1}', 'Marc', 'Durand', false);
    update public.clients set nom = 'Tisseront', facture_prefixe = 'RT', facture_prochain = 38, adresse = 'Route de Saint Bel' || chr(10) || '69160 Tassin',
      remise_type = 'pourcent', remise_valeur = 100, remise_motif = 'Merci d’être testeur' where id = '${ids.clientA}';
    update public.coachs set facture_nom = 'SCHIETSE Sylvain', facture_siret = '51896650200016', facture_adresse = '1763 rue Edouard Herriot' where id = '${ids.coach1}';
    insert into public.contacts (coach_id, prenom, nom, telephone, client_id) values ('${ids.coach1}', 'Inès', 'Tisseront', '33600000001', '${ids.clientA}');
  `);
});

afterAll(async () => {
  await db.close();
});

const paiement = (montant: number, notes: string | null, client = ids.clientA, mois = '2026-11') =>
  db.query<{ id: string }>(
    `insert into public.paiements (coach_id, titre, date, montant, moyen, statut, notes, reference)
     values ($1, $2, '2026-11-03', $3, 'Stripe', 'Payé', $4, $5) returning id`,
    [ids.coach1, `Abonnement ${mois.split('-').reverse().join('/')} · X${montant === 0 ? ' · offert' : ''}`, montant, notes, `abonnement:${mois}:${client}`],
  );

describe('factures', () => {
  it('un prélèvement Stripe payé reçoit sa facture, avec le numéro du client, le prix et la remise', async () => {
    const p = await paiement(0, 'Prix 269 €, remise 269 €');
    const { rows } = await db.query<Record<string, any>>(`select * from public.factures where paiement_id = $1`, [p.rows[0].id]);
    expect(rows).toHaveLength(1);
    const f = rows[0];
    expect(f.numero).toBe('RT38');
    expect(f.objet).toBe('Abonnement 11/2026');
    expect(Number(f.total)).toBe(0);
    expect(f.emetteur).toMatchObject({ nom: 'SCHIETSE Sylvain', siret: '51896650200016' });
    expect(f.destinataire).toEqual({ nom: 'Inès Tisseront', adresse: 'Route de Saint Bel\n69160 Tassin' });
    expect(f.lignes).toEqual([
      { libelle: 'Abonnement 11/2026', quantite: 1, prix_unitaire: 269, montant: 269 },
      { libelle: 'Remise · Merci d’être testeur', quantite: 1, prix_unitaire: -269, montant: -269 },
    ]);
    const c = await db.query<{ facture_prochain: number }>(`select facture_prochain from public.clients where id = $1`, [ids.clientA]);
    expect(c.rows[0].facture_prochain).toBe(39);
  });

  it('une seule facture par paiement, même si la ligne est mise à jour', async () => {
    const p = await paiement(50, null, ids.clientA, '2026-12');
    await db.query(`update public.paiements set montant = 50 where id = $1`, [p.rows[0].id]);
    const { rows } = await db.query(`select numero from public.factures where paiement_id = $1`, [p.rows[0].id]);
    expect(rows).toEqual([{ numero: 'RT39' }]);
  });

  it('sans préfixe, les initiales du client', async () => {
    await paiement(60, null, ids.clientSeances);
    const { rows } = await db.query(`select numero from public.factures where client_id = $1`, [ids.clientSeances]);
    expect(rows).toEqual([{ numero: 'MD1' }]);
  });

  it('le client lit ses factures, pas celles des autres ; personne ne les écrit directement', async () => {
    const a = await en(ids.userClientA, `select numero from public.factures order by numero`);
    expect(a.rows.map((r) => r.numero)).toEqual(['RT38', 'RT39']);
    expect((await en(ids.userClientB, `select numero from public.factures`)).rows).toHaveLength(0);
    expect((await en(ids.userCoach2, `select numero from public.factures`)).rows).toHaveLength(0);
    await expect(en(ids.userCoach1, `update public.factures set total = 1`)).rejects.toThrow();
    await expect(en(ids.userCoach1, `delete from public.factures`)).rejects.toThrow();
  });

  it('le coach facture à la main un paiement encaissé autrement, pas celui d’un autre coach', async () => {
    const p = await db.query<{ id: string }>(
      `insert into public.paiements (coach_id, titre, date, montant, moyen, statut, reference) values ($1, 'Séances novembre · Inès', '2026-11-20', 120, 'Virement', 'Payé', $2) returning id`,
      [ids.coach1, `seances:2026-11:${ids.clientA}`],
    );
    expect((await db.query(`select 1 from public.factures where paiement_id = $1`, [p.rows[0].id])).rows).toHaveLength(0);
    await expect(en(ids.userCoach2, `select public.facturer_paiement($1)`, [p.rows[0].id])).rejects.toThrow();
    await en(ids.userCoach1, `select public.facturer_paiement($1)`, [p.rows[0].id]);
    const { rows } = await db.query<Record<string, any>>(`select numero, moyen, total from public.factures where paiement_id = $1`, [p.rows[0].id]);
    expect(rows[0]).toMatchObject({ numero: 'RT40', moyen: 'Virement' });
  });

  it('le coach règle son en-tête, sa couleur et la numérotation de ses clients', async () => {
    await en(ids.userCoach1, `update public.coachs set facture_couleur = '#123456' where id = $1`, [ids.coach1]);
    await expect(en(ids.userCoach1, `update public.coachs set facture_couleur = 'rouge' where id = $1`, [ids.coach1])).rejects.toThrow();
    await expect(en(ids.userCoach1, `update public.coachs set facture_siret = '123' where id = $1`, [ids.coach1])).rejects.toThrow();
    await en(ids.userCoach1, `update public.clients set facture_prefixe = 'BT', facture_prochain = 1 where id = $1`, [ids.clientB]);
    await expect(en(ids.userClientB, `update public.clients set facture_prochain = 5 where id = $1`, [ids.clientB])).resolves.toMatchObject({ affectedRows: 0 });
  });
});
