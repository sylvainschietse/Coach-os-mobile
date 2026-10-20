// Accès d'un client à l'appli : son compte est créé par le coach avec un mot de passe provisoire,
// que le client remplace par le sien à la première connexion.

export interface AccesClient {
  email: string;
  motDePasse: string;
}

/** Message WhatsApp (ou SMS) qui transmet l'accès au client. */
export function messageAcces(prenom: string, coach: string, acces: AccesClient, lienAppli?: string): string {
  return [
    `Salut ${prenom || 'à toi'} ! Voici ton accès à l’appli Coach OS, pour retrouver tes séances et noter ce que tu fais.`,
    lienAppli ? `Pour l’installer : ${lienAppli}` : '',
    `E-mail : ${acces.email}`,
    `Mot de passe provisoire : ${acces.motDePasse}`,
    'À ta première connexion, l’appli te demandera de choisir ton propre mot de passe.',
    `À bientôt, ${coach}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** null si le mot de passe convient, sinon ce qui ne va pas. */
export function verifierMotDePasse(motDePasse: string, confirmation: string): string | null {
  if (motDePasse.length < 8) return 'Choisis au moins 8 caractères.';
  if (motDePasse !== confirmation) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}
