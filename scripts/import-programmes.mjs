// Import des modèles de programmes d'Airtable (base « Coach OS ») vers Supabase et vers la démonstration.
// Lit trois exports JSON faits en lecture seule (Programmes, Séances, Exercices de séance) : rien n'est écrit dans Airtable.
//
//   node scripts/import-programmes.mjs <dossier des exports> <dossier de sortie> <coach_id>
//
// Produit : <sortie>/programmes-NN.sql (lots à exécuter dans l'ordre, rejouables sans doublon)
//           src/data/modeles-demo.json (mêmes modèles pour la démo, exercices du catalogue de démonstration)
// Portée : Usage = Modèle, hors programme de test « TEST… ». Les marqueurs [COACHOS_BLOCS:…] et [COACHOS_CYCLES:…]
// sont décodés : blocs ordonnés (vides compris) et quatre variantes de cycle par ligne.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [entree, sortie, coachId] = process.argv.slice(2);
if (!entree || !sortie || !/^[0-9a-f-]{36}$/.test(coachId ?? '')) {
  console.error('Usage : node scripts/import-programmes.mjs <exports> <sortie> <coach_id>');
  process.exit(1);
}

const lire = (f) => JSON.parse(readFileSync(join(entree, f), 'utf8')).records;
const P = lire('programmes.json');
const S = lire('seances.json');
const L = lire('lignes.json');

const F = {
  p: {
    nom: 'fldNhWK4mXFBOpEFH', usage: 'fldZkl5EXHgR5nJNN', statut: 'fld87v5qpRA6e6hcK', objectifTexte: 'fldtFt2V3KIvJHxTl',
    duree: 'fldv4eKvE9dJoeT4m', freq: 'fldE7SvXRdfFauR1x', materiel: 'fldCUKnyfWJNfxCEm', contraintes: 'fldYIpSRfCbeUjpSO',
    consignes: 'fld10V5BD1MvD7Gz2', version: 'fldmQjt1AxT78AUDJ', niveau: 'fldIgTZD6jzUUfO2o', objectif: 'fld3ftidRgiVnwAYF',
    env: 'fldxtMuaizWvMx86z', priorites: 'fld5O3dNml71LYHIs', dureeCible: 'fldREUChoPCmIFqbd',
  },
  s: {
    nom: 'flddoHiWYThhXu0Bx', programme: 'fldmYcmN5vknhn3Eb', ordre: 'fldmthgpqZZaDN0F5', dominante: 'fldy78KYULhaq7kvj',
    duree: 'fldZvtK0Y6s6qJcId', objectif: 'fldg12BIdbxB1FCcT', consignes: 'fldsareDd3yOPLDA3',
  },
  l: {
    seance: 'flda5EZL21XdXlpzl', ordre: 'fld1V4xznZ2SQ4Fxp', phase: 'fldgxyO9Q2BbQXLDZ', bloc: 'fldlrxsbrPjxiyxdm',
    series: 'fldtcDSZIjVJi05id', reps: 'fldd2XFv7diUCagiN', duree: 'fldW8XY7bGqJSBjLc', distance: 'fldjRDZK3vzMgjhCh',
    charge: 'fldYkzsrxFDsjy7RT', recup: 'fldUoxig4okM7KrVc', rir: 'fldGoHJykZ6Qm6JhJ', tempo: 'fld0GoP3UdQLCrsme',
    consignes: 'fldrLGocaxB3ddGVq', progression: 'fldIrZnormDaY1hD2', exo: 'fld1OHWcCtt9UnYjq',
  },
};

const champ = (r, f) => r.cellValuesByFieldId[f];
const choix = (r, f) => champ(r, f)?.name ?? null;
const texte = (r, f) => {
  const v = champ(r, f);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};
const nombre = (r, f) => (typeof champ(r, f) === 'number' ? champ(r, f) : null);
const liens = (r, f) => (champ(r, f) ?? []).map((x) => x.id);

/** UUID stable tiré de l'identifiant Airtable : rejouer l'import ne crée pas de doublon. */
const uuid = (cle) => {
  const h = createHash('sha256').update(`coachos-import:${cle}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const MARQUEUR_BLOCS = /\n?\[COACHOS_BLOCS:(\[[^\n]*\])\]\s*$/;
const MARQUEUR_CYCLES = /\n?\[COACHOS_CYCLES:(\[[^\n]*\])\]\s*$/;

function separerBlocs(v) {
  const m = MARQUEUR_BLOCS.exec(v ?? '');
  if (!m) return { consignes: v ?? '', blocs: [] };
  const a = JSON.parse(m[1]);
  return { consignes: v.slice(0, m.index).trimEnd(), blocs: [...new Set(a)] };
}

function cyclesValides(v) {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(
      (x) =>
        Number.isInteger(x.series) && x.series >= 1 && x.series <= 8 && typeof x.repetitions === 'string' && typeof x.recuperationS === 'number' &&
        typeof x.rir === 'number' && ['chargeIntensite', 'tempo', 'consignes', 'progressionPrevue'].every((k) => typeof x[k] === 'string'),
    )
  );
}

function separerCycles(v) {
  const m = MARQUEUR_CYCLES.exec(v ?? '');
  if (!m) return { progression: v ?? '', cycles: null };
  const a = JSON.parse(m[1]);
  return { progression: v.slice(0, m.index).trimEnd(), cycles: cyclesValides(a) ? a : null };
}

const lireReps = (t) => {
  const m = /^\s*(\d+)(?:\s*[-–à]\s*(\d+))?/.exec(t ?? '');
  if (!m) return [null, null];
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  return max >= min ? [min, max] : [null, null];
};

// ---------- Lecture ----------
const modeles = P.filter((r) => choix(r, F.p.usage) === 'Modèle' && !/^TEST/i.test(texte(r, F.p.nom) ?? ''));
const idsModeles = new Set(modeles.map((r) => r.id));
const seancesPar = new Map();
for (const s of S) {
  const p = liens(s, F.s.programme).find((id) => idsModeles.has(id));
  if (!p) continue;
  if (!seancesPar.has(p)) seancesPar.set(p, []);
  seancesPar.get(p).push(s);
}
const idsSeances = new Set([...seancesPar.values()].flat().map((s) => s.id));
const lignesPar = new Map();
for (const l of L) {
  const s = liens(l, F.l.seance).find((id) => idsSeances.has(id));
  if (!s) continue;
  if (!lignesPar.has(s)) lignesPar.set(s, []);
  lignesPar.get(s).push(l);
}

const exoDe = (l) => {
  const v = champ(l, F.l.exo);
  const ids = v?.linkedRecordIds ?? [];
  return ids.length ? (v.valuesByLinkedRecordId[ids[0]] ?? [])[0] ?? null : null;
};

const stats = { programmes: 0, seances: 0, blocs: 0, blocsVides: 0, lignes: 0, lignesSansExercice: [], lignesAvecCycles: 0, sansBloc: 0 };
const programmes = [];
for (const p of modeles) {
  const seances = (seancesPar.get(p.id) ?? []).sort((a, b) => (nombre(a, F.s.ordre) ?? 0) - (nombre(b, F.s.ordre) ?? 0));
  const prog = {
    id: uuid(p.id),
    ref: p.id,
    titre: texte(p, F.p.nom),
    niveau: choix(p, F.p.niveau),
    objectif: choix(p, F.p.objectif) ?? texte(p, F.p.objectifTexte),
    seancesParSemaine: nombre(p, F.p.freq),
    dureeSemaines: nombre(p, F.p.duree),
    environnement: choix(p, F.p.env),
    materiel: texte(p, F.p.materiel),
    contraintes: texte(p, F.p.contraintes),
    consignes: texte(p, F.p.consignes),
    dureeCibleMin: nombre(p, F.p.dureeCible),
    priorites: (champ(p, F.p.priorites) ?? []).map((x) => x.name),
    version: texte(p, F.p.version),
    statut: choix(p, F.p.statut) ?? 'Brouillon',
    seanceSeule: texte(p, F.p.version) === 'coachos-single',
    seances: [],
  };
  stats.programmes++;
  for (const s of seances) {
    const { consignes, blocs: marqueur } = separerBlocs(champ(s, F.s.consignes));
    const lignes = (lignesPar.get(s.id) ?? []).sort((a, b) => (nombre(a, F.l.ordre) ?? 0) - (nombre(b, F.l.ordre) ?? 0));
    // Ordre d'origine (orderedLines) : blocs du marqueur, puis ceux trouvés sur les lignes, puis « sans bloc ».
    const titres = [...marqueur, ...new Set(lignes.map((l) => texte(l, F.l.bloc)).filter((b) => b && !marqueur.includes(b)))];
    if (lignes.some((l) => !texte(l, F.l.bloc))) titres.push('');
    const blocs = titres.map((titre) => ({
      id: uuid(`${s.id}:bloc:${titre}`),
      titre: titre || 'Sans bloc',
      lignes: lignes
        .filter((l) => (texte(l, F.l.bloc) ?? '') === titre)
        .flatMap((l) => {
          const exo = exoDe(l);
          if (!exo) {
            stats.lignesSansExercice.push(l.id);
            return [];
          }
          const reps = texte(l, F.l.reps);
          const [min, max] = lireReps(reps);
          const { progression, cycles } = separerCycles(champ(l, F.l.progression));
          if (cycles) stats.lignesAvecCycles++;
          stats.lignes++;
          return [
            {
              id: uuid(l.id),
              ref: l.id,
              exo,
              series: nombre(l, F.l.series) ?? 1,
              repetitions: reps,
              repetitionsMin: min,
              repetitionsMax: max,
              dureeS: nombre(l, F.l.duree),
              distanceM: nombre(l, F.l.distance),
              chargeIntensite: texte(l, F.l.charge),
              recuperationS: nombre(l, F.l.recup),
              rir: nombre(l, F.l.rir),
              tempo: texte(l, F.l.tempo),
              consignes: texte(l, F.l.consignes),
              phase: choix(l, F.l.phase),
              progression: progression.trim() || null,
              cycles,
            },
          ];
        }),
    }));
    stats.seances++;
    stats.blocs += blocs.length;
    stats.blocsVides += blocs.filter((b) => !b.lignes.length).length;
    if (titres.includes('')) stats.sansBloc++;
    prog.seances.push({
      id: uuid(s.id),
      ref: s.id,
      titre: texte(s, F.s.nom),
      ordre: nombre(s, F.s.ordre),
      dominante: texte(s, F.s.dominante),
      dureeMin: nombre(s, F.s.duree),
      objectif: texte(s, F.s.objectif),
      consignes: consignes.trim() || null,
      blocs,
    });
  }
  programmes.push(prog);
}

// ---------- Format compact commun (Supabase et démo) ----------
// Les mêmes textes reviennent des milliers de fois (consignes, variantes de cycles) : un dictionnaire les range une fois.
// Les identifiants ne voyagent pas : chacun est recalculé depuis la référence Airtable (md5 → uuid), en SQL comme en JS.
const dico = new Map();
const t = (v) => {
  if (v === null || v === undefined) return null;
  if (!dico.has(v)) dico.set(v, dico.size);
  return dico.get(v);
};
const cyclesDico = new Map();
const c = (cycles) => {
  if (!cycles) return null;
  const k = JSON.stringify(cycles);
  if (!cyclesDico.has(k))
    cyclesDico.set(k, {
      i: cyclesDico.size,
      v: cycles.map((x) => [x.series, t(x.repetitions), x.recuperationS, x.rir, t(x.chargeIntensite), t(x.tempo), t(x.consignes), t(x.progressionPrevue)]),
    });
  return cyclesDico.get(k).i;
};
const compact = programmes.map((p) => [
  p.ref, t(p.titre), t(p.niveau), t(p.objectif), p.seancesParSemaine, p.dureeSemaines, t(p.environnement), t(p.materiel), t(p.contraintes),
  t(p.consignes), p.dureeCibleMin, p.priorites.map(t), t(p.version), t(p.statut), p.seanceSeule ? 1 : 0,
  p.seances.map((s) => [
    s.ref, t(s.titre), s.ordre, t(s.dominante), s.dureeMin, t(s.objectif), t(s.consignes),
    s.blocs.map((b) => [
      t(b.titre),
      b.lignes.map((l) => [
        l.ref, t(l.exo), l.series, t(l.repetitions), l.repetitionsMin, l.repetitionsMax, l.dureeS, l.distanceM, t(l.chargeIntensite),
        l.recuperationS, l.rir, t(l.tempo), t(l.consignes), t(l.phase), t(l.progression), c(l.cycles),
      ]),
    ]),
  ]),
]);
const doc = { d: [...dico.keys()], c: [...cyclesDico.values()].map((x) => x.v), p: compact };
const texteDoc = JSON.stringify(doc);
mkdirSync(sortie, { recursive: true });
writeFileSync(new URL('../src/data/modeles-demo.json', import.meta.url), texteDoc);

// ---------- SQL pour Supabase ----------
// Le document est déposé par morceaux dans un schéma de travail non exposé, puis décodé en une transaction.
if (texteDoc.includes('$imp$')) throw new Error('Délimiteur présent dans les données');
const TAILLE = 120000;
const nb = Math.ceil(texteDoc.length / TAILLE);
for (let i = 0; i < nb; i++) {
  const debut = i === 0 ? 'create schema if not exists import_lot3;\ncreate table if not exists import_lot3.morceaux (n int primary key, t text not null);\n' : '';
  writeFileSync(
    join(sortie, `programmes-${String(i + 1).padStart(2, '0')}.sql`),
    `${debut}insert into import_lot3.morceaux values (${i + 1}, $imp$${texteDoc.slice(i * TAILLE, (i + 1) * TAILLE)}$imp$) on conflict (n) do update set t = excluded.t;\n`,
  );
}
writeFileSync(
  join(sortie, 'programmes-decodage.sql'),
  `-- Décodage du document compact : rejouable (on conflict do nothing), puis le schéma de travail est supprimé.
do $$
declare
  doc jsonb := (select string_agg(t, '' order by n) from import_lot3.morceaux)::jsonb;
  coach uuid := '${coachId}';
  d jsonb := doc->'d';
  p jsonb; s jsonb; b jsonb; l jsonb; v jsonb;
  pid uuid; sid uuid; bid uuid;
  bi int; li int;
  cyc jsonb;
  attendu int := ${stats.lignes};
  n int;
begin
  if (select count(*) from import_lot3.morceaux) <> ${nb} then raise exception 'Morceaux manquants'; end if;
  for p in select * from jsonb_array_elements(doc->'p') loop
    pid := md5('coachos-import:' || (p->>0))::uuid;
    insert into public.programmes (id, coach_id, ref_externe, titre, niveau, objectif, seances_par_semaine, duree_semaines, environnement, materiel,
      contraintes, consignes, duree_cible_min, priorites, version, statut, seance_seule)
    values (pid, coach, p->>0, d->>(p->>1)::int, d->>(p->>2)::int, d->>(p->>3)::int, (p->>4)::int, (p->>5)::int, d->>(p->>6)::int, d->>(p->>7)::int,
      d->>(p->>8)::int, d->>(p->>9)::int, (p->>10)::int, coalesce(array(select d->>(x::text)::int from jsonb_array_elements(p->11) x), '{}'),
      d->>(p->>12)::int, coalesce(d->>(p->>13)::int, 'Brouillon'), (p->>14)::int = 1)
    on conflict (id) do nothing;
    for s in select * from jsonb_array_elements(p->15) loop
      sid := md5('coachos-import:' || (s->>0))::uuid;
      insert into public.seances (id, coach_id, client_id, programme_id, ref_externe, titre, ordre, dominante, duree_prevue_min, objectif, consignes)
      values (sid, coach, null, pid, s->>0, d->>(s->>1)::int, (s->>2)::int, d->>(s->>3)::int, (s->>4)::int, d->>(s->>5)::int, d->>(s->>6)::int)
      on conflict (id) do nothing;
      bi := 0;
      for b in select * from jsonb_array_elements(s->7) loop
        bi := bi + 1;
        bid := md5('coachos-import:' || (s->>0) || ':bloc:' || bi)::uuid;
        insert into public.blocs (id, seance_id, ordre, titre) values (bid, sid, bi, d->>(b->>0)::int) on conflict (id) do nothing;
        li := 0;
        for l in select * from jsonb_array_elements(b->1) loop
          li := li + 1;
          cyc := null;
          if l->>15 is not null then
            select jsonb_agg(jsonb_build_object('series', (x->>0)::int, 'repetitions', d->>(x->>1)::int, 'recuperationS', (x->>2)::int,
              'rir', (x->>3)::int, 'chargeIntensite', d->>(x->>4)::int, 'tempo', d->>(x->>5)::int, 'consignes', d->>(x->>6)::int,
              'progressionPrevue', d->>(x->>7)::int) order by o)
            into cyc from jsonb_array_elements(doc->'c'->((l->>15)::int)) with ordinality as e(x, o);
          end if;
          insert into public.lignes (id, bloc_id, ordre, exercice_id, ref_externe, series, repetitions, repetitions_min, repetitions_max, duree_s,
            distance_m, charge_intensite, recuperation_s, rir, tempo, consignes, phase, progression, cycles)
          select md5('coachos-import:' || (l->>0))::uuid, bid, li, e.id, l->>0, (l->>2)::int, d->>(l->>3)::int, (l->>4)::int, (l->>5)::int,
            (l->>6)::int, (l->>7)::numeric, d->>(l->>8)::int, (l->>9)::int, (l->>10)::int, d->>(l->>11)::int, d->>(l->>12)::int,
            d->>(l->>13)::int, d->>(l->>14)::int, cyc
          from public.exercices e where e.coach_id = coach and e.ref_externe = d->>(l->>1)::int
          on conflict (id) do nothing;
          get diagnostics n = row_count;
        end loop;
      end loop;
    end loop;
  end loop;
  select count(*) into n from public.lignes where ref_externe is not null and bloc_id in (select b2.id from public.blocs b2 join public.seances s2 on s2.id = b2.seance_id where s2.coach_id = coach and s2.client_id is null);
  if n <> attendu then raise exception 'Import incomplet : % lignes sur %', n, attendu; end if;
end $$;
drop schema import_lot3 cascade;
`,
);

console.log(
  JSON.stringify(
    {
      ...stats,
      lignesSansExercice: stats.lignesSansExercice.length,
      morceaux: nb,
      document: texteDoc.length,
      textes: dico.size,
      variantes: cyclesDico.size,
      exercicesUtilises: new Set(programmes.flatMap((p) => p.seances.flatMap((s) => s.blocs.flatMap((b) => b.lignes.map((l) => l.exo))))).size,
    },
    null,
    1,
  ),
);
