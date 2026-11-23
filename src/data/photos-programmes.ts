// Photos des programmes sportifs (images Canva) : une par méthode de référence, trois par objectif pour la salle.
// Un programme créé par le coach reçoit aussi une photo, choisie d'après son objectif et son lieu d'entraînement.

import { clePhotoProgramme, type CleProgramme, type ProgrammeIllustre } from '@/domain/illustration-programme';

export type { ProgrammeIllustre };

const PHOTOS = {
  'salle-perte-1': require('../../assets/images/programmes/salle-perte-1.jpg'),
  'salle-perte-2': require('../../assets/images/programmes/salle-perte-2.jpg'),
  'salle-perte-3': require('../../assets/images/programmes/salle-perte-3.jpg'),
  'salle-muscle-1': require('../../assets/images/programmes/salle-muscle-1.jpg'),
  'salle-muscle-2': require('../../assets/images/programmes/salle-muscle-2.jpg'),
  'salle-muscle-3': require('../../assets/images/programmes/salle-muscle-3.jpg'),
  'salle-force-1': require('../../assets/images/programmes/salle-force-1.jpg'),
  'salle-force-2': require('../../assets/images/programmes/salle-force-2.jpg'),
  'salle-force-3': require('../../assets/images/programmes/salle-force-3.jpg'),
  'salle-forme-1': require('../../assets/images/programmes/salle-forme-1.jpg'),
  'salle-forme-2': require('../../assets/images/programmes/salle-forme-2.jpg'),
  'salle-forme-3': require('../../assets/images/programmes/salle-forme-3.jpg'),
  'cal-base': require('../../assets/images/programmes/cal-base.jpg'),
  'cal-tractions': require('../../assets/images/programmes/cal-tractions.jpg'),
  'cal-ppl': require('../../assets/images/programmes/cal-ppl.jpg'),
  'cal-split': require('../../assets/images/programmes/cal-split.jpg'),
  'maison-halteres': require('../../assets/images/programmes/maison-halteres.jpg'),
  'maison-elastiques-1': require('../../assets/images/programmes/maison-elastiques-1.jpg'),
  'maison-elastiques-2': require('../../assets/images/programmes/maison-elastiques-2.jpg'),
  'ref-nassim': require('../../assets/images/programmes/ref-nassim.jpg'),
  'ref-rud': require('../../assets/images/programmes/ref-rud.jpg'),
  'ref-nip': require('../../assets/images/programmes/ref-nip.jpg'),
  'ref-bws': require('../../assets/images/programmes/ref-bws.jpg'),
  coaching: require('../../assets/images/programmes/coaching.jpg'),
} satisfies Record<CleProgramme, number>;

/** Ce que montre chaque photo, lu par les lecteurs d'écran. */
const DESCRIPTIONS: Record<CleProgramme, string> = {
  'salle-perte-1': 'Un homme enchaîne des swings de kettlebell en salle',
  'salle-perte-2': 'Une femme rame sur un rameur en salle',
  'salle-perte-3': 'Une femme travaille aux cordes ondulatoires',
  'salle-muscle-1': 'Un homme au développé incliné aux haltères',
  'salle-muscle-2': 'Une femme au tirage horizontal à la poulie',
  'salle-muscle-3': 'Un homme fait des curls aux haltères',
  'salle-force-1': 'Une femme soulève une barre lourde au soulevé de terre',
  'salle-force-2': 'Une femme au squat avec barre',
  'salle-force-3': 'Un homme au développé couché, assuré par son coach',
  'salle-forme-1': 'Une femme fait un squat gobelet guidée par sa coach',
  'salle-forme-2': 'Un homme au tirage vertical à la machine',
  'salle-forme-3': 'Un homme à la presse à cuisses',
  'cal-base': 'Une femme fait des pompes sur un tapis chez elle',
  'cal-tractions': 'Un homme fait des tractions aidées d’un élastique au parc',
  'cal-ppl': 'Une femme aux barres parallèles d’un parc de street workout',
  'cal-split': 'Un homme fait des fentes bulgares sur un banc du parc',
  'maison-halteres': 'Une femme fait des fentes aux haltères dans son salon',
  'maison-elastiques-1': 'Un homme fait un squat bras tendus dans son salon',
  'maison-elastiques-2': 'Une femme fait un tirage à l’élastique chez elle',
  'ref-nassim': 'Un homme au soulevé de terre jambes tendues',
  'ref-rud': 'Un homme au développé épaules aux haltères',
  'ref-nip': 'Une femme au hip thrust avec barre',
  'ref-bws': 'Un homme fait des tractions en salle',
  coaching: 'Une coach et son client se tapent dans la main pendant la séance',
};

export function photoProgramme(p: ProgrammeIllustre) {
  const cle = clePhotoProgramme(p);
  return { source: PHOTOS[cle], description: DESCRIPTIONS[cle] };
}
