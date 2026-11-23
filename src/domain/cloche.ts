// Affichage de la cloche : « il y a 5 min », « hier à 18h02 »… à l'heure de Paris, sans téléphone.

const HEURE = (d: Date) => d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
const JOUR = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

export function ilYa(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const s = Math.max(0, Math.round((maintenant.getTime() - d.getTime()) / 1000));
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (JOUR(d) === JOUR(maintenant)) return `aujourd’hui à ${HEURE(d)}`;
  const hier = new Date(maintenant.getTime() - 86_400_000);
  if (JOUR(d) === JOUR(hier)) return `hier à ${HEURE(d)}`;
  if (s < 7 * 86_400) return `${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' })} à ${HEURE(d)}`;
  return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });
}

/** Pastille : au-delà de 9, « 9+ ». */
export const pastille = (n: number) => (n > 9 ? '9+' : String(n));
