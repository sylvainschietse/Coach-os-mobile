// Synchronisation avec Google Agenda : traduction d'un rendez-vous en événement Google, et des événements perso du coach
// en créneaux occupés. Ce fichier est aussi copié dans supabase/functions/_shared (Deno) : aucune dépendance, et un test
// vérifie que les deux copies sont identiques.

export const PORTEE_GOOGLE = 'openid email https://www.googleapis.com/auth/calendar.events';
/** Marque des événements créés par l'app : ils ne sont pas recopiés comme créneaux perso. */
export const MARQUE_APP = 'coachgo';

export interface RdvPourGoogle {
  id: string;
  type: 'seance' | 'visio' | 'appel';
  debut: string;
  fin: string;
  lieu: string;
  lienVisio?: string | null;
  note: string;
  statut: string;
  prenoms: string[];
}

export interface Occupation {
  id: string;
  debut: string;
  fin: string;
  titre: string;
  journee: boolean;
}

const NOMS = { seance: 'Séance', visio: 'Visio', appel: 'Appel' } as const;
const STATUTS: Record<string, string> = {
  propose: 'en attente de réponse',
  confirme: 'confirmé',
  annule_tard: 'annulé tardivement',
  absent: 'absent',
  realise: 'réalisé',
};

/** Identifiant Google de l'événement, tiré de celui du rendez-vous (lettres a-v et chiffres) : le même à chaque envoi. */
export const idEvenement = (rdvId: string) => rdvId.toLowerCase().replace(/[^0-9a-f]/g, '');

/** Statuts pour lesquels l'événement est retiré de l'agenda Google. */
export const retireDeGoogle = (statut: string) => statut === 'annule' || statut === 'refuse';

/** Corps d'un événement Google. Visio sans lien : Google crée un lien Meet (conferenceDataVersion=1). */
export function evenementGoogle(r: RdvPourGoogle, lienApp?: string) {
  const qui = r.prenoms.filter(Boolean).join(' et ') || 'Client';
  const statut = STATUTS[r.statut];
  const description = [
    statut ? `Statut : ${statut}` : '',
    r.lienVisio ? `Visio : ${r.lienVisio}` : '',
    r.note.trim(),
    lienApp ? `Dans CoachGo : ${lienApp}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    id: idEvenement(r.id),
    summary: `${NOMS[r.type]} · ${qui}`,
    ...(r.lieu.trim() ? { location: r.lieu.trim() } : {}),
    description,
    start: { dateTime: r.debut },
    end: { dateTime: r.fin },
    status: 'confirmed',
    transparency: 'opaque',
    // Proposé : couleur « banane » pour le distinguer d'un rendez-vous confirmé.
    ...(r.statut === 'propose' ? { colorId: '5' } : {}),
    extendedProperties: { private: { [MARQUE_APP]: r.id } },
    ...(r.type === 'visio' && !r.lienVisio
      ? { conferenceData: { createRequest: { requestId: r.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      : {}),
  };
}

/** Minuit à Paris pour une date « AAAA-MM-JJ » (événement sur la journée entière). */
export function minuitParis(jour: string) {
  const midi = new Date(`${jour}T12:00:00Z`);
  const decalage = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(midi)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(decalage ?? '');
  const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return new Date(Date.parse(`${jour}T00:00:00Z`) - minutes * 60_000).toISOString();
}

type EvenementLu = {
  id?: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/** Événements perso qui occupent le coach : ni annulés, ni « disponible », ni refusés, ni créés par l'app. */
export function occupationsGoogle(items: EvenementLu[]): Occupation[] {
  const res: Occupation[] = [];
  for (const e of items) {
    if (!e.id || e.status === 'cancelled' || e.transparency === 'transparent') continue;
    if (e.extendedProperties?.private?.[MARQUE_APP]) continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue;
    const journee = !e.start?.dateTime && !!e.start?.date;
    const debut = e.start?.dateTime ?? (e.start?.date ? minuitParis(e.start.date) : undefined);
    const fin = e.end?.dateTime ?? (e.end?.date ? minuitParis(e.end.date) : undefined);
    if (!debut || !fin || Date.parse(fin) <= Date.parse(debut)) continue;
    res.push({ id: e.id, debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString(), titre: (e.summary ?? '').trim() || 'Occupé', journee });
  }
  return res;
}

/** Adresse de retour acceptée après la connexion Google : le site de l'app ou l'app installée. */
export function retourAutorise(retour: string, site: string) {
  if (/^(coachos|exp|exps):\/\//.test(retour)) return true;
  const base = site.replace(/\/+$/, '');
  return !!base && (retour === base || retour.startsWith(`${base}/`) || retour.startsWith(`${base}?`));
}
