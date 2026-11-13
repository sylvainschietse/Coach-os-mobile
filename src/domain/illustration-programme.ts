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

const sansAccents = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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

type Public = 'femme-50' | 'femme' | 'homme-50' | 'homme';
type Objectif = 'perte' | 'muscle' | 'force' | 'forme';

/** Public visé, lu dans le titre (« MOD-SAL-V3-F50-… · Femme 50 ans · … »). Sans mention : programme mixte. */
function publicVise(titre: string): Public | undefined {
  const t = sansAccents(titre);
  const senior = /\b50 ?ans|\bsenior|post-?menopause|\bmenopause/.test(t.replace(/premenopause/g, ''));
  if (/\bfemmes?\b|feminin/.test(t)) return senior ? 'femme-50' : 'femme';
  if (/\bhommes?\b|masculin/.test(t)) return senior ? 'homme-50' : 'homme';
  return undefined;
}

/** Photos qui montrent le bon public, par objectif (la première sert aussi quand l'objectif est inconnu). */
const PAR_PUBLIC: Record<Public, Partial<Record<Objectif, Cle[]>> & { defaut: Cle[]; maison: Cle[] }> = {
  // Seule photo d'une femme de plus de 50 ans ; la rameuse (perte) a la quarantaine passée.
  'femme-50': { defaut: ['salle-forme-1'], perte: ['salle-perte-2', 'salle-forme-1'], maison: ['salle-forme-1'] },
  femme: {
    defaut: ['salle-force-2', 'salle-muscle-2', 'ref-nip'],
    perte: ['salle-perte-3', 'salle-perte-2', 'ref-nip'],
    muscle: ['salle-muscle-2', 'ref-nip', 'salle-force-2'],
    force: ['salle-force-1', 'salle-force-2', 'ref-nip'],
    maison: ['maison-halteres', 'maison-elastiques-2', 'cal-base'],
  },
  'homme-50': { defaut: ['salle-forme-3', 'salle-perte-1'], maison: ['salle-forme-3'] },
  homme: {
    defaut: ['salle-forme-2', 'salle-forme-3', 'salle-perte-1'],
    perte: ['salle-perte-1', 'salle-forme-2', 'salle-muscle-3'],
    muscle: ['salle-muscle-1', 'salle-muscle-3', 'ref-rud'],
    force: ['salle-force-3', 'ref-nassim', 'ref-bws'],
    maison: ['maison-elastiques-1', 'cal-split'],
  },
};

export function clePhotoProgramme(p: ProgrammeIllustre): Cle {
  const titre = p.titre.trim();
  for (const [motif, cle] of PAR_CODE) if (motif.test(titre)) return cle;
  const texte = sansAccents([p.objectif, p.environnement, p.materiel, titre].filter(Boolean).join(' '));
  const vise = publicVise(titre);
  if (vise) {
    // Un programme pour les femmes (ou les hommes, ou les plus de 50 ans) montre ce public.
    const photos = PAR_PUBLIC[vise];
    const objectif = OBJECTIFS.find(([motif]) => motif.test(sansAccents(p.objectif ?? '')) || motif.test(sansAccents(titre)))?.[1] as Objectif | undefined;
    const liste = /maison|domicile|elastique|poids du corps/.test(texte) ? photos.maison : ((objectif && photos[objectif]) ?? photos.defaut);
    return liste[(variante(titre.split(' · ')[0]) - 1) % liste.length];
  }
  if (/elastique/.test(texte)) return 'maison-elastiques-1';
  if (/traction/.test(texte)) return 'cal-tractions';
  if (/poids du corps|calisthenie|street workout/.test(texte)) return 'cal-base';
  if (/maison|domicile/.test(texte)) return 'maison-halteres';
  const objectif = OBJECTIFS.find(([motif]) => motif.test(sansAccents(p.objectif ?? '')) || motif.test(sansAccents(titre)))?.[1];
  if (!objectif) return /^Séance seule/.test(titre) ? 'coaching' : (`salle-forme-${variante(titre)}` as Cle);
  // Variante tirée du code du modèle (« MOD-SAL-23-3 ») : les modèles voisins de la liste ne se ressemblent pas.
  return `salle-${objectif}-${variante(titre.split(' · ')[0])}` as Cle;
}
