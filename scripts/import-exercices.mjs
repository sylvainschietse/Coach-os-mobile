// Catalogue d'exercices de Sylvain : Airtable (table Exercices, lecture seule) → Supabase et mode démo.
// Usage : node scripts/import-exercices.mjs <dossier des pages JSON> <coach_id>
// Chaque page est un tableau d'exercices au format compact (voir lireExercice).
// Écrit supabase/donnees/exercices-airtable.json, src/data/catalogue-demo.json et des fichiers SQL par lots.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const racine = join(import.meta.dirname, '..');

/** Les muscles arrivent avec des casses différentes (« fessiers », « Fessiers ») : une seule écriture. */
function nettoyer(liste) {
  const vus = new Map();
  for (const m of liste ?? []) {
    const propre = m.trim().charAt(0).toUpperCase() + m.trim().slice(1);
    if (propre && !vus.has(propre.toLowerCase())) vus.set(propre.toLowerCase(), propre);
  }
  return [...vus.values()];
}

const SANS_CHARGE = new Set(['Poids du corps', 'Aucun']);

/** Ce que le client notera pendant la séance, déduit de la famille et du matériel. */
export function mesuresPour(ex) {
  const famille = ex.famille ?? '';
  const materiel = ex.materiel ?? [];
  const charge = materiel.some((m) => !SANS_CHARGE.has(m));
  if (famille === 'Cardio et déplacements') return ['duree', 'distance'];
  if (famille === 'Gainage') return charge ? ['charge', 'duree'] : ['duree'];
  if (famille === 'Portés et maintien') return ['charge', 'distance', 'duree'];
  if (famille === 'Mobilité et étirements') return ['repetitions', 'duree'];
  if (famille === 'Sauts et lancers') return charge ? ['charge', 'repetitions'] : ['repetitions'];
  return charge ? ['charge', 'repetitions'] : ['repetitions'];
}

export function lireExercice(r) {
  const ex = {
    ref: r.id,
    nom: r.n.trim(),
    nomEn: r.en || undefined,
    alias: r.a || undefined,
    famille: r.f || undefined,
    pattern: r.p || undefined,
    muscles: nettoyer(r.m),
    musclesSecondaires: nettoyer(r.ms),
    materiel: nettoyer(r.mat),
    modalite: r.mod || undefined,
    niveau: r.niv || undefined,
    position: r.pos || undefined,
    lateralite: r.lat || undefined,
    videoUrl: r.v || undefined,
    actif: r.act !== false,
  };
  return { ...ex, mesures: mesuresPour(ex) };
}

const texte = (v) => (v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const tableau = (l) => `array[${l.map(texte).join(', ')}]::text[]`;

export function sqlLot(exercices, coachId) {
  const valeurs = exercices.map((e) =>
    `(${[
      texte(coachId) + '::uuid', texte(e.ref), texte(e.nom), tableau(e.mesures), texte(e.videoUrl), texte(e.nomEn),
      texte(e.alias), texte(e.famille), texte(e.pattern), tableau(e.muscles), tableau(e.musclesSecondaires),
      tableau(e.materiel), texte(e.modalite), texte(e.niveau), texte(e.position), texte(e.lateralite), e.actif,
    ].join(', ')})`,
  );
  return `insert into public.exercices (coach_id, ref_externe, nom, mesures, video_url, nom_en, alias, famille, pattern,
  muscles, muscles_secondaires, materiel, modalite, niveau, position, lateralite, actif) values
${valeurs.join(',\n')}
on conflict (coach_id, ref_externe) where ref_externe is not null do nothing;\n`;
}

if (process.argv[1] === import.meta.filename) {
  const [dossier, coachId] = process.argv.slice(2);
  const pages = readdirSync(dossier).filter((f) => f.endsWith('.json')).sort();
  const parRef = new Map();
  for (const p of pages) for (const r of JSON.parse(readFileSync(join(dossier, p), 'utf8'))) parRef.set(r.id, lireExercice(r));
  const exercices = [...parRef.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  mkdirSync(join(racine, 'supabase/donnees'), { recursive: true });
  writeFileSync(join(racine, 'supabase/donnees/exercices-airtable.json'), JSON.stringify(exercices, null, 1));
  // Mode démo : le même catalogue, sans ce qui ne sert pas à l'écran.
  const demo = exercices
    .filter((e) => e.actif)
    .map((e) => ({ id: `ex-${e.ref}`, nom: e.nom, mesures: e.mesures, famille: e.famille, materiel: e.materiel, muscles: e.muscles, videoUrl: e.videoUrl }));
  writeFileSync(join(racine, 'src/data/catalogue-demo.json'), JSON.stringify(demo));
  const sortie = join(dossier, 'sql');
  mkdirSync(sortie, { recursive: true });
  for (let i = 0; i < exercices.length; i += 125) {
    writeFileSync(join(sortie, `lot-${String(i / 125 + 1).padStart(2, '0')}.sql`), sqlLot(exercices.slice(i, i + 125), coachId));
  }
  console.log(`${exercices.length} exercices, ${Math.ceil(exercices.length / 125)} lots dans ${sortie}`);
}
