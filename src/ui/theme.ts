// Identité Coach OS reprise de la cascade finale de l'index.css d'origine (Zite) :
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
