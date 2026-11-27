// Vidéos selon la marque des machines du club du client. Pour un exercice sur machine du programme (« Presse à
// cuisses inclinée — machine »), les machines équivalentes des marques de son club (Technogym, Hammer Strength) avec
// leur vidéo, pour qu'il retrouve la sienne en salle. Les vidéos sont celles des chaînes YouTube publiques : elles
// sont lues dans le lecteur YouTube, jamais téléchargées ni rehébergées.
import type { Exercice } from './types';

export type Mouvement =
  | 'presse-cuisses'
  | 'hack-squat'
  | 'belt-squat'
  | 'squat'
  | 'leg-extension'
  | 'leg-curl'
  | 'mollets-assis'
  | 'mollets-debout'
  | 'hip-thrust'
  | 'abducteurs'
  | 'adducteurs'
  | 'kickback'
  | 'pec-deck'
  | 'oiseau'
  | 'elevations-laterales'
  | 'developpe-incline'
  | 'developpe-decline'
  | 'developpe-couche'
  | 'developpe-epaules'
  | 'dips'
  | 'pull-over'
  | 'tirage-vertical'
  | 'rowing-haut'
  | 'rowing-tbar'
  | 'rowing'
  | 'curl-biceps'
  | 'extension-triceps'
  | 'crunch'
  | 'rotation-buste'
  | 'extension-lombaire'
  | 'souleve-terre';

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Dans l'ordre : la première règle qui reconnaît le nom l'emporte (« leg curl » avant « curl »). */
const REGLES: [RegExp, Mouvement][] = [
  [/presse a cuisses|leg press/, 'presse-cuisses'],
  [/hack|v-squat|squat pendulaire/, 'hack-squat'],
  [/squat (a la )?ceinture|belt squat/, 'belt-squat'],
  [/leg extension/, 'leg-extension'],
  [/leg curl/, 'leg-curl'],
  [/mollets? assis/, 'mollets-assis'],
  [/mollets?|calf/, 'mollets-debout'],
  [/hip thrust|glute drive/, 'hip-thrust'],
  [/abduct/, 'abducteurs'],
  [/adduct/, 'adducteurs'],
  [/kickback fessier|presse a fessiers|extension de hanche/, 'kickback'],
  [/pec deck|butterfly|ecarte(?! inverse)|pectoral fly/, 'pec-deck'],
  [/oiseau|ecarte inverse|reverse fly/, 'oiseau'],
  [/elevations? laterales?/, 'elevations-laterales'],
  [/developpe incline/, 'developpe-incline'],
  [/developpe decline/, 'developpe-decline'],
  [/developpe (couche|assis poitrine)|chest press/, 'developpe-couche'],
  [/developpe (epaules|militaire)|shoulder press/, 'developpe-epaules'],
  [/dips/, 'dips'],
  [/pull-?over/, 'pull-over'],
  [/tirage vertical|tirage poitrine|tirage nuque|pulldown/, 'tirage-vertical'],
  [/rowing haut|high row/, 'rowing-haut'],
  [/t-bar/, 'rowing-tbar'],
  [/rowing|tirage horizontal/, 'rowing'],
  [/curl/, 'curl-biceps'],
  [/triceps/, 'extension-triceps'],
  [/crunch/, 'crunch'],
  [/rotation du (buste|tronc)/, 'rotation-buste'],
  [/extension lombaire|hyperextension|back extension/, 'extension-lombaire'],
  [/souleve de terre(?! roumain)|deadlift/, 'souleve-terre'],
  [/squat/, 'squat'],
];

/** Le mouvement reconnu dans un nom d'exercice, ou `undefined`. */
export function mouvementDe(nom: string): Mouvement | undefined {
  const n = sansAccents(nom);
  return REGLES.find(([r]) => r.test(n))?.[1];
}

export interface MachineMarque {
  /** TG-PS-01 (comme le catalogue), HS-PL-01… */
  ref: string;
  marque: 'Technogym' | 'Hammer Strength';
  gamme: string;
  nomOfficiel: string;
  /** Le nom en français, celui que le client voit. */
  nom: string;
  videoUrl: string;
  /** Les mouvements faits sur cette machine (déduits du nom quand ils ne sont pas donnés). */
  mouvements: Mouvement[];
}

type Brute = [ref: string, marque: MachineMarque['marque'], gamme: string, nomOfficiel: string, nom: string, video: string, mouvements?: Mouvement[]];

// Technogym : les 63 machines ajoutées au catalogue le 23 novembre 2026 (mêmes références et vidéos).
// Hammer Strength : chaînes officielles « Hammer Strength » et « Life Fitness / Hammer Strength », sauf le Seated Dip
// (BTX Coaching, pas de vidéo officielle).
const BRUTES: Brute[] = [
  ['TG-PS-01', 'Technogym', 'Pure Strength', 'Pure Strength Chest Press', 'Développé couché assis', 'gEzDvB1T1yA'],
  ['TG-PS-02', 'Technogym', 'Pure Strength', 'Pure Strength Incline Chest Press', 'Développé incliné', 'df8H_mSTYNg'],
  ['TG-PS-03', 'Technogym', 'Pure Strength', 'Pure Strength Wide Chest Press', 'Développé couché prise large', 'qw9N_Bv3ZYs'],
  ['TG-PS-04', 'Technogym', 'Pure Strength', 'Pure Strength Shoulder Press', 'Développé épaules', 'd7yQMvVQaXQ'],
  ['TG-PS-05', 'Technogym', 'Pure Strength', 'Pure Strength Seated Dip', 'Dips assis', 'QhqLW0uGRoc'],
  ['TG-PS-06', 'Technogym', 'Pure Strength', 'Pure Strength Pullover', 'Pull-over', 'SaLI8YHxOAo'],
  ['TG-PS-07', 'Technogym', 'Pure Strength', 'Pure Strength Pulldown', 'Tirage vertical', 'BN9MDxPxjjM'],
  ['TG-PS-08', 'Technogym', 'Pure Strength', 'Pure Strength Row', 'Rowing assis appui poitrine', '0YzMymwWV0o'],
  ['TG-PS-09', 'Technogym', 'Pure Strength', 'Pure Strength Low Row', 'Rowing bas', 'vY1-i6sAOMc'],
  ['TG-PS-10', 'Technogym', 'Pure Strength', 'Pure Strength T-Bar Row', 'Rowing T-bar', 'zN3h4SmexR0'],
  ['TG-PS-11', 'Technogym', 'Pure Strength', 'Pure Strength Biceps', 'Curl biceps pupitre', 'Dwxad2G_Ajo'],
  ['TG-PS-12', 'Technogym', 'Pure Strength', 'Pure Strength Leg Press', 'Presse à cuisses 45°', 'M1MBgv6QBSk'],
  ['TG-PS-13', 'Technogym', 'Pure Strength', 'Pure Strength Linear Leg Press', 'Presse à cuisses linéaire', 'v5fSebr6n_U'],
  ['TG-PS-14', 'Technogym', 'Pure Strength', 'Pure Strength Hack Squat', 'Hack squat', 'LndKbk23gKI'],
  ['TG-PS-15', 'Technogym', 'Pure Strength', 'Pure Strength Belt Squat', 'Squat à la ceinture', 'utGWh9J4lb8'],
  ['TG-PS-16', 'Technogym', 'Pure Strength', 'Pure Strength Deadlift', 'Soulevé de terre', 'QEtepqZYPaI'],
  ['TG-PS-17', 'Technogym', 'Pure Strength', 'Pure Strength Hip Thrust', 'Hip thrust', 'y50EcGQku58'],
  ['TG-PS-18', 'Technogym', 'Pure Strength', 'Pure Strength Rear Kick', 'Kickback fessier debout', 'zkPG-wy3PeE'],
  ['TG-PS-19', 'Technogym', 'Pure Strength', 'Pure Strength Standing Abductor', 'Abduction de hanche debout', 'v-CyqOVoEXM'],
  ['TG-PS-20', 'Technogym', 'Pure Strength', 'Pure Strength Leg Extension', 'Leg extension', 'HcIGtph0j3U'],
  ['TG-PS-21', 'Technogym', 'Pure Strength', 'Pure Strength Standing Leg Curl', 'Leg curl debout', 'CmtN7mqUkLQ'],
  ['TG-PS-22', 'Technogym', 'Pure Strength', 'Pure Strength Calf', 'Mollets debout', 'EUqHeyhUOm8'],
  ['TG-PS-23', 'Technogym', 'Pure Strength', 'Pure Strength Seated Calf', 'Mollets assis', 'paSkfNotQis'],
  ['TG-S9-01', 'Technogym', 'Selection 900', 'Selection 900 Chest Press', 'Développé couché assis', 'AJ_szU7CiXs'],
  ['TG-S9-02', 'Technogym', 'Selection 900', 'Selection 900 Pectoral', 'Pec deck (butterfly)', 'iIUWXNxc_Kk'],
  ['TG-S9-03', 'Technogym', 'Selection 900', 'Selection 900 Multi Flight', 'Écarté et oiseau (Multi Flight)', 'iIUWXNxc_Kk', ['pec-deck', 'oiseau']],
  ['TG-S9-04', 'Technogym', 'Selection 900', 'Selection 900 Reverse Fly', 'Oiseau (écarté inversé)', 'FMvTi4DR5Fs'],
  ['TG-S9-05', 'Technogym', 'Selection 900', 'Selection 900 Shoulder Press', 'Développé épaules', '7uAYLpiQtS8'],
  ['TG-S9-06', 'Technogym', 'Selection 900', 'Selection 900 Delts Machine', 'Élévations latérales', 'DYS65xSwqck'],
  ['TG-S9-07', 'Technogym', 'Selection 900', 'Selection 900 Lat Machine', 'Tirage vertical poulie haute', 'Xbo1ED6I4Io'],
  ['TG-S9-08', 'Technogym', 'Selection 900', 'Selection 900 Vertical Traction', 'Tirage vertical guidé', 'db_BT6FyTtE'],
  ['TG-S9-09', 'Technogym', 'Selection 900', 'Selection 900 Low Row', 'Rowing assis', 'rADR-qRgx2A'],
  ['TG-S9-10', 'Technogym', 'Selection 900', 'Selection 900 Pulley', 'Tirage horizontal poulie basse', 'YSFfQwTG4JE'],
  ['TG-S9-11', 'Technogym', 'Selection 900', 'Selection 900 Arm Curl', 'Curl biceps pupitre', 'KabNT3qAh3E'],
  ['TG-S9-12', 'Technogym', 'Selection 900', 'Selection 900 Arm Extension', 'Extension triceps', 'ZOke6S0opwQ'],
  ['TG-S9-13', 'Technogym', 'Selection 900', 'Selection 900 Abdominal Crunch', 'Crunch abdominal', 'rha2lXRJau8'],
  ['TG-S9-14', 'Technogym', 'Selection 900', 'Selection 900 Total Abdominal', 'Crunch abdominal (Total Abdominal)', 'iK3RR9Zaz_Y'],
  ['TG-S9-15', 'Technogym', 'Selection 900', 'Selection 900 Rotary Torso', 'Rotation du buste', 'h5naeryzGjE'],
  ['TG-S9-16', 'Technogym', 'Selection 900', 'Selection 900 Lower Back', 'Extension lombaire', 'x9aC7Nl6Azk'],
  ['TG-S9-17', 'Technogym', 'Selection 900', 'Selection 900 Leg Press', 'Presse à cuisses assise', 'uEsZWWiYNAQ'],
  ['TG-S9-18', 'Technogym', 'Selection 900', 'Selection 900 Leg Extension', 'Leg extension', 'ycv7NZYOpE4'],
  ['TG-S9-19', 'Technogym', 'Selection 900', 'Selection 900 Leg Curl', 'Leg curl assis', 'vkkyibtK6I8'],
  ['TG-S9-20', 'Technogym', 'Selection 900', 'Selection 900 Prone Leg Curl', 'Leg curl allongé', 'QjNFk4F5dAs'],
  ['TG-S9-21', 'Technogym', 'Selection 900', 'Selection 900 Adductor', 'Adducteurs', 'KaEp53Hj-EU'],
  ['TG-S9-22', 'Technogym', 'Selection 900', 'Selection 900 Abductor', 'Abducteurs', 'DHIzHGNaTnM'],
  ['TG-S9-23', 'Technogym', 'Selection 900', 'Selection 900 Glute Press', 'Presse à fessiers (kickback)', 'nt4zOGMfsc0'],
  ['TG-S9-24', 'Technogym', 'Selection 900', 'Selection 900 Hip Thrust', 'Hip thrust guidé', 'xtIZ9pjcA_8'],
  ['TG-S9-25', 'Technogym', 'Selection 900', 'Selection 900 Rotary Calf', 'Mollets (Rotary Calf)', 'CYP0KXpNvrY'],
  ['TG-BS-01', 'Technogym', 'Biostrength', 'Biostrength Chest Press', 'Développé couché assis', 'n1Dyy3De1Rc'],
  ['TG-BS-02', 'Technogym', 'Biostrength', 'Biostrength Pectoral', 'Pec deck (butterfly)', 'iIUWXNxc_Kk'],
  ['TG-BS-03', 'Technogym', 'Biostrength', 'Biostrength Reverse Fly', 'Oiseau (écarté inversé)', 'FMvTi4DR5Fs'],
  ['TG-BS-04', 'Technogym', 'Biostrength', 'Biostrength Shoulder Press', 'Développé épaules', '7uAYLpiQtS8'],
  ['TG-BS-05', 'Technogym', 'Biostrength', 'Biostrength Vertical Traction', 'Tirage vertical', 'db_BT6FyTtE'],
  ['TG-BS-06', 'Technogym', 'Biostrength', 'Biostrength Low Row', 'Rowing assis', 'rADR-qRgx2A'],
  ['TG-BS-07', 'Technogym', 'Biostrength', 'Biostrength Arm Curl', 'Curl biceps', 'VV8Q9kb5dPw'],
  ['TG-BS-08', 'Technogym', 'Biostrength', 'Biostrength Arm Extension', 'Extension triceps', 'e52m4r4qtDM'],
  ['TG-BS-09', 'Technogym', 'Biostrength', 'Biostrength Total Abdominal', 'Crunch abdominal', 'GYC04FFti4I'],
  ['TG-BS-10', 'Technogym', 'Biostrength', 'Biostrength Lower Back', 'Extension lombaire', 'mwHMvmKcrU0'],
  ['TG-BS-11', 'Technogym', 'Biostrength', 'Biostrength Leg Press', 'Presse à cuisses', 'Mqhedrdsai0'],
  ['TG-BS-12', 'Technogym', 'Biostrength', 'Biostrength Leg Extension', 'Leg extension', '2lvdnQg04PM'],
  ['TG-BS-13', 'Technogym', 'Biostrength', 'Biostrength Leg Curl', 'Leg curl assis', 'ttXVKHhLoDU'],
  ['TG-BS-14', 'Technogym', 'Biostrength', 'Biostrength Adductor', 'Adducteurs', 'KaEp53Hj-EU'],
  ['TG-BS-15', 'Technogym', 'Biostrength', 'Biostrength Abductor', 'Abducteurs', 'DHIzHGNaTnM'],
  ['HS-PL-01', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Bench Press', 'Développé couché assis', 'yxGgZSMC8SU'],
  ['HS-PL-02', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Incline Press', 'Développé incliné', 'UKPBc1BWRzw'],
  ['HS-PL-03', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Decline Press', 'Développé décliné', 'm5lw3woF8h4'],
  ['HS-PL-04', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Wide Chest', 'Développé couché prise large', 'M-aOL1AxZoQ'],
  ['HS-PL-05', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Shoulder Press', 'Développé épaules', 'TBZ3m1cd2Vw'],
  ['HS-PL-06', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Front Lat Pulldown', 'Tirage vertical', 'WcTbf3RI3Q8'],
  ['HS-PL-07', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Row', 'Rowing assis', 'VZmJ8z6zh3g'],
  ['HS-PL-08', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral High Row', 'Rowing haut', '5vcDfRwVMSk'],
  ['HS-PL-09', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Low Row', 'Rowing bas', 'k2S4G14cmts'],
  ['HS-PL-10', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral D.Y. Row', 'Rowing à un bras (D.Y. Row)', '27AgbqjwmOs'],
  ['HS-PL-11', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Leg Press', 'Presse à cuisses', 's9tIVWbJjhU'],
  ['HS-PL-12', 'Hammer Strength', 'Plate-Loaded', 'Linear Leg Press', 'Presse à cuisses linéaire', 'Xv-FPPjt4iQ'],
  ['HS-PL-13', 'Hammer Strength', 'Plate-Loaded', 'Hack Squat', 'Hack squat', '8AXtP_CHO4k'],
  ['HS-PL-14', 'Hammer Strength', 'Plate-Loaded', 'V-Squat', 'V-squat', 'j6bEZhsOyVc'],
  ['HS-PL-15', 'Hammer Strength', 'Plate-Loaded', 'Belt Squat', 'Squat à la ceinture', 'z4EPh7rwzfY'],
  ['HS-PL-16', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Leg Extension', 'Leg extension', 'b1qPDBWUQ-8'],
  ['HS-PL-17', 'Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Kneeling Leg Curl', 'Leg curl à genoux', 'zFmKmtcZxB0'],
  ['HS-PL-18', 'Hammer Strength', 'Plate-Loaded', 'Seated Calf', 'Mollets assis', 'UoYD9G2zSMo'],
  ['HS-PL-19', 'Hammer Strength', 'Plate-Loaded', 'Glute Drive', 'Hip thrust', 'EAdDjw-k3ow'],
  ['HS-PL-20', 'Hammer Strength', 'Plate-Loaded', 'Seated Dip', 'Dips assis', '5wpfxxUGCuI'],
  ['HS-PL-21', 'Hammer Strength', 'Plate-Loaded', 'Seated Biceps', 'Curl biceps assis', 'B27-cHMnlPE'],
  ['HS-PL-22', 'Hammer Strength', 'Ground Base', 'Squat Lunge', 'Squat et fente', 'ynLtdYQMu78'],
  ['HS-SE-01', 'Hammer Strength', 'Select', 'Chest Press', 'Développé couché assis', 'tzudm_FA4ew'],
  ['HS-SE-02', 'Hammer Strength', 'Select', 'Shoulder Press', 'Développé épaules', 'MjVDrYPD7Rs'],
  ['HS-SE-03', 'Hammer Strength', 'Select', 'Lat Pulldown', 'Tirage vertical', 'NAIEnMjN-6w'],
  ['HS-SE-04', 'Hammer Strength', 'Select', 'Row', 'Rowing assis', '0GU9_kT6tBY'],
  ['HS-SE-05', 'Hammer Strength', 'Select', 'Pectoral Fly / Rear Deltoid', 'Pec deck et oiseau', 'sAeDw6xhFFw', ['pec-deck', 'oiseau']],
  ['HS-SE-06', 'Hammer Strength', 'Select', 'Biceps Curl', 'Curl biceps', 'rwo-3PTM8U4'],
  ['HS-SE-07', 'Hammer Strength', 'Select', 'Triceps Extension', 'Extension triceps', '_JoblP7fggo'],
  ['HS-SE-08', 'Hammer Strength', 'Select', 'Seated Leg Press', 'Presse à cuisses assise', 'yyla8aCTMWo'],
  ['HS-SE-09', 'Hammer Strength', 'Select', 'Leg Extension', 'Leg extension', 'MpEydcQ1oDw'],
  ['HS-SE-10', 'Hammer Strength', 'Select', 'Seated Leg Curl', 'Leg curl assis', '_qwLdYywo_A'],
  ['HS-SE-11', 'Hammer Strength', 'Select', 'Leg Curl', 'Leg curl allongé', 'SiwJ_T62l9c'],
  ['HS-SE-12', 'Hammer Strength', 'Select', 'Hip Abduction', 'Abducteurs', 'H98IP8rARy4'],
  ['HS-SE-13', 'Hammer Strength', 'Select', 'Hip Adduction', 'Adducteurs', '36EB4I915sU'],
  ['HS-SE-14', 'Hammer Strength', 'Select', 'Hip and Glute', 'Presse à fessiers (kickback)', '7nazTC6EshM'],
  ['HS-SE-15', 'Hammer Strength', 'Select', 'Abdominal Crunch', 'Crunch abdominal', 'yUHmHlVdVqM'],
  ['HS-SE-16', 'Hammer Strength', 'Select', 'Back Extension', 'Extension lombaire', '4sla2xidkD0'],
  ['HS-SE-17', 'Hammer Strength', 'Select', 'Standing Calf Raise', 'Mollets debout', 'g_E7_q1z2bo'],
];

export const MACHINES_MARQUES: MachineMarque[] = BRUTES.map(([ref, marque, gamme, nomOfficiel, nom, video, mouvements]) => {
  const m = mouvements ?? [mouvementDe(nom) ?? mouvementDe(nomOfficiel)].filter((x): x is Mouvement => !!x);
  return { ref, marque, gamme, nomOfficiel, nom, videoUrl: `https://www.youtube.com/watch?v=${video}`, mouvements: m };
});

/** Les marques dont on a les vidéos machine par machine. */
export const MARQUES_VIDEOS: MachineMarque['marque'][] = ['Technogym', 'Hammer Strength'];

/**
 * Un exercice fait sur une machine guidée. Les exercices à la poulie, aux élastiques, à la Smith machine ou en poids
 * libre restent avec leur vidéo habituelle : ce ne sont pas les mêmes mouvements que sur une machine de marque.
 * Le matériel de l'exercice décide quand il est connu, sinon son nom.
 */
export function surMachine(e: Pick<Exercice, 'nom' | 'materiel'>) {
  const materiel = (e.materiel ?? []).map(sansAccents);
  const nom = sansAccents(e.nom);
  if (/smith|poulie|elastique/.test(nom) || materiel.some((m) => /smith|poulie/.test(m))) return false;
  if (materiel.length) return materiel.some((m) => m.includes('machine'));
  return /machine|presse a cuisses|leg (press|extension|curl)|pec deck|hack/.test(nom);
}

/** Les précisions du nom qui départagent les machines d'un même mouvement (leg curl assis, couché, debout…). */
const PRECISIONS = [/assise?|seated/, /couche|allonge|prone/, /debout|standing/, /genoux|kneeling/, /inclinee?|45/, /lineaire|linear/, /horizontale?/, /large|wide/];

function lesPlusProches(nom: string, machines: MachineMarque[]) {
  let retenues = machines;
  for (const r of PRECISIONS) {
    if (!r.test(nom)) continue;
    const proches = retenues.filter((m) => r.test(sansAccents(`${m.nom} ${m.nomOfficiel}`)));
    if (proches.length) retenues = proches;
  }
  return retenues;
}

export interface MachinesDeMarque {
  marque: MachineMarque['marque'];
  machines: MachineMarque[];
}

/**
 * Les machines des marques du client pour cet exercice, une liste par marque (dans l'ordre de ses marques).
 * Rien quand l'exercice n'est pas sur machine, quand il nomme déjà une marque ou quand le mouvement n'est pas reconnu.
 */
export function machinesPour(e: Pick<Exercice, 'nom' | 'materiel'>, marques: readonly string[]): MachinesDeMarque[] {
  if (!marques.length || !surMachine(e)) return [];
  const nom = sansAccents(e.nom);
  if (MARQUES_VIDEOS.some((m) => nom.includes(sansAccents(m))) || /pure strength|selection 900|biostrength/.test(nom)) return [];
  const mouvement = mouvementDe(e.nom);
  if (!mouvement) return [];
  return MARQUES_VIDEOS.filter((m) => marques.includes(m))
    .map((marque) => ({ marque, machines: lesPlusProches(nom, MACHINES_MARQUES.filter((x) => x.marque === marque && x.mouvements.includes(mouvement))) }))
    .filter((g) => g.machines.length > 0);
}
