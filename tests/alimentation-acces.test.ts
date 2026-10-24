/// <reference types="node" />
// Profils nutrition, aliments, recettes et repas : qui voit et modifie quoi (PGlite).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userLea: '10000000-0000-4000-8000-000000000011',
  userThomas: '10000000-0000-4000-8000-000000000012',
  userAutre: '10000000-0000-4000-8000-000000000013',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  lea: '30000000-0000-4000-8000-000000000011',
  thomas: '30000000-0000-4000-8000-000000000012',
  autre: '30000000-0000-4000-8000-000000000013',
};

let db: PGlite;

async function en(userId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; set role authenticated; select set_config('test.uid', '${userId ?? ''}', false);`);
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
  `);
  const dossier = join(__dirname, '../supabase/migrations');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dossier, f), 'utf8'));
  }
  await db.exec(`
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userLea}'), ('${ids.userThomas}'), ('${ids.userAutre}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, user_id, prenom) values
      ('${ids.lea}', '${ids.coach1}', '${ids.userLea}', 'Léa'), ('${ids.thomas}', '${ids.coach1}', '${ids.userThomas}', 'Thomas'),
      ('${ids.autre}', '${ids.coach2}', '${ids.userAutre}', 'Client de l’autre coach');
    insert into public.aliments (source, nom, kcal, proteines, glucides, lipides) values ('base', 'Riz blanc cuit', 130, 2.7, 28, 0.3);
  `);
});

afterAll(async () => {
  await db.close();
});

const ajouterAliment = (user: string, valeurs: string) =>
  en(user, `insert into public.aliments (coach_id, client_id, source, nom, code_barres, kcal, proteines, glucides, lipides) values ${valeurs} returning id`);

describe('profil nutrition', () => {
  it('Léa remplit son profil ; son coach le lit ; Thomas et l’autre coach non', async () => {
    await en(ids.userLea, `insert into public.profils_nutrition (client_id, sexe, naissance, taille_cm, activite, objectif, regimes)
      values ('${ids.lea}', 'femme', '1996-05-10', 165, 'modere', 'perte', '{vegetarien}')`);
    expect((await en(ids.userCoach1, 'select regimes from public.profils_nutrition')).rows).toEqual([{ regimes: ['vegetarien'] }]);
    expect((await en(ids.userThomas, 'select * from public.profils_nutrition')).rows).toEqual([]);
    expect((await en(ids.userCoach2, 'select * from public.profils_nutrition')).rows).toEqual([]);
    await expect(en(ids.userThomas, `insert into public.profils_nutrition (client_id) values ('${ids.lea}')`)).rejects.toThrow();
  });

  it('refuse un régime inconnu', async () => {
    await expect(en(ids.userThomas, `insert into public.profils_nutrition (client_id, regimes) values ('${ids.thomas}', '{carnivore}')`)).rejects.toThrow();
  });
});

describe('aliments', () => {
  it('tout le monde lit la base commune ; personne ne la modifie', async () => {
    expect((await en(ids.userAutre, 'select nom from public.aliments')).rows).toEqual([{ nom: 'Riz blanc cuit' }]);
    await en(ids.userCoach1, `update public.aliments set kcal = 1 where source = 'base'`);
    await en(ids.userLea, `update public.aliments set kcal = 1 where source = 'base'`);
    expect((await db.query(`select kcal from public.aliments where source = 'base'`)).rows).toEqual([{ kcal: '130' }]);
  });

  it('un produit scanné par Léa sert à tous les clients de Sylvain, pas à ceux de l’autre coach', async () => {
    await ajouterAliment(ids.userLea, `('${ids.coach1}', null, 'off', 'Skyr', '3000000000017', 60, 10, 4, 0.2)`);
    expect((await en(ids.userThomas, `select nom from public.aliments where code_barres = '3000000000017'`)).rows).toHaveLength(1);
    expect((await en(ids.userCoach1, `select nom from public.aliments where code_barres = '3000000000017'`)).rows).toHaveLength(1);
    expect((await en(ids.userAutre, `select nom from public.aliments where code_barres = '3000000000017'`)).rows).toEqual([]);
    // Le même code une deuxième fois chez le même coach : refusé (l'app relit l'existant).
    await expect(ajouterAliment(ids.userThomas, `('${ids.coach1}', null, 'off', 'Skyr', '3000000000017', 60, 10, 4, 0.2)`)).rejects.toThrow();
    // Un client ne peut pas écrire chez un autre coach, ni ajouter un aliment « partagé » sans code-barres.
    await expect(ajouterAliment(ids.userLea, `('${ids.coach2}', null, 'off', 'X', '3000000000024', 1, 0, 0, 0)`)).rejects.toThrow();
    await expect(ajouterAliment(ids.userLea, `('${ids.coach1}', null, 'client', 'X', null, 1, 0, 0, 0)`)).rejects.toThrow();
  });

  it('l’aliment personnel de Léa reste à elle (et à son coach)', async () => {
    await ajouterAliment(ids.userLea, `('${ids.coach1}', '${ids.lea}', 'client', 'Gâteau de mamie', null, 400, 6, 50, 20)`);
    expect((await en(ids.userThomas, `select * from public.aliments where nom = 'Gâteau de mamie'`)).rows).toEqual([]);
    expect((await en(ids.userCoach1, `select * from public.aliments where nom = 'Gâteau de mamie'`)).rows).toHaveLength(1);
    await expect(ajouterAliment(ids.userThomas, `('${ids.coach1}', '${ids.lea}', 'client', 'Pirate', null, 1, 0, 0, 0)`)).rejects.toThrow();
  });

  it('refuse des valeurs impossibles', async () => {
    await expect(ajouterAliment(ids.userCoach1, `('${ids.coach1}', null, 'coach', 'X', null, 1000, 0, 0, 0)`)).rejects.toThrow();
  });
});

describe('recettes', () => {
  const recette = (user: string, coach: string, client: string | null, statut: string, titre: string) =>
    en(user, `insert into public.recettes (coach_id, client_id, titre, statut, ingredients) values ('${coach}', ${client ? `'${client}'` : 'null'}, '${titre}', '${statut}', '[]')`);

  it('les clients ne voient de la banque que les recettes approuvées', async () => {
    await recette(ids.userCoach1, ids.coach1, null, 'approuvee', 'Bowl validé');
    await recette(ids.userCoach1, ids.coach1, null, 'brouillon', 'Essai en cours');
    expect((await en(ids.userLea, 'select titre from public.recettes order by titre')).rows).toEqual([{ titre: 'Bowl validé' }]);
    expect((await en(ids.userAutre, 'select titre from public.recettes')).rows).toEqual([]);
    expect((await en(ids.userCoach1, 'select titre from public.recettes')).rows).toHaveLength(2);
  });

  it('Léa crée ses recettes, sans pouvoir s’auto-approuver ni écrire dans la banque', async () => {
    await recette(ids.userLea, ids.coach1, ids.lea, 'brouillon', 'Mon porridge');
    expect((await en(ids.userThomas, `select * from public.recettes where titre = 'Mon porridge'`)).rows).toEqual([]);
    expect((await en(ids.userCoach1, `select * from public.recettes where titre = 'Mon porridge'`)).rows).toHaveLength(1);
    await expect(recette(ids.userLea, ids.coach1, null, 'brouillon', 'Dans la banque')).rejects.toThrow();
    await expect(recette(ids.userLea, ids.coach1, ids.lea, 'approuvee', 'Auto-approuvée')).rejects.toThrow();
    await en(ids.userLea, `update public.recettes set statut = 'approuvee' where titre = 'Bowl validé'`);
    expect((await db.query(`select titre from public.recettes where titre = 'Bowl validé' and statut = 'approuvee'`)).rows).toHaveLength(1);
  });
});

describe('journal des repas', () => {
  it('Léa note et supprime ses repas ; son coach les lit sans les modifier', async () => {
    await en(ids.userLea, `insert into public.repas (client_id, date, moment, libelle, quantite_g, kcal, proteines, glucides, lipides, source)
      values ('${ids.lea}', '2026-10-24', 'dejeuner', 'Riz', 150, 195, 4, 42, 0.5, 'saisie'), ('${ids.lea}', '2026-10-24', 'diner', 'Soupe', 250, 75, 2, 11, 2, 'saisie')`);
    expect((await en(ids.userCoach1, 'select libelle from public.repas order by libelle')).rows).toEqual([{ libelle: 'Riz' }, { libelle: 'Soupe' }]);
    await en(ids.userCoach1, `delete from public.repas`);
    await en(ids.userThomas, `delete from public.repas`);
    expect((await db.query('select * from public.repas')).rows).toHaveLength(2);
    await en(ids.userLea, `delete from public.repas where libelle = 'Soupe'`);
    expect((await db.query('select libelle from public.repas')).rows).toEqual([{ libelle: 'Riz' }]);
    await expect(
      en(ids.userThomas, `insert into public.repas (client_id, date, moment, libelle, kcal, proteines, glucides, lipides, source) values ('${ids.lea}', '2026-10-24', 'diner', 'X', 1, 0, 0, 0, 'saisie')`),
    ).rejects.toThrow();
  });
});

describe('plan alimentaire de la semaine', () => {
  const jours = JSON.stringify([[{ id: 'a', moment: 'dejeuner', recetteId: 'r', titre: 'Bol', portions: 1, macrosPortion: { kcal: 500, proteines: 30, glucides: 50, lipides: 15 }, macros: { kcal: 500, proteines: 30, glucides: 50, lipides: 15 } }], [], [], [], [], [], []]);
  it('le coach prépare la semaine de Léa ; Léa la lit sans la modifier ; les autres ne la voient pas', async () => {
    await en(ids.userCoach1, `insert into public.plans_repas (client_id, semaine, jours) values ('${ids.lea}', '2026-10-19', $1)`, [jours]);
    expect((await en(ids.userLea, 'select semaine::text from public.plans_repas')).rows).toEqual([{ semaine: '2026-10-19' }]);
    expect((await en(ids.userThomas, 'select * from public.plans_repas')).rows).toEqual([]);
    expect((await en(ids.userCoach2, 'select * from public.plans_repas')).rows).toEqual([]);
    await en(ids.userLea, `update public.plans_repas set jours = '[[],[],[],[],[],[],[]]'`);
    expect((await db.query(`select jsonb_array_length(jours->0) as n from public.plans_repas`)).rows).toEqual([{ n: 1 }]);
    await expect(en(ids.userLea, `insert into public.plans_repas (client_id, semaine, jours) values ('${ids.lea}', '2026-10-26', $1)`, [jours])).rejects.toThrow();
    await expect(en(ids.userCoach2, `insert into public.plans_repas (client_id, semaine, jours) values ('${ids.lea}', '2026-10-26', $1)`, [jours])).rejects.toThrow();
  });

  it('refuse une semaine qui ne commence pas un lundi ou qui n’a pas 7 jours', async () => {
    await expect(en(ids.userCoach1, `insert into public.plans_repas (client_id, semaine, jours) values ('${ids.lea}', '2026-10-21', $1)`, [jours])).rejects.toThrow();
    await expect(en(ids.userCoach1, `insert into public.plans_repas (client_id, semaine, jours) values ('${ids.lea}', '2026-11-02', '[[],[]]')`)).rejects.toThrow();
  });
});
