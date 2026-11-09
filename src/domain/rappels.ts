// Rappels du client, programmés sur son téléphone pour les deux semaines à venir et recalculés à chaque ouverture
// de l'appli : séances prévues, rendez-vous avec le coach, repas à noter, motivation et bilan de la semaine.
// Tout est calculé ici, sans téléphone : l'heure est celle de Paris, comme le reste de l'appli.
import { ajouterJours, aujourdhuiParis, lundiDe } from './entrainement';

export interface PreferencesRappels {
  /** Le matin d'une séance prévue, et 2 h avant un rendez-vous avec le coach. */
  seances: boolean;
  /** Déjeuner et dîner à noter, sauf s'ils le sont déjà. */
  repas: boolean;
  /** Deux petits mots par semaine (mardi et vendredi matin). */
  motivation: boolean;
  /** Le dimanche soir, si le bilan de la semaine n'est pas rempli. */
  bilan: boolean;
  /** Ancien réglage des messages du coach : désormais côté serveur (alertes coupées), gardé pour la reprise. */
  messages: boolean;
  /** « HH:MM » */
  heureDejeuner: string;
  heureDiner: string;
}

export const PREFERENCES_PAR_DEFAUT: PreferencesRappels = {
  seances: true,
  repas: true,
  motivation: true,
  bilan: true,
  messages: true,
  heureDejeuner: '14:00',
  heureDiner: '21:00',
};

export type GenreRappel = 'seance' | 'rdv' | 'repas' | 'motivation' | 'bilan';

export interface Rappel {
  /** Stable : le même rappel garde le même identifiant d'un calcul à l'autre. */
  id: string;
  genre: GenreRappel;
  quand: Date;
  titre: string;
  corps: string;
  /** Écran à ouvrir quand on touche la notification. */
  url: string;
}

export interface ContexteRappels {
  maintenant: Date;
  prenom: string;
  /** Séances du programme avec un jour prévu (AAAA-MM-JJ). */
  seances: { id: string; titre: string; datePrevue?: string; derniereRealisation?: string }[];
  /** Rendez-vous avec le coach (ISO). */
  rendezVous: { id: string; debut: string; lieu?: string; statut: string }[];
  /** Moments de repas déjà notés aujourd'hui. */
  repasDuJour: string[];
  /** Le bilan de la semaine en cours est-il déjà rempli ? */
  bilanFait: boolean;
  /** L'option nutrition ou le journal des repas est-il ouvert au client ? */
  journalRepas: boolean;
}

export const HORIZON_JOURS = 14;
/** iOS garde 64 notifications programmées au plus : on reste bien en dessous. */
export const MAX_RAPPELS = 48;

const HEURE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const heureValide = (h: string) => HEURE.test(h.trim());

/** Décalage de Paris par rapport à UTC à un instant donné, en minutes (60 l'hiver, 120 l'été). */
function decalageParis(instant: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  const commeUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((commeUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** L'instant qui correspond à « jour à HH:MM, heure de Paris ». */
export function aParis(jour: string, heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const [a, mo, j] = jour.split('-').map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, m);
  // Deux passes : le décalage au bon instant, même les jours de changement d'heure.
  let instant = new Date(naif - decalageParis(new Date(naif)) * 60000);
  instant = new Date(naif - decalageParis(instant) * 60000);
  return instant;
}

/** « 18:30 » à Paris. */
const heureParis = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

/** Jour de la semaine à Paris : 0 dimanche … 6 samedi. */
const jourSemaine = (jour: string) => new Date(`${jour}T12:00:00Z`).getUTCDay();

export const MOTIVATIONS: { titre: string; corps: (prenom: string) => string }[] = [
  { titre: 'Un pas après l’autre', corps: (p) => `${p}, ce que tu fais aujourd’hui construit tes résultats de demain. Continue !` },
  { titre: 'La régularité gagne', corps: (p) => `Pas besoin d’être parfait·e, ${p} : être régulier·e suffit. Tu es sur la bonne voie.` },
  { titre: 'Fier de toi', corps: (p) => `${p}, chaque séance faite compte. Ton coach voit tes efforts.` },
  { titre: 'Petite victoire', corps: (p) => `Un verre d’eau, une marche, un repas noté : ${p}, chaque petite victoire te rapproche de ton objectif.` },
  { titre: 'On lâche rien', corps: (p) => `Une semaine difficile ? C’est normal, ${p}. L’important, c’est de reprendre dès la prochaine séance.` },
  { titre: 'Ton objectif t’attend', corps: (p) => `${p}, souviens-toi pourquoi tu as commencé. Tu es plus fort·e que tu ne le crois.` },
  { titre: 'Bien joué', corps: (p) => `Tu prends soin de toi, ${p}. Continue comme ça, les résultats suivent.` },
  { titre: 'Énergie', corps: (p) => `Bouge un peu aujourd’hui, ${p} : ton corps et ton moral te diront merci.` },
];

/** Tous les rappels des deux prochaines semaines, dans l'ordre, déjà passés exclus. */
export function planifierRappels(prefs: PreferencesRappels, c: ContexteRappels): Rappel[] {
  const rappels: Rappel[] = [];
  const aujourdhui = aujourdhuiParis(c.maintenant);
  const jours = Array.from({ length: HORIZON_JOURS }, (_, i) => ajouterJours(aujourdhui, i));
  const fin = ajouterJours(aujourdhui, HORIZON_JOURS);
  const prenom = c.prenom.trim() || 'Toi';

  if (prefs.seances) {
    for (const s of c.seances) {
      if (!s.datePrevue || s.datePrevue < aujourdhui || s.datePrevue >= fin) continue;
      // Déjà faite le jour prévu (ou après) : rien à rappeler.
      if (s.derniereRealisation && aujourdhuiParis(new Date(s.derniereRealisation)) >= s.datePrevue) continue;
      rappels.push({
        id: `seance-${s.id}-${s.datePrevue}`,
        genre: 'seance',
        quand: aParis(s.datePrevue, '08:00'),
        titre: 'Séance du jour',
        corps: `${s.titre} t’attend aujourd’hui. Prêt·e, ${prenom} ?`,
        url: '/client?onglet=programme',
      });
    }
    for (const r of c.rendezVous) {
      if (['annule', 'annule_tard', 'refuse', 'realise', 'absent'].includes(r.statut)) continue;
      const debut = new Date(r.debut);
      rappels.push({
        id: `rdv-${r.id}-${r.debut}`,
        genre: 'rdv',
        quand: new Date(debut.getTime() - 2 * 3600_000),
        titre: `Séance avec ton coach à ${heureParis(r.debut)}`,
        corps: r.lieu?.trim() ? `Rendez-vous : ${r.lieu.trim()}. Pense à ta bouteille d’eau !` : 'Pense à ta bouteille d’eau et à ta serviette !',
        url: '/client',
      });
    }
  }

  if (prefs.repas && c.journalRepas) {
    const moments = [
      { moment: 'dejeuner', heure: prefs.heureDejeuner, titre: 'Ton déjeuner est noté ?', corps: 'Note ce que tu as mangé ce midi : une photo ou quelques secondes suffisent.' },
      { moment: 'diner', heure: prefs.heureDiner, titre: 'Pense à noter ton dîner', corps: 'Ton coach suit ton alimentation : note ton dîner avant d’aller dormir.' },
    ];
    for (const jour of jours)
      for (const m of moments) {
        if (!heureValide(m.heure)) continue;
        if (jour === aujourdhui && c.repasDuJour.includes(m.moment)) continue;
        rappels.push({ id: `repas-${m.moment}-${jour}`, genre: 'repas', quand: aParis(jour, m.heure.trim()), titre: m.titre, corps: m.corps, url: '/client?onglet=nutrition' });
      }
  }

  if (prefs.motivation) {
    for (const jour of jours) {
      const js = jourSemaine(jour);
      if (js !== 2 && js !== 5) continue;
      // Un message différent à chaque fois, dans l'ordre de la liste.
      const rang = Math.floor(new Date(`${jour}T12:00:00Z`).getTime() / 86_400_000 / 7) * 2 + (js === 5 ? 1 : 0);
      const mot = MOTIVATIONS[rang % MOTIVATIONS.length];
      rappels.push({ id: `motivation-${jour}`, genre: 'motivation', quand: aParis(jour, '09:00'), titre: mot.titre, corps: mot.corps(prenom), url: '/client' });
    }
  }

  if (prefs.bilan) {
    for (const jour of jours) {
      if (jourSemaine(jour) !== 0) continue;
      if (lundiDe(jour) === lundiDe(aujourdhui) && c.bilanFait) continue;
      rappels.push({
        id: `bilan-${jour}`,
        genre: 'bilan',
        quand: aParis(jour, '18:00'),
        titre: 'Ton bilan de la semaine',
        corps: `${prenom}, 2 minutes pour dire à ton coach comment s’est passée ta semaine.`,
        url: '/client?onglet=suivi',
      });
    }
  }

  return rappels
    .filter((r) => r.quand.getTime() > c.maintenant.getTime() + 60_000)
    .sort((a, b) => a.quand.getTime() - b.quand.getTime())
    .slice(0, MAX_RAPPELS);
}
