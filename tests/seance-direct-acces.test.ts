/// <reference types="node" />
// Séance en direct dans un vrai Postgres (PGlite) : le coach note la séance de son client (séance vierge ou séance
// du programme), le renvoi ne crée rien de plus, le calendrier est coché, et personne d'autre ne peut le faire.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  userCoach1: '10000000-0000-4000-8000-000000000001',
  userCoach2: '10000000-0000-4000-8000-000000000002',
  userLea: '10000000-0000-4000-8000-000000000011',
  coach1: '20000000-0000-4000-8000-000000000001',
  coach2: '20000000-0000-4000-8000-000000000002',
  lea: '30000000-0000-4000-8000-000000000011',
  thomas: '30000000-0000-4000-8000-000000000012',
  presse: '40000000-0000-4000-8000-000000000001',
  tirage: '40000000-0000-4000-8000-000000000002',
  exoAutreCoach: '40000000-0000-4000-8000-000000000003',
  programme: '50000000-0000-4000-8000-000000000001',
  seance: '60000000-0000-4000-8000-000000000001',
  bloc: '70000000-0000-4000-8000-000000000001',
  ligne: '80000000-0000-4000-8000-000000000001',
  suivi: '90000000-0000-4000-8000-000000000001',
  cycle: '91000000-0000-4000-8000-000000000001',
};
const uuid = (prefixe: string, n: number) => `${prefixe}-0000-4000-8000-${String(n).padStart(12, '0')}`;

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
const envoyer = (user: string, p: object) => en(user, 'select public.enregistrer_seance_en_direct($1::jsonb) as r', [JSON.stringify(p)]);

const maintenant = new Date();
const base = (n: number, extra: object = {}) => ({
  id: uuid('a0000000', n),
  clientId: ids.lea,
  titre: 'Séance en direct · 27 novembre',
  debut: new Date(maintenant.getTime() - 50 * 60000).toISOString(),
  fin: maintenant.toISOString(),
  seanceDirecteId: uuid('b0000000', n),
  blocId: uuid('b1000000', n),
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
    insert into auth.users (id) values ('${ids.userCoach1}'), ('${ids.userCoach2}'), ('${ids.userLea}');
    insert into public.coachs (id, user_id, nom, lien_questionnaire) values
      ('${ids.coach1}', '${ids.userCoach1}', 'Sylvain', 'sylvain'), ('${ids.coach2}', '${ids.userCoach2}', 'Autre', 'autre');
    insert into public.clients (id, coach_id, user_id, prenom) values
      ('${ids.lea}', '${ids.coach1}', '${ids.userLea}', 'Léa'), ('${ids.thomas}', '${ids.coach2}', null, 'Thomas');
    insert into public.exercices (id, coach_id, nom, mesures) values
      ('${ids.presse}', null, 'Presse à cuisses — machine', '{charge,repetitions}'),
      ('${ids.tirage}', '${ids.coach1}', 'Tirage vertical — machine', '{charge,repetitions}'),
      ('${ids.exoAutreCoach}', '${ids.coach2}', 'Exercice d''un autre coach', '{charge,repetitions}');
  `);
  // Un programme en cours pour Léa, avec une séance « presse ».
  const programme = {
    id: ids.programme,
    clientId: ids.lea,
    titre: 'Programme de Léa',
    seances: [
      {
        id: ids.seance,
        titre: 'Jambes',
        ordre: 1,
        blocs: [{ id: ids.bloc, titre: 'Principal', lignes: [{ id: ids.ligne, exerciceId: ids.presse, series: 3, repetitions: '10', repetitionsMin: 10, repetitionsMax: 10, recuperationS: 90 }] }],
      },
    ],
  };
  await en(ids.userCoach1, 'select public.enregistrer_programme($1::jsonb)', [JSON.stringify(programme)]);
  await en(ids.userCoach1, `insert into public.suivis (id, coach_id, client_id, debut, duree_mois) values ($1, $2, $3, $4, 3)`, [ids.suivi, ids.coach1, ids.lea, jour(-3)]);
  await en(
    ids.userCoach1,
    `insert into public.cycles (id, suivi_id, coach_id, client_id, ordre, nom, debut, fin, statut, programme_id, mode)
     values ($1, $2, $3, $4, 1, 'Cycle 1', $5, $6, 'Prêt', $7, 'Copie personnalisée')`,
    [ids.cycle, ids.suivi, ids.coach1, ids.lea, jour(-3), jour(30), ids.programme],
  );
  await en(ids.userCoach1, 'select public.activer_cycle($1)', [ids.cycle]);
});

afterAll(async () => {
  await db.close();
});

describe('séance vierge', () => {
  const p = base(1, {
    exercices: [
      {
        ligneId: uuid('c0000000', 1),
        exerciceId: ids.tirage,
        series: [
          { id: uuid('d0000000', 1), valeurs: { charge: 47.5, repetitions: 10 } },
          { id: uuid('d0000000', 2), valeurs: { charge: 47.5, repetitions: 9 }, reposS: 92 },
          { id: uuid('d0000000', 3), valeurs: { charge: 47.5, repetitions: 8 }, reposS: 105 },
        ],
      },
    ],
    note: 5,
    commentaire: 'Belle séance',
  });

  it('le coach enregistre la séance de sa cliente, repos compris', async () => {
    expect((await envoyer(ids.userCoach1, p)).rows[0].r).toBe('enregistree');
    const r = await en(
      ids.userCoach1,
      `select r.seance_titre, r.note, r.commentaire, s.client_id = r.client_id as meme_client, s.archivee, s.programme_id,
              l.series, l.repetitions, l.charge_indicative::float as charge
       from public.realisations r join public.seances s on s.id = r.seance_id
       join public.blocs b on b.seance_id = s.id join public.lignes l on l.bloc_id = b.id where r.id = $1`,
      [p.id],
    );
    expect(r.rows).toEqual([
      { seance_titre: 'Séance en direct · 27 novembre', note: 5, commentaire: 'Belle séance', meme_client: true, archivee: true, programme_id: null, series: 3, repetitions: '8–10', charge: 47.5 },
    ]);
    const series = await en(ids.userCoach1, 'select index, repos_s, exercice_nom, valeurs from public.series_realisees where realisation_id = $1 order by index', [p.id]);
    expect(series.rows).toEqual([
      { index: 0, repos_s: null, exercice_nom: 'Tirage vertical — machine', valeurs: { charge: 47.5, repetitions: 10 } },
      { index: 1, repos_s: 92, exercice_nom: 'Tirage vertical — machine', valeurs: { charge: 47.5, repetitions: 9 } },
      { index: 2, repos_s: 105, exercice_nom: 'Tirage vertical — machine', valeurs: { charge: 47.5, repetitions: 8 } },
    ]);
  });

  it('la cliente la voit dans son historique, sans la séance dans ses séances à faire', async () => {
    expect((await en(ids.userLea, 'select seance_titre from public.realisations where id = $1', [p.id])).rows).toHaveLength(1);
    expect((await en(ids.userLea, 'select count(*)::int as n from public.series_realisees where realisation_id = $1', [p.id])).rows[0].n).toBe(3);
    expect((await en(ids.userLea, `select id from public.seances where client_id = $1 and archivee = false and programme_id is null`, [ids.lea])).rows).toHaveLength(0);
  });

  it('un renvoi (coupure réseau) ne crée rien de plus', async () => {
    expect((await envoyer(ids.userCoach1, p)).rows[0].r).toBe('doublon');
    expect((await en(ids.userCoach1, 'select count(*)::int as n from public.series_realisees where realisation_id = $1', [p.id])).rows[0].n).toBe(3);
  });

  it('faite pendant le cycle en cours, elle compte dans ce cycle sans toucher au calendrier', async () => {
    const q = base(9, { cycleId: ids.cycle, exercices: [{ ligneId: uuid('c0000000', 9), exerciceId: ids.tirage, series: [{ id: uuid('d0000000', 30), valeurs: { charge: 50, repetitions: 8 } }] }] });
    expect((await envoyer(ids.userCoach1, q)).rows[0].r).toBe('enregistree');
    const r = await en(ids.userCoach1, 'select cycle_id, programme_id, cycle_nom, planification_id from public.realisations where id = $1', [q.id]);
    expect(r.rows).toEqual([{ cycle_id: ids.cycle, programme_id: ids.programme, cycle_nom: 'Cycle 1', planification_id: null }]);
    expect((await en(ids.userCoach1, 'select count(*)::int as n from public.planifications where realisation_id = $1', [q.id])).rows[0].n).toBe(0);
  });

  it('refuse une séance sans aucune série', async () => {
    await expect(envoyer(ids.userCoach1, base(2, { exercices: [{ ligneId: uuid('c0000000', 2), exerciceId: ids.tirage, series: [] }] }))).rejects.toThrow(/au moins une série/);
  });
});

describe('séance du programme', () => {
  it('rattache les séries à la séance prévue, range l’exercice ajouté à part et coche le calendrier', async () => {
    const p = base(3, {
      titre: 'Jambes',
      seanceId: ids.seance,
      cycleId: ids.cycle,
      exercices: [
        { ligneId: ids.ligne, exerciceId: ids.presse, series: [{ id: uuid('d0000000', 10), valeurs: { charge: 110, repetitions: 10 } }, { id: uuid('d0000000', 11), valeurs: { charge: 110, repetitions: 10 }, reposS: 90 }] },
        { ligneId: uuid('c0000000', 3), exerciceId: ids.tirage, series: [{ id: uuid('d0000000', 12), valeurs: { charge: 45, repetitions: 12 } }] },
      ],
    });
    expect((await envoyer(ids.userCoach1, p)).rows[0].r).toBe('enregistree');
    const r = await en(ids.userCoach1, 'select seance_id, cycle_id, programme_id, programme_nom from public.realisations where id = $1', [p.id]);
    expect(r.rows).toEqual([{ seance_id: ids.seance, cycle_id: ids.cycle, programme_id: ids.programme, programme_nom: 'Programme de Léa' }]);
    const lignes = await en(ids.userCoach1, 'select ligne_id, count(*)::int as n from public.series_realisees where realisation_id = $1 group by ligne_id order by n desc', [p.id]);
    expect(lignes.rows).toEqual([
      { ligne_id: ids.ligne, n: 2 },
      { ligne_id: uuid('c0000000', 3), n: 1 },
    ]);
    // La séance du programme n'a pas changé : l'exercice ajouté est dans la séance en direct, archivée.
    expect((await en(ids.userCoach1, 'select count(*)::int as n from public.lignes l join public.blocs b on b.id = l.bloc_id where b.seance_id = $1', [ids.seance])).rows[0].n).toBe(1);
    expect((await en(ids.userCoach1, 'select archivee from public.seances where id = $1', [p.seanceDirecteId])).rows).toEqual([{ archivee: true }]);
    const plan = await en(ids.userCoach1, 'select statut, date::text from public.planifications where realisation_id = $1', [p.id]);
    expect(plan.rows).toEqual([{ statut: 'Réalisée', date: jour(0) }]);
  });
});

describe('cloisonnement', () => {
  it('un autre coach ne peut pas noter une séance pour cette cliente', async () => {
    await expect(
      envoyer(ids.userCoach2, base(4, { exercices: [{ ligneId: uuid('c0000000', 4), exerciceId: ids.presse, series: [{ id: uuid('d0000000', 20), valeurs: { charge: 50 } }] }] })),
    ).rejects.toThrow(/hors de ton dossier/);
  });

  it('la cliente ne peut pas l’appeler elle-même', async () => {
    await expect(
      envoyer(ids.userLea, base(5, { exercices: [{ ligneId: uuid('c0000000', 5), exerciceId: ids.presse, series: [{ id: uuid('d0000000', 21), valeurs: { charge: 50 } }] }] })),
    ).rejects.toThrow(/Réservé au coach/);
  });

  it('refuse un exercice du catalogue d’un autre coach', async () => {
    await expect(
      envoyer(ids.userCoach1, base(6, { exercices: [{ ligneId: uuid('c0000000', 6), exerciceId: ids.exoAutreCoach, series: [{ id: uuid('d0000000', 22), valeurs: { charge: 50 } }] }] })),
    ).rejects.toThrow(/catalogue/);
  });

  it('refuse une séance du programme d’une autre cliente', async () => {
    await expect(
      envoyer(ids.userCoach2, {
        ...base(7, { clientId: ids.thomas, seanceId: ids.seance }),
        exercices: [{ ligneId: ids.ligne, exerciceId: ids.presse, series: [{ id: uuid('d0000000', 23), valeurs: { charge: 50 } }] }],
      }),
    ).rejects.toThrow(/Séance introuvable/);
  });

  it('un visiteur sans compte ne peut pas l’appeler', async () => {
    await db.exec('set role anon');
    await expect(db.query('select public.enregistrer_seance_en_direct($1::jsonb)', [JSON.stringify(base(8))])).rejects.toThrow();
    await db.exec('reset role');
  });
});
