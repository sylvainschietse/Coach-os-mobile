// Catalogue des activités qu'un client peut déclarer en plus de son programme : cours collectifs de salle (dont les
// programmes Les Mills), yoga et Pilates, activités aquatiques, sports de raquette, collectifs, de combat, danse,
// glisse et plein air. Le nom choisi devient le titre de l'activité, sa catégorie le « sport » enregistré.
// Le client peut aussi taper un nom absent de la liste.
import type { Sport } from './activites';

export interface ActiviteCatalogue {
  nom: string;
  sport: Sport;
  /** Autres façons de la chercher (« spinning » pour RPM). */
  motsCles?: string;
}

const de = (sport: Sport, noms: (string | [string, string?])[]): ActiviteCatalogue[] =>
  noms.map((n) => (typeof n === 'string' ? { nom: n, sport } : { nom: n[0], sport, ...(n[1] ? { motsCles: n[1] } : {}) }));

export const CATALOGUE_ACTIVITES: ActiviteCatalogue[] = [
  ...de('musculation', [['Séance de musculation', 'muscu salle fonte poids'], ['CrossFit', 'wod box cross training'], ['Cross training', 'crossfit wod'], ['Hyrox', 'irox course ergo'], ['Street workout', 'calisthenie barre traction'], ['Haltérophilie', 'arrache epaule-jete'], ['Force athlétique', 'powerlifting squat souleve developpe'], ['Strongman', 'strongman'], ['Kettlebell', 'kettlebell girevoy'], ['Préparation physique', 'prepa physique'], ['Renforcement à la maison', 'maison poids du corps'], ['Circuit à la maison', 'maison poids du corps hiit'], ['Séance vidéo en ligne', 'youtube appli application']]),
  ...de('cours', [
    ['Body Pump', 'les mills barre poids pump'],
    ['Body Attack', 'les mills cardio attack'],
    ['Body Combat', 'les mills boxe arts martiaux combat'],
    ['Body Balance', 'les mills yoga tai chi pilates'],
    ['Body Step', 'les mills step'],
    ['Body Jam', 'les mills danse'],
    ['RPM', 'les mills velo cycling spinning biking'],
    ['Les Mills Sprint', 'velo hiit cycling'],
    ['Les Mills Grit', 'hiit'],
    ['Les Mills Core', 'abdos gainage cx worx'],
    ['Les Mills Tone', 'renforcement'],
    ['Les Mills Barre', 'barre danse'],
    ['Les Mills Dance', 'danse shbam'],
    ['Cycling (vélo en salle)', 'spinning biking velo rpm'],
    ['Step', 'cardio'],
    ['LIA', 'cardio aerobic'],
    ['HIIT', 'fractionne cardio tabata'],
    ['Circuit training', 'cardio renforcement'],
    ['Abdos-fessiers', 'caf cuisses abdos fessiers'],
    ['Renforcement musculaire (cours)', 'renfo body sculpt'],
    ['Body sculpt', 'renforcement'],
    ['TRX', 'sangles suspension'],
    ['Cours kettlebell', 'kettlebell'],
    ['Boot camp', 'exterieur cardio'],
    ['Cardio boxing', 'boxe cardio'],
    ['Gym douce', 'seniors douce'],
    ['Gym posturale', 'dos posture'],
    ['Cuisses-abdos-fessiers (CAF)', 'caf'],
    ['Body Vive', 'les mills'],
    ['Les Mills Ceremony', 'les mills'],
    ['Les Mills Conquer', 'les mills combat'],
    ['Les Mills Shapes', 'les mills'],
    ['Les Mills Trip', 'les mills velo immersif'],
    ['Body Training', 'renforcement'],
    ['Total body', 'renforcement complet'],
    ['Tabata', 'hiit'],
    ['Cardio training (machines)', 'tapis elliptique velo rameur cardio'],
    ['Elliptique', 'velo elliptique'],
    ['Rameur', 'aviron indoor'],
    ['SkiErg', 'ski erg'],
    ['Air bike', 'assault bike'],
    ['Stepper', 'escalier'],
    ['Corde à sauter', 'corde'],
    ['Fit ball', 'swiss ball ballon'],
    ['Small group training', 'petit groupe'],
    ['Électrostimulation (EMS)', 'ems miha'],
    ['Trampoline fitness', 'jumping'],
    ['Pound', 'baguettes'],
    ['Jumping fitness', 'trampoline'],
    ['Gym seniors', 'seniors'],
    ['Gym poussette', 'post-natal'],
    ['Renforcement du périnée', 'hypopressif abdominaux hypopressifs'],
    ['Abdos hypopressifs', 'hypopressif'],
  ]),
  ...de('yoga', [
    ['Yoga Hatha', 'yoga'],
    ['Yoga Vinyasa', 'yoga flow'],
    ['Yoga Ashtanga', 'yoga'],
    ['Yin yoga', 'yoga'],
    ['Power yoga', 'yoga'],
    ['Yoga Kundalini', 'yoga'],
    ['Yoga Iyengar', 'yoga'],
    ['Yoga chaud (Bikram)', 'yoga hot'],
    ['Yoga Nidra', 'yoga relaxation'],
    ['Yoga prénatal', 'yoga grossesse'],
    ['Aerial yoga', 'yoga aerien hamac'],
    ['Pilates au sol', 'pilates mat'],
    ['Pilates ballon', 'pilates swiss ball'],
    ['Pilates reformer', 'pilates machine'],
    ['Pilates avec accessoires', 'pilates cercle small ball elastique'],
    ['Stretching', 'etirements souplesse'],
    ['Mobilité', 'etirements articulaire'],
    ['Barre au sol', 'danse etirements'],
    ['Qi gong', 'chi kung'],
    ['Tai-chi', 'tai chi'],
    ['Yoga Sivananda', 'yoga'],
    ['Yoga restauratif', 'yoga doux'],
    ['Yoga sur chaise', 'yoga'],
    ['Acroyoga', 'yoga'],
    ['Yoga en ligne', 'yoga video'],
    ['Pilates chaise (wunda chair)', 'pilates machine'],
    ['Pilates cadillac', 'pilates machine'],
    ['Pilates en ligne', 'pilates video'],
    ['Méthode de Gasquet', 'dos perinee'],
    ['Méthode Feldenkrais', 'feldenkrais'],
    ['Sophrologie active', 'relaxation'],
    ['Relaxation et respiration', 'respiration'],
    ['Étirements à la maison', 'stretching'],
  ]),
  ...de('aquatique', [
    ['Aquagym', 'aqua gym piscine'],
    ['Aquabike', 'aqua velo piscine'],
    ['Aqua tonus', 'aqua piscine'],
    ['Aqua training', 'aqua work circuit piscine'],
    ['Aqua jogging', 'aqua course piscine'],
    ['Aqua boxing', 'aqua boxe piscine'],
    ['Aqua zumba', 'aqua danse piscine'],
    ['Aqua Pilates', 'aqua piscine'],
    ['Aqua stretching', 'aqua piscine'],
    ['Aqua fitness', 'aqua piscine'],
    ['Aqua trampoline', 'aqua piscine'],
    ['Aqua palming', 'palmes piscine'],
  ]),
  ...de('natation', [['Natation', 'piscine nage'], ['Nage en eau libre', 'mer lac'], ['Longe-côte', 'marche aquatique mer'], ['Natation synchronisée', 'artistique'], ['Plongée', 'plongee'], ['Apnée', 'apnee']]),
  ...de('velo', [['Vélo de route', 'cyclisme'], ['VTT', 'velo tout terrain'], ['Gravel', 'velo'], ['Vélo d’appartement', 'home trainer velo'], ['Vélo (trajets)', 'velotaf'], ['Vélo électrique', 'vae'], ['BMX'], ['Cyclo-cross'], ['Vélo sur piste', 'piste']]),
  ...de('course', [['Course à pied', 'running footing jogging'], ['Course sur tapis', 'running tapis'], ['Fractionné', 'running piste'], ['Course sur piste', 'athletisme'], ['Athlétisme'], ['Course d’orientation', 'orientation'], ['Triathlon', 'tri'], ['Duathlon'], ['Course d’obstacles', 'spartan mud day']]),
  ...de('trail', [['Trail', 'course nature']]),
  ...de('marche', [['Marche', 'promenade'], ['Marche nordique', 'batons'], ['Marche active', 'marche rapide'], ['Marche sur tapis', 'tapis incline'], ['Marche afghane', 'respiration'], ['Promenade du chien', 'chien']]),
  ...de('randonnee', [['Randonnée', 'rando montagne'], ['Raquettes à neige', 'neige rando'], ['Alpinisme', 'montagne'], ['Via ferrata', 'montagne']]),
  ...de('raquette', [['Tennis'], ['Padel', 'paddle tennis padle'], ['Badminton'], ['Squash'], ['Tennis de table', 'ping-pong'], ['Pickleball'], ['Beach tennis'], ['Speedminton'], ['Racquetball'], ['Pelote basque', 'pala cesta']]),
  ...de('sport_co', [['Football', 'foot'], ['Futsal', 'foot salle'], ['Basket-ball', 'basket'], ['Handball', 'hand'], ['Volley-ball', 'volley'], ['Beach-volley', 'volley plage'], ['Rugby'], ['Rugby à toucher', 'touch'], ['Hockey sur gazon', 'hockey'], ['Hockey sur glace', 'hockey'], ['Roller hockey', 'hockey'], ['Ultimate', 'frisbee'], ['Baseball'], ['Softball'], ['Netball'], ['Water-polo', 'piscine'], ['Foot à 5', 'five foot urban'], ['Beach soccer', 'foot plage']]),
  ...de('combat', [
    ['Boxe anglaise', 'boxe'],
    ['Boxe thaï', 'muay thai boxe'],
    ['Kickboxing', 'boxe'],
    ['Judo'],
    ['Karaté'],
    ['Jiu-jitsu brésilien', 'jjb grappling'],
    ['MMA', 'combat libre'],
    ['Krav maga', 'self defense'],
    ['Taekwondo'],
    ['Lutte'],
    ['Aïkido'],
    ['Kung-fu', 'wushu'],
    ['Capoeira'],
    ['Savate (boxe française)', 'boxe francaise'],
    ['Escrime'],
    ['Sac de frappe', 'boxe'],
  ]),
  ...de('danse', [['Zumba', 'danse fitness'], ['Strong Nation', 'zumba'], ['Danse classique'], ['Danse contemporaine'], ['Salsa', 'danse latine'], ['Hip-hop', 'danse'], ['Pole dance', 'barre'], ['Danse jazz', 'modern jazz'], ['Danse de salon', 'rock valse tango'], ['Bachata', 'danse latine'], ['Kizomba', 'danse'], ['Rock', 'danse'], ['Tango'], ['Claquettes'], ['Danse orientale'], ['Afro dance', 'danse africaine'], ['Dancehall'], ['K-pop', 'danse'], ['Country', 'line dance']]),
  ...de('glisse', [
    ['Stand up paddle', 'paddle sup'],
    ['Kayak', 'canoe'],
    ['Aviron', 'rameur bateau'],
    ['Surf'],
    ['Ski alpin', 'ski'],
    ['Ski de fond', 'ski nordique'],
    ['Snowboard'],
    ['Escalade', 'grimpe bloc'],
    ['Roller', 'patins'],
    ['Skateboard', 'skate'],
    ['Trottinette'],
    ['Patin à glace', 'patinage'],
    ['Ski de randonnée', 'skimo'],
    ['Biathlon'],
    ['Kitesurf', 'kite'],
    ['Planche à voile', 'windsurf'],
    ['Wakeboard'],
    ['Voile', 'bateau'],
    ['Canyoning'],
    ['Escalade en salle', 'bloc grimpe'],
    ['Slackline'],
    ['Parkour', 'freerun'],
    ['Accrobranche'],
  ]),
  ...de('autre', [['Équitation', 'cheval'], ['Golf'], ['Pétanque', 'boules'], ['Bowling'], ['Tir à l’arc', 'arc'], ['Gymnastique', 'gym artistique'], ['Trampoline'], ['Cirque', 'aerien'], ['Jardinage', 'activite physique'], ['Bricolage ou déménagement', 'activite physique'], ['Jeux avec les enfants', 'activite physique']]),
];

const sansAccents = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Recherche sans accents sur le nom et les mots-clés ; les noms qui commencent par la recherche d'abord. */
export function chercherActivites(q: string, sport?: Sport, catalogue = CATALOGUE_ACTIVITES): ActiviteCatalogue[] {
  const mots = sansAccents(q).split(/\s+/).filter(Boolean);
  const l = catalogue.filter((a) => (!sport || a.sport === sport) && mots.every((m) => sansAccents(`${a.nom} ${a.motsCles ?? ''}`).includes(m)));
  const debut = (a: ActiviteCatalogue) => (mots.length && sansAccents(a.nom).startsWith(mots.join(' ')) ? 0 : 1);
  return mots.length ? l.sort((a, b) => debut(a) - debut(b)) : l;
}

/** Catégorie d'un nom tapé librement, si on le reconnaît (« rpm » → cours). */
export const activiteConnue = (nom: string) => CATALOGUE_ACTIVITES.find((a) => sansAccents(a.nom) === sansAccents(nom.trim()));

// ---------- Dépense estimée ----------

/**
 * Intensité moyenne (MET, d'après le Compendium des activités physiques) par type d'activité, puis pour les activités
 * qui s'en écartent nettement. 1 MET ≈ 1 kcal par kg et par heure au repos.
 */
const MET_SPORT: Record<Sport, number> = {
  musculation: 5,
  // Machines cardio (elliptique, rameur, escalier) : entre 5 et 9 selon la machine.
  cardio: 7,
  cours: 6.5,
  yoga: 3,
  aquatique: 5,
  natation: 7,
  velo: 7.5,
  course: 9.8,
  trail: 9,
  marche: 3.8,
  randonnee: 6,
  raquette: 7,
  sport_co: 7.5,
  combat: 8,
  danse: 5.5,
  glisse: 5,
  autre: 4,
};

const MET_ACTIVITE: Record<string, number> = {
  // Programmes Les Mills : moyennes publiées par Les Mills (lesmills.com, « calorie burn »), ramenées à l'heure pour
  // 70 kg : BODYCOMBAT 570 kcal en 55 min, BODYATTACK 555 en 55 min, RPM 500 en 45 min, SPRINT 290 en 30 min,
  // TONE 450 en 45 min, BODYPUMP environ 560 par cours. Les autres viennent des moyennes relevées par les salles.
  RPM: 9.5,
  'Les Mills Sprint': 8.3,
  'Les Mills Trip': 8.5,
  'Cycling (vélo en salle)': 8.5,
  'Body Pump': 8,
  'Body Attack': 8.6,
  'Body Combat': 8.9,
  'Les Mills Conquer': 8.9,
  'Les Mills Tone': 8.6,
  'Body Balance': 3.3,
  'Body Step': 7.5,
  'Body Jam': 6.5,
  'Les Mills Dance': 6.5,
  'Les Mills Grit': 9.5,
  'Les Mills Core': 4.5,
  HIIT: 8,
  Tabata: 8,
  CrossFit: 8,
  'Cross training': 8,
  Hyrox: 9,
  'Air bike': 9,
  'Corde à sauter': 11,
  'Gym douce': 2.8,
  'Gym seniors': 2.8,
  'Gym posturale': 2.8,
  'Abdos hypopressifs': 2.3,
  'Renforcement du périnée': 2.3,
  'Électrostimulation (EMS)': 3.5,
  Stretching: 2.5,
  Mobilité: 2.5,
  'Étirements à la maison': 2.5,
  'Yoga Nidra': 1.5,
  'Yoga restauratif': 2,
  'Relaxation et respiration': 1.5,
  'Sophrologie active': 1.5,
  'Power yoga': 4,
  'Yoga Ashtanga': 4,
  'Yoga Vinyasa': 3.5,
  'Yoga chaud (Bikram)': 4,
  'Pilates reformer': 3.5,
  'Qi gong': 2.5,
  'Tai-chi': 3,
  Aquagym: 4.5,
  Aquabike: 6.5,
  'Aqua jogging': 6,
  'Aqua boxing': 6,
  'Aqua stretching': 2.5,
  'Longe-côte': 5,
  'Water-polo': 10,
  'Marche nordique': 4.8,
  'Marche active': 4.3,
  'Marche sur tapis': 4.3,
  'Promenade du chien': 3,
  Badminton: 5.5,
  Padel: 6,
  Tennis: 7.3,
  Squash: 9,
  'Tennis de table': 4,
  Pickleball: 4.5,
  Football: 7,
  Futsal: 8,
  'Basket-ball': 6.5,
  Rugby: 8.3,
  'Volley-ball': 4,
  'Beach-volley': 8,
  'Boxe anglaise': 9,
  'Sac de frappe': 7,
  Zumba: 6.5,
  'Danse classique': 5,
  'Danse de salon': 4,
  'Stand up paddle': 6,
  Kayak: 5,
  Aviron: 7,
  'Ski de fond': 9,
  'Ski de randonnée': 9.5,
  'Ski alpin': 5.5,
  Escalade: 8,
  'Escalade en salle': 7.5,
  Golf: 4.8,
  Équitation: 5.5,
  Pétanque: 2.5,
  Bowling: 3,
  Jardinage: 3.8,
  'Bricolage ou déménagement': 5,
  'Jeux avec les enfants': 4,
  Fractionné: 10,
  Triathlon: 9,
};

/** Poids utilisé quand le client n'a pas encore de mensuration. */
export const POIDS_PAR_DEFAUT = 70;

/**
 * Dépense estimée (kcal) : MET de l'activité × poids × durée, ajustée par l'effort ressenti (5/10 = moyen ;
 * 10/10 ≈ +20 %, 1/10 ≈ -16 %). Une estimation pour se faire une idée, pas une mesure.
 */
export function estimerCalories(a: { sport: Sport; titre?: string; dureeS: number; ressenti?: number }, poidsKg?: number | null): number | undefined {
  if (!(a.dureeS > 0)) return undefined;
  const met = (a.titre && (MET_ACTIVITE[a.titre] ?? MET_ACTIVITE[activiteConnue(a.titre)?.nom ?? ''])) || MET_SPORT[a.sport] || MET_SPORT.autre;
  const poids = poidsKg && poidsKg >= 30 && poidsKg <= 250 ? poidsKg : POIDS_PAR_DEFAUT;
  const effort = a.ressenti ? 0.8 + 0.04 * a.ressenti : 1;
  return Math.round(Math.min(met * effort * poids * (a.dureeS / 3600), 50000));
}

// ---------- Séances d'activité dans un programme ----------

/**
 * Activités du catalogue qu'un coach programme comme du cardio ou du renforcement détaillé : elles restent des
 * séances composées d'exercices. Tout le reste (cours de salle, yoga, aquatique, sports…) varie selon le prof et
 * le contexte : la séance tient en un nom, et le client la valide simplement.
 */
const DETAILLEES = new Set([
  'HIIT',
  'Tabata',
  'Circuit training',
  'Cardio training (machines)',
  'Elliptique',
  'Rameur',
  'SkiErg',
  'Air bike',
  'Stepper',
  'Corde à sauter',
  'Cours kettlebell',
  'Fit ball',
  'Renforcement musculaire (cours)',
  'Total body',
  'Mobilité',
  'Étirements à la maison',
]);
const CATEGORIES_DETAILLEES: Sport[] = ['musculation', 'course', 'trail', 'velo', 'marche', 'natation'];

export const estActiviteSimple = (a: ActiviteCatalogue) => !CATEGORIES_DETAILLEES.includes(a.sport) && !DETAILLEES.has(a.nom);

const motsSeuls = (t: string) =>
  ` ${sansAccents(t)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

/**
 * L'activité simple demandée au coach (« ajoute une séance de RPM », « Body Pump le jeudi »), s'il y en a une : la plus
 * longue reconnue, en mots entiers (« bodypump » collé aussi). Une demande longue décrit une vraie séance (« full body…,
 * finir par du stretching ») : elle reste à l'assistant.
 */
export function activiteSimpleDans(texte: string, motsMax = 12): ActiviteCatalogue | undefined {
  const t = motsSeuls(texte);
  if (t.trim().split(' ').length > motsMax) return undefined;
  const colle = ` ${t.trim().split(' ').join(' ')} `;
  let meilleure: ActiviteCatalogue | undefined;
  let longueur = 0;
  for (const a of CATALOGUE_ACTIVITES) {
    if (!estActiviteSimple(a)) continue;
    const n = motsSeuls(a.nom).trim();
    if (n.length < 3) continue;
    const trouve = t.includes(` ${n} `) || (n.includes(' ') && colle.includes(` ${n.replace(/ /g, '')} `));
    if (trouve && n.length > longueur) {
      meilleure = a;
      longueur = n.length;
    }
  }
  return meilleure;
}

/** La séance d'activité telle qu'elle part dans le programme : un nom, une consigne courte, aucun exercice. */
export const seanceActivite = (a: ActiviteCatalogue) => ({
  titre: a.nom,
  consignes: `${a.nom} : le contenu dépend du cours et du prof, il n'est pas détaillé ici. Valide la séance une fois faite.`,
});
