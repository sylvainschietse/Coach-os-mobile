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

/**
 * « https://wa.me/33612345678?text=… » → { telephone: '33612345678', message: '…' } (message décodé, emoji compris).
 * Undefined pour tout autre lien. Sert à ouvrir WhatsApp par une intention Android adressée à WhatsApp lui-même.
 */
export function lireLienWhatsApp(url: string): { telephone: string; message: string } | undefined {
  const m = url.match(/^https:\/\/wa\.me\/(\d*)\/?(?:\?(.*))?$/i);
  if (!m) return undefined;
  const texte = (m[2] ?? '').split('&').find((p) => p.startsWith('text='));
  let message = '';
  try {
    message = texte ? decodeURIComponent(texte.slice(5).replace(/\+/g, '%20')) : '';
  } catch {
    return undefined;
  }
  return { telephone: m[1], message };
}
