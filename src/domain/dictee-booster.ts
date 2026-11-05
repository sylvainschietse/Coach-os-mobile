// Dictée du Booster : le coach raconte la séance d'une traite (« Objectif : perdre 5 kilos pour l'été. Antécédents :
// opéré du genou en 2020. Freins : horaires décalés… Mot du coach : bravo pour ta séance ») et chaque phrase va dans
// sa rubrique. Utile surtout quand le client n'a pas rempli le questionnaire : le compte rendu se construit avec ce que
// le coach a dit. Tout se fait sur le téléphone, sans serveur ; le coach relit et corrige avant d'enregistrer.
//
// La règle, simple à expliquer : si le coach dit le nom d'une rubrique, tout ce qui suit y va jusqu'à la rubrique
// suivante. Sinon l'application devine phrase par phrase avec des mots repères, et range le reste dans « Observations ».

/** Les rubriques de l'entretien (identifiants de ENTRETIEN) et le mot du coach, qui ouvre le compte rendu. */
export type RubriqueDictee =
  | 'objectif'
  | 'antecedents'
  | 'pourquoiMaintenant'
  | 'dejaEssaye'
  | 'freins'
  | 'attentesCoach'
  | 'projection'
  | 'observationsCoach'
  | 'mot';

export const LIBELLES_DICTEE: Record<RubriqueDictee, string> = {
  objectif: 'Objectif',
  antecedents: 'Antécédents et profil sportif',
  pourquoiMaintenant: 'Pourquoi maintenant',
  dejaEssaye: 'Déjà essayé',
  freins: 'Freins',
  attentesCoach: 'Attentes',
  projection: 'Projection à 6 mois',
  observationsCoach: 'Observations du coach',
  mot: 'Mot du coach',
};

/** Ce que le coach dit pour annoncer une rubrique, en début de phrase (texte sans accents, en minuscules). */
const MARQUEURS: [RubriqueDictee, RegExp][] = [
  ['mot', /^(?:le |mon |un )?(?:petit )?(?:mot|message)(?: du coach| pour (?:lui|elle|le client|la cliente))?\b/],
  ['objectif', /^(?:son |sa |ses |l'|mon )?(?:objectif|but)s?(?: principal| principaux)?\b/],
  ['antecedents', /^(?:ses |les |son |sa |l')?(?:antecedents?|profil(?: sportif)?|sante|passe sportif|historique)(?: medica(?:l|ux))?(?: et (?:profil|passe) sportif)?\b/],
  ['pourquoiMaintenant', /^pourquoi maintenant\b/],
  ['dejaEssaye', /^(?:ce qu'(?:il|elle) a )?deja (?:essaye|teste)e?s?\b/],
  ['freins', /^(?:ses |les )?freins?\b/],
  ['attentesCoach', /^(?:ses |les )?attentes?(?: envers (?:le coach|moi|son coach))?\b/],
  ['projection', /^(?:la )?projection(?: a (?:6|six) mois)?\b/],
  ['observationsCoach', /^(?:mes |les )?observations?(?: du coach)?\b/],
];

/** Mots repères quand le coach n'a pas annoncé de rubrique. */
const INDICES: [RubriqueDictee, RegExp][] = [
  ['mot', /\b(?:tu|ton|ta|tes|toi|bravo|felicitations)\b|\bt'/],
  ['objectif', /\b(?:objectif|veut|voudrait|souhaite|aimerait|perdre|maigrir|mincir|se muscler|prendre du muscle|tonifier|affiner|remettre en forme|retrouver la forme|marathon|semi|10 ?km)\b/],
  [
    'antecedents',
    /\b(?:antecedents?|blessures?|blesse|operee?|operation|chirurgie|entorse|fracture|tendinite|hernie|lombalgie|sciatique|douleurs?|mal (?:au|a la|aux|de)|genou|cheville|epaule|dos|hanche|traitement|asthme|diabete|cardiaque|enceinte|grossesse|accouche|sante|pratique|sportif|sportive|club|salle de sport|course a pied|footing|velo|natation|foot|tennis|danse|yoga|pilates|crossfit|muscu|musculation|sedentaire)\b/,
  ],
  ['pourquoiMaintenant', /\b(?:declic|mariage|vacances|cet ete|pour l'ete|rentree|nouvel an|anniversaire|medecin|bilan sanguin)\b/],
  ['dejaEssaye', /\b(?:deja essaye|a essaye|a teste|a deja fait|regimes?|applis?|application|abonnement|a abandonne|jeune intermittent|weight watchers)\b/],
  ['freins', /\b(?:freins?|temps|horaires?|enfants|boulot|travail|deplacements?|fatigue|fatiguee?|motivation|difficile|du mal|grignote|grignotage|stress|stresse|decroche|flemme|budget|organisation)\b/],
  ['attentesCoach', /\b(?:attend|attentes?|cadre|suivi|accompagne|accompagnement|pousse|motive|recadre|rendre des comptes)\b/],
  ['projection', /\b(?:dans (?:6|six) mois|d'ici (?:6|six) mois|dans un an|se voit|s'imagine|se projette|a terme)\b/],
  ['observationsCoach', /\b(?:j'ai (?:observe|remarque|note|vu)|je (?:note|remarque|trouve)|posture|technique|coordination|souffle|essouffle)\b/],
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
    if (!rubrique) {
      if (annoncee) rubrique = annoncee;
      else {
        const n = normaliser(phrase);
        rubrique = INDICES.find(([, re]) => re.test(n))?.[0] ?? 'observationsCoach';
      }
    }
    phrase = phrase.trim();
    if (!phrase || !/[\p{L}\d]/u.test(phrase)) continue;
    (ranges[rubrique] ??= []).push(majuscule(phrase));
  }
  return Object.fromEntries(Object.entries(ranges).map(([r, l]) => [r, l!.join(' ')])) as RangementDictee;
}

/**
 * Ajoute une dictée rangée à ce qui est déjà écrit, sans rien effacer : l'entretien (par identifiant de ENTRETIEN)
 * et le mot du coach.
 */
export function ajouterDicteeBooster(
  actuel: { entretien: Record<string, string>; mot: string },
  rangement: RangementDictee,
): { entretien: Record<string, string>; mot: string } {
  const ajout = (avant: string | undefined, texte: string | undefined) => [avant?.trim(), texte?.trim()].filter(Boolean).join('\n');
  const entretien = { ...actuel.entretien };
  for (const [r, texte] of Object.entries(rangement) as [RubriqueDictee, string][]) {
    if (r !== 'mot') entretien[r] = ajout(entretien[r], texte);
  }
  return { entretien, mot: ajout(actuel.mot, rangement.mot) };
}
