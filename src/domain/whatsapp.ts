// Liens WhatsApp vus depuis le téléphone.

/**
 * « https://wa.me/33612345678?text=… » → « whatsapp://send?phone=33612345678&text=… ».
 * Sur le téléphone, le lien wa.me passe par le navigateur ou ramène WhatsApp sur la dernière conversation ouverte,
 * sans le bon numéro ni le message ; le lien whatsapp:// ouvre directement la bonne conversation, message prérempli.
 */
export function lienWhatsAppNatif(url: string): string | undefined {
  const m = url.match(/^https:\/\/wa\.me\/(\d*)\/?(?:\?(.*))?$/i);
  if (!m) return undefined;
  const parametres = [m[1] ? `phone=${m[1]}` : '', ...(m[2] ?? '').split('&').filter((p) => p.startsWith('text='))].filter(Boolean);
  return `whatsapp://send${parametres.length ? `?${parametres.join('&')}` : ''}`;
}
