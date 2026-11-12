/// <reference types="node" />
// Virement signalé par le client, paiement confirmé par le coach, notifications des deux côtés, dans un vrai Postgres (PGlite).
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

const ligne = (statut: string, montant: number, client: string) =>
  db.query<{ id: string }>(
    `insert into public.paiements (coach_id, titre, date, montant, statut, reference) values ($1, 'Coaching · test', '2026-11-12', $2, $3, $4) returning id`,
    [ids.coach1, montant, statut, `divers:${client}`],
  );
const factureDe = async (paiementId: string) =>
  (await db.query<Record<string, any>>(`select * from public.factures where paiement_id = $1`, [paiementId])).rows[0];
const notifs = async (user: string, genre: string) =>
  (await db.query<Record<string, any>>(`select titre, corps, url from public.notifications where user_id = $1 and genre = $2`, [user, genre])).rows;

describe('virement signalé puis confirmé', () => {
  it('le client signale son virement : le coach est prévenu, la facture le note', async () => {
    const p = await ligne('En attente', 120, ids.clientB);
    await en(ids.userCoach1, `select public.facturer_paiement($1)`, [p.rows[0].id]);
    const f = await factureDe(p.rows[0].id);
    expect(f.paye_le).toBeNull();

    await en(ids.userClientB, `select public.signaler_virement($1)`, [f.id]);
    expect((await factureDe(p.rows[0].id)).virement_signale_le).not.toBeNull();
    const n = await notifs(ids.userCoach1, 'virement_signale');
    expect(n).toHaveLength(1);
    expect(n[0].corps).toContain('Bruno');
    expect(n[0].corps).toContain(f.numero);
    expect(n[0].corps).toContain('120,00 €');
    expect(n[0].url).toBe('/coach?onglet=crm&rubrique=Paiements');
  });

  it('personne d’autre ne peut signaler un virement sur cette facture', async () => {
    const p = await ligne('En attente', 50, ids.clientB);
    await en(ids.userCoach1, `select public.facturer_paiement($1)`, [p.rows[0].id]);
    const f = await factureDe(p.rows[0].id);
    await expect(en(ids.userClientA, `select public.signaler_virement($1)`, [f.id])).rejects.toThrow('Facture introuvable');
    await expect(en(ids.userCoach1, `select public.signaler_virement($1)`, [f.id])).rejects.toThrow('Facture introuvable');
  });

  it('le coach confirme : la ligne passe à « Payé » par virement, la facture est réglée, le client est prévenu', async () => {
    const p = await ligne('En attente', 80, ids.clientB);
    await en(ids.userCoach1, `select public.facturer_paiement($1)`, [p.rows[0].id]);
    const f = await factureDe(p.rows[0].id);
    await en(ids.userClientB, `select public.signaler_virement($1)`, [f.id]);
    const avant = (await notifs(ids.userClientB, 'paiement_confirme')).length;

    await expect(en(ids.userCoach2, `select public.confirmer_paiement_facture($1)`, [f.id])).rejects.toThrow('Facture introuvable');
    await expect(en(ids.userClientB, `select public.confirmer_paiement_facture($1)`, [f.id])).rejects.toThrow('Facture introuvable');
    await en(ids.userCoach1, `select public.confirmer_paiement_facture($1)`, [f.id]);

    const ligneApres = (await db.query<Record<string, any>>(`select statut, moyen from public.paiements where id = $1`, [p.rows[0].id])).rows[0];
    expect(ligneApres).toEqual({ statut: 'Payé', moyen: 'Virement' });
    const apres = await factureDe(p.rows[0].id);
    expect(apres.paye_le).not.toBeNull();
    expect(apres.moyen).toBe('Virement');
    const n = await notifs(ids.userClientB, 'paiement_confirme');
    expect(n).toHaveLength(avant + 1);
    expect(n.at(-1)!.corps).toContain('80,00 €');
    expect(n.at(-1)!.url).toBe('/client?onglet=moi');
    // Déjà réglée : on ne peut plus la signaler.
    await expect(en(ids.userClientB, `select public.signaler_virement($1)`, [f.id])).rejects.toThrow('déjà réglée');
  });

  it('passer la ligne à « Payé » depuis la fiche prévient aussi le client', async () => {
    const p = await ligne('En attente', 40, ids.clientB);
    await en(ids.userCoach1, `select public.facturer_paiement($1)`, [p.rows[0].id]);
    const avant = (await notifs(ids.userClientB, 'paiement_confirme')).length;
    await db.query(`update public.paiements set statut = 'Payé', moyen = 'Espèces' where id = $1`, [p.rows[0].id]);
    expect(await notifs(ids.userClientB, 'paiement_confirme')).toHaveLength(avant + 1);
  });
});
