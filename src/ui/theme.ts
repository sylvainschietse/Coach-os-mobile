// Identité CoachGo reprise de la cascade finale de l'index.css d'origine (Zite) :
// primaire HSL 358 78% 43%, fond 220 18% 97%, bordure 220 14% 89%, texte secondaire 220 8% 42%.
// Bebas Neue pour les titres, Jost pour le texte, JetBrains Mono pour les chiffres du minuteur.
export const couleurs = {
  /** `--primary` : boutons, onglet actif, kicker. */
  rouge: '#C3181E',
  /** Accent de marque : ligne de l'en-tête, courbes. */
  rougeMarque: '#D71920',
  /** `--accent` : fond rouge très pâle. */
  rougeClair: '#FEF1F1',
  rougeTexte: '#9F1418',
  noir: '#111216',
  /** `--secondary`. */
  secondaire: '#262931',
  texte: '#1A1C23',
  texteDoux: '#636874',
  suggestion: '#A3A7B0',
  bordure: '#DFE2E7',
  saisie: '#CCCFD7',
  fond: '#F6F7F9',
  /** `--muted` : fond des sous-navigations. */
  discret: '#EDEFF2',
  carte: '#FFFFFF',
  vert: '#1E8E4E',
  vertClair: '#E7F5EC',
  bleu: '#2563EB',
  orange: '#C2410C',
  orangeClair: '#FFF1E6',
};

export const polices = {
  titre: 'BebasNeue_400Regular',
  texte: 'Jost_400Regular',
  texteMoyen: 'Jost_500Medium',
  texteGras: 'Jost_600SemiBold',
  chiffres: 'JetBrainsMono_500Medium',
};

export const espace = (n: number) => n * 4;

/** Arrondis d'origine (rem × 16) : global .9rem, cartes 1.1 à 1.25rem. */
export const arrondi = { controle: 11, global: 14, carte: 18, hero: 20 };

/** Bebas Neue : espacement .035em, à multiplier par la taille. */
export const espacementTitre = (taille: number) => taille * 0.035;

/** Largeur au-delà de laquelle l'espace coach passe en deux colonnes (ordinateur, tablette). */
export const LARGEUR_LARGE = 900;
/** `lg` de Tailwind : menu latéral du CRM. */
export const LARGEUR_LG = 1024;
/** `max-w-7xl` coach et `max-w-4xl` client. */
export const LARGEUR_COACH = 1280;
export const LARGEUR_CLIENT = 896;

/**
 * Une couleur par univers : la lueur de l'en-tête, la scène de la page, l'onglet actif, les puces et les boutons pleins
 * prennent la couleur de la page. Le rouge reste la marque, l'entraînement et ce qui demande l'attention.
 */
export type CleUnivers = 'rouge' | 'bleu' | 'vert' | 'rougeDore' | 'ambre';

export interface Univers {
  cle: CleUnivers;
  /** Couleur d'accent : texte actif, icône, trait. */
  accent: string;
  /** Teinte plus soutenue : fin des dégradés, texte sur fond clair. */
  fonce: string;
  /** Fond très pâle : onglet actif, pastilles. */
  clair: string;
  /** Kicker posé sur la scène colorée. */
  kickerScene: string;
  /** Dégradé des boutons pleins et de l'onglet actif. */
  degrade: string;
  /** Fond de l'en-tête et de la scène : dégradé horizontal, continu entre les deux. */
  scene: string;
  /** Couleur unie des boutons et onglets actifs, sous leur dégradé. */
  uni: string;
}

/**
 * Fond sombre avec une lueur de la couleur qui part du coin haut gauche (et une seconde, plus discrète, à droite),
 * comme la séance plein écran. `rgb` : la couleur de la lueur, `rgb2` : celle du coin droit.
 */
const scene = (rgb: string, rgb2 = rgb) =>
  `radial-gradient(circle at 0% 0%, rgba(${rgb}, 0.62) 0%, rgba(${rgb}, 0) 70%), radial-gradient(circle at 100% 0%, rgba(${rgb2}, 0.3) 0%, rgba(${rgb2}, 0) 60%), linear-gradient(180deg, #121318 0%, #18191E 100%)`;

export const univers: Record<CleUnivers, Univers> = {
  rouge: {
    cle: 'rouge',
    accent: '#D9252B',
    fonce: '#B3161C',
    clair: '#FEF1F1',
    kickerScene: '#FF7A7E',
    degrade: 'linear-gradient(135deg, #E0262C 0%, #B3161C 100%)',
    scene: scene('224, 38, 44'),
    uni: '#B81B21',
  },
  bleu: {
    cle: 'bleu',
    accent: '#3B6CF6',
    fonce: '#2553D8',
    clair: '#EEF3FF',
    kickerScene: '#8FAEFF',
    degrade: 'linear-gradient(135deg, #3B6CF6 0%, #2553D8 100%)',
    scene: scene('59, 108, 246'),
    uni: '#2F86EA',
  },
  vert: {
    cle: 'vert',
    accent: '#1FA35C',
    fonce: '#16864A',
    clair: '#E8F6EE',
    kickerScene: '#7FDCA6',
    degrade: 'linear-gradient(135deg, #1FA35C 0%, #16864A 100%)',
    scene: scene('31, 163, 92'),
    uni: '#3BAE55',
  },
  rougeDore: {
    cle: 'rougeDore',
    accent: '#B8862A',
    fonce: '#9C7621',
    clair: '#FBF5E6',
    kickerScene: '#E9C877',
    degrade: 'linear-gradient(135deg, #E0262C 0%, #B8862A 100%)',
    scene: scene('224, 38, 44', '201, 151, 43'),
    uni: '#B81B21',
  },
  ambre: {
    cle: 'ambre',
    accent: '#D9850A',
    fonce: '#B36C06',
    clair: '#FFF5E5',
    kickerScene: '#FFC36B',
    degrade: 'linear-gradient(135deg, #F2A72E 0%, #D9850A 100%)',
    scene: scene('232, 147, 12'),
    uni: '#D08A12',
  },
};
