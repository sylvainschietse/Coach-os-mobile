// Accès d'un client à l'appli : son compte est créé par le coach avec un mot de passe provisoire,
// que le client remplace par le sien à la première connexion.

import { normaliserEmail, normaliserTelephone } from './crm';

export interface AccesClient {
  email: string;
  motDePasse: string;
}

/** Téléphone du client : Android installe l'APK, iPhone ajoute la version web à son écran d'accueil (pas encore sur l'App Store). */
export type PlateformeAcces = 'android' | 'iphone';

/** Message WhatsApp (ou SMS) qui transmet l'accès au client. */
export function messageAcces(
  prenom: string,
  coach: string,
  acces: AccesClient,
  lienAppli?: string,
  lienTuto?: string,
  plateforme: PlateformeAcces = 'android',
): string {
  const installation =
    plateforme === 'iphone'
      ? lienAppli
        ? [
            `Sur ton iPhone, ouvre ce lien dans Safari : ${lienAppli}`,
            'Puis appuie sur le bouton Partager (le carré avec la flèche vers le haut) et choisis « Sur l’écran d’accueil ». L’appli CoachGo apparaît alors avec tes autres applis.',
          ]
        : []
      : [lienAppli ? `Pour l’installer : ${lienAppli}` : ''];
  return [
    `Salut ${prenom || 'à toi'} ! Voici ton accès à l’appli CoachGo, pour retrouver tes séances et noter ce que tu fais.`,
    ...installation,
    lienTuto ? `Pour bien démarrer, regarde la vidéo (1 min 30) : ${lienTuto}` : '',
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

/** null si les coordonnées saisies par le client conviennent, sinon ce qui ne va pas. Le téléphone est facultatif. */
export function verifierCoordonnees(email: string, telephone: string): string | null {
  if (!normaliserEmail(email)) return 'Cette adresse e-mail n’est pas reconnue.';
  if (telephone.trim() && !normaliserTelephone(telephone)) return 'Ce numéro de téléphone n’est pas reconnu.';
  return null;
}
