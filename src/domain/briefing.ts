// Résumé du bilan d'accueil pour préparer la séance Booster.
// Calculé sur l'appareil à partir des réponses, sans IA : rien n'est envoyé à un service extérieur.
// Les seuils des « leviers » sont des choix de départ, à ajuster avec Sylvain.

import { lireChoix } from './questionnaire';

export interface Briefing {
  /** Douleurs et contre-indications : à lire avant tout test physique. */
  sante: string[];
  objectif: string[];
  profil: string[];
  /** Habitudes qui ressortent comme points à travailler. */
  leviers: string[];
  motivation: string[];
}

const ou = (a: string | undefined, b: string | undefined) => (a === 'Autre' && b ? b : a);
const avecAutre = (choix: string | undefined, precision: string | undefined) =>
  lireChoix(choix)
    .map((c) => (c === 'Autre' && precision ? precision : c))
    .join(', ');
const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function preparerSeance(r: Record<string, string>): Briefing {
  const sante: string[] = [];
  if (r.douleur === 'Oui') sante.push(`Douleur ou blessure : ${r.douleurDetail || 'pas de précision donnée'}`);
  if (r.contreIndication === 'Oui') sante.push(`Contre-indication médicale : ${r.contreIndicationDetail || 'pas de précision donnée'}`);

  const objectif: string[] = [];
  if (r.objectif) objectif.push(ou(r.objectif, r.objectifAutre)!);
  if (r.pourquoi) objectif.push(`Pourquoi : ${r.pourquoi}`);
  if (r.echeance) objectif.push(`Échéance : ${r.echeance}`);
  if (r.motivation) objectif.push(`Ce qui l’amène : ${r.motivation}`);

  const profil: string[] = [];
  if (r.activiteReguliere === 'Oui' && r.activites) profil.push(`Pratique : ${avecAutre(r.activites, r.activitesAutre)}`);
  if (r.activiteReguliere === 'Non') profil.push('Pas d’activité physique régulière');
  if (r.anciennete) profil.push(`Ancienneté : ${minuscule(r.anciennete)}`);
  if (r.seancesActuelles || r.seancesPossibles)
    profil.push(`Séances par semaine : ${r.seancesActuelles ?? '?'} aujourd’hui, ${r.seancesPossibles ?? '?'} possibles`);
  if (r.lieu) profil.push(`Lieu : ${minuscule(r.lieu)}${r.materiel ? ` (matériel : ${minuscule(avecAutre(r.materiel, r.materielAutre))})` : ''}`);
  if (r.typesAimes) profil.push(`Aime : ${minuscule(r.typesAimes)}`);
  if (r.aEviter) profil.push(`À éviter : ${r.aEviter}`);

  const leviers: string[] = [];
  const si = (cond: boolean, texte: string) => cond && leviers.push(texte);
  const note = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v));
  si(r.sommeilHeures === 'Moins de 6 h', 'Sommeil : moins de 6 h par nuit');
  si((note(r.sommeilQualite) ?? 10) <= 4, `Qualité du sommeil : ${r.sommeilQualite}/10`);
  si(r.reveilRepose === 'Rarement', 'Se réveille rarement reposé(e)');
  si(r.alimentation === 'À améliorer' || r.alimentation === 'Très déséquilibrée', `Alimentation jugée « ${minuscule(r.alimentation ?? '')} »`);
  si(r.repas === '1', 'Un seul repas par jour');
  si(r.grignotage === 'Souvent' || r.grignotage === 'Tous les jours', `Grignotage : ${minuscule(r.grignotage ?? '')}`);
  si(r.proteines === 'Rarement' || r.proteines === 'Jamais', `Protéines aux repas : ${minuscule(r.proteines ?? '')}`);
  si(r.fruitsLegumes === 'Non', 'Pas de fruits et légumes tous les jours');
  si(r.ultraTransformes === '3 à 5 fois par semaine' || r.ultraTransformes === 'Presque tous les jours', `Produits ultra-transformés : ${r.ultraTransformes}`);
  si(r.sel === 'Souvent', 'Ajoute souvent du sel');
  si(r.boissonsSucrees === 'Plusieurs fois par semaine' || r.boissonsSucrees === 'Tous les jours', `Boissons sucrées : ${minuscule(r.boissonsSucrees ?? '')}`);
  si(r.restaurant === '3 fois par semaine ou plus', 'Restaurant ou plats préparés 3 fois par semaine ou plus');
  si(r.eau === 'Moins de 1 L' || r.eau === 'Entre 1 et 1,5 L', `Eau : ${minuscule(r.eau ?? '')} par jour`);
  si((note(r.stress) ?? 0) >= 7, `Stress : ${r.stress}/10`);
  si(r.tabac === 'Tous les jours' || r.tabac === 'Occasionnellement', `Tabac : ${minuscule(r.tabac ?? '')}`);
  si(r.alcool === 'Plus de 2 fois par semaine', 'Alcool plus de 2 fois par semaine');

  const motivation: string[] = [];
  if (r.motivationNote) motivation.push(`Motivation : ${r.motivationNote}/10${r.empeche ? `, freinée par : ${r.empeche}` : ''}`);
  if (r.obstacle) motivation.push(`Principal obstacle : ${minuscule(ou(r.obstacle, r.obstacleAutre)!)}`);
  if (r.attentes) motivation.push(`Attend : ${minuscule(avecAutre(r.attentes, r.attentesAutre))}`);
  if (r.dejaCoach === 'Oui') {
    if (r.coachApprecie) motivation.push(`A aimé avec un ancien coach : ${r.coachApprecie}`);
    if (r.coachDecu) motivation.push(`Ne veut pas retrouver : ${r.coachDecu}`);
  }
  if (r.bonCoach) motivation.push(`« Le bon coach » pour lui/elle : ${r.bonCoach}`);
  if (r.autreChose) motivation.push(`À savoir aussi : ${r.autreChose}`);

  return { sante, objectif, profil, leviers, motivation };
}
