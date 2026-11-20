// Lecture des tests vidéo et photo du bilan postural : ce que mesure chaque angle, ce que veut dire un écart,
// les muscles probablement faibles ou raides, la symétrie droite / gauche, les proportions des segments,
// les priorités, un plan de travail et une synthèse à montrer au client.
// Tout reste des hypothèses de coaching à confirmer par les tests du coach, jamais un diagnostic médical.
import { angleTroisPoints, type Point } from './mesure-angle';
import { constats, pistes, type BilanPostural, type Constat, type IdConstat, type Niveau, type Piste, type VueId } from './bilan-postural';

const deg = (r: number) => (r * 180) / Math.PI;
const arrondi = (n: number) => Math.round(n * 10) / 10;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

type Cote = 'D' | 'G';
const nomCote = (c: Cote) => (c === 'D' ? 'droite' : 'gauche');
const autre = (c: Cote): Cote => (c === 'D' ? 'G' : 'D');

/** « squatGenouD » → « squatGenou » ; le côté → « D ». */
export const famille = (id: IdConstat) => id.replace(/[DG]$/, '');
export const coteDe = (id: IdConstat): Cote | undefined => (/[DG]$/.test(id) ? (id.slice(-1) as Cote) : undefined);

// ---------- Ce que mesure chaque angle ----------

export interface Explication {
  /** Ce que mesure l'angle, en clair. */
  mesure: string;
  /** Ce que veut dire un écart avec la norme. */
  sens: string;
  /** Tests simples pour confirmer en séance. */
  confirmer: string[];
}

export const EXPLICATIONS: Record<string, Explication> = {
  epaules: {
    mesure: 'La pente de la ligne qui relie les deux épaules, debout et relâché.',
    sens: 'Une épaule plus haute vient souvent d’un trapèze ou d’un carré des lombes plus tendu de ce côté, d’une habitude (sac, téléphone) ou d’un bassin qui n’est pas à niveau.',
    confirmer: ['Compare la souplesse des trapèzes en inclinant la tête de chaque côté.', 'Regarde si le bassin penche du même côté.'],
  },
  bassinFrontal: {
    mesure: 'La pente de la ligne qui relie les deux os du bassin (épines iliaques avant), debout.',
    sens: 'Un bassin plus haut d’un côté peut venir d’un appui préféré, d’un carré des lombes raide ou d’un moyen fessier faible de l’autre côté.',
    confirmer: ['Tenue sur une jambe 30 s de chaque côté.', 'Test d’Adams : client penché en avant, regarde si le dos est symétrique.'],
  },
  genouStatique: {
    mesure: 'L’écart du genou avec la ligne hanche-cheville, debout, vu de face.',
    sens: 'Un genou qui rentre (valgus) charge l’intérieur du genou ; un genou qui part vers l’extérieur (varus) charge l’extérieur. Debout, c’est souvent lié à la forme des os : ce qui compte surtout, c’est ce qui se passe en mouvement.',
    confirmer: ['Compare avec le squat de face : le genou rentre-t-il davantage en descendant ?'],
  },
  omoplates: {
    mesure: 'La pente de la ligne qui relie la pointe des deux omoplates, de dos.',
    sens: 'Une omoplate plus haute suit souvent l’épaule du même côté : trapèze supérieur ou élévateur de l’omoplate plus tendu.',
    confirmer: ['Bras levés au-dessus de la tête : les omoplates montent-elles de la même façon ?'],
  },
  talon: {
    mesure: 'L’angle entre le tendon d’Achille et le talon, vu de dos.',
    sens: 'Un talon qui part vers l’extérieur montre un pied qui s’affaisse (pronation) : la voûte plantaire travaille moins et le genou a tendance à rentrer. L’inverse (supination) charge le bord externe du pied.',
    confirmer: ['Regarde l’usure des chaussures.', 'Test de la voûte : le client creuse son pied sans plier les orteils.'],
  },
  tete: {
    mesure: 'L’angle entre l’horizontale et la ligne qui va de la base du cou (C7) à l’oreille, de profil.',
    sens: 'En dessous de 50°, la tête est projetée vers l’avant : la nuque porte plus de poids, ce qui va souvent avec des tensions et un haut du dos arrondi.',
    confirmer: ['Dos au mur : l’arrière de la tête touche-t-il le mur sans lever le menton ?'],
  },
  bassinSagittal: {
    mesure: 'La bascule du bassin vers l’avant, entre l’épine iliaque arrière et l’épine iliaque avant, de profil.',
    sens: 'Trop basculé vers l’avant : bas du dos cambré, fléchisseurs de hanche souvent raides et fessiers peu actifs. Basculé vers l’arrière : bas du dos plat, ischio-jambiers souvent raides.',
    confirmer: ['Test de Thomas pour les fléchisseurs de hanche.', 'Jambe tendue levée allongé pour les ischio-jambiers.'],
  },
  cyphose: {
    mesure: 'La courbure du haut du dos, entre la base du cou et la dernière côte.',
    sens: 'Au-delà de 45°, le haut du dos est arrondi : pectoraux souvent raides, muscles entre les omoplates peu toniques.',
    confirmer: ['Allongé sur le dos, bras au-dessus de la tête : touchent-ils le sol sans cambrer ?'],
  },
  lordose: {
    mesure: 'La cambrure du bas du dos, entre la dernière côte et le sacrum.',
    sens: 'Très cambré : souvent lié à un bassin basculé vers l’avant. Plat : bassin basculé vers l’arrière, dos moins prêt à encaisser les charges.',
    confirmer: ['Allongé genoux pliés : la main passe-t-elle facilement sous les lombaires ?'],
  },
  tronc: {
    mesure: 'La position des épaules par rapport au bassin, de profil.',
    sens: 'Épaules en arrière et bassin poussé vers l’avant : posture « relâchée », on se tient sur ses ligaments plutôt que sur ses muscles.',
    confirmer: ['Demande au client de se tenir droit : la posture se corrige-t-elle facilement ?'],
  },
  genouProfil: {
    mesure: 'L’angle du genou de profil, entre la hanche, le genou et la cheville.',
    sens: 'Un genou qui part en arrière (recurvatum) se verrouille sur ses ligaments : à surveiller sous charge.',
    confirmer: ['Genoux légèrement déverrouillés : le client sent-il ses cuisses travailler ?'],
  },
  squatGenou: {
    mesure: 'L’écart du genou avec la ligne hanche-cheville au point le plus bas du squat, de face.',
    sens: 'Au-delà de 10°, le genou rentre en descendant (valgus dynamique) : le moyen fessier ne tient pas assez la cuisse, ou la cheville manque de souplesse et le pied s’affaisse.',
    confirmer: ['Refais le squat avec un élastique au-dessus des genoux : le genou reste-t-il dans l’axe ?', 'Talons surélevés : si le genou se corrige, la cheville est en cause.'],
  },
  squatBassin: {
    mesure: 'La pente du bassin au point le plus bas du squat, de face.',
    sens: 'Un bassin qui penche montre que le poids part sur une jambe : souvent la plus forte, ou celle qui fait moins mal.',
    confirmer: ['Squat sur deux balances : compare le poids sous chaque pied.'],
  },
  squatTronc: {
    mesure: 'L’écart entre l’inclinaison du buste et celle du tibia au point le plus bas, de profil.',
    sens: 'Idéalement le buste est à peu près parallèle au tibia. S’il penche beaucoup plus, c’est souvent la cheville qui manque de souplesse, des fessiers ou un gainage qui lâchent, ou simplement des cuisses longues (voir la morphologie).',
    confirmer: ['Talons surélevés sur une cale : si le buste se redresse, la cheville est en cause.'],
  },
  squatProfondeur: {
    mesure: 'L’angle de la cuisse avec l’horizontale au point le plus bas : positif quand la hanche passe sous le genou.',
    sens: 'Un squat qui s’arrête haut vient souvent des chevilles ou des hanches qui manquent de souplesse, ou d’un manque de contrôle en bas du mouvement.',
    confirmer: ['Squat assisté en tenant un support : descend-il plus bas ?'],
  },
  squatCheville: {
    mesure: 'L’inclinaison du tibia vers l’avant au point le plus bas : c’est la flexion de cheville.',
    sens: 'Sous 25°, la cheville plie peu : le buste doit pencher, les talons décollent ou les pieds s’ouvrent pour compenser.',
    confirmer: ['Test genou au mur : pied à 10 cm du mur, le genou touche-t-il sans décoller le talon ?'],
  },
  unipodalGenou: {
    mesure: 'L’écart du genou d’appui avec la ligne hanche-cheville en squat sur une jambe, de face.',
    sens: 'Au-delà de 10°, le genou rentre : le moyen fessier du côté de l’appui ne contrôle pas assez la cuisse. C’est le test le plus parlant pour la course et les sauts.',
    confirmer: ['Test de force en abduction allongé sur le côté, compare gauche et droite.'],
  },
  unipodalBassin: {
    mesure: 'La pente du bassin quand le client fléchit sur une jambe.',
    sens: 'Le bassin s’affaisse côté jambe levée (signe de Trendelenburg) : le moyen fessier du côté de l’appui ne le tient pas assez. À la course ou dans les escaliers, le genou et le bas du dos encaissent ce manque à chaque pas.',
    confirmer: ['Tenue sur une jambe 30 s, yeux ouverts puis fermés.', 'Test de force en abduction allongé sur le côté.'],
  },
  unipodalTronc: {
    mesure: 'La pente de la ligne des épaules en squat sur une jambe.',
    sens: 'Le buste penche vers la jambe d’appui pour garder l’équilibre : c’est une compensation d’un moyen fessier ou d’un gainage latéral qui manque de force.',
    confirmer: ['Refais le test mains sur la tête : la compensation devient-elle plus visible ?'],
  },
};

export const explication = (c: Constat): Explication | undefined => EXPLICATIONS[famille(c.id)];

// ---------- Muscles probablement faibles, raides ou forts ----------

export type ZoneMuscle =
  | 'pectoraux'
  | 'abdominaux'
  | 'flechisseursHanche'
  | 'adducteurs'
  | 'quadriceps'
  | 'voutePlantaire'
  | 'nuque'
  | 'hautDuDos'
  | 'grandDorsal'
  | 'lombaires'
  | 'moyenFessier'
  | 'grandFessier'
  | 'ischios'
  | 'mollets';

export const ZONES: Record<ZoneMuscle, { libelle: string; vue: 'face' | 'dos' }> = {
  pectoraux: { libelle: 'Pectoraux', vue: 'face' },
  abdominaux: { libelle: 'Abdominaux et gainage', vue: 'face' },
  flechisseursHanche: { libelle: 'Fléchisseurs de hanche (psoas)', vue: 'face' },
  adducteurs: { libelle: 'Adducteurs', vue: 'face' },
  quadriceps: { libelle: 'Quadriceps', vue: 'face' },
  voutePlantaire: { libelle: 'Voûte plantaire, tibial postérieur', vue: 'face' },
  nuque: { libelle: 'Nuque et trapèzes supérieurs', vue: 'dos' },
  hautDuDos: { libelle: 'Haut du dos (trapèzes moyens et inférieurs, rhomboïdes)', vue: 'dos' },
  grandDorsal: { libelle: 'Grand dorsal', vue: 'dos' },
  lombaires: { libelle: 'Bas du dos (lombaires, carré des lombes)', vue: 'dos' },
  moyenFessier: { libelle: 'Moyen fessier', vue: 'dos' },
  grandFessier: { libelle: 'Grand fessier', vue: 'dos' },
  ischios: { libelle: 'Ischio-jambiers', vue: 'dos' },
  mollets: { libelle: 'Mollets', vue: 'dos' },
};

export type EtatMuscle = 'faible' | 'raide' | 'fort';

interface Indice {
  zone: ZoneMuscle;
  cote?: Cote;
  etat: EtatMuscle;
}

const f = (zone: ZoneMuscle, cote?: Cote): Indice => ({ zone, cote, etat: 'faible' });
const r = (zone: ZoneMuscle, cote?: Cote): Indice => ({ zone, cote, etat: 'raide' });

/** Muscles en cause pour un constat hors norme (vide si dans la norme). */
export function musclesConstat(c: Constat): Indice[] {
  if (c.niveau === 'normal') return [];
  const cote = coteDe(c.id);
  const v = c.valeur;
  switch (famille(c.id)) {
    case 'genouStatique':
    case 'squatGenou':
    case 'unipodalGenou':
      return v > 0 ? [f('moyenFessier', cote), r('adducteurs', cote)] : [];
    case 'unipodalBassin':
    case 'unipodalTronc':
      return [f('moyenFessier', cote), f('abdominaux')];
    case 'talon':
      return v > 0 ? [f('voutePlantaire', cote), r('mollets', cote)] : [r('mollets', cote)];
    case 'tete':
      return [r('nuque'), f('hautDuDos')];
    case 'cyphose':
      return v > 45 ? [r('pectoraux'), f('hautDuDos')] : [];
    case 'bassinSagittal':
    case 'lordose':
      return c.texte.includes('avant') || c.texte.includes('très cambré')
        ? [r('flechisseursHanche'), r('lombaires'), f('grandFessier'), f('abdominaux')]
        : [r('ischios'), f('lombaires')];
    case 'tronc':
      return v < 0 ? [r('ischios'), f('flechisseursHanche'), f('grandFessier'), f('abdominaux')] : [];
    case 'genouProfil':
      return v > 0 ? [f('ischios')] : [];
    case 'squatTronc':
      return [r('mollets'), f('grandFessier'), f('abdominaux')];
    case 'squatCheville':
      return [r('mollets')];
    case 'squatProfondeur':
      return [r('mollets'), r('grandFessier')];
    default:
      return [];
  }
}

const MUSCLES_OBS: Record<string, Indice[]> = {
  'Talons qui décollent': [r('mollets')],
  'Pieds qui s’ouvrent': [r('mollets')],
  'Pieds qui s’affaissent': [f('voutePlantaire')],
  'Bras qui tombent vers l’avant': [r('grandDorsal'), r('pectoraux'), f('hautDuDos')],
  'Bas du dos qui s’arrondit': [r('ischios')],
  'Bas du dos qui se cambre': [r('flechisseursHanche'), f('abdominaux')],
};

export interface HypotheseMuscle {
  zone: ZoneMuscle;
  libelle: string;
  cote?: Cote;
  etat: EtatMuscle;
  /** Les mesures ou observations qui y mènent. */
  indices: string[];
}

/** Carte des muscles : faibles et raides d'après les constats, forts d'après les tests réussis. */
export function carteMuscles(b: BilanPostural | undefined): HypotheseMuscle[] {
  const res = new Map<string, HypotheseMuscle>();
  const noter = (i: Indice, source: string) => {
    const cle = `${i.zone}-${i.etat}-${i.cote ?? ''}`;
    const h = res.get(cle) ?? { zone: i.zone, libelle: ZONES[i.zone].libelle + (i.cote ? ` ${i.cote === 'D' ? 'droit' : 'gauche'}` : ''), cote: i.cote, etat: i.etat, indices: [] };
    if (!h.indices.includes(source)) h.indices.push(source);
    res.set(cle, h);
  };
  const liste = constats(b);
  for (const c of liste) for (const i of musclesConstat(c)) noter(i, c.titre);
  for (const [id, s] of Object.entries(b?.vues ?? {}) as [VueId, { observations: string[] }][]) {
    for (const o of s?.observations ?? []) {
      for (const i of MUSCLES_OBS[o] ?? []) noter(i, o);
      if (o === 'Tronc qui penche vers l’appui') noter(f('moyenFessier', id === 'unipodalDroit' ? 'D' : 'G'), o);
    }
  }
  // Forts : seulement là où rien ne signale un manque.
  const signale = (zone: ZoneMuscle, cote?: Cote) => [...res.values()].some((h) => h.zone === zone && h.etat !== 'fort' && (!h.cote || !cote || h.cote === cote));
  const parId = new Map(liste.map((c) => [c.id, c]));
  const ok = (...ids: IdConstat[]) => ids.every((id) => parId.get(id)?.niveau === 'normal');
  const fort = (zone: ZoneMuscle, source: string, cote?: Cote) => {
    if (!signale(zone, cote)) noter({ zone, cote, etat: 'fort' }, source);
  };
  if (ok('squatGenouD', 'squatGenouG')) fort('quadriceps', 'Genoux dans l’axe au squat');
  if (parId.has('squatCheville') && ok('squatCheville')) fort('mollets', 'Chevilles souples au squat');
  if (parId.has('squatProfondeur') && ok('squatProfondeur', 'squatTronc')) fort('grandFessier', 'Squat profond, buste parallèle au tibia');
  for (const cote of ['D', 'G'] as Cote[]) {
    if (parId.has(`unipodalGenou${cote}`) && ok(`unipodalGenou${cote}`, `unipodalBassin${cote}`)) fort('moyenFessier', `Squat sur la jambe ${nomCote(cote)} stable`, cote);
  }
  if (parId.has('cyphose') && ok('cyphose', 'tete')) fort('hautDuDos', 'Haut du dos et tête bien placés');
  const ordre: Record<EtatMuscle, number> = { faible: 0, raide: 1, fort: 2 };
  return [...res.values()].sort((a, b) => ordre[a.etat] - ordre[b.etat] || b.indices.length - a.indices.length);
}

// ---------- Points forts ----------

/** Ce qui va bien, en mots simples : pour le client autant que pour le coach. */
export function pointsForts(b: BilanPostural | undefined): string[] {
  const parId = new Map(constats(b).map((c) => [c.id, c]));
  const ok = (...ids: IdConstat[]) => ids.every((id) => parId.get(id)?.niveau === 'normal');
  const obs = new Set(Object.values(b?.vues ?? {}).flatMap((s) => s?.observations ?? []));
  const res: string[] = [];
  if (ok('squatGenouD', 'squatGenouG')) res.push('Genoux bien alignés au squat');
  if (parId.has('squatCheville') && ok('squatCheville') && !obs.has('Talons qui décollent')) res.push('Chevilles souples : talons au sol en bas du squat');
  if (parId.has('squatTronc') && ok('squatTronc')) res.push('Dos bien placé au squat, buste parallèle au tibia');
  if (parId.has('squatProfondeur') && (parId.get('squatProfondeur')?.valeur ?? -90) >= 0) res.push('Squat complet, hanche sous le genou');
  if (parId.has('squatBassin') && ok('squatBassin')) res.push('Poids bien réparti sur les deux jambes');
  for (const cote of ['D', 'G'] as Cote[]) {
    if (parId.has(`unipodalGenou${cote}`) && ok(`unipodalGenou${cote}`, `unipodalBassin${cote}`)) res.push(`Jambe ${nomCote(cote)} stable sur un pied`);
  }
  if (parId.has('tete') && ok('tete', 'cyphose')) res.push('Tête et haut du dos bien placés');
  if (parId.has('bassinSagittal') && ok('bassinSagittal', 'lordose')) res.push('Bassin et bas du dos bien placés');
  if (parId.has('epaules') && ok('epaules', 'bassinFrontal')) res.push('Épaules et bassin à niveau');
  return res;
}

// ---------- Droite / gauche ----------

export interface Asymetrie {
  titre: string;
  droite: number;
  gauche: number;
  niveauDroite: Niveau;
  niveauGauche: Niveau;
  ecart: number;
  /** Écart assez grand pour en parler. */
  net: boolean;
  /** Le côté qui s'écarte le plus de la norme. */
  coteFaible?: Cote;
}

const PAIRES: { famille: string; titre: string; seuil: number }[] = [
  { famille: 'squatGenou', titre: 'Genou au squat', seuil: 5 },
  { famille: 'unipodalGenou', titre: 'Genou sur une jambe', seuil: 5 },
  { famille: 'unipodalBassin', titre: 'Chute du bassin sur une jambe', seuil: 3 },
  { famille: 'unipodalTronc', titre: 'Buste sur une jambe', seuil: 4 },
  { famille: 'genouStatique', titre: 'Axe du genou debout', seuil: 4 },
  { famille: 'talon', titre: 'Talon', seuil: 4 },
];

export function asymetries(b: BilanPostural | undefined): Asymetrie[] {
  const parId = new Map(constats(b).map((c) => [c.id as string, c]));
  return PAIRES.flatMap(({ famille: fa, titre, seuil }) => {
    const d = parId.get(`${fa}D`);
    const g = parId.get(`${fa}G`);
    if (!d || !g) return [];
    const ecart = arrondi(Math.abs(d.valeur - g.valeur));
    const net = ecart > seuil;
    // Plus la valeur est haute, plus on s'écarte de la norme pour toutes ces mesures.
    return [{ titre, droite: d.valeur, gauche: g.valeur, niveauDroite: d.niveau, niveauGauche: g.niveau, ecart, net, coteFaible: net ? (d.valeur > g.valeur ? 'D' : 'G') : undefined }];
  });
}

/** Une phrase quand un côté compense l'autre : symétrique sur deux jambes, mais un côté lâche sur une jambe. */
export function compensation(b: BilanPostural | undefined): string | undefined {
  const a = asymetries(b);
  const deuxJambes = a.find((x) => x.titre === 'Genou au squat');
  const uneJambe = a.find((x) => x.net && x.titre.includes('une jambe'));
  if (!uneJambe?.coteFaible) return undefined;
  const cote = (c: Cote) => (c === 'D' ? 'droit' : 'gauche');
  const faible = cote(uneJambe.coteFaible);
  const fortCote = cote(autre(uneJambe.coteFaible));
  if (deuxJambes && !deuxJambes.net)
    return `Côté ${faible} plus faible sur une jambe, alors que le squat à deux jambes est symétrique : le côté ${fortCote} compense quand les deux pieds sont au sol.`;
  return `Le côté ${faible} est le plus faible : il lâche dès qu’il travaille seul.`;
}

// ---------- Qualités (radar) et score ----------

export interface Qualite {
  cle: string;
  libelle: string;
  /** Sur 10. */
  note: number;
}

const NOTE: Record<Niveau, number> = { normal: 10, leger: 6, marque: 3 };

const QUALITES: { cle: string; libelle: string; familles: string[]; obs: string[] }[] = [
  { cle: 'cheville', libelle: 'Mobilité cheville', familles: ['squatCheville', 'squatTronc'], obs: ['Talons qui décollent', 'Pieds qui s’ouvrent'] },
  { cle: 'hanche', libelle: 'Mobilité hanche', familles: ['squatProfondeur'], obs: ['Bas du dos qui s’arrondit'] },
  { cle: 'genou', libelle: 'Stabilité genou', familles: ['squatGenou', 'unipodalGenou', 'genouStatique'], obs: ['Pieds qui s’affaissent'] },
  { cle: 'bassin', libelle: 'Stabilité bassin', familles: ['unipodalBassin', 'unipodalTronc', 'squatBassin'], obs: ['Tronc qui penche vers l’appui', 'Perte d’équilibre', 'Poids déporté d’un côté'] },
  { cle: 'posture', libelle: 'Posture', familles: ['tete', 'cyphose', 'lordose', 'bassinSagittal', 'tronc', 'genouProfil', 'epaules', 'bassinFrontal', 'omoplates', 'talon'], obs: ['Bas du dos qui se cambre'] },
  { cle: 'epaules', libelle: 'Épaules', familles: ['cyphose', 'tete'], obs: ['Bras qui tombent vers l’avant'] },
];

/** Les qualités mesurées par les vues faites (une qualité sans mesure n'apparaît pas). */
export function qualites(b: BilanPostural | undefined): Qualite[] {
  const liste = constats(b);
  const vues = b?.vues ?? {};
  const obs = new Set(Object.values(vues).flatMap((s) => s?.observations ?? []));
  const squatFait = !!(vues.squatFace || vues.squatProfil);
  const res: Qualite[] = [];
  for (const q of QUALITES) {
    const notes = liste.filter((c) => q.familles.includes(famille(c.id))).map((c) => NOTE[c.niveau]);
    // Les observations ne comptent que si la vue qui permet de les voir a été faite.
    if (q.cle === 'epaules' && squatFait) notes.push(obs.has('Bras qui tombent vers l’avant') ? 4 : 10);
    else for (const o of q.obs) if (obs.has(o)) notes.push(4);
    if (!notes.length) continue;
    res.push({ cle: q.cle, libelle: q.libelle, note: arrondi(notes.reduce((s, n) => s + n, 0) / notes.length) });
  }
  const a = asymetries(b);
  if (a.length) {
    const seuils = new Map(PAIRES.map((p) => [p.titre, p.seuil]));
    const notes = a.map((x) => (x.net ? Math.max(2, 10 - (x.ecart - (seuils.get(x.titre) ?? 4)) * 1.5) : 10));
    res.push({ cle: 'symetrie', libelle: 'Symétrie G/D', note: arrondi(notes.reduce((s, n) => s + n, 0) / notes.length) });
  }
  return res;
}

/** Score sur 100 : moyenne des qualités mesurées. */
export function scoreMouvement(b: BilanPostural | undefined): number | undefined {
  const q = qualites(b);
  return q.length ? Math.round((q.reduce((s, x) => s + x.note, 0) / q.length) * 10) : undefined;
}

// ---------- Morphologie : longueur des segments et angles du squat ----------

export interface Morphologie {
  source: 'photo de profil' | 'squat de profil';
  /** Longueurs rapportées à la jambe (genou → cheville). */
  buste: number;
  cuisse: number;
  jambe: 1;
  lecture: string[];
  conseils: string[];
}

export function morphologie(b: BilanPostural | undefined): Morphologie | undefined {
  const pr = b?.vues.profil?.points;
  const sq = b?.vues.squatProfil?.points;
  const seg =
    pr?.acromion && pr.trochanter && pr.genou && pr.malleole
      ? { source: 'photo de profil' as const, e: pr.acromion, h: pr.trochanter, g: pr.genou, m: pr.malleole }
      : sq?.epaule && sq.hanche && sq.genou && sq.malleole
        ? { source: 'squat de profil' as const, e: sq.epaule, h: sq.hanche, g: sq.genou, m: sq.malleole }
        : undefined;
  if (!seg) return undefined;
  const jambe = distance(seg.g, seg.m);
  if (!jambe) return undefined;
  const cuisse = Math.round((distance(seg.h, seg.g) / jambe) * 100) / 100;
  const buste = Math.round((distance(seg.e, seg.h) / jambe) * 100) / 100;
  const lecture: string[] = [];
  const conseils: string[] = [];
  if (cuisse > 1.08) {
    lecture.push('Cuisses longues par rapport aux jambes : pour garder l’équilibre, le buste doit pencher davantage au squat. Ce n’est pas un défaut de technique, c’est la morphologie.');
    conseils.push('Pieds un peu plus écartés, pointes ouvertes à 20-30°', 'Squat goblet ou barre devant plutôt que barre haute', 'Soulevé de terre : la version sumo est souvent plus confortable', 'Une petite cale sous les talons aide à garder le buste droit');
  } else if (cuisse < 0.94) {
    lecture.push('Cuisses courtes par rapport aux jambes : le squat buste droit est naturellement facile. Les mouvements de hanche (soulevé de terre, hip thrust) demanderont plus de travail technique.');
    conseils.push('Profite du squat profond, buste droit', 'Travaille la charnière de hanche (good morning, soulevé de terre roumain)');
  } else lecture.push('Cuisses et jambes de longueur proche : proportions classiques, le squat standard convient.');
  if (buste > 1.45) lecture.push('Buste long : plus de bras de levier sur le dos quand il penche, le gainage compte double.');
  else if (buste < 1.1) lecture.push('Buste court : le buste reste plus facilement droit au squat.');
  return { source: seg.source, buste, cuisse, jambe: 1, lecture, conseils };
}

/** Angles au point bas du squat de profil : hanche, genou, et flexion de cheville. */
export function anglesSquat(b: BilanPostural | undefined): { hanche: number; genou: number; cheville: number; sousParallele: boolean } | undefined {
  const p = b?.vues.squatProfil?.points;
  if (!p?.epaule || !p.hanche || !p.genou || !p.malleole) return undefined;
  const avant = Math.sign(p.genou.x - p.malleole.x) || 1;
  return {
    hanche: Math.round(angleTroisPoints(p.epaule, p.hanche, p.genou)),
    genou: Math.round(angleTroisPoints(p.hanche, p.genou, p.malleole)),
    cheville: Math.round(deg(Math.atan2(avant * (p.genou.x - p.malleole.x), p.malleole.y - p.genou.y))),
    sousParallele: p.hanche.y >= p.genou.y,
  };
}

// ---------- Priorités, plan de travail et objectifs ----------

export interface Priorite extends Piste {
  /** Une phrase chiffrée tirée des mesures. */
  detail: string;
}

/** Les 3 pistes les plus importantes, avec ce qui les montre. */
export function priorites(b: BilanPostural | undefined, nombre = 3): Priorite[] {
  const parId = new Map(constats(b).map((c) => [c.id, c]));
  return pistes(b)
    .slice(0, nombre)
    .map((p) => {
      const mesures = p.depuis
        .map((t) => [...parId.values()].find((c) => c.titre === t))
        .filter((c): c is Constat => !!c)
        .slice(0, 2)
        .map((c) => `${c.titre.replace(/^Squat : /, 'squat, ').replace(/^Squat jambe /, 'jambe ')} ${String(c.valeur).replace('.', ',')}°`);
      const obs = p.depuis.filter((t) => ![...parId.values()].some((c) => c.titre === t));
      return { ...p, detail: [...mesures, ...obs.map((o) => o.toLowerCase())].join(' · ') };
    });
}

export interface Objectif {
  titre: string;
  valeur: number;
  cible: number;
  /** « ≤ » ou « ≥ ». */
  sens: '≤' | '≥';
}

/** Objectifs chiffrés pour le re-test : ramener chaque mesure hors norme dans la norme. */
export function objectifs(b: BilanPostural | undefined, nombre = 4): Objectif[] {
  return constats(b)
    .filter((c) => c.niveau !== 'normal')
    .sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === 'marque' ? -1 : 1))
    .slice(0, nombre)
    .map((c) => (c.valeur > c.norme[1] ? { titre: c.titre, valeur: c.valeur, cible: c.norme[1], sens: '≤' as const } : { titre: c.titre, valeur: c.valeur, cible: c.norme[0], sens: '≥' as const }));
}

export interface PlanTravail {
  corriger: { titre: string; exercices: string[] }[];
  renforcer: string[];
  objectifs: Objectif[];
  /** Semaines avant le re-test. */
  semaines: number;
}

const unique = (l: string[]) => [...new Set(l)];

export function planTravail(b: BilanPostural | undefined): PlanTravail | undefined {
  const p = priorites(b);
  if (!p.length) return undefined;
  return {
    corriger: p.map((x) => ({ titre: x.titre, exercices: x.exercices.slice(0, 3) })),
    renforcer: unique(p.flatMap((x) => x.renforcement)).slice(0, 5),
    objectifs: objectifs(b),
    semaines: 8,
  };
}

// ---------- Synthèse pour le client ----------

export interface SyntheseClient {
  score?: number;
  phrase: string;
  forces: string[];
  axes: { titre: string; texte: string }[];
  compensation?: string;
}

export function syntheseClient(b: BilanPostural | undefined): SyntheseClient {
  const score = scoreMouvement(b);
  const p = priorites(b);
  const phrase =
    score === undefined
      ? 'Fais au moins une vue pour obtenir le bilan.'
      : p.length === 0
        ? 'Rien de marqué sur les mesures : une très bonne base pour progresser en force et en charge.'
        : `${score >= 75 ? 'Une très bonne base' : score >= 55 ? 'Une bonne base' : 'Une base à consolider'}, avec ${p.length} point${p.length > 1 ? 's' : ''} précis à travailler pour progresser sans te blesser.`;
  return { score, phrase, forces: pointsForts(b).slice(0, 4), axes: p.map((x) => ({ titre: x.titre, texte: x.benefice })), compensation: compensation(b) };
}

/** Texte à envoyer au client (message, e-mail). */
export function texteSyntheseClient(b: BilanPostural | undefined, prenom?: string): string {
  const s = syntheseClient(b);
  const plan = planTravail(b);
  const l: string[] = [`${prenom ? `${prenom}, voici` : 'Voici'} ce que tes vidéos racontent.`];
  if (s.score !== undefined) l.push(`Score mouvement : ${s.score}/100. ${s.phrase}`);
  if (s.forces.length) l.push('', 'Tes points forts :', ...s.forces.map((x) => `✓ ${x}`));
  if (s.axes.length) l.push('', 'Ce qu’on va travailler :', ...s.axes.map((x) => `→ ${x.titre} : ${x.texte}`));
  if (s.compensation) l.push('', s.compensation);
  if (plan) l.push('', `Le plan : 4 semaines pour corriger, 3 pour renforcer, puis on refait les mêmes vidéos en semaine ${plan.semaines} pour mesurer tes progrès.`);
  l.push('', 'Ces mesures sont des repères de coaching, pas un diagnostic médical.');
  return l.join('\n');
}

export type { Cote };

// ---------- Dessin des repères pour revoir une vue ----------

/** Segments à tracer entre les repères de chaque vue. */
export const TRACES: Record<VueId, [string, string][]> = {
  face: [['epauleD', 'epauleG'], ['eiasD', 'eiasG'], ['eiasD', 'genouD'], ['genouD', 'chevilleD'], ['eiasG', 'genouG'], ['genouG', 'chevilleG']],
  dos: [['omoplateD', 'omoplateG'], ['molletD', 'achilleD'], ['achilleD', 'talonD'], ['molletG', 'achilleG'], ['achilleG', 'talonG']],
  profil: [['oreille', 'c7'], ['c7', 't8'], ['t8', 't12'], ['t12', 'l3'], ['l3', 's2'], ['eips', 'eias'], ['acromion', 'trochanter'], ['trochanter', 'genou'], ['genou', 'malleole']],
  squatFace: [['eiasD', 'eiasG'], ['eiasD', 'genouD'], ['genouD', 'chevilleD'], ['eiasG', 'genouG'], ['genouG', 'chevilleG']],
  squatProfil: [['epaule', 'hanche'], ['hanche', 'genou'], ['genou', 'malleole']],
  unipodalDroit: [['eiasAppui', 'eiasAutre'], ['eiasAppui', 'genou'], ['genou', 'cheville'], ['epauleAppui', 'epauleAutre']],
  unipodalGauche: [['eiasAppui', 'eiasAutre'], ['eiasAppui', 'genou'], ['genou', 'cheville'], ['epauleAppui', 'epauleAutre']],
};

/** Repère près duquel écrire la valeur de chaque mesure. */
export function ancre(c: Constat): string {
  const cote = coteDe(c.id) ?? '';
  const ancres: Record<string, string> = {
    epaules: 'epauleG',
    bassinFrontal: 'eiasG',
    genouStatique: `genou${cote}`,
    omoplates: 'omoplateG',
    talon: `talon${cote}`,
    tete: 'oreille',
    bassinSagittal: 'eias',
    cyphose: 't8',
    lordose: 'l3',
    tronc: 'acromion',
    genouProfil: 'genou',
    squatGenou: `genou${cote}`,
    squatBassin: 'eiasG',
    squatTronc: 'epaule',
    squatProfondeur: 'hanche',
    squatCheville: 'malleole',
    unipodalGenou: 'genou',
    unipodalBassin: 'eiasAutre',
    unipodalTronc: 'epauleAutre',
  };
  return ancres[famille(c.id)] ?? '';
}
