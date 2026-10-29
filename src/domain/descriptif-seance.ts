// Descriptif d'une séance écrit à partir de ce que le coach a saisi : organisation, objectif, déroulé de chaque bloc,
// et rappel de ce que veulent dire biset, superset, tempo… quand la séance en contient. Rien n'est inventé : chaque
// phrase vient d'un champ rempli.
import { dureeCourte } from './entrainement';
import type { Bloc, FormatBloc, LignePrescription, Seance } from './types';

export const FORMATS_BLOC: FormatBloc[] = ['Classique', 'Biset', 'Superset', 'Triset', 'Circuit'];
export const CONTRACTIONS = ['Classique', 'Excentrique lente', 'Pause isométrique', 'Concentrique explosive', 'Isométrie (maintien)'];

const DEFINITIONS_FORMAT: Record<Exclude<FormatBloc, 'Classique'>, string> = {
  Biset: 'Biset : deux exercices pour le même muscle, enchaînés sans pause. On récupère seulement après le deuxième.',
  Superset:
    'Superset : deux exercices enchaînés sans pause, souvent pour des muscles opposés (par exemple pectoraux puis dos). Un muscle se repose pendant que l’autre travaille.',
  Triset: 'Triset : trois exercices enchaînés sans pause, puis on récupère.',
  Circuit: 'Circuit : on fait tous les exercices du bloc l’un après l’autre, puis on recommence pour le nombre de tours prévu.',
};

const DEFINITIONS_CONTRACTION: Record<string, string> = {
  'Excentrique lente': 'Excentrique lente : on freine la descente (ou le retour) du mouvement, lentement et sous contrôle.',
  'Pause isométrique': 'Pause isométrique : on marque un arrêt de une à deux secondes au point le plus difficile, sans relâcher.',
  'Concentrique explosive': 'Concentrique explosive : on pousse ou on tire le plus vite possible, en gardant une technique propre.',
  'Isométrie (maintien)': 'Isométrie : on tient la position sans bouger pendant le temps prévu.',
};

const TEMPO = 'Tempo : la vitesse du mouvement en secondes. Par exemple 3-1-1-0 veut dire 3 s pour descendre, 1 s de pause en bas, 1 s pour remonter, 0 s en haut.';
const RIR = 'RIR (répétitions en réserve) : le nombre de répétitions que vous pourriez encore faire en fin de série. RIR 2 veut dire s’arrêter à environ 2 répétitions de l’échec.';

const liste = (mots: string[]) => (mots.length < 2 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots.at(-1)}`);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Ce que les répétitions prévues disent de l'objectif. Rien si les lignes ne le permettent pas. */
function objectifDesReps(lignes: LignePrescription[]) {
  const reps = lignes.map((l) => l.repetitionsMax ?? l.repetitionsMin).filter((r): r is number => r !== undefined && r > 0);
  if (reps.length < 2) return '';
  const moyenne = reps.reduce((a, b) => a + b, 0) / reps.length;
  if (moyenne <= 5) return 'Les séries courtes et lourdes visent surtout la force.';
  if (moyenne <= 12) return 'Les séries de 6 à 12 répétitions visent surtout le développement musculaire.';
  return 'Les séries longues visent surtout l’endurance musculaire.';
}

function deroulementBloc(b: Bloc) {
  const noms = b.lignes.map((l) => l.exercice.nom);
  const format = b.format && b.format !== 'Classique' ? b.format : undefined;
  const tours = b.lignes[0]?.series;
  const recup = b.lignes.at(-1)?.recuperationS;
  const morceaux: string[] = [];
  if (!noms.length) morceaux.push('Bloc à compléter.');
  else if (format) {
    morceaux.push(`En ${format.toLowerCase()} : ${noms.join(' puis ')}, sans pause entre les exercices.`);
    if (tours) morceaux.push(`${pluriel(tours, 'tour')}.`);
    if (recup !== undefined) morceaux.push(`Récupération de ${dureeCourte(recup)} après chaque tour.`);
  } else {
    morceaux.push(noms.length === 1 ? `${noms[0]}.` : `${liste(noms)}, l’un après l’autre.`);
    const recups = [...new Set(b.lignes.map((l) => l.recuperationS).filter((r): r is number => r !== undefined))];
    if (recups.length === 1) morceaux.push(`Récupération de ${dureeCourte(recups[0])} entre les séries.`);
  }
  if (b.tempo) morceaux.push(`Tempo ${b.tempo}.`);
  if (b.contraction && b.contraction !== 'Classique') morceaux.push(`Contraction : ${b.contraction.toLowerCase()}.`);
  if (b.description?.trim()) morceaux.push(b.description.trim());
  return `• ${b.titre || 'Bloc'} · ${morceaux.join(' ')}`;
}

export function descriptifSeance(s: Seance): string {
  const blocs = s.blocs.filter((b) => b.lignes.length || b.description);
  if (!blocs.length) return '';
  const lignes = blocs.flatMap((b) => b.lignes);
  const parties: string[] = [];

  const intro = [`Cette séance se déroule en ${pluriel(blocs.length, 'partie')} : ${liste(blocs.map((b) => (b.titre || 'Bloc').toLowerCase()))}.`];
  if (s.dureeMin) intro.push(`Comptez environ ${s.dureeMin} minutes.`);
  parties.push(intro.join(' '));

  const objectif = s.objectif ? `Objectif : ${s.objectif.replace(/\.$/, '')}.` : objectifDesReps(lignes.filter((l) => l.phase !== 'Échauffement' && l.phase !== 'Retour au calme'));
  if (objectif) parties.push(objectif);

  parties.push(blocs.map(deroulementBloc).join('\n'));

  const rappels: string[] = [];
  for (const f of FORMATS_BLOC) if (f !== 'Classique' && blocs.some((b) => b.format === f)) rappels.push(DEFINITIONS_FORMAT[f]);
  if (blocs.some((b) => b.tempo) || lignes.some((l) => l.tempo)) rappels.push(TEMPO);
  for (const c of Object.keys(DEFINITIONS_CONTRACTION)) if (blocs.some((b) => b.contraction === c)) rappels.push(DEFINITIONS_CONTRACTION[c]);
  if (lignes.some((l) => l.rir !== undefined)) rappels.push(RIR);
  if (rappels.length) parties.push(`Bon à savoir\n${rappels.join('\n')}`);

  return parties.join('\n\n');
}
