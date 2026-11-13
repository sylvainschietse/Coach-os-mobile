// Saisie d'une séance après coup, quand le client s'est entraîné sans son téléphone : il raconte ce qu'il a fait (dictée
// lue par l'IA, ou lecture simple en démo), l'app remplit les séries, puis il valide bloc par bloc. Ce qu'il ne dit pas
// reste « comme prévu ». Fonctions pures : l'écran et le serveur s'en servent.

import type { Mesure } from './types';

/** Un exercice tel qu'on le décrit à la lecture de la dictée. */
export interface LigneADicter {
  id: string;
  nom: string;
  series: number;
  /** Les cases d'une série, dans l'ordre de saisie (charge et répétitions, durée…). */
  mesures: Mesure[];
}

export type SerieDictee = Partial<Record<Mesure, number>>;
export interface LigneDictee {
  ligneId: string;
  /** Série par série, dans l'ordre. Vide si le client a seulement dit « comme prévu ». */
  series: SerieDictee[];
}
export interface SeanceDictee {
  lignes: LigneDictee[];
  /** Ressenti de 1 à 10, s'il en parle. */
  note?: number;
  /** Ce qu'il dit d'autre (douleur, fatigue, machine prise…), remis au propre. */
  commentaire?: string;
}

export type Valeurs = Record<string, Partial<Record<Mesure, string>>>;

const ecrit = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/**
 * Les cases remplies par la dictée (`ligneId:n` → valeurs), les exercices dont le client a parlé, et les séries
 * incomplètes : un exercice cité dont une série n'a reçu aucune valeur. Une charge dite une fois vaut pour les séries
 * suivantes (« tirage 50 kilos, 10, 10, 8 »).
 */
export function remplirDepuisDictee(lignes: LigneADicter[], dictee: SeanceDictee): { vals: Valeurs; dictees: string[]; manques: string[] } {
  const vals: Valeurs = {};
  const dictees: string[] = [];
  const manques: string[] = [];
  for (const l of lignes) {
    const lu = dictee.lignes.find((x) => x.ligneId === l.id);
    if (!lu) continue;
    dictees.push(l.id);
    if (!lu.series.length) continue;
    const autres = l.mesures.filter((m) => m !== 'charge');
    let charge: number | undefined;
    for (let n = 1; n <= Math.max(1, l.series); n++) {
      const s = lu.series[n - 1];
      if (s?.charge !== undefined) charge = s.charge;
      const v: Partial<Record<Mesure, string>> = {};
      if (s)
        for (const m of l.mesures) {
          const x = m === 'charge' ? (s.charge ?? charge) : s[m];
          if (x !== undefined && Number.isFinite(x) && x >= 0) v[m] = ecrit(x);
        }
      if (!Object.keys(v).length || (autres.length && !autres.some((m) => v[m]))) manques.push(`${l.id}:${n}`);
      else vals[`${l.id}:${n}`] = v;
    }
  }
  return { vals, dictees, manques };
}

const sansAccents = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ');

const MOTS_VIDES = new Set(['avec', 'pour', 'sans', 'les', 'des', 'aux', 'barre', 'halteres', 'haltere', 'machine', 'poulie', 'assis', 'debout', 'unilateral']);
const motsCles = (nom: string) =>
  sansAccents(nom)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m))
    .map((m) => m.slice(0, Math.max(4, m.length - 1)));

/**
 * Lecture simple d'une dictée, sans IA (mode démo, ou secours) : on repère chaque exercice par un mot de son nom, puis
 * les nombres qui suivent jusqu'à l'exercice suivant. « kg », « kilos » marquent une charge, « s », « secondes » une
 * durée ; les autres nombres sont des répétitions (ou des durées pour un exercice au temps).
 */
export function lireDicteeSimple(texte: string, lignes: LigneADicter[]): SeanceDictee {
  const t = sansAccents(texte);
  const reperes = lignes
    .map((l) => {
      const positions = motsCles(l.nom)
        .map((m) => t.search(new RegExp(`\\b${m}`)))
        .filter((p) => p >= 0);
      return { l, pos: positions.length ? Math.min(...positions) : -1 };
    })
    .filter((r) => r.pos >= 0)
    .sort((a, b) => a.pos - b.pos);

  const resultat: LigneDictee[] = [];
  reperes.forEach(({ l, pos }, i) => {
    const morceau = t.slice(pos, reperes[i + 1]?.pos ?? t.length);
    const auTemps = l.mesures[0] === 'duree';
    let charge: number | undefined;
    const autres: number[] = [];
    const nombres = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|k\b|s\b|sec\w*|minutes?|min\b)?/g;
    for (const m of morceau.matchAll(nombres)) {
      const n = Number(m[1].replace(',', '.'));
      const unite = m[2] ?? '';
      if (/^k/.test(unite)) charge = n;
      else if (/^min/.test(unite)) autres.push(n * 60);
      else autres.push(n);
    }
    const champ: Mesure = auTemps ? 'duree' : l.mesures.includes('repetitions') ? 'repetitions' : l.mesures[0];
    const series: SerieDictee[] = autres.slice(0, Math.max(1, l.series)).map((n, k) => ({ [champ]: n, ...(k === 0 && charge !== undefined ? { charge } : {}) }));
    if (!series.length && charge !== undefined) series.push({ charge });
    resultat.push({ ligneId: l.id, series: /comme prevu/.test(morceau) && !autres.length ? [] : series });
  });
  return { lignes: resultat };
}

/** Une séance notée en entier : chaque exercice prévu a au moins une série remplie. */
export function seanceDetaillee(lignesPrevues: string[], seriesFaites: { ligneId: string }[]): boolean {
  return lignesPrevues.length > 0 && lignesPrevues.every((id) => seriesFaites.some((s) => s.ligneId === id));
}

/** Les mentions que le coach lit en tête du commentaire, selon la façon dont la séance a été notée. */
export const MENTIONS = {
  dictee: 'Racontée à voix haute après la séance.',
  prevu: 'Notée après la séance : tout comme prévu.',
  faite: 'Séance faite, sans le détail.',
} as const;
