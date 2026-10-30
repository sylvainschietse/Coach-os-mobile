// Choix de la photo d'un programme sportif d'après son code, son objectif et son lieu d'entraînement
// (les photos elles-mêmes sont dans data/photos-programmes.ts).

export const CLES_PROGRAMME = [
  'salle-perte-1',
  'salle-perte-2',
  'salle-perte-3',
  'salle-muscle-1',
  'salle-muscle-2',
  'salle-muscle-3',
  'salle-force-1',
  'salle-force-2',
  'salle-force-3',
  'salle-forme-1',
  'salle-forme-2',
  'salle-forme-3',
  'cal-base',
  'cal-tractions',
  'cal-ppl',
  'cal-split',
  'maison-halteres',
  'maison-elastiques-1',
  'maison-elastiques-2',
  'ref-nassim',
  'ref-rud',
  'ref-nip',
  'ref-bws',
  'coaching',
] as const;

export type CleProgramme = (typeof CLES_PROGRAMME)[number];
type Cle = CleProgramme;

const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Méthodes de référence et programmes au poids du corps : leur photo montre l'exercice qui les caractérise. */
const PAR_CODE: [RegExp, Cle][] = [
  [/^CAL-TRACTIONS/, 'cal-tractions'],
  [/^CAL-PPL/, 'cal-ppl'],
  [/^CAL-SPLIT/, 'cal-split'],
  [/^CAL-/, 'cal-base'],
  [/^REF-AX/, 'maison-halteres'],
  [/^REF-CARRIO-3/, 'maison-elastiques-2'],
  [/^REF-CARRIO/, 'maison-elastiques-1'],
  [/^REF-NASSIM/, 'ref-nassim'],
  [/^REF-RUD/, 'ref-rud'],
  [/^REF-NIP/, 'ref-nip'],
  [/^REF-BWS/, 'ref-bws'],
];

const OBJECTIFS: [RegExp, string][] = [
  [/perte|seche|minceur|cardio/, 'perte'],
  [/force/, 'force'],
  [/muscle|masse|hypertrophie/, 'muscle'],
  [/forme|sante|reprise|tonus/, 'forme'],
];

/** Toujours la même variante pour un même programme, même après une copie (le titre garde son code). */
function variante(texte: string) {
  let h = 0;
  for (const c of texte) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 3) + 1;
}

export interface ProgrammeIllustre {
  titre: string;
  objectif?: string;
  environnement?: string;
  materiel?: string;
}

export function clePhotoProgramme(p: ProgrammeIllustre): Cle {
  const titre = p.titre.trim();
  for (const [motif, cle] of PAR_CODE) if (motif.test(titre)) return cle;
  const texte = sansAccents([p.objectif, p.environnement, p.materiel, titre].filter(Boolean).join(' '));
  if (/elastique/.test(texte)) return 'maison-elastiques-1';
  if (/traction/.test(texte)) return 'cal-tractions';
  if (/poids du corps|calisthenie|street workout/.test(texte)) return 'cal-base';
  if (/maison|domicile/.test(texte)) return 'maison-halteres';
  const objectif = OBJECTIFS.find(([motif]) => motif.test(sansAccents(p.objectif ?? '')) || motif.test(sansAccents(titre)))?.[1];
  if (!objectif) return /^Séance seule/.test(titre) ? 'coaching' : (`salle-forme-${variante(titre)}` as Cle);
  // Variante tirée du code du modèle (« MOD-SAL-23-3 ») : les modèles voisins de la liste ne se ressemblent pas.
  return `salle-${objectif}-${variante(titre.split(' · ')[0])}` as Cle;
}

