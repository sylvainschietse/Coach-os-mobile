// Les textes développés du compte rendu : regard du coach, explication de chaque test et suite du travail,
// priorités expliquées, actions de la semaine, prochaines étapes.
// Rédigés par l'IA quand le compte en ligne est branché ; sinon proposés par le modèle ci-dessous.
// Les tournures du modèle sont un point de départ, à valider avec Sylvain. Elles donnent une direction de travail,
// jamais d'exercice précis, de durée ou de charge, et aucune note globale.

import { preparerSeance } from './briefing';
import type { Booster, Contact } from './crm';
import { ENTRETIEN, syntheseEvaluation, TESTS, type IdTest } from './evaluation';

export interface Redaction {
  regard?: string;
  /** Ce que dit le résultat et la suite du travail, par test renseigné. */
  tests?: Partial<Record<IdTest, string>>;
  /** Explication de chaque priorité, dans l'ordre de booster.priorites. */
  priorites?: string[];
  semaine?: string[];
  suite?: string[];
  source?: 'ia' | 'modele' | 'coach';
}

/** Les priorités sont rangées dans booster.priorites ; leurs explications dans la rédaction. */
export type RedactionGeneree = Redaction & { titresPriorites: string[] };

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const liste = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs.at(-1)}`);

const ARTICLE: Record<IdTest, string> = {
  poussee: 'la poussée', tirage: 'le tirage', jambes: 'les jambes', cardio: 'le cardio', mobilite: 'la mobilité', posture: 'la posture',
};

const ZONE: Record<'poussee' | 'tirage' | 'jambes', string> = {
  poussee: 'le haut du corps en poussée',
  tirage: 'le dos et les bras en tirage',
  jambes: 'les jambes',
};

const FORCE: Record<string, [string, string]> = {
  'Très à l’aise': ['Tu es très à l’aise sur {zone} : c’est un vrai point d’appui.', 'On s’en servira pour progresser plus vite, en augmentant l’exigence au fil des semaines.'],
  Correct: ['Le niveau est correct sur {zone} : la base est là.', 'On va consolider la technique, puis augmenter progressivement la difficulté.'],
  Difficile: ['Sur {zone}, l’effort reste encore important pour toi.', 'On commencera par des variantes adaptées pour construire ta force pas à pas, sans brûler les étapes.'],
  'Très limité': ['Sur {zone}, c’est aujourd’hui ton point le plus fragile.', 'On partira de mouvements très accessibles pour poser des bases solides, en toute sécurité.'],
};

const CARDIO: Record<string, [string, string]> = {
  'Bonne aisance': ['Tu as montré une bonne aisance sur l’effort cardio.', 'On pourra rapidement varier les intensités pour continuer à progresser.'],
  'Aisance correcte': ['Ton endurance est correcte : tu tiens l’effort.', 'On va la développer régulièrement pour que l’effort devienne plus facile.'],
  'Essoufflement marqué': ['L’essoufflement est arrivé vite pendant l’effort.', 'On construira ton endurance progressivement, à une intensité où tu peux encore parler.'],
  'Très difficile': ['L’effort cardio a été très difficile pour toi aujourd’hui.', 'On reprendra en douceur, avec des efforts courts et une récupération suffisante.'],
  'Test interrompu': ['Le test cardio a été interrompu.', 'On reprendra à une intensité plus douce, et on en reparlera ensemble.'],
};

const MOBILITE: Record<string, [string, string]> = {
  Bonne: ['Ta mobilité est bonne.', 'On l’entretiendra au fil des séances.'],
  Correcte: ['Ta mobilité est correcte.', 'Un peu de mobilité régulière suffira à l’entretenir.'],
  'Légèrement limitée': ['Ta mobilité est légèrement limitée', 'Quelques moments de mobilité ciblée dans tes séances suffiront à gagner en aisance.'],
  'Nettement limitée': ['Ta mobilité est nettement limitée', 'On intégrera de la mobilité ciblée à chaque séance : tu gagneras en confort au quotidien et en qualité de mouvement.'],
  'Très limitée': ['Ta mobilité est très limitée', 'La mobilité sera une vraie priorité de travail, avec des mouvements doux et réguliers.'],
};

const POSTURE: Record<string, [string, string]> = {
  RAS: ['Rien de particulier à signaler sur ta posture.', 'On restera attentifs à la qualité de tes placements.'],
  'Légère asymétrie': ['Une légère asymétrie est visible', 'On travaillera l’équilibre entre ton côté droit et ton côté gauche.'],
  'Asymétrie nette': ['Une asymétrie nette est visible', 'On rééquilibrera les deux côtés et on suivra son évolution.'],
  'Compensation marquée': ['Ton corps compense nettement', 'On travaillera le placement et le contrôle pour que chaque zone fasse sa part.'],
  'À approfondir': ['Ta posture mérite d’être observée plus en détail.', 'On y reviendra lors d’une prochaine séance.'],
};

const OBSERVATION: Record<string, string> = {
  'Amplitude limitée': 'l’amplitude du mouvement reste limitée',
  'Gainage perdu': 'le gainage se relâche en cours d’effort',
  'Épaules instables': 'les épaules manquent de stabilité',
  Asymétrie: 'un côté travaille plus que l’autre',
  Compensation: 'le corps compense pour finir le mouvement',
  'Douleur / gêne': 'une gêne est apparue',
  'Contrôle scapulaire limité': 'les omoplates sont encore difficiles à contrôler',
  'Compensation du tronc': 'le buste compense pour tirer',
  'Manque de contrôle': 'le mouvement manque encore de contrôle',
  'Genoux instables': 'les genoux ont tendance à rentrer ou à bouger',
  'Équilibre limité': 'l’équilibre est encore fragile',
  'Compensation du dos': 'le dos compense',
  'Rythme stable': 'tu as su garder un rythme régulier',
  'Récupération rapide': 'tu récupères vite',
  'Récupération lente': 'la récupération prend du temps',
  'Fatigue précoce': 'la fatigue arrive tôt',
  Gêne: 'une gêne est apparue',
  Douleur: 'une douleur est apparue',
};

const ZONES: Record<string, string> = {
  Chevilles: 'des chevilles', Hanches: 'des hanches', Épaules: 'des épaules', Thorax: 'du thorax',
  Bassin: 'du bassin', Tête: 'de la tête', Dos: 'du dos', Appuis: 'des appuis',
};

/** Ce qu'une observation ajoute à la suite du travail. */
const SUITE_OBSERVATION: Record<string, string> = {
  'Gainage perdu': 'Le gainage fera partie de chaque séance.',
  Asymétrie: 'On travaillera aussi chaque côté séparément pour rééquilibrer.',
  'Douleur / gêne': 'On adaptera les mouvements pour qu’ils restent confortables.',
  'Contrôle scapulaire limité': 'On apprendra à placer et contrôler tes épaules.',
  'Genoux instables': 'On soignera l’alignement des genoux à chaque mouvement.',
  'Équilibre limité': 'On ajoutera du travail d’équilibre et de stabilité.',
  Douleur: 'On adaptera l’intensité et on surveillera cette gêne.',
  Gêne: 'On adaptera l’intensité et on surveillera cette gêne.',
};

function explicationTest(id: IdTest, resultat: string, observations: string[], rpe: number | undefined): string | undefined {
  const table = id === 'cardio' ? CARDIO : id === 'mobilite' ? MOBILITE : id === 'posture' ? POSTURE : FORCE;
  const base = table[resultat];
  if (!base) return undefined; // Non réalisé, non adapté, non évalué : rien à expliquer.
  const zone = id in ZONE ? ZONE[id as keyof typeof ZONE] : '';
  let [constat, suite] = base.map((s) => s.replace('{zone}', zone));
  const phrases: string[] = [];

  if (id === 'mobilite' || id === 'posture') {
    // Les observations sont ici des zones du corps.
    const zones = observations.map((o) => ZONES[o]).filter(Boolean);
    if (!constat.endsWith('.')) constat += zones.length ? `, surtout au niveau ${liste(zones)}.` : '.';
    if (observations.includes('Droite / gauche') || observations.includes('Asymétrie')) constat += ' Une différence entre ton côté droit et ton côté gauche est visible.';
    if (observations.includes('Douleur / gêne')) suite += ' On respectera tes sensations et on surveillera la gêne ressentie.';
    phrases.push(constat);
  } else {
    phrases.push(constat);
    const vus = observations.map((o) => OBSERVATION[o]).filter(Boolean);
    if (vus.length) phrases.push(`J’ai noté que ${liste(vus)}.`);
    if (id === 'cardio' && rpe) phrases.push(`Tu as estimé ton effort à ${rpe}/10${rpe >= 8 ? ' : c’était exigeant, et c’est normal au départ' : ''}.`);
    const ajouts = observations.map((o) => SUITE_OBSERVATION[o]).filter((x, i, xs) => x && xs.indexOf(x) === i);
    if (ajouts.length) suite = `${suite} ${ajouts.join(' ')}`;
  }
  phrases.push(suite);
  return phrases.join(' ');
}

type Theme = 'regularite' | 'alimentation' | 'sommeil' | 'stress' | 'hydratation' | 'mobilite' | 'cardio' | 'force';

const THEMES: [Theme, RegExp][] = [
  ['sommeil', /sommeil|dorm|récup/i],
  ['stress', /stress|anxi|détente|mental/i],
  ['alimentation', /aliment|nutri|manger|repas|protéin|grignot/i],
  ['hydratation', /hydrat|\beau\b|boire/i],
  ['mobilite', /mobilit|souplesse|étirement/i],
  ['cardio', /cardio|endurance|courir|course|souffle/i],
  ['force', /force|renfor|muscl|gainage|épaule|dos|jambe/i],
  ['regularite', /régular|séance|entraîn|bouger|activité|routine|fois par semaine/i],
];

const EXPLICATION_THEME: Record<Theme, string> = {
  regularite: 'La régularité est la clé des résultats. Mieux vaut des séances accessibles et fréquentes que des efforts intenses mais irréguliers : c’est ce qui installe l’habitude.',
  alimentation: 'Une alimentation plus équilibrée t’aidera à avoir plus d’énergie et à progresser. L’idée n’est pas de tout changer, mais d’améliorer progressivement tes habitudes, repas après repas.',
  sommeil: 'Le sommeil est la base de la récupération et de l’énergie. Mieux dormir t’aidera à rester motivé(e), à mieux récupérer de tes séances et à mieux gérer ton quotidien.',
  stress: 'Le stress joue sur l’énergie, le sommeil et l’envie de bouger. Apprendre à relâcher la pression fait partie du travail, au même titre que l’entraînement.',
  hydratation: 'Bien boire paraît simple, mais c’est un levier immédiat sur l’énergie, la concentration et la récupération.',
  mobilite: 'Gagner en mobilité te rendra plus à l’aise dans tes mouvements, à l’entraînement comme au quotidien, et protégera tes articulations.',
  cardio: 'Développer ton endurance rendra les efforts du quotidien plus faciles et te donnera plus d’énergie. On avance progressivement, sans se mettre dans le rouge.',
  force: 'Renforcer ton corps te donnera plus de solidité et de confiance dans tes mouvements. On construit la force étape par étape, avec une technique propre.',
};

const themeDe = (texte: string): Theme | undefined => THEMES.find(([, motif]) => motif.test(texte))?.[0];

function habitudes(r: Record<string, string>) {
  const note = (v: string | undefined) => (v ? Number(v) : undefined);
  return {
    sommeil: r.sommeilHeures === 'Moins de 6 h' || (note(r.sommeilQualite) ?? 10) <= 4 || r.reveilRepose === 'Rarement',
    alimentation:
      r.alimentation === 'À améliorer' || r.alimentation === 'Très déséquilibrée' || r.grignotage === 'Souvent' || r.grignotage === 'Tous les jours' ||
      r.ultraTransformes === '3 à 5 fois par semaine' || r.ultraTransformes === 'Presque tous les jours' || r.restaurant === '3 fois par semaine ou plus',
    proteines: r.proteines === 'Rarement' || r.proteines === 'Jamais',
    fruits: r.fruitsLegumes === 'Non',
    sucre: r.boissonsSucrees === 'Plusieurs fois par semaine' || r.boissonsSucrees === 'Tous les jours',
    eau: r.eau === 'Moins de 1 L' || r.eau === 'Entre 1 et 1,5 L',
    stress: (note(r.stress) ?? 0) >= 7,
  };
}

/** Les textes proposés sans IA, à partir du bilan, des tests et des priorités saisies par le coach. */
export function redactionModele(contact: Contact, booster: Booster, reponses: Record<string, string> | undefined): Redaction {
  const r = reponses ?? {};
  const h = habitudes(r);
  const e = booster.evaluation;

  const tests: Partial<Record<IdTest, string>> = {};
  const atouts: string[] = [];
  const fragiles: string[] = [];
  for (const t of TESTS) {
    const res = e?.tests[t.id];
    if (!res?.resultat) continue;
    const texte = explicationTest(t.id, res.resultat, res.observations, res.rpe);
    if (texte) tests[t.id] = texte;
    const rang = t.resultats.indexOf(res.resultat);
    if (rang <= 1 && t.id !== 'posture') atouts.push(ARTICLE[t.id]);
    if (rang >= 2 && rang <= 4 && !/^(Non |À approfondir|Test interrompu)/.test(res.resultat)) fragiles.push(ARTICLE[t.id]);
  }

  const aTravailler = [
    fragiles.length ? `${liste(fragiles)} côté physique` : '',
    h.alimentation || h.proteines || h.fruits || h.sucre ? 'l’équilibre alimentaire' : '',
    h.eau ? 'l’hydratation' : '',
    h.sommeil ? 'le sommeil' : '',
    h.stress ? 'la gestion du stress' : '',
  ].filter(Boolean);
  const objectif = r.objectif === 'Autre' ? r.objectifAutre : r.objectif;
  const regard = [
    `${contact.prenom}, merci pour ton investissement pendant ce Booster.`,
    atouts.length ? `Tu as de bonnes bases, notamment sur ${liste(atouts)}, et c’est un vrai point d’appui pour la suite.` : 'Tu as fait le premier pas, et c’est souvent le plus difficile.',
    aTravailler.length ? `Les points à travailler concernent surtout ${liste(aTravailler)}.` : '',
    objectif ? `Ton objectif (${minuscule(objectif)}) est tout à fait atteignable avec un cadre clair et progressif.` : 'Avec un cadre clair et progressif, tu vas voir des résultats.',
    'L’idée n’est pas de tout changer d’un coup, mais d’avancer étape par étape, à ton rythme.',
  ]
    .filter(Boolean)
    .join(' ');

  const priorites = booster.priorites
    .filter((p) => p.trim())
    .map((p) => {
      const theme = themeDe(p);
      return theme ? EXPLICATION_THEME[theme] : 'C’est l’axe sur lequel on concentre nos efforts en premier : de petites actions répétées chaque semaine feront la différence.';
    });

  const seances = r.seancesPossibles?.match(/^\d/)?.[0];
  const semaine = [
    seances ? `Planifier tes ${seances} séance${seances === '1' ? '' : 's'} de la semaine dans ton agenda` : 'Planifier tes séances de la semaine dans ton agenda',
    h.alimentation ? 'Préparer tes repas à l’avance quand c’est possible' : '',
    h.proteines ? 'Ajouter une source de protéines à chaque repas' : '',
    h.fruits ? 'Ajouter des fruits ou des légumes à chaque repas' : '',
    h.sucre ? 'Remplacer une boisson sucrée par de l’eau chaque jour' : '',
    h.eau ? 'Boire entre 1,5 et 2 L d’eau par jour' : '',
    h.sommeil ? 'Te coucher 15 minutes plus tôt que d’habitude' : '',
    h.stress ? 'Garder chaque jour un moment rien qu’à toi pour décompresser' : '',
  ]
    .filter(Boolean)
    .slice(0, 4);
  semaine.push('Noter chaque soir ton énergie et ta motivation de 1 à 10');

  const suite = [
    'Suivre tes entraînements',
    h.alimentation || h.proteines || h.fruits || h.sucre ? 'Approfondir la nutrition' : '',
    h.sommeil || h.stress ? 'Mettre en place des routines' : '',
    'Faire un point ensemble dans 3 à 4 semaines',
  ].filter(Boolean);

  return { regard, tests, priorites, semaine, suite, source: 'modele' };
}

/** Tout ce que l'IA peut lire pour rédiger : faits saisis, sans identifiant ni coordonnées. */
export function dossierRedaction(contact: Contact, booster: Booster, reponses: Record<string, string> | undefined): string {
  const b = reponses ? preparerSeance(reponses) : undefined;
  const bloc = (titre: string, lignes: (string | undefined)[]) => {
    const propres = lignes.filter((l): l is string => !!l?.trim());
    return propres.length ? `## ${titre}\n${propres.map((l) => `- ${l}`).join('\n')}` : `## ${titre}\n(non renseigné)`;
  };
  return [
    `Prénom du client : ${contact.prenom}`,
    bloc('Objectif (bilan d’accueil)', b?.objectif ?? []),
    bloc('Santé déclarée', b?.sante ?? []),
    bloc('Profil sportif', b?.profil ?? []),
    bloc('Habitudes qui ressortent du bilan', b?.leviers ?? []),
    bloc('Motivation et attentes', b?.motivation ?? []),
    bloc('Entretien pendant le Booster', ENTRETIEN.map((q) => (booster.entretien?.[q.id]?.trim() ? `${q.libelle} ${booster.entretien[q.id].trim()}` : undefined))),
    `## Évaluation physique (résultat | effort perçu | observations du coach)\n${booster.evaluation ? syntheseEvaluation(booster.evaluation) : '(aucun test saisi)'}`,
    bloc('Priorités choisies par le coach', booster.priorites),
    bloc('Mot du coach', [booster.compteRendu]),
  ].join('\n\n');
}

/** Une rédaction générée remplit les champs vides des priorités, sans écraser celles choisies par le coach. */
export function appliquerRedaction(booster: Booster, g: RedactionGeneree): { priorites: string[]; redaction: Redaction } {
  const coach = booster.priorites.filter((p) => p.trim());
  const priorites = coach.length >= 3 ? coach : [...coach, ...g.titresPriorites.slice(coach.length)].slice(0, 3);
  const { titresPriorites: _titres, ...redaction } = g;
  return { priorites, redaction };
}
