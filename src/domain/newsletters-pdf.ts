// Newsletters de la bibliothèque envoyées en PDF : le PDF magazine (celui du recueil) est rangé dans les documents
// du coach ; l'e-mail est court (le thème en quelques lignes et un bouton vers le PDF), le message WhatsApp aussi, et
// le PDF peut être déposé dans « Mes documents » de chaque client. Règles pures, sans écran ni stockage.
import { personnaliser } from './newsletters';

/** Libellé du bouton de l'e-mail qui ouvre le PDF. */
export const BOUTON_PDF = 'Lire la newsletter en PDF';

/** Validité du lien vers le PDF, en secondes : un an, le temps qu'un client retrouve l'e-mail. */
export const VALIDITE_LIEN_PDF = 365 * 24 * 3600;

/** Le fichier rangé pour un article : <coach>/newsletters/<article>.pdf, dans le compartiment privé « documents ». */
export const cheminPdf = (coach: string, article: string) => `${coach}/newsletters/${article.replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;

/** L'article d'un lien signé vers son PDF (newsletter rouverte) ; undefined si le lien ne mène pas à un PDF de la bibliothèque. */
export function articleDuLien(lien?: string): string | undefined {
  const m = lien?.match(/\/object\/sign\/documents\/[0-9a-f-]{36}\/newsletters\/([A-Za-z0-9_-]+)\.pdf\?/);
  return m?.[1];
}

/** Le chemin rangé d'après le lien signé (pour le déposer dans les documents des clients). */
export function cheminDuLien(lien?: string): string | undefined {
  const m = lien?.match(/\/object\/sign\/documents\/([0-9a-f-]{36}\/newsletters\/[A-Za-z0-9_-]+\.pdf)\?/);
  return m?.[1];
}

/** Le texte de l'e-mail : le chapeau sert d'introduction (au-dessus), ce texte invite à ouvrir le PDF. */
export function introPdf(minutes?: number) {
  const duree = minutes ? `, à lire en ${minutes} minutes` : '';
  return `Je t’ai préparé un article complet, illustré et sourcé${duree}. Ouvre le PDF avec le bouton ci-dessous : tu peux le garder et le relire quand tu veux.\n\nBonne lecture !`;
}

/** Le message WhatsApp, prêt à partir : le titre, le chapeau, le lien vers le PDF (sauf s'il est joint) et la signature. */
export function messageWhatsAppPdf(a: { objet: string; chapeau?: string }, v: { prenom?: string; coach: string; lien?: string }) {
  const p = (t?: string) => personnaliser(t ?? '', v).trim();
  const bonjour = v.prenom?.trim() ? `Bonjour ${v.prenom.trim()} !` : 'Bonjour !';
  const titre = p(a.objet).replace(/^\s*,\s*/, '');
  // Le chapeau commence souvent par « {prenom}, » : déjà salué, on enlève ce prénom pour ne pas le répéter.
  const chapeau = personnaliser((a.chapeau ?? '').replace(/^\s*\{prenom\}\s*,\s*/, ''), v).trim();
  const debut = chapeau ? chapeau.charAt(0).toUpperCase() + chapeau.slice(1) : '';
  return [`${bonjour} Voici ma nouvelle newsletter : « ${titre} »`, debut, v.lien ? `Le PDF à lire ici :\n${v.lien}` : 'Le PDF est juste au-dessus.', `Bonne lecture ! ${v.coach}`].filter(Boolean).join('\n\n');
}
