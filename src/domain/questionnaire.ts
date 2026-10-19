// Questionnaire d'accueil (remplace le formulaire Tally). À ajuster avec les vraies questions de Sylvain.

export type TypeQuestion = 'texte' | 'long' | 'telephone' | 'email' | 'date' | 'choix';

export interface Question {
  id: string;
  libelle: string;
  type: TypeQuestion;
  obligatoire?: boolean;
  options?: string[];
  aide?: string;
}

export interface Section {
  titre: string;
  questions: Question[];
}

export const QUESTIONNAIRE: Section[] = [
  {
    titre: 'Toi',
    questions: [
      { id: 'prenom', libelle: 'Prénom', type: 'texte', obligatoire: true },
      { id: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
      { id: 'telephone', libelle: 'Téléphone', type: 'telephone', obligatoire: true },
      { id: 'email', libelle: 'E-mail', type: 'email', obligatoire: true },
      { id: 'dateNaissance', libelle: 'Date de naissance', type: 'date' },
    ],
  },
  {
    titre: 'Ton objectif',
    questions: [
      {
        id: 'objectif',
        libelle: 'Ton objectif principal',
        type: 'choix',
        obligatoire: true,
        options: ['Perdre du poids', 'Prendre du muscle', 'Remise en forme', 'Performance sportive', 'Santé et bien-être', 'Autre'],
      },
      { id: 'objectifDetail', libelle: 'Dis-m’en plus sur ce que tu veux atteindre', type: 'long' },
      { id: 'activite', libelle: 'Ton activité physique actuelle', type: 'choix', options: ['Pas de sport', '1 fois par semaine', '2 à 3 fois par semaine', '4 fois ou plus'] },
    ],
  },
  {
    titre: 'Pour bien te coacher',
    questions: [
      {
        id: 'blessures',
        libelle: 'Douleurs, blessures ou contre-indications à connaître',
        type: 'long',
        aide: 'Seul ton coach verra cette réponse.',
      },
      { id: 'disponibilites', libelle: 'Quand es-tu disponible pour t’entraîner ?', type: 'long' },
      { id: 'source', libelle: 'Comment m’as-tu connu ?', type: 'choix', options: ['Instagram', 'Bouche-à-oreille', 'Google', 'Autre'] },
    ],
  },
];

export const LIBELLES_QUESTIONS: Record<string, string> = Object.fromEntries(
  QUESTIONNAIRE.flatMap((s) => s.questions.map((q) => [q.id, q.libelle])),
);

/** Ce qui manque ou ne va pas, question par question. */
export function verifierReponses(reponses: Record<string, string>, normaliser: {
  telephone: (t: string) => string | undefined;
  email: (e: string) => string | undefined;
}): Record<string, string> {
  const erreurs: Record<string, string> = {};
  for (const q of QUESTIONNAIRE.flatMap((s) => s.questions)) {
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
