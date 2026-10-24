/// <reference types="node" />
// Lot 4 dans un vrai Postgres (PGlite) : bilans hebdomadaires et synthèse automatique, retour du coach, objectifs,
// photos privées ou partagées. La synthèse SQL doit produire exactement le texte de domain/suivi-hebdo.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ajouterJours, aujourdhuiParis } from '../src/domain/entrainement';
import { lundiCourant, syntheseAutomatique, type ReponsesBilan } from '../src/domain/suivi-hebdo';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userClientA: '10000000-0000-4000-8000-0000000000a1',
  userClientB: '10000000-0000-4000-8000-0000000000b1',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  clientA: '30000000-0000-4000-8000-0000000000a1',
  clientB: '30000000-0000-4000-8000-0000000000b1',
  programme: '50000000-0000-4000-8000-000000000001',
  suivi: '90000000-0000-4000-8000-000000000001',
  cycle: '91000000-0000-4000-8000-000000000001',
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

const semaine = lundiCourant();
const precedente = ajouterJours(semaine, -7);
const reponses = (r: Partial<ReponsesBilan> = {}): ReponsesBilan => ({
  energie: 7,
  sommeil: 6,
  stress: 4,
  motivation: 8,
  seances: 2,
  difficultes: '',
  douleurs: '',
  victoire: '',
  ...r,
});
const envoyer = (user: string, s: string, r: ReponsesBilan, envoi: string) =>
  en(user, `select public.enregistrer_bilan($1::jsonb) as r`, [JSON.stringify({ semaine: s, envoiId: envoi, reponses: r })]);
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

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
  const debut = ajouterJours(aujourdhuiParis(), -20);
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userClientA}'), ('${ids.userClientB}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, prenom, user_id) values
      ('${ids.clientA}', '${ids.coach1}', 'Inès', '${ids.userClientA}'), ('${ids.clientB}', '${ids.coach1}', 'Bruno', '${ids.userClientB}');
    insert into public.programmes (id, coach_id, titre, seances_par_semaine) values ('${ids.programme}', '${ids.coach1}', 'Force', 3);
    insert into public.suivis (id, coach_id, client_id, debut, duree_mois) values ('${ids.suivi}', '${ids.coach1}', '${ids.clientA}', '${debut}', 3);
    select set_config('coachos.activation', 'oui', false);
    insert into public.cycles (id, suivi_id, coach_id, client_id, ordre, nom, debut, fin, statut, programme_id)
      values ('${ids.cycle}', '${ids.suivi}', '${ids.coach1}', '${ids.clientA}', 1, 'Cycle 1', '${debut}', '${ajouterJours(debut, 34)}', 'Actif', '${ids.programme}');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('bilans hebdomadaires', () => {
  it('la synthèse SQL est le texte exact de la synthèse du téléphone', async () => {
    const cas: [ReponsesBilan, ReponsesBilan | null, number | null][] = [
      [reponses(), null, null],
      [reponses({ douleurs: 'Genou droit en descente', victoire: '  3 séances !  ' }), reponses({ energie: 5, sommeil: 6, motivation: 9 }), 3],
      [reponses({ douleurs: 'Aucune gêne.', energie: 2, seances: 1 }), null, 3],
      [reponses({ stress: 9 }), null, 1],
      [reponses({ seances: 0 }), null, null],
      [reponses({ motivation: 2, seances: 4 }), null, 3],
      [reponses({ sommeil: 5, seances: 4 }), null, 3],
      [reponses({ difficultes: 'Horaires', seances: 3 }), null, 3],
      [reponses({ seances: 3 }), null, 3],
    ];
    for (const [a, p, cible] of cas) {
      const { rows } = await db.query<{ retour: string; priorite: string; a_revoir: boolean }>(`select * from public.synthese_bilan($1::jsonb, $2::jsonb, $3::date, $4::int)`, [
        JSON.stringify(a),
        p && JSON.stringify(p),
        p ? precedente : null,
        cible,
      ]);
      const attendu = syntheseAutomatique(a, p && { semaine: precedente, reponses: p }, cible);
      expect(rows[0]).toEqual({ retour: attendu.retourCoach, priorite: attendu.priorite, a_revoir: attendu.aRevoir });
    }
  });

  it('le client envoie son bilan : synthèse publiée, objectif du programme, envoi répété sans effet', async () => {
    expect((await envoyer(ids.userClientA, precedente, reponses({ energie: 5 }), 'envoi-precedent')).rows[0].r).toBe('enregistre');
    expect((await envoyer(ids.userClientA, semaine, reponses({ douleurs: 'Épaule' }), 'envoi-semaine-1')).rows[0].r).toBe('enregistre');
    expect((await envoyer(ids.userClientA, semaine, reponses({ douleurs: 'Épaule' }), 'envoi-semaine-1')).rows[0].r).toBe('doublon');
    const { rows } = await en(ids.userClientA, `select retour_coach, priorite, source_retour, a_revoir, repondu_le is not null as publie from public.bilans_hebdo where semaine = $1`, [semaine]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source_retour: 'Automatique', a_revoir: true, publie: true });
    expect(rows[0].retour_coach).toContain('pour un objectif de 3 séances dans ton programme.');
    expect(rows[0].retour_coach).toContain('énergie +2 points');
  });

  it('refuse une semaine future ou un jour qui n’est pas un lundi, et des scores incomplets', async () => {
    await expect(envoyer(ids.userClientA, ajouterJours(semaine, 7), reponses(), 'envoi-futur-1')).rejects.toThrow('Semaine invalide ou future');
    await expect(envoyer(ids.userClientA, ajouterJours(semaine, 1), reponses(), 'envoi-mardi-1')).rejects.toThrow('Semaine invalide ou future');
    await expect(envoyer(ids.userClientA, semaine, reponses({ stress: 11 }), 'envoi-score-1')).rejects.toThrow('Complétez les quatre scores');
  });

  it('un client ne voit pas les bilans d’un autre ; le coach voit ceux de ses clients seulement', async () => {
    expect((await en(ids.userClientB, `select id from public.bilans_hebdo`)).rows).toHaveLength(0);
    expect((await en(ids.userCoach1, `select id from public.bilans_hebdo`)).rows).toHaveLength(2);
    expect((await en(ids.userCoach2, `select id from public.bilans_hebdo`)).rows).toHaveLength(0);
    await expect(en(ids.userClientA, `update public.bilans_hebdo set a_revoir = false`)).rejects.toThrow('permission denied');
    expect((await en(ids.userCoach1, `select a_revoir from public.bilans_hebdo where semaine = $1`, [semaine])).rows[0].a_revoir).toBe(true);
  });

  it('le coach répond ; un bilan modifié entre-temps est refusé ; après réponse le client ne peut plus le changer', async () => {
    const { rows } = await en(ids.userCoach1, `select id, envoye_le::text as e from public.bilans_hebdo where semaine = $1`, [semaine]);
    await expect(en(ids.userCoach1, `select public.repondre_bilan($1, 'Bravo', 'Dormir', '2000-01-01')`, [rows[0].id])).rejects.toThrow('Le client a modifié son bilan');
    await expect(en(ids.userCoach2, `select public.repondre_bilan($1, 'Bravo', 'Dormir', $2::timestamptz)`, [rows[0].id, rows[0].e])).rejects.toThrow('Bilan introuvable');
    await en(ids.userCoach1, `select public.repondre_bilan($1, 'Belle semaine.', 'Garder le rythme.', $2::timestamptz)`, [rows[0].id, rows[0].e]);
    const lu = (await en(ids.userClientA, `select retour_coach, priorite, source_retour, a_revoir from public.bilans_hebdo where semaine = $1`, [semaine])).rows[0];
    expect(lu).toEqual({ retour_coach: 'Belle semaine.', priorite: 'Garder le rythme.', source_retour: 'Coach', a_revoir: false });
    await expect(envoyer(ids.userClientA, semaine, reponses(), 'envoi-semaine-2')).rejects.toThrow('Votre coach a déjà répondu');
  });
});

describe('objectifs', () => {
  const objectif = (user: string, o: object) => en(user, `select public.enregistrer_objectif($1::jsonb) as id`, [JSON.stringify(o)]);
  let id = '';

  it('création idempotente, valeurs, atteinte, version périmée refusée, archivage', async () => {
    const creer = { action: 'creer', envoiId: 'objectif-1', objectif: { titre: 'Courir 5 km', unite: 'km', depart: 2, cible: 5, echeance: '' } };
    id = (await objectif(ids.userClientA, creer)).rows[0].id as string;
    expect((await objectif(ids.userClientA, creer)).rows[0].id).toBe(id);
    const version = async () => (await en(ids.userClientA, `select modifie_le::text as v from public.objectifs where id = $1`, [id])).rows[0].v as string;
    const v1 = await version();
    await objectif(ids.userClientA, { action: 'progresser', id, version: v1, valeur: 5.5, envoiId: 'valeur-1' });
    await objectif(ids.userClientA, { action: 'progresser', id, version: v1, valeur: 5.5, envoiId: 'valeur-1' });
    let g = (await en(ids.userClientA, `select historique, atteint_le is not null as atteint from public.objectifs where id = $1`, [id])).rows[0];
    expect((g.historique as unknown[]).length).toBe(2);
    expect(g.atteint).toBe(true);
    await expect(objectif(ids.userClientA, { action: 'progresser', id, version: v1, valeur: 3, envoiId: 'valeur-2' })).rejects.toThrow('Cet objectif a changé');
    await objectif(ids.userClientA, { action: 'progresser', id, version: await version(), valeur: 3, envoiId: 'valeur-3' });
    g = (await en(ids.userClientA, `select atteint_le is not null as atteint from public.objectifs where id = $1`, [id])).rows[0];
    expect(g.atteint).toBe(false);
    await objectif(ids.userClientA, { action: 'archiver', id, version: await version(), envoiId: 'archive-1' });
    await expect(objectif(ids.userClientA, { action: 'progresser', id, version: await version(), valeur: 4, envoiId: 'valeur-4' })).rejects.toThrow('archivé');
  });

  it('refuse une cible égale au départ et l’objectif d’un autre client', async () => {
    await expect(objectif(ids.userClientA, { action: 'creer', envoiId: 'objectif-2', objectif: { titre: 'Poids', unite: 'kg', depart: 70, cible: 70, echeance: '' } })).rejects.toThrow(
      'La cible doit être différente',
    );
    await expect(objectif(ids.userClientB, { action: 'archiver', id, version: 'x', envoiId: 'archive-b' })).rejects.toThrow('hors de votre dossier');
    expect((await en(ids.userClientB, `select id from public.objectifs`)).rows).toHaveLength(0);
    expect((await en(ids.userCoach1, `select id from public.objectifs`)).rows).toHaveLength(1);
  });
});

describe('photos', () => {
  it('privées par défaut, visibles du coach seulement une fois partagées ; seul le partage se modifie', async () => {
    const ajout = (envoi: string, partage: boolean) =>
      en(ids.userClientA, `insert into public.photos_clients (date_photo, vue, partage, image, envoi_id) values ($1, 'Face', $2, $3, $4) on conflict (client_id, envoi_id) do nothing`, [
        aujourdhuiParis(),
        partage,
        JPEG,
        envoi,
      ]);
    await ajout('photo-privee', false);
    await ajout('photo-privee', false);
    await ajout('photo-partagee', true);
    expect((await en(ids.userClientA, `select id from public.photos_clients`)).rows).toHaveLength(2);
    expect((await en(ids.userCoach1, `select envoi_id from public.photos_clients`)).rows).toEqual([{ envoi_id: 'photo-partagee' }]);
    expect((await en(ids.userCoach2, `select id from public.photos_clients`)).rows).toHaveLength(0);
    expect((await en(ids.userClientB, `select id from public.photos_clients`)).rows).toHaveLength(0);
    await en(ids.userClientA, `update public.photos_clients set partage = true where envoi_id = 'photo-privee'`);
    expect((await en(ids.userCoach1, `select id from public.photos_clients`)).rows).toHaveLength(2);
    await expect(en(ids.userClientA, `update public.photos_clients set date_photo = '2020-01-01'`)).rejects.toThrow();
    await en(ids.userCoach1, `delete from public.photos_clients`);
    expect((await en(ids.userClientA, `select id from public.photos_clients`)).rows).toHaveLength(2);
  });

  it('refuse une image qui n’est pas un JPEG, une date future ou une photo au nom d’un autre client', async () => {
    const inserer = (user: string, date: string, image: string, client?: string) =>
      en(user, `insert into public.photos_clients (date_photo, vue, image, envoi_id${client ? ', client_id' : ''}) values ($1, 'Dos', $2, 'photo-x-${date}'${client ? ', $3' : ''})`, [
        date,
        image,
        ...(client ? [client] : []),
      ]);
    await expect(inserer(ids.userClientA, aujourdhuiParis(), 'data:image/png;base64,iVBOR')).rejects.toThrow();
    await expect(inserer(ids.userClientA, ajouterJours(aujourdhuiParis(), 2), JPEG)).rejects.toThrow();
    await expect(inserer(ids.userClientB, aujourdhuiParis(), JPEG, ids.clientA)).rejects.toThrow();
  });
});
