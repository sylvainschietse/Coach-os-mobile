// Recopie les noms de la table Ciqual de l'app pour la fonction « lire-recette » (qui ne lit pas les fichiers de l'app).
// À relancer quand src/data/aliments-base.json change : node scripts/noms-ciqual.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const base = JSON.parse(readFileSync(new URL('../src/data/aliments-base.json', import.meta.url), 'utf8'));
const noms = base.map((a) => a.nom).sort((a, b) => a.localeCompare(b, 'fr'));
const texte = noms.join('\n');
if (/[`\\]|\$\{/.test(texte)) throw new Error('Caractère à échapper dans un nom Ciqual');
writeFileSync(
  new URL('../supabase/functions/lire-recette/noms-ciqual.ts', import.meta.url),
  `// Généré par scripts/noms-ciqual.mjs depuis src/data/aliments-base.json : ne pas modifier à la main.\nexport const NOMS_CIQUAL = \`\n${texte}\n\`.trim().split('\\n');\n`,
);
console.log(`${noms.length} noms`);
