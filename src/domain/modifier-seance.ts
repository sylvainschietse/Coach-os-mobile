// Modifier une séance en la dictant : l'assistant reçoit la séance actuelle et la consigne du coach, et renvoie la
// séance entière modifiée. Ce qui n'a pas changé garde ses réglages (élastique, tempo, chrono, consignes…).
import type { Bloc, LignePrescription } from './types';

const MAX_SEANCE = 1400;

const prescription = (l: LignePrescription) =>
  [
    `${l.series} × ${l.dureeS ? `${l.dureeS} s` : (l.repetitions ?? '—')}`,
    l.chargeIntensite ?? '',
    l.recuperationS !== undefined ? `récup ${l.recuperationS} s` : '',
    l.rir !== undefined ? `RIR ${l.rir}` : '',
  ]
    .filter(Boolean)
    .join(', ');

/** La séance en quelques lignes lisibles, pour l'assistant. */
export function texteSeance(blocs: Bloc[]): string {
  const t = blocs
    .map((b) => [`${b.titre || 'Sans bloc'} :`, ...b.lignes.map((l) => `- ${l.exercice.nom} : ${prescription(l)}`)].join('\n'))
    .join('\n');
  return t.length > MAX_SEANCE ? `${t.slice(0, MAX_SEANCE)}…` : t;
}

/** La demande envoyée à l'assistant : la séance actuelle s'il y en a une, puis ce que le coach veut changer. */
export function demandeModification(titre: string, blocs: Bloc[], consigne: string): string {
  const c = consigne.trim();
  if (!blocs.some((b) => b.lignes.length)) return `Séance « ${titre} ». ${c}`;
  return [
    `Séance « ${titre} », contenu actuel :`,
    texteSeance(blocs),
    '',
    `Modification demandée par le coach : ${c}`,
    '',
    'Renvoie la séance entière avec cette modification. Garde à l’identique, dans le même ordre, tout ce que la demande ne touche pas.',
  ].join('\n');
}

const memePrescription = (a: LignePrescription, b: LignePrescription) =>
  a.series === b.series && (a.repetitions ?? '') === (b.repetitions ?? '') && (a.dureeS ?? 0) === (b.dureeS ?? 0) && a.recuperationS === b.recuperationS && a.rir === b.rir;

/**
 * Reprend la proposition en gardant ce qui existait : un exercice déjà présent garde sa ligne (identifiant, élastique,
 * tempo, chrono, consignes) et ne prend que la nouvelle prescription si elle a changé ; un bloc au même nom garde ses réglages.
 */
export function fusionnerBlocs(anciens: Bloc[], proposes: Bloc[]): Bloc[] {
  const lignes = new Map<string, LignePrescription[]>();
  for (const b of anciens) for (const l of b.lignes) lignes.set(l.exercice.id, [...(lignes.get(l.exercice.id) ?? []), l]);
  const blocsPris = new Set<string>();
  return proposes.map((p) => {
    const ancien = anciens.find((b) => !blocsPris.has(b.id) && b.titre.trim().toLowerCase() === p.titre.trim().toLowerCase());
    if (ancien) blocsPris.add(ancien.id);
    const suite = p.lignes.map((l) => {
      const reste = lignes.get(l.exercice.id);
      const avant = reste?.shift();
      if (!avant) return l;
      if (memePrescription(avant, l)) return avant;
      return { ...avant, series: l.series, repetitions: l.repetitions, repetitionsMin: l.repetitionsMin, repetitionsMax: l.repetitionsMax, dureeS: l.dureeS, recuperationS: l.recuperationS, rir: l.rir };
    });
    return ancien ? { ...ancien, titre: p.titre, lignes: suite } : { ...p, lignes: suite };
  });
}

/** Ce qui change, en noms d'exercices : pour que le coach voie l'essentiel avant d'appliquer. */
export function changementsSeance(anciens: Bloc[], nouveaux: Bloc[]): { retires: string[]; ajoutes: string[]; modifies: string[] } {
  const a = anciens.flatMap((b) => b.lignes);
  const n = nouveaux.flatMap((b) => b.lignes);
  const ids = (ls: LignePrescription[]) => new Set(ls.map((l) => l.exercice.id));
  const ia = ids(a);
  const inn = ids(n);
  const uniques = (ls: string[]) => [...new Set(ls)];
  return {
    retires: uniques(a.filter((l) => !inn.has(l.exercice.id)).map((l) => l.exercice.nom)),
    ajoutes: uniques(n.filter((l) => !ia.has(l.exercice.id)).map((l) => l.exercice.nom)),
    modifies: uniques(n.filter((l) => ia.has(l.exercice.id) && !a.some((x) => x.id === l.id && memePrescription(x, l))).map((l) => l.exercice.nom)),
  };
}
