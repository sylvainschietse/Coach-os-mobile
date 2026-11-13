// Dictée du Booster : le coach raconte l'entretien d'une traite et chaque information va dans sa rubrique. Utile
// surtout quand le client n'a pas rempli le questionnaire : le compte rendu se construit avec ce que le coach a dit.
// Avec le compte en ligne, c'est l'IA qui range (fonction ranger-entretien) ; sans elle, on applique la règle
// ci-dessous. Dans les deux cas le coach relit et corrige avant d'enregistrer.
//
// Règle sans IA : si le coach dit le nom d'une rubrique (« Objectif : … Freins : … »), tout ce qui suit y va jusqu'à
// la rubrique suivante. Ce qui n'est pas annoncé va dans « Observations du coach » : on ne devine pas, deviner rangeait
// trop de phrases au mauvais endroit. Le mot du coach ne se remplit jamais par la dictée globale.

/** Les rubriques de l'entretien (identifiants de ENTRETIEN). */
export type RubriqueDictee =
  | 'objectif'
  | 'antecedents'
  | 'pourquoiMaintenant'
  | 'dejaEssaye'
  | 'freins'
  | 'attentesCoach'
  | 'projection'
  | 'observationsCoach';

export const LIBELLES_DICTEE: Record<RubriqueDictee, string> = {
  objectif: 'Objectif',
  antecedents: 'Antécédents et profil sportif',
  pourquoiMaintenant: 'Pourquoi maintenant',
  dejaEssaye: 'Déjà essayé',
  freins: 'Freins',
  attentesCoach: 'Attentes',
  projection: 'Projection à 6 mois',
  observationsCoach: 'Observations du coach',
};

/** Ce que le coach dit pour annoncer une rubrique, en début de phrase (texte sans accents, en minuscules). */
const MARQUEURS: [RubriqueDictee, RegExp][] = [
  ['objectif', /^(?:son |sa |ses |l'|mon )?(?:objectif|but)s?(?: principal| principaux)?\b/],
  ['antecedents', /^(?:ses |les |son |sa |l')?(?:antecedents?|profil(?: sportif)?|sante|passe sportif|historique)(?: medica(?:l|ux))?(?: et (?:profil|passe) sportif)?\b/],
  ['pourquoiMaintenant', /^pourquoi maintenant\b/],
  ['dejaEssaye', /^(?:ce qu'(?:il|elle) a )?deja (?:essaye|teste)e?s?\b/],
  ['freins', /^(?:ses |les )?freins?\b/],
  ['attentesCoach', /^(?:ses |les )?attentes?(?: envers (?:le coach|moi|son coach))?\b/],
  ['projection', /^(?:la )?projection(?: a (?:6|six) mois)?\b/],
  ['observationsCoach', /^(?:mes |les )?observations?(?: du coach)?\b/],
];

/** Ce qui suit le nom d'une rubrique et n'apporte rien (« Son objectif est de… », « Freins : … »). */
const LIAISON = /^[\s:,.\-–—]*(?:(?:c'est|ce sont|ce serait|est|sont|serait)(?: de| d'| que| qu')?|de|d')?[\s:,.\-–—]*/;

/** Même longueur que le texte d'origine : les positions trouvées dans l'un valent dans l'autre. */
const normaliser = (t: string) =>
  t
    .split('')
    .map((c) => (c === '’' ? "'" : (c.normalize('NFD')[0] ?? c).toLowerCase()[0] ?? c))
    .join('');

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export type RangementDictee = Partial<Record<RubriqueDictee, string>>;

/** Texte dicté → phrases rangées par rubrique (chaque rubrique trouvée a son texte, phrases dans l'ordre dicté). */
export function rangerDicteeBooster(texte: string): RangementDictee {
  const phrases = (texte.match(/[^.!?\n;]+[.!?]*/g) ?? []).map((p) => p.trim()).filter(Boolean);
  const ranges: Partial<Record<RubriqueDictee, string[]>> = {};
  let annoncee: RubriqueDictee | undefined;
  for (const brute of phrases) {
    let phrase = brute;
    let rubrique: RubriqueDictee | undefined;
    // « Alors, côté freins… », « Pour l'objectif… » : on ignore ces petits mots d'introduction.
    const intro = normaliser(phrase).match(/^(?:(?:alors|donc|ensuite|et|pour|cote|concernant|niveau)\b|au niveau (?:de |des |du )?)?[\s,]*(?:l'|le |la |les )?/)?.[0].length ?? 0;
    const tete = normaliser(phrase.slice(intro));
    for (const [r, re] of MARQUEURS) {
      const m = tete.match(re);
      if (!m) continue;
      rubrique = annoncee = r;
      const reste = phrase.slice(intro + m[0].length);
      phrase = reste.slice(normaliser(reste).match(LIAISON)?.[0].length ?? 0);
      break;
    }
    rubrique ??= annoncee ?? 'observationsCoach';
    phrase = phrase.trim();
    if (!phrase || !/[\p{L}\d]/u.test(phrase)) continue;
    (ranges[rubrique] ??= []).push(majuscule(phrase));
  }
  return Object.fromEntries(Object.entries(ranges).map(([r, l]) => [r, l!.join(' ')])) as RangementDictee;
}

/** Ne garde que les rubriques connues et non vides (la réponse de l'IA passe par ici aussi). */
export function rangementPropre(brut: Record<string, unknown> | undefined): RangementDictee {
  return Object.fromEntries(
    Object.entries(brut ?? {}).filter(([k, v]) => k in LIBELLES_DICTEE && typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim()]),
  ) as RangementDictee;
}

/** Ajoute une dictée rangée à l'entretien déjà écrit (par identifiant de ENTRETIEN), sans rien effacer. */
export function ajouterDicteeBooster(entretien: Record<string, string>, rangement: RangementDictee): Record<string, string> {
  const resultat = { ...entretien };
  for (const [r, texte] of Object.entries(rangementPropre(rangement))) {
    resultat[r] = [resultat[r]?.trim(), texte].filter(Boolean).join('\n');
  }
  return resultat;
}
