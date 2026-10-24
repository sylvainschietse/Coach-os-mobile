/// <reference types="node" />
// Lot 3 dans un vrai Postgres (PGlite) : modèles sans client, cycles, activation, calendrier, réalisations, corbeille.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userLea: '10000000-0000-4000-8000-000000000011',
  userThomas: '10000000-0000-4000-8000-000000000012',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  lea: '30000000-0000-4000-8000-000000000011',
  thomas: '30000000-0000-4000-8000-000000000012',
  exo: '40000000-0000-4000-8000-000000000001',
  modele: '50000000-0000-4000-8000-000000000001',
  copie: '50000000-0000-4000-8000-000000000002',
  seance: '60000000-0000-4000-8000-000000000001',
  seanceCopie: '60000000-0000-4000-8000-000000000002',
  bloc: '70000000-0000-4000-8000-000000000001',
  blocCopie: '70000000-0000-4000-8000-000000000002',
  ligne: '80000000-0000-4000-8000-000000000001',
  ligneCopie: '80000000-0000-4000-8000-000000000002',
  suivi: '90000000-0000-4000-8000-000000000001',
  cycle1: '91000000-0000-4000-8000-000000000001',
  cycle2: '91000000-0000-4000-8000-000000000002',
  real: 'a0000000-0000-4000-8000-000000000001',
  serie: 'a1000000-0000-4000-8000-000000000001',
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
const jour = (decalage: number) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ligne = (id: string, extra: object = {}) => ({
  id,
  exerciceId: ids.exo,
  series: 3,
  repetitions: '12–15',
  repetitionsMin: 12,
  repetitionsMax: 15,
  recuperationS: 150,
  rir: 3,
  chargeIntensite: 'Charge à ajuster au RIR cible',
  phase: 'Principal',
  ...extra,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select array[]::text[] $$;
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
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userLea}'), ('${ids.userThomas}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, user_id, prenom) values
      ('${ids.lea}', '${ids.coach1}', '${ids.userLea}', 'Léa'), ('${ids.thomas}', '${ids.coach1}', '${ids.userThomas}', 'Thomas');
    insert into public.exercices (id, coach_id, nom, mesures, ref_externe, famille) values
      ('${ids.exo}', '${ids.coach1}', 'Rowing buste penché — barre', '{charge,repetitions}', 'EXO-0001', 'Tirages horizontaux');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('modèles', () => {
  it('le coach enregistre un modèle et sa séance sans client, en une transaction', async () => {
    const p = {
      id: ids.modele,
      titre: 'MOD-SAL-13-4 · Débutant · Prise de muscle · 4 séances',
      niveau: 'Débutant',
      objectif: 'Prise de muscle',
      seancesParSemaine: 4,
      dureeSemaines: 5,
      environnement: 'Salle équipée',
      priorites: ['Corps entier'],
      seances: [
        {
          id: ids.seance,
          titre: 'MOD-SAL-13-4-S3 · Dos · Triceps',
          ordre: 3,
          dominante: 'Dos · Triceps',
          dureeMin: 75,
          blocs: [{ id: ids.bloc, titre: '3 · Mouvement de référence', lignes: [ligne(ids.ligne, { cycles: [{}, {}, {}, {}] })] }],
        },
      ],
    };
    await en(ids.userCoach1, 'select public.enregistrer_programme($1::jsonb)', [JSON.stringify(p)]);
    const r = await en(
      ids.userCoach1,
      `select s.client_id, s.dominante, l.repetitions, l.phase, jsonb_array_length(l.cycles) as n, p.priorites
       from public.seances s join public.blocs b on b.seance_id = s.id join public.lignes l on l.bloc_id = b.id
       join public.programmes p on p.id = s.programme_id where s.id = $1`,
      [ids.seance],
    );
    expect(r.rows).toEqual([{ client_id: null, dominante: 'Dos · Triceps', repetitions: '12–15', phase: 'Principal', n: 4, priorites: ['Corps entier'] }]);
  });

  it('une copie qui échoue ne laisse rien', async () => {
    const p = {
      id: '50000000-0000-4000-8000-0000000000ff',
      titre: 'Copie cassée',
      seances: [{ id: '60000000-0000-4000-8000-0000000000ff', titre: 'S', blocs: [{ id: '70000000-0000-4000-8000-0000000000ff', titre: 'B', lignes: [ligne('80000000-0000-4000-8000-0000000000ff', { series: 99 })] }] }],
    };
    await expect(en(ids.userCoach1, 'select public.enregistrer_programme($1::jsonb)', [JSON.stringify(p)])).rejects.toThrow();
    const r = await en(ids.userCoach1, "select count(*)::int as n from public.programmes where titre = 'Copie cassée'");
    expect(r.rows[0].n).toBe(0);
  });

  it('un autre coach ne voit ni ne modifie le modèle', async () => {
    expect((await en(ids.userCoach2, 'select id from public.seances where id = $1', [ids.seance])).rows).toHaveLength(0);
    await expect(
      en(ids.userCoach2, 'select public.enregistrer_seance($1::jsonb)', [JSON.stringify({ id: ids.seance, titre: 'Pirate', programmeId: ids.modele, blocs: [] })]),
    ).rejects.toThrow();
  });

  it('le client ne voit pas un modèle qui ne lui est pas attribué', async () => {
    expect((await en(ids.userLea, 'select id from public.seances where id = $1', [ids.seance])).rows).toHaveLength(0);
    expect((await en(ids.userLea, 'select id from public.programmes where id = $1', [ids.modele])).rows).toHaveLength(0);
  });
});

describe('cycles et activation', () => {
  it('crée un suivi et un cycle ; un cycle ne peut pas être créé ni passé actif à la main', async () => {
    await en(ids.userCoach1, `insert into public.suivis (id, coach_id, client_id, debut, duree_mois) values ($1, $2, $3, $4, 3)`, [
      ids.suivi,
      ids.coach1,
      ids.lea,
      jour(0),
    ]);
    await en(
      ids.userCoach1,
      `insert into public.cycles (id, suivi_id, coach_id, client_id, ordre, nom, debut, fin, statut) values
       ($1, $2, $3, $4, 1, 'Cycle 1 · Fondations', $5, $6, 'Brouillon'), ($7, $2, $3, $4, 2, 'Cycle 2', $8, $9, 'Prêt')`,
      [ids.cycle1, ids.suivi, ids.coach1, ids.lea, jour(-1), jour(30), ids.cycle2, jour(31), jour(60)],
    );
    await expect(en(ids.userCoach1, `update public.cycles set statut = 'Actif', programme_id = $2 where id = $1`, [ids.cycle1, ids.modele])).rejects.toThrow(
      /Activer/,
    );
  });

  it('refuse d’activer un brouillon, un cycle sans programme ou hors dates', async () => {
    await expect(en(ids.userCoach1, 'select public.activer_cycle($1)', [ids.cycle1])).rejects.toThrow(/Brouillon/);
    await en(ids.userCoach1, `update public.cycles set statut = 'Prêt' where id = $1`, [ids.cycle1]);
    await expect(en(ids.userCoach1, 'select public.activer_cycle($1)', [ids.cycle1])).rejects.toThrow(/aucun programme/);
    await en(ids.userCoach1, `update public.cycles set programme_id = $2, mode = 'Modèle' where id = $1`, [ids.cycle2, ids.modele]);
    await expect(en(ids.userCoach1, 'select public.activer_cycle($1)', [ids.cycle2])).rejects.toThrow(/hors du cycle/);
  });

  it('le client ne voit ni brouillon ni cycle prêt', async () => {
    expect((await en(ids.userLea, 'select id from public.cycles')).rows).toHaveLength(0);
  });

  it('active le cycle avec sa copie : le client voit la copie, pas le modèle', async () => {
    const copie = {
      id: ids.copie,
      clientId: ids.lea,
      titre: 'Copie · Léa · Cycle 1 · MOD-SAL-13-4',
      modeleOrigineId: ids.modele,
      cycleApplique: 2,
      seances: [{ id: ids.seanceCopie, titre: 'MOD-SAL-13-4-S3 · Dos · Triceps', ordre: 3, blocs: [{ id: ids.blocCopie, titre: '3 · Mouvement de référence', lignes: [ligne(ids.ligneCopie, { repetitions: '8–12', rir: 2 })] }] }],
    };
    await en(ids.userCoach1, 'select public.enregistrer_programme($1::jsonb)', [JSON.stringify(copie)]);
    await en(ids.userCoach1, `update public.cycles set programme_id = $2, mode = 'Copie personnalisée' where id = $1`, [ids.cycle1, ids.copie]);
    await en(ids.userCoach1, 'select public.activer_cycle($1)', [ids.cycle1]);
    const visibles = await en(ids.userLea, 'select id from public.seances order by id');
    expect(visibles.rows.map((r) => r.id)).toEqual([ids.seanceCopie]);
    expect((await en(ids.userLea, 'select repetitions from public.lignes')).rows).toEqual([{ repetitions: '8–12' }]);
    expect((await en(ids.userLea, 'select statut from public.cycles')).rows).toEqual([{ statut: 'Actif' }]);
    expect((await en(ids.userThomas, 'select id from public.seances')).rows).toHaveLength(0);
  });

  it('un cycle actif garde un programme ; un deuxième actif est impossible', async () => {
    await expect(en(ids.userCoach1, 'update public.cycles set programme_id = null where id = $1', [ids.cycle1])).rejects.toThrow(/garder un programme/);
    await expect(
      db.exec(`set coachos.activation = 'oui'; update public.cycles set statut = 'Actif' where id = '${ids.cycle2}';`),
    ).rejects.toThrow();
    await db.exec(`reset coachos.activation;`);
  });

  it('déplace un cycle', async () => {
    await en(ids.userCoach1, 'select public.deplacer_cycle($1, 1)', [ids.cycle1]);
    const r = await en(ids.userCoach1, 'select id, ordre from public.cycles order by ordre');
    expect(r.rows.map((x) => x.id)).toEqual([ids.cycle2, ids.cycle1]);
  });
});

describe('calendrier et réalisation', () => {
  let creneau: string;

  it('planifie une séance du cycle actif, refuse un doublon le même jour et hors dates', async () => {
    const p = { cycleId: ids.cycle1, seanceId: ids.seanceCopie, date: jour(0), envoiId: 'envoi-0001' };
    creneau = (await en(ids.userLea, 'select public.planifier_seance($1::jsonb) as id', [JSON.stringify(p)])).rows[0].id as string;
    // Même envoi : pas de second créneau.
    expect((await en(ids.userLea, 'select public.planifier_seance($1::jsonb) as id', [JSON.stringify(p)])).rows[0].id).toBe(creneau);
    await expect(en(ids.userLea, 'select public.planifier_seance($1::jsonb)', [JSON.stringify({ ...p, envoiId: 'envoi-0002' })])).rejects.toThrow(
      /déjà prévue/,
    );
    await expect(
      en(ids.userLea, 'select public.planifier_seance($1::jsonb)', [JSON.stringify({ ...p, date: jour(90), envoiId: 'envoi-0003' })]),
    ).rejects.toThrow(/dates du cycle/);
    // Deux occurrences de la même séance, jours différents : distinctes.
    await en(ids.userLea, 'select public.planifier_seance($1::jsonb)', [JSON.stringify({ ...p, date: jour(2), envoiId: 'envoi-0004' })]);
    expect((await en(ids.userLea, `select count(*)::int as n from public.planifications where statut = 'Prévue'`)).rows[0].n).toBe(2);
  });

  it('un autre client ne peut pas planifier dans ce cycle ni écrire directement', async () => {
    await expect(
      en(ids.userThomas, 'select public.planifier_seance($1::jsonb)', [JSON.stringify({ cycleId: ids.cycle1, seanceId: ids.seanceCopie, date: jour(1), envoiId: 'envoi-9999' })]),
    ).rejects.toThrow(/hors de votre dossier/);
    await expect(en(ids.userLea, `update public.planifications set statut = 'Réalisée'`)).rejects.toThrow();
  });

  it('enregistre la séance une seule fois, avec libellés figés, et marque le créneau', async () => {
    const r = {
      id: ids.real,
      seanceId: ids.seanceCopie,
      clientId: ids.lea,
      cycleId: ids.cycle1,
      planificationId: creneau,
      note: 7,
      commentaire: 'Trop difficile : rowing',
      series: [{ id: ids.serie, ligneId: ids.ligneCopie, index: 0, valeurs: { charge: 40, repetitions: 10 }, suggestion: { charge: 37.5 } }],
    };
    expect((await en(ids.userLea, 'select public.enregistrer_realisation($1::jsonb) as r', [JSON.stringify(r)])).rows[0].r).toBe('enregistree');
    expect((await en(ids.userLea, 'select public.enregistrer_realisation($1::jsonb) as r', [JSON.stringify(r)])).rows[0].r).toBe('doublon');
    const coach = await en(
      ids.userCoach1,
      `select r.note, r.cycle_nom, r.programme_nom, r.seance_titre, s.exercice_nom, s.valeurs from public.realisations r
       join public.series_realisees s on s.realisation_id = r.id`,
    );
    expect(coach.rows).toEqual([
      {
        note: 7,
        cycle_nom: 'Cycle 1 · Fondations',
        programme_nom: 'Copie · Léa · Cycle 1 · MOD-SAL-13-4',
        seance_titre: 'MOD-SAL-13-4-S3 · Dos · Triceps',
        exercice_nom: 'Rowing buste penché — barre',
        valeurs: { charge: 40, repetitions: 10 },
      },
    ]);
    const plan = await en(ids.userLea, 'select statut, realisation_id from public.planifications where id = $1', [creneau]);
    expect(plan.rows).toEqual([{ statut: 'Réalisée', realisation_id: ids.real }]);
    await expect(en(ids.userLea, 'select public.annuler_creneau($1)', [creneau])).rejects.toThrow(/réalisée/);
  });

  it('refuse un envoi vide et une ligne d’une autre séance', async () => {
    const base = { seanceId: ids.seanceCopie, clientId: ids.lea, cycleId: ids.cycle1, series: [] };
    await expect(
      en(ids.userLea, 'select public.enregistrer_realisation($1::jsonb)', [JSON.stringify({ ...base, id: 'a0000000-0000-4000-8000-000000000002' })]),
    ).rejects.toThrow(/au moins un résultat/);
    await expect(
      en(ids.userLea, 'select public.enregistrer_realisation($1::jsonb)', [
        JSON.stringify({ ...base, id: 'a0000000-0000-4000-8000-000000000003', series: [{ id: 'a1000000-0000-4000-8000-000000000003', ligneId: ids.ligne, index: 0, valeurs: { charge: 1 } }] }),
      ]),
    ).rejects.toThrow(/hors de cette séance/);
  });

  it('Thomas ne peut pas enregistrer dans le dossier de Léa', async () => {
    await expect(
      en(ids.userThomas, 'select public.enregistrer_realisation($1::jsonb)', [
        JSON.stringify({ id: 'a0000000-0000-4000-8000-000000000004', seanceId: ids.seanceCopie, clientId: ids.lea, note: 3, series: [] }),
      ]),
    ).rejects.toThrow(/hors de votre dossier/);
  });
});

describe('corbeille', () => {
  it('protège le modèle lié à un cycle et la copie du client', async () => {
    await expect(en(ids.userCoach1, 'select public.mettre_a_la_corbeille($1::jsonb)', [JSON.stringify([{ kind: 'programme', id: ids.modele }])])).rejects.toThrow(
      /lié à un dossier client/,
    );
    await expect(en(ids.userCoach1, 'select public.mettre_a_la_corbeille($1::jsonb)', [JSON.stringify([{ kind: 'seance', id: ids.seanceCopie }])])).rejects.toThrow(
      /lié à un dossier client/,
    );
  });

  it('met un modèle libre à la corbeille sans rien effacer, puis le restaure', async () => {
    await en(ids.userCoach1, 'update public.cycles set programme_id = $2 where id = $1', [ids.cycle2, ids.copie]);
    await en(ids.userCoach1, 'select public.mettre_a_la_corbeille($1::jsonb)', [JSON.stringify([{ kind: 'programme', id: ids.modele }])]);
    expect((await en(ids.userCoach1, 'select supprime_le is not null as d from public.programmes where id = $1', [ids.modele])).rows[0].d).toBe(true);
    await en(ids.userCoach1, 'update public.programmes set supprime_le = null where id = $1', [ids.modele]);
    expect((await en(ids.userCoach1, 'select count(*)::int as n from public.lignes where id = $1', [ids.ligne])).rows[0].n).toBe(1);
  });
});
