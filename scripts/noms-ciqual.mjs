// Recopie les noms de la table Ciqual de l'app pour la fonction « lire-recette », qui les lit sur GitHub (dépôt public)
// à une version figée. À relancer quand src/data/aliments-base.json change : node scripts/noms-ciqual.mjs, puis
// mettre à jour VERSION_NOMS dans supabase/functions/lire-recette/index.ts avec le commit qui contient le nouveau fichier.
import { readFileSync, writeFileSync } from 'node:fs';

const base = JSON.parse(readFileSync(new URL('../src/data/aliments-base.json', import.meta.url), 'utf8'));
const noms = base.map((a) => a.nom).sort((a, b) => a.localeCompare(b, 'fr'));
const texte = noms.join('\n');
writeFileSync(new URL('../supabase/functions/lire-recette/noms-ciqual.txt', import.meta.url), texte + '\n');
console.log(`${noms.length} noms`);
