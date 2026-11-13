// Bilan postural par photos et vidéos : le coach touche des repères anatomiques sur chaque vue, l'application
// calcule les angles, les compare à des repères indicatifs et propose des pistes de déséquilibres et d'exercices.
// Ce ne sont que des hypothèses de coaching à confirmer par les tests du coach, jamais un diagnostic médical.
//
// Coordonnées de l'écran : x vers la droite, y vers le bas. Seuls des angles sont calculés : ils ne dépendent
// pas de la taille d'affichage de l'image.
import { angleTroisPoints, type Point } from './mesure-angle';

export type VueId = 'face' | 'dos' | 'profil' | 'squatFace' | 'squatProfil' | 'unipodalDroit' | 'unipodalGauche';
export type Niveau = 'normal' | 'leger' | 'marque';

export interface Repere {
  cle: string;
  libelle: string;
}

export interface DefinitionVue {
  id: VueId;
  titre: string;
  media: 'photo' | 'video';
  /** Comment placer le client et le téléphone, et où coller les pastilles. */
  consigne: string;
  reperes: Repere[];
  /** Ce que le coach coche en regardant la vidéo. */
  observations?: string[];
}

export const VUES: DefinitionVue[] = [
  {
    id: 'face',
    titre: 'Debout, de face',
    media: 'photo',
    consigne:
      'Client pieds nus, en sous-vêtements ou tenue près du corps, pieds écartés largeur de bassin, bras le long du corps. Téléphone à hauteur du bassin, bien droit, à 2-3 m. Pastilles sur les épines iliaques avant et au centre des rotules.',
    reperes: [
      { cle: 'epauleD', libelle: 'Épaule droite du client (acromion)' },
      { cle: 'epauleG', libelle: 'Épaule gauche du client (acromion)' },
      { cle: 'eiasD', libelle: 'Bassin droit (épine iliaque avant)' },
      { cle: 'eiasG', libelle: 'Bassin gauche (épine iliaque avant)' },
      { cle: 'genouD', libelle: 'Genou droit (centre de la rotule)' },
      { cle: 'genouG', libelle: 'Genou gauche (centre de la rotule)' },
      { cle: 'chevilleD', libelle: 'Cheville droite (milieu des malléoles)' },
      { cle: 'chevilleG', libelle: 'Cheville gauche (milieu des malléoles)' },
    ],
  },
  {
    id: 'dos',
    titre: 'Debout, de dos',
    media: 'photo',
    consigne:
      'Même position, de dos. Téléphone à hauteur des genoux pour bien voir les talons, bien droit. Pastilles sur la pointe des omoplates et sur le tendon d’Achille.',
    reperes: [
      { cle: 'omoplateD', libelle: 'Pointe de l’omoplate droite' },
      { cle: 'omoplateG', libelle: 'Pointe de l’omoplate gauche' },
      { cle: 'molletD', libelle: 'Milieu du mollet droit' },
      { cle: 'achilleD', libelle: 'Tendon d’Achille droit (hauteur des malléoles)' },
      { cle: 'talonD', libelle: 'Bas du talon droit (milieu)' },
      { cle: 'molletG', libelle: 'Milieu du mollet gauche' },
      { cle: 'achilleG', libelle: 'Tendon d’Achille gauche (hauteur des malléoles)' },
      { cle: 'talonG', libelle: 'Bas du talon gauche (milieu)' },
    ],
  },
  {
    id: 'profil',
    titre: 'Debout, de profil',
    media: 'photo',
    consigne:
      'Client de profil, regard droit devant, bras croisés sur la poitrine pour dégager le dos. Téléphone à hauteur du bassin, bien droit, perpendiculaire au client. Pastilles : base du cou (C7), milieu du dos, dernière côte (T12), creux des lombaires, sacrum, épines iliaques avant et arrière.',
    reperes: [
      { cle: 'oreille', libelle: 'Oreille (tragus)' },
      { cle: 'c7', libelle: 'Base du cou (vertèbre saillante C7)' },
      { cle: 't8', libelle: 'Sommet de la courbe du dos (vers T7-T8)' },
      { cle: 't12', libelle: 'Fin du dos thoracique (T12, niveau dernière côte)' },
      { cle: 'l3', libelle: 'Creux des lombaires (vers L3)' },
      { cle: 's2', libelle: 'Haut du sacrum (fossettes)' },
      { cle: 'acromion', libelle: 'Épaule (acromion)' },
      { cle: 'eias', libelle: 'Épine iliaque avant' },
      { cle: 'eips', libelle: 'Épine iliaque arrière' },
      { cle: 'trochanter', libelle: 'Hanche (grand trochanter)' },
      { cle: 'genou', libelle: 'Genou (milieu, sur le côté)' },
      { cle: 'malleole', libelle: 'Malléole externe' },
    ],
  },
  {
    id: 'squatFace',
    titre: 'Squat bras en l’air, de face',
    media: 'video',
    consigne:
      'Pieds largeur de bassin, bras tendus au-dessus de la tête, 5 squats lents aussi bas que possible. Téléphone à hauteur des genoux, de face. Arrête la vidéo au point le plus bas.',
    reperes: [
      { cle: 'eiasD', libelle: 'Bassin droit (épine iliaque avant)' },
      { cle: 'genouD', libelle: 'Genou droit (centre de la rotule)' },
      { cle: 'chevilleD', libelle: 'Cheville droite (milieu)' },
      { cle: 'eiasG', libelle: 'Bassin gauche (épine iliaque avant)' },
      { cle: 'genouG', libelle: 'Genou gauche (centre de la rotule)' },
      { cle: 'chevilleG', libelle: 'Cheville gauche (milieu)' },
    ],
    observations: ['Pieds qui s’ouvrent', 'Pieds qui s’affaissent', 'Poids déporté d’un côté'],
  },
  {
    id: 'squatProfil',
    titre: 'Squat bras en l’air, de profil',
    media: 'video',
    consigne: 'Même squat, filmé de profil, téléphone à hauteur du bassin. Arrête la vidéo au point le plus bas.',
    reperes: [
      { cle: 'epaule', libelle: 'Épaule (acromion)' },
      { cle: 'hanche', libelle: 'Hanche (grand trochanter)' },
      { cle: 'genou', libelle: 'Genou (milieu, sur le côté)' },
      { cle: 'malleole', libelle: 'Malléole externe' },
    ],
    observations: ['Talons qui décollent', 'Bras qui tombent vers l’avant', 'Bas du dos qui s’arrondit', 'Bas du dos qui se cambre'],
  },
  {
    id: 'unipodalDroit',
    titre: 'Squat sur la jambe droite, de face',
    media: 'video',
    consigne: 'Appui sur la jambe droite, mains sur les hanches, 5 flexions lentes à environ 45-60°. Téléphone à hauteur des genoux, de face. Arrête au point le plus bas.',
    reperes: [
      { cle: 'eiasAppui', libelle: 'Bassin côté appui (épine iliaque avant droite)' },
      { cle: 'eiasAutre', libelle: 'Bassin côté levé (épine iliaque avant gauche)' },
      { cle: 'genou', libelle: 'Genou d’appui (centre de la rotule)' },
      { cle: 'cheville', libelle: 'Cheville d’appui (milieu)' },
    ],
    observations: ['Tronc qui penche vers l’appui', 'Perte d’équilibre'],
  },
  {
    id: 'unipodalGauche',
    titre: 'Squat sur la jambe gauche, de face',
    media: 'video',
    consigne: 'Appui sur la jambe gauche, mains sur les hanches, 5 flexions lentes à environ 45-60°. Téléphone à hauteur des genoux, de face. Arrête au point le plus bas.',
    reperes: [
      { cle: 'eiasAppui', libelle: 'Bassin côté appui (épine iliaque avant gauche)' },
      { cle: 'eiasAutre', libelle: 'Bassin côté levé (épine iliaque avant droite)' },
      { cle: 'genou', libelle: 'Genou d’appui (centre de la rotule)' },
      { cle: 'cheville', libelle: 'Cheville d’appui (milieu)' },
    ],
    observations: ['Tronc qui penche vers l’appui', 'Perte d’équilibre'],
  },
];

export interface SaisieVue {
  points: Record<string, Point>;
  observations: string[];
}

export interface BilanPostural {
  vues: Partial<Record<VueId, SaisieVue>>;
}

export const vueComplete = (d: DefinitionVue, s: SaisieVue | undefined) => !!s && d.reperes.every((r) => s.points[r.cle]);
export const vuesCompletes = (b: BilanPostural | undefined) => VUES.filter((v) => vueComplete(v, b?.vues[v.id])).length;

// ---------- Géométrie ----------

const deg = (r: number) => (r * 180) / Math.PI;
const arrondi = (n: number) => Math.round(n * 10) / 10;

/** Écart d'un segment avec l'horizontale (0 à 90°). */
const inclinaison = (a: Point, b: Point) => deg(Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)));

/** x de la droite (a, b) à la hauteur y. */
const xSurLigne = (a: Point, b: Point, y: number) => (b.y === a.y ? (a.x + b.x) / 2 : a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));

/**
 * Écart du point du milieu avec la droite haut-bas, en degrés, positif quand il part vers l'axe du corps
 * (genou qui rentre) et négatif vers l'extérieur.
 */
function ecartVersAxe(haut: Point, milieu: Point, bas: Point, axeX: number): number {
  const ecart = 180 - angleTroisPoints(haut, milieu, bas);
  const ligne = xSurLigne(haut, bas, milieu.y);
  return Math.abs(milieu.x - axeX) < Math.abs(ligne - axeX) ? ecart : -ecart;
}

/** Écart du bas du talon avec le prolongement de la jambe : positif quand il part vers l'extérieur (talon en valgus). */
function ecartTalon(mollet: Point, achille: Point, talon: Point, axeX: number): number {
  const ecart = 180 - angleTroisPoints(mollet, achille, talon);
  const ligne = xSurLigne(mollet, achille, talon.y);
  return Math.abs(talon.x - axeX) > Math.abs(ligne - axeX) ? ecart : -ecart;
}

/** Angle de la courbe passant par 3 repères le long du dos (approche de l'angle de Cobb pour un arc régulier). */
const courbure = (a: Point, sommet: Point, b: Point) => 2 * (180 - angleTroisPoints(a, sommet, b));

// ---------- Constats ----------

export type IdConstat =
  | 'epaules'
  | 'bassinFrontal'
  | 'genouStatiqueD'
  | 'genouStatiqueG'
  | 'omoplates'
  | 'talonD'
  | 'talonG'
  | 'tete'
  | 'bassinSagittal'
  | 'cyphose'
  | 'lordose'
  | 'tronc'
  | 'genouProfil'
  | 'squatGenouD'
  | 'squatGenouG'
  | 'squatTronc'
  | 'unipodalGenouD'
  | 'unipodalGenouG'
  | 'unipodalBassinD'
  | 'unipodalBassinG';

export interface Constat {
  id: IdConstat;
  vue: VueId;
  titre: string;
  /** Valeur signée en degrés (le sens est expliqué dans le texte). */
  valeur: number;
  niveau: Niveau;
  /** Ce que dit la valeur, en clair. */
  texte: string;
  repere: string;
}

const niveauEcart = (v: number, leger: number, marque: number): Niveau => (Math.abs(v) > marque ? 'marque' : Math.abs(v) > leger ? 'leger' : 'normal');

function constatsVue(id: VueId, p: Record<string, Point>): Constat[] {
  const c: Constat[] = [];
  const ajouter = (x: Omit<Constat, 'vue' | 'valeur'> & { valeur: number }) => c.push({ ...x, vue: id, valeur: arrondi(x.valeur) });
  const plusHaut = (d: Point, g: Point) => (d.y < g.y ? 'droit' : 'gauche');

  if (id === 'face') {
    const e = inclinaison(p.epauleD, p.epauleG);
    ajouter({ id: 'epaules', titre: 'Hauteur des épaules', valeur: e, niveau: niveauEcart(e, 2, 4), repere: '0 à 2°', texte: e <= 2 ? 'Épaules à la même hauteur.' : `Épaule ${plusHaut(p.epauleD, p.epauleG) === 'droit' ? 'droite' : 'gauche'} plus haute.` });
    const b = inclinaison(p.eiasD, p.eiasG);
    ajouter({ id: 'bassinFrontal', titre: 'Hauteur du bassin', valeur: b, niveau: niveauEcart(b, 2, 4), repere: '0 à 2°', texte: b <= 2 ? 'Bassin horizontal.' : `Bassin plus haut à ${plusHaut(p.eiasD, p.eiasG) === 'droit' ? 'droite' : 'gauche'}.` });
    const axe = (p.eiasD.x + p.eiasG.x) / 2;
    for (const [cote, nom] of [['D', 'droit'], ['G', 'gauche']] as const) {
      const v = ecartVersAxe(p[`eias${cote}`], p[`genou${cote}`], p[`cheville${cote}`], axe);
      ajouter({
        id: `genouStatique${cote}`,
        titre: `Axe du genou ${nom}`,
        valeur: v,
        niveau: v > 6 ? (v > 10 ? 'marque' : 'leger') : v < -5 ? (v < -9 ? 'marque' : 'leger') : 'normal',
        repere: '−5 à +6°',
        texte: v > 6 ? 'Genou qui rentre vers l’intérieur (valgus).' : v < -5 ? 'Genou qui part vers l’extérieur (varus, jambe arquée).' : 'Genou bien dans l’axe.',
      });
    }
  }

  if (id === 'dos') {
    const o = inclinaison(p.omoplateD, p.omoplateG);
    ajouter({ id: 'omoplates', titre: 'Hauteur des omoplates', valeur: o, niveau: niveauEcart(o, 2, 4), repere: '0 à 2°', texte: o <= 2 ? 'Omoplates à la même hauteur.' : `Omoplate ${plusHaut(p.omoplateD, p.omoplateG) === 'droit' ? 'droite' : 'gauche'} plus haute.` });
    const axe = (p.achilleD.x + p.achilleG.x) / 2;
    for (const [cote, nom] of [['D', 'droit'], ['G', 'gauche']] as const) {
      const v = ecartTalon(p[`mollet${cote}`], p[`achille${cote}`], p[`talon${cote}`], axe);
      ajouter({
        id: `talon${cote}`,
        titre: `Talon ${nom}`,
        valeur: v,
        niveau: v > 6 ? (v > 10 ? 'marque' : 'leger') : v < -3 ? (v < -6 ? 'marque' : 'leger') : 'normal',
        repere: '−3 à +6°',
        texte: v > 6 ? 'Talon qui part vers l’extérieur : pied qui s’affaisse (pronation).' : v < -3 ? 'Talon qui part vers l’intérieur : appui sur le bord externe (supination).' : 'Talon dans l’axe de la jambe.',
      });
    }
  }

  if (id === 'profil') {
    // Sens du regard : l'épine iliaque avant est devant l'arrière.
    const avant = Math.sign(p.eias.x - p.eips.x) || 1;
    const cva = deg(Math.atan2(p.c7.y - p.oreille.y, Math.abs(p.oreille.x - p.c7.x)));
    ajouter({ id: 'tete', titre: 'Position de la tête (angle cervical)', valeur: cva, niveau: cva >= 50 ? 'normal' : cva >= 45 ? 'leger' : 'marque', repere: '50° ou plus', texte: cva >= 50 ? 'Tête bien placée au-dessus des épaules.' : 'Tête projetée vers l’avant.' });
    const bassin = deg(Math.atan2(p.eias.y - p.eips.y, Math.abs(p.eias.x - p.eips.x)));
    ajouter({
      id: 'bassinSagittal',
      titre: 'Bascule du bassin',
      valeur: bassin,
      niveau: bassin > 14 ? (bassin > 18 ? 'marque' : 'leger') : bassin < 4 ? (bassin < 0 ? 'marque' : 'leger') : 'normal',
      repere: '4 à 14° d’antéversion',
      texte: bassin > 14 ? 'Bassin basculé vers l’avant (antéversion).' : bassin < 4 ? 'Bassin basculé vers l’arrière (rétroversion).' : 'Bascule du bassin dans la norme.',
    });
    const cy = courbure(p.c7, p.t8, p.t12);
    ajouter({ id: 'cyphose', titre: 'Courbure du haut du dos (cyphose)', valeur: cy, niveau: cy > 45 ? (cy > 55 ? 'marque' : 'leger') : cy < 20 ? 'leger' : 'normal', repere: '20 à 45°', texte: cy > 45 ? 'Haut du dos arrondi (hypercyphose).' : cy < 20 ? 'Haut du dos plutôt plat.' : 'Courbure du haut du dos dans la norme.' });
    const lo = courbure(p.t12, p.l3, p.s2);
    ajouter({ id: 'lordose', titre: 'Cambrure du bas du dos (lordose)', valeur: lo, niveau: lo > 50 ? (lo > 60 ? 'marque' : 'leger') : lo < 25 ? 'leger' : 'normal', repere: '25 à 50°', texte: lo > 50 ? 'Bas du dos très cambré (hyperlordose).' : lo < 25 ? 'Bas du dos plutôt plat (lordose effacée).' : 'Cambrure dans la norme.' });
    const tronc = deg(Math.atan2(avant * (p.acromion.x - p.trochanter.x), p.trochanter.y - p.acromion.y));
    ajouter({ id: 'tronc', titre: 'Épaules par rapport au bassin', valeur: tronc, niveau: tronc < -4 ? (tronc < -8 ? 'marque' : 'leger') : tronc > 6 ? 'leger' : 'normal', repere: '−4 à +6°', texte: tronc < -4 ? 'Bassin poussé vers l’avant, épaules en arrière (posture relâchée, « sway back »).' : tronc > 6 ? 'Buste penché vers l’avant.' : 'Épaules bien au-dessus du bassin.' });
    const ecart = 180 - angleTroisPoints(p.trochanter, p.genou, p.malleole);
    const ligne = xSurLigne(p.trochanter, p.malleole, p.genou.y);
    const recurvatum = avant * (p.genou.x - ligne) < 0 ? ecart : -ecart;
    ajouter({ id: 'genouProfil', titre: 'Genou de profil', valeur: recurvatum, niveau: recurvatum > 5 ? (recurvatum > 10 ? 'marque' : 'leger') : recurvatum < -5 ? 'leger' : 'normal', repere: '−5 à +5°', texte: recurvatum > 5 ? 'Genou en hyperextension (recurvatum).' : recurvatum < -5 ? 'Genou qui reste fléchi.' : 'Genou bien tendu, sans hyperextension.' });
  }

  if (id === 'squatFace') {
    const axe = (p.eiasD.x + p.eiasG.x) / 2;
    for (const [cote, nom] of [['D', 'droit'], ['G', 'gauche']] as const) {
      const v = ecartVersAxe(p[`eias${cote}`], p[`genou${cote}`], p[`cheville${cote}`], axe);
      ajouter({ id: `squatGenou${cote}`, titre: `Squat : genou ${nom}`, valeur: v, niveau: v > 10 ? (v > 15 ? 'marque' : 'leger') : 'normal', repere: '10° ou moins', texte: v > 10 ? 'Le genou rentre pendant la descente (valgus dynamique).' : 'Genou stable dans l’axe.' });
    }
  }

  if (id === 'squatProfil') {
    const avant = Math.sign(p.genou.x - p.malleole.x) || 1;
    const tronc = deg(Math.atan2(avant * (p.epaule.x - p.hanche.x), p.hanche.y - p.epaule.y));
    const tibia = deg(Math.atan2(avant * (p.genou.x - p.malleole.x), p.malleole.y - p.genou.y));
    const d = tronc - tibia;
    ajouter({ id: 'squatTronc', titre: 'Squat : buste par rapport au tibia', valeur: d, niveau: d > 10 ? (d > 20 ? 'marque' : 'leger') : 'normal', repere: '10° ou moins (buste parallèle au tibia)', texte: d > 10 ? 'Le buste penche nettement plus que le tibia.' : 'Buste et tibia bien parallèles.' });
  }

  if (id === 'unipodalDroit' || id === 'unipodalGauche') {
    const cote = id === 'unipodalDroit' ? 'D' : 'G';
    const nom = cote === 'D' ? 'droite' : 'gauche';
    const axe = (p.eiasAppui.x + p.eiasAutre.x) / 2;
    const v = ecartVersAxe(p.eiasAppui, p.genou, p.cheville, axe);
    ajouter({ id: `unipodalGenou${cote}`, titre: `Squat jambe ${nom} : genou`, valeur: v, niveau: v > 10 ? (v > 15 ? 'marque' : 'leger') : 'normal', repere: '10° ou moins', texte: v > 10 ? 'Le genou d’appui rentre vers l’intérieur.' : 'Genou d’appui stable.' });
    const chute = deg(Math.atan2(p.eiasAutre.y - p.eiasAppui.y, Math.abs(p.eiasAutre.x - p.eiasAppui.x)));
    ajouter({ id: `unipodalBassin${cote}`, titre: `Squat jambe ${nom} : bassin`, valeur: chute, niveau: chute > 2 ? (chute > 5 ? 'marque' : 'leger') : 'normal', repere: '2° ou moins', texte: chute > 2 ? 'Le bassin s’affaisse du côté de la jambe levée.' : 'Bassin stable.' });
  }
  return c;
}

export function constats(b: BilanPostural | undefined): Constat[] {
  if (!b) return [];
  return VUES.flatMap((v) => {
    const s = b.vues[v.id];
    return vueComplete(v, s) ? constatsVue(v.id, s!.points) : [];
  });
}

// ---------- Pistes : déséquilibres probables et exercices ----------

export interface Piste {
  titre: string;
  /** Les constats qui y mènent. */
  depuis: string[];
  raccourcis: string[];
  faibles: string[];
  exercices: string[];
  prudence?: string;
}

type ModelePiste = Omit<Piste, 'depuis'>;

const PISTES: { si: (c: Map<IdConstat, Constat>, obs: Set<string>) => boolean; piste: ModelePiste }[] = [
  {
    si: (c) => (c.get('bassinSagittal')?.valeur ?? 0) > 14 || (c.get('lordose')?.valeur ?? 0) > 50,
    piste: {
      titre: 'Bassin en avant et bas du dos cambré',
      raccourcis: ['Fléchisseurs de hanche (psoas, droit fémoral)', 'Muscles du bas du dos'],
      faibles: ['Fessiers', 'Abdominaux profonds (transverse, obliques)'],
      exercices: ['Étirement du psoas en fente, bassin rentré', 'Pont fessier', 'Dead bug', 'Rétroversion du bassin allongé', 'Gainage avec rétroversion'],
    },
  },
  {
    si: (c) => (c.get('bassinSagittal')?.valeur ?? 10) < 4 || (c.get('lordose')?.valeur ?? 40) < 25,
    piste: {
      titre: 'Bassin en arrière et bas du dos plat',
      raccourcis: ['Ischio-jambiers', 'Grands droits de l’abdomen'],
      faibles: ['Fléchisseurs de hanche', 'Muscles du bas du dos'],
      exercices: ['Étirement des ischio-jambiers', 'Chat-vache', 'Bird dog', 'Extension lombaire à la machine (charge légère)'],
    },
  },
  {
    si: (c) => (c.get('cyphose')?.valeur ?? 0) > 45 || (c.get('tete')?.valeur ?? 60) < 50,
    piste: {
      titre: 'Haut du dos arrondi, épaules et tête en avant',
      raccourcis: ['Pectoraux', 'Grand dorsal', 'Trapèzes supérieurs et muscles de la nuque'],
      faibles: ['Trapèzes moyens et inférieurs, rhomboïdes', 'Extenseurs du haut du dos', 'Fléchisseurs profonds du cou'],
      exercices: ['Face pull à la poulie haute', 'Tirage horizontal à la poulie, omoplates serrées', 'Extension du haut du dos sur rouleau', 'Étirement des pectoraux contre un cadre de porte', 'Rentré du menton contre un mur'],
    },
  },
  {
    si: (c) => (c.get('tronc')?.valeur ?? 0) < -4 || (c.get('genouProfil')?.valeur ?? 0) > 5,
    piste: {
      titre: 'Posture relâchée, bassin poussé vers l’avant',
      raccourcis: ['Ischio-jambiers', 'Abdominaux supérieurs'],
      faibles: ['Fléchisseurs de hanche', 'Obliques externes', 'Fessiers'],
      exercices: ['Gainage frontal', 'Pont fessier', 'Leg curl à la machine en contrôlant la fin de mouvement', 'Apprendre à se tenir genoux déverrouillés'],
    },
  },
  {
    si: (c) => ['genouStatiqueD', 'genouStatiqueG', 'squatGenouD', 'squatGenouG', 'unipodalGenouD', 'unipodalGenouG'].some((id) => (c.get(id as IdConstat)?.valeur ?? 0) > 10 || (id.startsWith('genouStatique') && (c.get(id as IdConstat)?.valeur ?? 0) > 6)),
    piste: {
      titre: 'Genou qui rentre vers l’intérieur',
      raccourcis: ['Adducteurs', 'Mollets (souvent)'],
      faibles: ['Moyen fessier', 'Rotateurs externes de la hanche'],
      exercices: ['Abduction de hanche à la poulie basse ou à la machine', 'Squat avec élastique au-dessus des genoux', 'Marche latérale avec élastique', 'Pont fessier avec élastique'],
    },
  },
  {
    si: (c) => (c.get('unipodalBassinD')?.valeur ?? 0) > 2 || (c.get('unipodalBassinG')?.valeur ?? 0) > 2,
    piste: {
      titre: 'Bassin qui s’affaisse sur une jambe',
      raccourcis: [],
      faibles: ['Moyen fessier du côté de l’appui', 'Gainage latéral'],
      exercices: ['Abduction de hanche à la poulie, côté faible', 'Gainage latéral', 'Montée sur marche contrôlée', 'Équilibre unipodal bassin horizontal'],
    },
  },
  {
    si: (c) => (c.get('talonD')?.valeur ?? 0) > 6 || (c.get('talonG')?.valeur ?? 0) > 6,
    piste: {
      titre: 'Pied qui s’affaisse (pronation)',
      raccourcis: ['Mollets', 'Péroniers'],
      faibles: ['Tibial postérieur et muscles de la voûte plantaire', 'Moyen fessier'],
      exercices: ['« Pied court » : creuser la voûte sans plier les orteils', 'Montées sur pointes lentes, talons rapprochés', 'Équilibre unipodal pieds nus', 'Étirement des mollets'],
      prudence: 'Si le pied s’affaisse beaucoup ou fait mal, un avis de podologue est utile.',
    },
  },
  {
    si: (c, obs) => (c.get('squatTronc')?.valeur ?? 0) > 10 || obs.has('Talons qui décollent'),
    piste: {
      titre: 'Manque de souplesse des chevilles au squat',
      raccourcis: ['Mollets (soléaire, gastrocnémiens)', 'Fléchisseurs de hanche'],
      faibles: ['Fessiers', 'Gainage', 'Extenseurs du haut du dos'],
      exercices: ['Mobilité de cheville genou vers le mur', 'Étirement des mollets', 'Squat à la poulie basse en contrepoids, talons au sol', 'Presse à cuisses pieds hauts, amplitude contrôlée'],
    },
  },
  {
    si: (_c, obs) => obs.has('Bras qui tombent vers l’avant'),
    piste: {
      titre: 'Épaules qui manquent de mobilité au-dessus de la tête',
      raccourcis: ['Grand dorsal', 'Pectoraux'],
      faibles: ['Trapèzes moyens et inférieurs', 'Coiffe des rotateurs'],
      exercices: ['Étirement du grand dorsal à la poulie haute', 'Glissés de bras au mur', 'Face pull', 'Rotation externe à la poulie'],
    },
  },
  {
    si: (c) => ['epaules', 'bassinFrontal', 'omoplates'].some((id) => (c.get(id as IdConstat)?.valeur ?? 0) > 2),
    piste: {
      titre: 'Asymétrie droite / gauche',
      raccourcis: ['Carré des lombes et trapèze supérieur du côté haut (souvent)'],
      faibles: ['Moyen fessier et gainage latéral du côté opposé'],
      exercices: ['Gainage latéral, plus long du côté faible', 'Travail unilatéral à la poulie', 'Étirement latéral du tronc côté raide'],
      prudence: 'Vérifie au test d’Adams (client penché en avant) : une bosse d’un côté du dos demande un avis médical. Une différence de longueur de jambe se mesure chez un professionnel de santé.',
    },
  },
];

export function pistes(b: BilanPostural | undefined): Piste[] {
  const liste = constats(b);
  const parId = new Map(liste.map((c) => [c.id, c]));
  const obs = new Set(Object.values(b?.vues ?? {}).flatMap((s) => s?.observations ?? []));
  return PISTES.filter((p) => p.si(parId, obs)).map((p) => ({
    ...p.piste,
    depuis: liste.filter((c) => c.niveau !== 'normal').map((c) => c.titre),
  }));
}

export const AVERTISSEMENT =
  'Ces mesures sont des repères de coaching, à confirmer par tes tests (souplesse, force, palpation). Ce n’est pas un diagnostic médical : en cas de douleur, oriente vers un professionnel de santé.';

/** Lignes du compte rendu. */
export function syntheseBilan(b: BilanPostural | undefined): string[] {
  const c = constats(b).filter((x) => x.niveau !== 'normal');
  if (!c.length) return constats(b).length ? ['POSTURE — rien de marqué sur les repères mesurés'] : [];
  return [
    ...c.map((x) => `POSTURE · ${x.titre.toUpperCase()} — ${x.valeur}° (repère ${x.repere}) : ${x.texte}`),
    ...pistes(b).map((p) => `PISTE — ${p.titre} : renforcer ${p.faibles.join(', ').toLowerCase()} ; exercices : ${p.exercices.join(', ').toLowerCase()}`),
  ];
}
