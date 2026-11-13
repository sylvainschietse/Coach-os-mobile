// Assemble toutes les migrations en un seul fichier à coller dans l'éditeur SQL de Supabase.
// Usage : node scripts/installation-sql.mjs (le test tests/installation.test.ts vérifie qu'il est à jour).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dossier = join(import.meta.dirname, '../supabase/migrations');

export function installationSql() {
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort();
  return [
    '-- Coach OS : installation complète de la base, à coller en une fois dans Supabase > SQL Editor > Run.',
    '-- Fichier généré par scripts/installation-sql.mjs à partir de supabase/migrations : ne pas modifier à la main.',
    ...fichiers.map((f) => `\n-- ===== ${f} =====\n${readFileSync(join(dossier, f), 'utf8').trim()}\n`),
  ].join('\n');
}

if (process.argv[1] === import.meta.filename) writeFileSync(join(dossier, '../installation.sql'), installationSql());
