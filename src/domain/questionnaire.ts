// Bilan d'accueil : reprise fidèle du formulaire Tally « Bilan forme & objectifs » de Sylvain.
// Recopié depuis les captures de l'éditeur Tally (7 pages : accueil, 5 pages de questions, remerciement).

export type TypeQuestion = 'texte' | 'long' | 'telephone' | 'email' | 'date' | 'choix' | 'choixMultiple' | 'echelle';

/** Question affichée seulement si une réponse précédente vaut cette valeur, l'une de ces valeurs, ou la contient (choix multiple). */
export interface Condition {
  question: string;
  egal?: string;
  parmi?: string[];
  contient?: string;
}

export interface Question {
  id: string;
  libelle: string;
  type: TypeQuestion;
  obligatoire?: boolean;
  options?: string[];
  aide?: string;
  placeholder?: string;
  condition?: Condition;
  /** Sous-titre de rubrique (Sommeil, Alimentation…) affiché avant la première question qui le porte. */
  rubrique?: string;
}

export interface Section {
  titre: string;
  intro?: string;
  questions: Question[];
}

export const TITRE_QUESTIONNAIRE = 'Bilan forme & objectifs';
export const ACCUEIL =
  'Ce bilan va me permettre de mieux comprendre tes objectifs, ton parcours et tes contraintes afin de te proposer la stratégie la plus adaptée.';

/** Page de remerciement du Tally (sans la signature, ajoutée avec le nom du coach). */
export const MERCI = [
  'Merci d’avoir pris le temps de compléter ce bilan.',
  'Tes réponses me permettront de préparer notre séance et de personnaliser mes conseils en fonction de tes objectifs, de ton mode de vie et de tes attentes.',
  'Lors de notre rencontre, nous prendrons le temps d’échanger ensemble sur ton parcours, d’évaluer ta condition physique et de définir les actions les plus adaptées pour t’aider à progresser.',
  '🎁 À l’issue de notre séance, tu recevras gratuitement ton Plan d’Action Personnalisé.',
  'Ce document récapitulera les principaux points abordés ensemble ainsi que des recommandations concrètes que tu pourras commencer à appliquer immédiatement, que tu choisisses ou non de poursuivre un accompagnement.',
  'À très bientôt !',
];

/** Les choix multiples sont rangés en texte, séparés par ce séparateur. */
export const SEPARATEUR = ', ';
export const lireChoix = (v: string | undefined) => (v ? v.split(SEPARATEUR).filter(Boolean) : []);

const SEANCES = ['1 séance', '2 séances', '3 séances', '4 séances', '5 séances ou plus'];

export const QUESTIONNAIRE: Section[] = [
  {
    titre: 'Faisons connaissance',
    intro: 'Quelques informations pour que je puisse préparer au mieux notre échange',
    questions: [
      { id: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
      { id: 'prenom', libelle: 'Prénom', type: 'texte', obligatoire: true },
      { id: 'telephone', libelle: 'Téléphone', type: 'telephone', obligatoire: true },
      { id: 'email', libelle: 'Email', type: 'email', obligatoire: true },
      { id: 'dateNaissance', libelle: 'Date de naissance', type: 'date', obligatoire: true },
    ],
  },
  {
    titre: 'Tes objectifs',
    intro: 'J’aimerais maintenant mieux comprendre ce que tu souhaites obtenir grâce à cette séance.',
    questions: [
      { id: 'motivation', libelle: 'Qu’est-ce qui t’amène aujourd’hui ?', type: 'long', placeholder: 'Dis-m’en plus...' },
      {
        id: 'objectif',
        libelle: 'Quel est ton objectif principal ?',
        type: 'choix',
        obligatoire: true,
        options: [
          'Perdre du poids',
          'Prendre du muscle',
          'Retrouver la forme',
          'Améliorer ma santé',
          'Améliorer mes performances',
          'Gagner en mobilité',
          'Préparer une course ou une compétition',
          'Autre',
        ],
      },
      {
        id: 'objectifAutre',
        libelle: 'Peux-tu préciser ton objectif ?',
        type: 'texte',
        placeholder: 'Précise ici...',
        condition: { question: 'objectif', egal: 'Autre' },
      },
      { id: 'pourquoi', libelle: 'Pourquoi cet objectif est-il important pour toi aujourd’hui ?', type: 'long', placeholder: 'Raconte-moi...' },
      {
        id: 'echeance',
        libelle: 'As-tu une échéance particulière ?',
        type: 'texte',
        aide: 'Vacances, mariage, compétition, événement personnel...',
        placeholder: 'Ex: Mariage le 10 juin...',
      },
    ],
  },
  {
    // Pas de titre sur cette page dans Tally : celui-ci sert seulement de repère dans l'appli.
    titre: 'Ton hygiène de vie',
    intro: 'Ces quelques questions me permettront d’identifier les principaux leviers sur lesquels agir pour t’aider à atteindre ton objectif.',
    questions: [
      {
        id: 'sommeilHeures',
        rubrique: 'Sommeil',
        libelle: 'En moyenne, combien d’heures dors-tu par nuit ?',
        type: 'choix',
        obligatoire: true,
        options: ['Moins de 6 h', 'Entre 6 et 7 h', 'Entre 7 et 8 h', 'Plus de 8 h'],
      },
      { id: 'sommeilQualite', rubrique: 'Sommeil', libelle: 'Comment évalues-tu la qualité de ton sommeil ?', type: 'echelle', obligatoire: true },
      {
        id: 'reveilRepose',
        rubrique: 'Sommeil',
        libelle: 'Te réveilles-tu généralement reposé(e) ?',
        type: 'choix',
        obligatoire: true,
        options: ['Toujours', 'Souvent', 'Parfois', 'Rarement'],
      },
      {
        id: 'alimentation',
        rubrique: '🥗 Alimentation',
        libelle: 'Comment juges-tu ton alimentation actuelle ?',
        type: 'choix',
        obligatoire: true,
        options: ['Très équilibrée', 'Plutôt équilibrée', 'À améliorer', 'Très déséquilibrée'],
      },
      {
        id: 'repas',
        rubrique: '🥗 Alimentation',
        libelle: 'Combien de repas prends-tu chaque jour ?',
        type: 'choix',
        obligatoire: true,
        options: ['1', '2', '3', '4 ou plus'],
      },
      {
        id: 'grignotage',
        rubrique: '🥗 Alimentation',
        libelle: 'Grignotes-tu entre les repas ?',
        type: 'choix',
        obligatoire: true,
        options: ['Jamais', 'Occasionnellement', 'Souvent', 'Tous les jours'],
      },
      {
        id: 'proteines',
        rubrique: '🥗 Alimentation',
        libelle: 'Consommes-tu une source de protéines à la plupart de tes repas ?',
        type: 'choix',
        obligatoire: true,
        options: ['Oui', 'Souvent', 'Rarement', 'Jamais'],
      },
      {
        id: 'fruitsLegumes',
        rubrique: '🥗 Alimentation',
        libelle: 'Manges-tu des fruits et légumes chaque jour ?',
        type: 'choix',
        obligatoire: true,
        options: ['Oui', 'Non'],
      },
      {
        id: 'ultraTransformes',
        rubrique: '🥗 Alimentation',
        libelle: 'Consommes-tu régulièrement des produits ultra-transformés (plats préparés, fast-food, biscuits, chips, etc.) ?',
        type: 'choix',
        obligatoire: true,
        options: ['Rarement', '1 à 2 fois par semaine', '3 à 5 fois par semaine', 'Presque tous les jours'],
      },
      {
        id: 'sel',
        rubrique: '🥗 Alimentation',
        libelle: 'Ajoutes-tu souvent du sel à tes repas ?',
        type: 'choix',
        obligatoire: true,
        options: ['Jamais', 'Parfois', 'Souvent'],
      },
      {
        id: 'boissonsSucrees',
        rubrique: '🥗 Alimentation',
        libelle: 'Consommes-tu régulièrement des boissons sucrées (sodas, jus, boissons énergétiques...) ?',
        type: 'choix',
        obligatoire: true,
        options: ['Jamais', 'Occasionnellement', 'Plusieurs fois par semaine', 'Tous les jours'],
      },
      {
        id: 'restaurant',
        rubrique: '🥗 Alimentation',
        libelle: 'À quelle fréquence manges-tu au restaurant, en restauration rapide ou des plats préparés ?',
        type: 'choix',
        obligatoire: true,
        options: ['Rarement', '1 à 2 fois par semaine', '3 fois par semaine ou plus'],
      },
      {
        id: 'eau',
        rubrique: '💧 Hydratation',
        libelle: 'Combien d’eau bois-tu en moyenne chaque jour ?',
        type: 'choix',
        obligatoire: true,
        options: ['Moins de 1 L', 'Entre 1 et 1,5 L', 'Entre 1,5 et 2 L', 'Plus de 2 L'],
      },
      { id: 'stress', rubrique: '🧘 Stress', libelle: 'Comment évalues-tu ton niveau de stress actuel ?', type: 'echelle', obligatoire: true },
      { id: 'tabac', rubrique: '🚬 Tabac', libelle: 'Fumes-tu ?', type: 'choix', obligatoire: true, options: ['Non', 'Occasionnellement', 'Tous les jours'] },
      {
        id: 'alcool',
        rubrique: '🍷 Alcool',
        libelle: 'À quelle fréquence consommes-tu de l’alcool ?',
        type: 'choix',
        obligatoire: true,
        options: ['Jamais', 'Occasionnellement', '1 à 2 fois par semaine', 'Plus de 2 fois par semaine'],
      },
    ],
  },
  {
    titre: 'Ton profil sportif',
    intro: 'Ces quelques questions vont m’aider à mieux comprendre ton niveau actuel et à adapter la séance à ton profil.',
    questions: [
      {
        id: 'activiteReguliere',
        libelle: 'Pratiques-tu actuellement une activité physique régulière ?',
        type: 'choix',
        obligatoire: true,
        options: ['Oui', 'Non'],
      },
      {
        id: 'activites',
        libelle: 'Quelle(s) activité(s) pratiques-tu actuellement ?',
        type: 'choixMultiple',
        obligatoire: true,
        condition: { question: 'activiteReguliere', egal: 'Oui' },
        options: [
          'Musculation',
          'Fitness',
          'Course à pied',
          'Vélo',
          'Natation',
          'Sport collectif',
          'CrossFit',
          'Arts martiaux',
          'Marche ou randonnée',
          'Autre',
        ],
      },
      {
        id: 'activitesAutre',
        libelle: 'Peux-tu préciser ?',
        type: 'texte',
        placeholder: 'Précise ici...',
        condition: { question: 'activites', contient: 'Autre' },
      },
      {
        id: 'anciennete',
        libelle: 'Depuis combien de temps t’entraînes-tu régulièrement ?',
        type: 'choix',
        obligatoire: true,
        options: ['Je débute', 'Moins de 6 mois', 'Entre 6 mois et 2 ans', 'Plus de 2 ans'],
      },
      {
        id: 'seancesActuelles',
        libelle: 'Combien de séances fais-tu actuellement chaque semaine ?',
        type: 'choix',
        obligatoire: true,
        options: ['Aucune', ...SEANCES],
      },
      {
        id: 'seancesPossibles',
        libelle: 'Combien de séances pourrais-tu consacrer à ton entraînement chaque semaine ?',
        type: 'choix',
        obligatoire: true,
        options: SEANCES,
      },
      {
        id: 'lieu',
        libelle: 'Où souhaites-tu t’entraîner principalement ?',
        type: 'choix',
        obligatoire: true,
        options: ['En salle', 'À la maison', 'En salle et à la maison'],
      },
      {
        id: 'materiel',
        libelle: 'Quel matériel as-tu à disposition chez toi ?',
        type: 'choixMultiple',
        obligatoire: true,
        condition: { question: 'lieu', parmi: ['À la maison', 'En salle et à la maison'] },
        options: [
          'Aucun matériel',
          'Tapis',
          'Élastiques',
          'Haltères',
          'Kettlebell',
          'Barre et disques',
          'Banc',
          'Barre de traction',
          'TRX ou sangles',
          'Rack à squat',
          'Machine de musculation',
          'Vélo d’appartement',
          'Tapis de course',
          'Rameur',
          'Autre',
        ],
      },
      {
        id: 'materielAutre',
        libelle: 'Peux-tu préciser le matériel disponible ?',
        type: 'texte',
        placeholder: 'Précise ici...',
        condition: { question: 'materiel', contient: 'Autre' },
      },
      {
        id: 'typesAimes',
        libelle: 'Quels types d’entraînement apprécies-tu le plus ?',
        type: 'choixMultiple',
        obligatoire: true,
        options: [
          'Musculation',
          'Cardio',
          'Circuit training',
          'HIIT',
          'Poids du corps',
          'Course à pied',
          'Vélo',
          'Mobilité',
          'Activités en extérieur',
          'Je n’ai pas encore de préférence',
          'Autre',
        ],
      },
      { id: 'aEviter', libelle: 'Y a-t-il des exercices ou des types d’entraînement que tu n’aimes pas ou que tu préfères éviter ?', type: 'long' },
      {
        id: 'douleur',
        libelle: 'As-tu actuellement une douleur ou une blessure qui pourrait limiter certains exercices ?',
        type: 'choix',
        obligatoire: true,
        options: ['Non', 'Oui'],
      },
      {
        id: 'douleurDetail',
        libelle: 'Peux-tu préciser la zone concernée, depuis quand, et dans quelles situations la douleur apparaît ?',
        type: 'long',
        condition: { question: 'douleur', egal: 'Oui' },
      },
      // Dans Tally, la règle « Oui » de cette question n'affiche rien (cible vide).
      {
        id: 'contreIndication',
        libelle: 'As-tu une contre-indication médicale connue à la pratique du sport ?',
        type: 'choix',
        obligatoire: true,
        options: ['Non', 'Oui'],
      },
    ],
  },
  {
    titre: '✨ Tes attentes',
    intro: 'Plus j’en sais sur tes attentes, plus je pourrai te proposer des conseils adaptés à ta situation.',
    questions: [
      {
        id: 'attentes',
        libelle: 'Qu’attends-tu principalement d’un accompagnement ?',
        type: 'choixMultiple',
        obligatoire: true,
        options: [
          'Me remettre en forme',
          'Être motivé(e)',
          'Avoir un programme clair',
          'Corriger ma technique',
          'Apprendre à mieux manger',
          'Être suivi régulièrement',
          'Gagner du temps',
          'Me sentir mieux dans mon corps',
          'Autre',
        ],
      },
      // Dans Tally, la règle sur « Autre » masque « Peux-tu préciser ? » au lieu de l'afficher : ici on l'affiche.
      {
        id: 'attentesAutre',
        libelle: 'Peux-tu préciser ?',
        type: 'texte',
        placeholder: 'Précise ici...',
        condition: { question: 'attentes', contient: 'Autre' },
      },
      {
        id: 'dejaCoach',
        libelle: 'As-tu déjà été accompagné(e) par un coach sportif ?',
        type: 'choix',
        obligatoire: true,
        options: ['Oui', 'Non'],
      },
      {
        id: 'coachApprecie',
        libelle: 'Qu’avais-tu particulièrement apprécié dans cet accompagnement ?',
        type: 'long',
        condition: { question: 'dejaCoach', egal: 'Oui' },
      },
      {
        id: 'coachDecu',
        libelle: 'Y a-t-il des choses qui t’avaient déçu ou que tu ne souhaites pas retrouver ?',
        type: 'long',
        condition: { question: 'dejaCoach', egal: 'Oui' },
      },
      { id: 'bonCoach', libelle: 'Qu’est-ce qui te ferait dire, dans quelques mois : « J’ai choisi le bon coach. »', type: 'long' },
      {
        id: 'motivationNote',
        libelle: 'Sur une échelle de 1 à 10, à quel point es-tu motivé(e) pour atteindre ton objectif ?',
        type: 'echelle',
        obligatoire: true,
      },
      { id: 'empeche', libelle: 'Qu’est-ce qui t’empêche aujourd’hui d’être à 10/10 ?', type: 'long' },
      {
        id: 'obstacle',
        libelle: 'À ton avis, quel est aujourd’hui ton principal obstacle ?',
        type: 'choix',
        obligatoire: true,
        options: [
          'Manque de temps',
          'Manque de motivation',
          'Je ne sais pas quoi faire',
          'Difficulté à être régulier',
          'Alimentation',
          'Stress',
          'Fatigue',
          'Douleurs / blessures',
          'Autre',
        ],
      },
      {
        id: 'obstacleAutre',
        libelle: 'Peux-tu préciser ?',
        type: 'texte',
        placeholder: 'Précise ici...',
        condition: { question: 'obstacle', egal: 'Autre' },
      },
      { id: 'autreChose', libelle: 'Y a-t-il autre chose que tu aimerais que je sache avant notre rencontre ?', type: 'long' },
    ],
  },
];

const TOUTES = QUESTIONNAIRE.flatMap((s) => s.questions);

export const LIBELLES_QUESTIONS: Record<string, string> = Object.fromEntries(TOUTES.map((q) => [q.id, q.libelle]));

/** Une question conditionnelle n'apparaît que si sa condition est remplie (et que la question dont elle dépend est elle-même visible). */
export function estVisible(q: Question, reponses: Record<string, string>): boolean {
  if (!q.condition) return true;
  const parent = TOUTES.find((p) => p.id === q.condition!.question);
  if (parent && !estVisible(parent, reponses)) return false;
  const v = reponses[q.condition.question];
  if (q.condition.egal !== undefined) return v === q.condition.egal;
  if (q.condition.parmi !== undefined) return q.condition.parmi.includes(v);
  if (q.condition.contient !== undefined) return lireChoix(v).includes(q.condition.contient);
  return true;
}

/** Ne garde que les réponses aux questions visibles, sans espaces superflus. */
export function nettoyerReponses(reponses: Record<string, string>): Record<string, string> {
  const visibles = new Set(TOUTES.filter((q) => estVisible(q, reponses)).map((q) => q.id));
  return Object.fromEntries(
    Object.entries(reponses)
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([k, v]) => v && visibles.has(k)),
  );
}

/** Ce qui manque ou ne va pas, question par question (toutes les pages, ou une seule). */
export function verifierReponses(
  reponses: Record<string, string>,
  normaliser: { telephone: (t: string) => string | undefined; email: (e: string) => string | undefined },
  section?: Section,
): Record<string, string> {
  const erreurs: Record<string, string> = {};
  for (const q of section ? section.questions : TOUTES) {
    if (!estVisible(q, reponses)) continue;
    const v = reponses[q.id]?.trim() ?? '';
    if (!v) {
      if (q.obligatoire) erreurs[q.id] = 'Réponse obligatoire';
      continue;
    }
    if (q.type === 'telephone' && !normaliser.telephone(v)) erreurs[q.id] = 'Numéro non reconnu';
    if (q.type === 'email' && !normaliser.email(v)) erreurs[q.id] = 'Adresse e-mail non reconnue';
    if (q.type === 'date' && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) erreurs[q.id] = 'Format jj/mm/aaaa';
  }
  return erreurs;
}

/** Les réponses rangées comme dans le questionnaire, pour la fiche du coach. Les réponses d'une ancienne version vont dans « Autres réponses ». */
export function reponsesParSection(reponses: Record<string, string>, masquer: string[] = []) {
  const connues = new Set(TOUTES.map((q) => q.id));
  const sections = QUESTIONNAIRE.map((s) => ({
    titre: s.titre,
    lignes: s.questions
      .filter((q) => reponses[q.id] && !masquer.includes(q.id))
      .map((q) => ({ id: q.id, rubrique: q.rubrique, libelle: q.libelle, valeur: q.type === 'echelle' ? `${reponses[q.id]} / 10` : reponses[q.id] })),
  }));
  const autres = Object.entries(reponses)
    .filter(([k, v]) => v && !connues.has(k) && !masquer.includes(k))
    .map(([k, v]) => ({ id: k, rubrique: undefined, libelle: k, valeur: v }));
  if (autres.length) sections.push({ titre: 'Autres réponses', lignes: autres });
  return sections.filter((s) => s.lignes.length > 0);
}
