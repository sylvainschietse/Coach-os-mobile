// Reprise de l'export nutrition de l'ancienne app Zite de Sylvain (dossier « Coach-OS-Nutrition »).
// - Table Ciqual 2025 (Anses, Licence Ouverte Etalab 2.0) → src/data/aliments-base.json, la base commune d'aliments.
// - 200 recettes sourcées et leurs variantes → supabase/donnees/recettes-zite.json, et un échantillon pour la démo.
// - Avec --sql <dossier> <coach_id> : les fichiers SQL pour charger les recettes dans la banque du coach (en brouillon).
// La table Ciqual est embarquée dans l'app (référence fixe, versionnée avec elle) : elle n'est pas copiée en base.
// Usage : node scripts/import-zite-nutrition.mjs <dossier de l'export> [--sql <dossier> <coach_id>]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , exportDir, option, dossierSql, coachId] = process.argv;
if (!exportDir) throw new Error('Indique le dossier de l’export Zite.');
const lire = (f) => JSON.parse(readFileSync(join(exportDir, 'donnees', f), 'utf8'));
const racine = join(import.meta.dirname, '..');

/** UUID v5 (SHA-1) : les mêmes identifiants à chaque import. */
function uuid5(nom) {
  const ns = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'); // espace de noms URL
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(nom)])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const r1 = (v) => Math.round(v * 10) / 10;
const mots = (liste) => new RegExp(`\\b(${liste.join('|')})`, 'i');

// ——— Ciqual ———
// Ciqual ne dit pas ce qu'un aliment contient (viande, lait, gluten…) : on le déduit du groupe et du nom.
// C'est une déduction, pas une donnée de la table : les régimes « sans gluten » restent à confirmer par le coach.

const VEGETAL = mots(['vegetal', 'vegetale', 'vegetaux', 'vegetarien', 'vegan', 'soja', 'tofu', 'seitan', 'tempeh']);
const MOTS_VIANDE = mots([
  'viande', 'boeuf', 'veau', 'porc', 'agneau', 'mouton', 'poulet', 'poule', 'volaille', 'dinde', 'canard', 'oie\\b', 'lapin', 'cheval',
  'jambon', 'lard', 'bacon', 'saucisse', 'saucisson', 'chorizo', 'merguez', 'salami', 'pate de campagne', 'foie gras', 'coq\\b', 'cantonais',
  'andouill', 'boudin', 'cervelas', 'knack', 'chipolata', 'kebab', 'hamburger', 'cheeseburger', 'cordon bleu', 'nugget', 'gibier',
  'chevreuil', 'sanglier', 'pintade', 'caille', 'pigeon', 'abat', 'rognon', 'tripe', 'langue', 'carpaccio', 'bolognaise', 'gelatine',
  'pot-au-feu', 'blanquette', 'bourguignon', 'cassoulet', 'choucroute garnie', 'lasagne', 'moussaka', 'hachis parmentier', 'couscous au',
  'paella', 'tartiflette', 'croque-monsieur', 'quiche lorraine', 'pizza royale', 'pizza au jambon', 'raviol', 'tortellini',
]);
const MOTS_POISSON = mots([
  'poisson', 'thon', 'saumon', 'cabillaud', 'morue', 'sardine', 'maquereau', 'truite', 'colin', 'merlu', 'lieu\\b', 'anchois', 'hareng',
  'sole\\b', 'bar ', 'dorade', 'daurade', 'tilapia', 'fletan', 'eglefin', 'haddock', 'merlan', 'limande', 'carrelet', 'raie', 'rouget',
  'lotte', 'baudroie', 'espadon', 'perche', 'brochet', 'carpe', 'anguille', 'surimi', 'tarama', 'oeufs de lump', 'caviar', 'brandade',
  'rillettes de thon', 'nuoc', 'pangasius', 'panga', 'sprat', 'flet\\b', 'turbot', 'mulet', 'loup', 'saint-pierre', 'empereur', 'hoki',
]);
const MOTS_MER = mots([
  'crevette', 'moule', 'huitre', 'calmar', 'calamar', 'encornet', 'poulpe', 'seiche', 'crabe', 'homard', 'langouste', 'langoustine',
  'saint-jacques', 'bulot', 'bigorneau', 'ecrevisse', 'fruits de mer', 'palourde', 'coques?\\b', 'praire', 'oursin', 'escargot', 'gambas',
]);
const MOTS_OEUF = mots(['oeuf', 'omelette', 'mayonnaise', 'quiche', 'flan', 'creme brulee', 'creme caramel', 'meringue', 'pates aux oeufs', 'brioche', 'madeleine', 'genoise', 'crepe', 'gaufre']);
const MOTS_LAIT = mots([
  'lait\\b', 'laits', 'fromage', 'beurre', 'creme', 'yaourt', 'yogourt', 'skyr', 'kefir', 'emmental', 'comte', 'gruyere', 'mozzarella', 'parmesan',
  'chevre\\b', 'feta', 'ricotta', 'mascarpone', 'camembert', 'brie', 'roquefort', 'cantal', 'raclette', 'reblochon', 'tomme', 'bechamel',
  'gratin', 'fromage blanc', 'petit-suisse', 'faisselle', 'lactose', 'cheese', 'chantilly', 'lacte', 'lactee',
  'babeurre', 'ghee', 'brocciu', 'halloumi', 'cottage', 'quark', 'burrata', 'chocolat au lait', 'chocolat blanc', 'tiramisu', 'croque',
]);
const MOTS_GLUTEN = mots([
  'ble\\b', 'froment', 'farine', 'pain', 'baguette', 'brioche', 'biscotte', 'biscuit', 'gateau', 'cake', 'tarte', 'pates',
  'spaghetti', 'macaroni', 'tagliatelle', 'lasagne', 'raviol', 'semoule', 'couscous', 'boulgour', 'boulghour', 'seigle', 'orge',
  'epeautre', 'avoine', 'muesli', 'seitan', 'chapelure', 'pane', 'panee', 'croissant', 'viennoiserie', 'pizza', 'quiche', 'crepe',
  'gaufre', 'beignet', 'vermicelle', 'sandwich', 'hamburger', 'wrap', 'tortilla de ble', 'nouille', 'gnocchi', 'croute', 'feuillete', 'madeleine',
  'cookie', 'sable', 'galette', 'cereales', 'petit-beurre', 'pain d\'epice', 'kamut', 'malt', 'biere', 'chocolatine', 'tortellini',
]);
const GROUPES = {
  viande: ['viandes crues', 'viandes cuites', 'autres produits à base de viande'],
  poisson: ['poissons crus', 'poissons cuits', 'huiles de poissons'],
  fruits_de_mer: ['mollusques et crustacés crus', 'mollusques et crustacés cuits'],
  oeuf: ['oeufs'],
  lait: ['fromages et alternatives végétales', 'produits laitiers frais et alternatives végétales', 'laits', 'beurres', 'crèmes et spécialités à base de crème', 'glaces'],
  gluten: ['pains et assimilés', 'pâtes à tarte', 'viennoiseries', 'biscuits sucrés', 'gâteaux et pâtisseries', 'pizzas, tartes et crêpes salées', 'sandwichs', 'feuilletées et autres entrées'],
};

function contientCiqual(nom, groupe) {
  const t = sansAccents(nom);
  const vegetal = VEGETAL.test(t) && !/ne convient pas aux veganes/.test(t);
  const sansGluten = /sans gluten/.test(t);
  const sansLactose = /sans lactose/.test(t);
  const c = new Set();
  const dans = (cle) => GROUPES[cle].includes(groupe);
  if ((dans('viande') || groupe === 'charcuteries et alternatives végétales' || MOTS_VIANDE.test(t)) && !vegetal) c.add('viande');
  if (dans('poisson') || MOTS_POISSON.test(t) || (groupe === 'produits à base de poissons et produits de la mer' && !MOTS_MER.test(t))) c.add('poisson');
  if (dans('fruits_de_mer') || MOTS_MER.test(t)) c.add('fruits_de_mer');
  if (dans('oeuf') || MOTS_OEUF.test(t)) c.add('oeuf');
  // Les « alternatives végétales » partagent le groupe des produits laitiers : leur nom les distingue.
  if ((dans('lait') || MOTS_LAIT.test(t)) && !(vegetal || /boisson (a base )?(de |d')?(soja|amande|avoine|riz|coco|noisette|epeautre)|lait de coco|beurre de cacahuete|beurre de cacao|creme de marrons|creme de coco|creme de cassis|lait de soja/.test(t))) c.add('lait');
  if ((dans('gluten') || MOTS_GLUTEN.test(t)) && !sansGluten && !/sarrasin|riz|mais|quinoa|chataigne|pois chiche|lentille/.test(t.split(',')[0])) c.add('gluten');
  if (/\bmiel/.test(t)) c.add('miel');
  // Les huiles et graisses végétales ne contiennent pas de lait, même quand le nom évoque le beurre.
  if (['huiles et graisses végétales', 'margarines'].includes(groupe)) c.delete('lait');
  if (sansLactose) c.delete('lait');
  return [...c];
}

const ciqual = lire('ciqual.json');
const CLES = { kcal: 'kcal', protein: 'proteines', carbs: 'glucides', fat: 'lipides' };
const ecartes = [];
const aliments = [];
for (const f of ciqual.foods) {
  // Sans calories connues, l'aliment ne sert pas au journal : on ne l'importe pas plutôt que d'afficher 0 kcal.
  if (f.kcal === null) {
    ecartes.push(f.name);
    continue;
  }
  const inconnues = [];
  const traces = [];
  const v = {};
  for (const [c, cle] of Object.entries(CLES)) {
    if (f[c] !== null) v[cle] = r1(Math.min(f[c], cle === 'kcal' ? 900 : 100));
    else if (f.raw[c] === 'traces') {
      v[cle] = 0;
      traces.push(cle);
    } else {
      // « - » dans Ciqual : valeur non mesurée. Enregistrée à 0 mais marquée inconnue, jamais présentée comme un zéro.
      v[cle] = 0;
      inconnues.push(cle);
    }
  }
  aliments.push({
    id: uuid5(`coachos/ciqual/${f.code}`),
    nom: f.name,
    categorie: f.group === '-' ? undefined : f.group,
    ...v,
    contient: contientCiqual(f.name, f.group),
    source: 'base',
    codeCiqual: f.code,
    ...(inconnues.length ? { valeursInconnues: inconnues } : {}),
    ...(traces.length ? { traces } : {}),
  });
}
aliments.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
writeFileSync(join(racine, 'src/data/aliments-base.json'), JSON.stringify(aliments));

// ——— Recettes ———

const { refs } = lire('recipeFoods.json');
const recettesZite = lire('recipes.json');

const CONTIENT_ALLERGENE = { Gluten: 'gluten', Lait: 'lait', 'Œuf': 'oeuf', Poisson: 'poisson', 'Crustacés': 'fruits_de_mer', Mollusques: 'fruits_de_mer' };
const REFS_MER = /prawn|seafood|shrimp|mussel|squid/i;
const REFS_POISSON = /cod|salmon|tuna|trout|fish|mackerel|sardine|haddock/i;
const VIANDE_DANS_LE_NOM = mots(['poulet', 'boeuf', 'porc', 'agneau', 'dinde', 'jambon', 'lard', 'bacon', 'chorizo', 'saucisse', 'pancetta', 'veau', 'canard', 'volaille', 'viande', 'prosciutto', 'merguez', 'gelatine']);

function contientIngredient(i) {
  const c = new Set();
  for (const a of i.allergens ?? []) if (CONTIENT_ALLERGENE[a]) c.add(CONTIENT_ALLERGENE[a]);
  if (i.animal === 'dairy') c.add('lait');
  if (i.animal === 'egg') c.add('oeuf');
  if (i.animal === 'honey') c.add('miel');
  if (i.animal === 'meat') {
    // L'export classe aussi le poisson en « meat » : l'allergène et la référence de protéine disent lequel.
    const ref = i.proteinRef ?? '';
    const marin = c.has('poisson') || c.has('fruits_de_mer') || REFS_MER.test(ref) || REFS_POISSON.test(ref);
    if (REFS_MER.test(ref)) c.add('fruits_de_mer');
    else if (REFS_POISSON.test(ref)) c.add('poisson');
    if (!marin || VIANDE_DANS_LE_NOM.test(sansAccents(i.label))) c.add('viande');
  }
  return [...c];
}

const majuscule = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// Format compact : les champs vides sont omis, l'app les complète à la lecture (lireIngredient).
// L'export donne les quantités pour une portion ; Coach OS les garde pour la recette entière (× portions).
const ingredient = (portions) => (i) => {
  const ref = i.proteinRef ? refs[i.proteinRef] : undefined;
  const amount = i.amount === null || i.amount === undefined ? i.amount : i.amount * portions;
  const grammes = (ref && i.proteinGrams ? i.proteinGrams : i.amountUnit === 'g' && i.amount ? i.amount : 0) * portions;
  const contient = contientIngredient(i);
  return {
    nom: majuscule(i.label.trim()),
    ...(grammes ? { quantiteG: r1(grammes) } : {}),
    // Valeurs pour 100 g connues seulement pour les protéines de référence (Ciqual) : les autres viennent des macros publiées par portion.
    ...(ref ? { kcal: ref.kcal, proteines: ref.protein, glucides: ref.carbs, lipides: ref.fat } : { valeursInconnues: true }),
    ...(amount !== null && amount !== undefined && !(i.amountUnit === 'g' && r1(amount) === r1(grammes)) ? { quantite: r1(amount * 100) / 100 } : {}),
    unite: i.amountUnit,
    ...(i.amountApprox ? { approximatif: true } : {}),
    ...(i.optional ? { facultatif: true } : {}),
    ...(contient.length ? { contient } : {}),
  };
};

const macros = (m) => ({ kcal: r1(m.kcal), proteines: r1(m.protein), glucides: r1(m.carbs), lipides: r1(m.fat) });
const etapes = (liste) => (liste?.length ? liste.map((s, n) => `${n + 1}. ${s.replace(/\{(\d+)ml\}/g, '$1 ml')}`).join('\n') : undefined);
const REGIME = { omnivore: 'omnivore', vegetarien: 'vegetarien', vegan: 'vegan' };

const recettes = recettesZite.map((y) => {
  const [origine, ...autres] = [y.variants.find((v) => v.id === 'original') ?? y.variants[0], ...y.variants.filter((v) => v.id !== 'original')];
  const portions = Math.min(50, Math.max(1, Math.round(y.yield)));
  return {
    id: uuid5(`coachos/recette/zite/${y.id}`),
    titre: y.name,
    portions,
    tempsMin: y.minutes || undefined,
    etapes: etapes(y.steps),
    ingredients: origine.ingredients.map(ingredient(portions)),
    macrosPortion: macros(origine.macros),
    regimeSource: REGIME[origine.diet],
    variantes: autres.map((v) => ({
      id: v.id,
      libelle: v.label,
      regime: REGIME[v.diet],
      macrosPortion: macros(v.macros),
      ingredients: v.ingredients.map(ingredient(portions)),
      ...(v.notes?.length ? { notes: v.notes } : {}),
      ...(v.steps?.length ? { etapes: etapes(v.steps) } : {}),
    })),
    origine: {
      ref: `zite:${y.id}`,
      nom: y.sourceName,
      url: y.source,
      ...(y.rating ? { note: y.rating, votes: y.votes } : {}),
      verifieLe: y.checked,
      cuisine: y.cuisine,
      methode: y.method,
      prepMin: y.prepMinutes,
    },
    types: [...new Set(y.meals)],
    statut: 'brouillon',
    regimesConfirmes: [],
  };
});
writeFileSync(join(racine, 'supabase/donnees/recettes-zite.json'), JSON.stringify(recettes));
// La démo en montre une sur cinq.
writeFileSync(join(racine, 'src/data/recettes-demo.json'), JSON.stringify(recettes.filter((_, n) => n % 5 === 0)));

console.error(`${aliments.length} aliments Ciqual (${ecartes.length} écartés faute de calories), ${recettes.length} recettes, ${recettes.reduce((n, r) => n + r.variantes.length, 0)} variantes.`);

// ——— SQL ———

if (option === '--sql') {
  if (!/^[0-9a-f-]{36}$/.test(coachId ?? '')) throw new Error('Indique le coach_id du coach qui reçoit les recettes.');
  mkdirSync(dossierSql, { recursive: true });
  const t = (v) => (v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const tab = (l) => t(`{${l.join(',')}}`);
  const json = (v) => (v === undefined ? 'null' : `${t(JSON.stringify(v))}::jsonb`);
  const morceaux = (liste, taille) => Array.from({ length: Math.ceil(liste.length / taille) }, (_, k) => liste.slice(k * taille, (k + 1) * taille));

  morceaux(recettes, 30).forEach((paquet, k) => {
    const lignes = paquet.map(
      (r) =>
        `(${t(r.id)}, ${t(coachId)}, ${t(r.titre)}, ${r.portions}, ${r.tempsMin ?? 'null'}, ${t(r.etapes)}, ${json(r.ingredients)}, 'brouillon', ${json(r.macrosPortion)}, ${json(r.variantes)}, ${json(r.origine)}, ${tab(r.types)}, ${t(r.regimeSource)}, ${t(r.origine.ref)})`,
    );
    // Une recette déjà importée garde ce que le coach en a fait (approbation, retouches).
    writeFileSync(
      join(dossierSql, `recettes-${k + 1}.sql`),
      `insert into public.recettes (id, coach_id, titre, portions, temps_min, etapes, ingredients, statut, macros_portion, variantes, origine, types, regime_source, ref_externe) values\n${lignes.join(',\n')}\non conflict (id) do nothing;\n`,
    );
  });
}
