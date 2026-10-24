// Identité Coach OS : rouge #D71920, noir et neutres ; Bebas pour les titres, Jost pour le texte.
export const couleurs = {
  rouge: '#D71920',
  rougeClair: '#FBE8E9',
  noir: '#0B0B0C',
  texte: '#17171A',
  texteDoux: '#6B6B73',
  suggestion: '#A3A3AB',
  bordure: '#E4E4E8',
  fond: '#F6F6F7',
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
};

export const espace = (n: number) => n * 4;

/** Largeur au-delà de laquelle l'espace coach passe en deux colonnes (ordinateur, tablette). */
export const LARGEUR_LARGE = 900;
