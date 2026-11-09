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

  it('un mois offert ou payé à la main reçoit aussi sa facture, avec le nom de l’offre ; une ligne en attente non', async () => {
    const o = await db.query<{ id: string }>(
      `insert into public.offres (coach_id, modele, nom, prix, periodicite) values ($1, 'hybride', 'Hybride complet', 269, 'mois') returning id`,
      [ids.coach1],
    );
    await db.query(`update public.clients set offre_id = $1 where id = $2`, [o.rows[0].id, ids.clientB]);
    const offert = await db.query<{ id: string }>(
      `insert into public.paiements (coach_id, titre, date, montant, statut, notes, reference)
       values ($1, 'Abonnement 01/2027 · Bruno · offert', '2027-01-01', 0, 'Payé', 'Prix 269 €, remise 269 € (Merci d’être testeur)', $2) returning id`,
      [ids.coach1, `abonnement:2027-01:${ids.clientB}`],
    );
    const f = await db.query<Record<string, any>>(`select numero, objet, lignes from public.factures where paiement_id = $1`, [offert.rows[0].id]);
    expect(f.rows[0].objet).toBe('Abonnement 01/2027 · Hybride complet');
    expect(f.rows[0].lignes[0]).toMatchObject({ libelle: 'Abonnement 01/2027 · Hybride complet', prix_unitaire: 269 });

    const attente = await db.query<{ id: string }>(
      `insert into public.paiements (coach_id, titre, date, montant, statut, reference) values ($1, 'Abonnement 02/2027 · Bruno', '2027-02-01', 269, 'En attente', $2) returning id`,
      [ids.coach1, `abonnement:2027-02:${ids.clientB}`],
    );
    expect((await db.query(`select 1 from public.factures where paiement_id = $1`, [attente.rows[0].id])).rows).toHaveLength(0);
    await db.query(`update public.paiements set statut = 'Payé', moyen = 'Virement' where id = $1`, [attente.rows[0].id]);
    expect((await db.query(`select 1 from public.factures where paiement_id = $1`, [attente.rows[0].id])).rows).toHaveLength(1);
  });

  it('le coach règle son en-tête, sa couleur et la numérotation de ses clients', async () => {
    await en(ids.userCoach1, `update public.coachs set facture_couleur = '#123456' where id = $1`, [ids.coach1]);
    await expect(en(ids.userCoach1, `update public.coachs set facture_couleur = 'rouge' where id = $1`, [ids.coach1])).rejects.toThrow();
    await expect(en(ids.userCoach1, `update public.coachs set facture_siret = '123' where id = $1`, [ids.coach1])).rejects.toThrow();
    await en(ids.userCoach1, `update public.clients set facture_prefixe = 'BT', facture_prochain = 1 where id = $1`, [ids.clientB]);
    await expect(en(ids.userClientB, `update public.clients set facture_prochain = 5 where id = $1`, [ids.clientB])).resolves.toMatchObject({ affectedRows: 0 });
  });
});

describe('factures à régler', () => {
  const ligne = (titre: string, statut: string, montant: number, reference: string, notes: string | null = null, date = '2026-10-31') =>
    db.query<{ id: string }>(
      `insert into public.paiements (coach_id, titre, date, montant, statut, notes, reference) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [ids.coach1, titre, date, montant, statut, notes, reference],
    );
  const factureDe = async (paiementId: string) =>
    (await db.query<Record<string, any>>(`select * from public.factures where paiement_id = $1`, [paiementId])).rows[0];

  it('le coach facture une ligne en attente : « à régler », puis payée quand elle est réglée', async () => {
    const p = await ligne('Coaching · Bruno', 'En attente', 80, `divers:${ids.clientB}`);
    await en(ids.userCoach1, `select public.facturer_paiement($1)`, [p.rows[0].id]);
    let f = await factureDe(p.rows[0].id);
    expect(f).toMatchObject({ paye_le: null, moyen: null });
    expect(Number(f.total)).toBe(80);
    await db.query(`update public.paiements set statut = 'Payé', moyen = 'Virement', date = '2026-11-12' where id = $1`, [p.rows[0].id]);
    f = await factureDe(p.rows[0].id);
    expect(f.moyen).toBe('Virement');
    expect(f.paye_le).toEqual(new Date('2026-11-12'));
  });

  it('les séances du mois en attente reçoivent leur facture d’office, détaillée, et suivent les corrections', async () => {
    const p = await ligne(
      'Séances d’octobre 2026 · Bruno (8 séances)',
      'En attente',
      260,
      `mois:2026-10:${ids.clientB}`,
      'Seul (40 €) : 02/10, 09/10, 16/10, 29/10, 30/10 · Avec Romain (20 €) : 06/10, 15/10, 20/10',
    );
    let f = await factureDe(p.rows[0].id);
    expect(f.objet).toBe('Séances d’octobre 2026');
    expect(f.paye_le).toBeNull();
    // Tarif de base 60 € : chaque ligne montre le tarif de base, le % de remise et le prix remisé.
    expect(f.lignes).toEqual([
      { libelle: 'Séances seul : 02/10, 09/10, 16/10, 29/10, 30/10', quantite: 5, prix_unitaire: 40, montant: 200, prix_base: 60, remise_pct: 33.3 },
      { libelle: 'Séances avec Romain : 06/10, 15/10, 20/10', quantite: 3, prix_unitaire: 20, montant: 60, prix_base: 60, remise_pct: 66.7 },
    ]);
    const numero = f.numero;
    await db.query(`update public.paiements set montant = 150, notes = '09/10, 22/10, 26/10 · 50 € la séance' where id = $1`, [p.rows[0].id]);
    f = await factureDe(p.rows[0].id);
    expect(f.numero).toBe(numero);
    expect(Number(f.total)).toBe(150);
    expect(f.lignes).toEqual([
      { libelle: 'Séances du 09/10, 22/10, 26/10', quantite: 3, prix_unitaire: 50, montant: 150, prix_base: 60, remise_pct: 16.7 },
    ]);
  });

  it('une facture par mois regroupe les séances une par une, payée quand toutes le sont', async () => {
    const a = await ligne('Séance du 03/12 · Bruno', 'En attente', 40, `seance:aaaaaaaa-0000-4000-8000-000000000001:${ids.clientB}`, null, '2026-12-03');
    const b = await ligne('Séance du 10/12 · Bruno (à 2)', 'En attente', 20, `seance:aaaaaaaa-0000-4000-8000-000000000002:${ids.clientB}`, null, '2026-12-10');
    await ligne('Séance du 05/01 · Bruno', 'En attente', 40, `seance:aaaaaaaa-0000-4000-8000-000000000003:${ids.clientB}`, null, '2027-01-05');
    expect(await factureDe(a.rows[0].id)).toBeUndefined();
    await expect(en(ids.userCoach2, `select public.facturer_mois($1, '2026-12')`, [ids.clientB])).rejects.toThrow();
    const r = await en(ids.userCoach1, `select public.facturer_mois($1, '2026-12') as id`, [ids.clientB]);
    const f = (await db.query<Record<string, any>>(`select * from public.factures where id = $1`, [r.rows[0].id])).rows[0];
    expect(f.objet).toBe('Séances de décembre 2026');
    expect(Number(f.total)).toBe(60);
    expect(f.lignes.map((l: any) => [l.libelle, l.prix_base, l.remise_pct, l.montant])).toEqual([
      ['Séance du 03/12', 60, 33.3, 40],
      ['Séance du 10/12', 60, 66.7, 20],
    ]);
    expect((await en(ids.userCoach1, `select public.facturer_mois($1, '2026-12') as id`, [ids.clientB])).rows[0].id).toBeNull();
    const liees = await en(ids.userCoach1, `select paiement_id from public.factures_paiements where facture_id = $1`, [f.id]);
    expect(liees.rows).toHaveLength(2);

    await db.query(`update public.paiements set statut = 'Payé', moyen = 'Espèces' where id = $1`, [a.rows[0].id]);
    expect((await db.query<Record<string, any>>(`select paye_le from public.factures where id = $1`, [f.id])).rows[0].paye_le).toBeNull();
    await db.query(`update public.paiements set statut = 'Payé', moyen = 'Espèces' where id = $1`, [b.rows[0].id]);
    expect((await db.query<Record<string, any>>(`select paye_le, moyen from public.factures where id = $1`, [f.id])).rows[0]).toMatchObject({ moyen: 'Espèces' });
  });

  it('un pack montre le prix remisé des séances et la séance offerte à 100 %', async () => {
    const pk = await db.query<{ id: string }>(
      `insert into public.packs_seances (coach_id, client_id, seances_total, prix, achete_le) values ($1, $2, 11, 500, '2026-11-06') returning id`,
      [ids.coach1, ids.clientA],
    );
    const p = await db.query<{ id: string }>(
      `insert into public.paiements (coach_id, titre, contact_id, date, montant, statut, reference)
       values ($1, 'Pack 10 séances + 1 offerte · Inès', (select id from public.contacts where client_id = $2), '2026-11-06', 500, 'Payé', $3) returning id`,
      [ids.coach1, ids.clientA, `pack:${pk.rows[0].id}`],
    );
    const f = await factureDe(p.rows[0].id);
    expect(f.lignes).toEqual([
      { libelle: 'Séances de coaching', quantite: 10, prix_unitaire: 50, montant: 500, prix_base: 60, remise_pct: 16.7 },
      { libelle: 'Séance offerte', quantite: 1, prix_unitaire: 0, montant: 0, prix_base: 60, remise_pct: 100 },
    ]);
    expect(Number(f.total)).toBe(500);
  });
});
