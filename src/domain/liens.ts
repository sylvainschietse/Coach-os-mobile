// Seuls ces liens s'ouvrent depuis l'appli : une adresse saisie ailleurs (vidéo d'exercice, recette, source) ne peut pas
// lancer un « javascript: » ou une autre appli inattendue.
const SCHEMAS_AUTORISES = /^(https?|tel|mailto|sms|whatsapp):/i;

export function lienAutorise(url: string): boolean {
  return SCHEMAS_AUTORISES.test(url.trim());
}
