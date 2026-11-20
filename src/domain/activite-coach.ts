// Accueil du coach, bloc « Ce qui s'est passé » : ce que ses clients et ses prospects ont fait sur une période,
// le plus récent d'abord. Les données viennent de plusieurs tables ; ici, seulement les règles (période, tri, libellés).

export type PeriodeActivite = 'jour' | 'hier' | '3j' | '7j' | '15j' | '1m';

export const PERIODES_ACTIVITE: { cle: PeriodeActivite; libelle: string }[] = [
  { cle: 'jour', libelle: 'Aujourd’hui' },
  { cle: 'hier', libelle: 'Hier' },
  { cle: '3j', libelle: '3 j' },
  { cle: '7j', libelle: '7 j' },
  { cle: '15j', libelle: '15 j' },
  { cle: '1m', libelle: '1 mois' },
];

export type GenreActivite = 'seance' | 'sport' | 'rdv' | 'bilan' | 'questionnaire' | 'paiement';

export interface EvenementActivite {
  id: string;
  genre: GenreActivite;
  /** Horodatage ISO ; pour un paiement (daté d'un jour), midi de ce jour. */
  quand: string;
  /** Prénom (ou prénoms d'un duo) en gras en tête de ligne. */
  qui: string;
  /** La suite de la phrase : « a fait Haut du corps ». */
  quoi: string;
  /** Contact à ouvrir d'un appui (fiche) ; absent : la ligne mène à l'agenda ou aux paiements. */
  contactId?: string;
}

/** [du, au[ de la période, en heure locale. « Hier » s'arrête à minuit ; les autres vont jusqu'à maintenant. */
export function bornesPeriode(periode: PeriodeActivite, maintenant: Date): { du: Date; au: Date } {
  const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const ilYa = (jours: number) => new Date(minuit.getFullYear(), minuit.getMonth(), minuit.getDate() - jours);
  switch (periode) {
    case 'jour':
      return { du: minuit, au: maintenant };
    case 'hier':
      return { du: ilYa(1), au: minuit };
    case '3j':
      return { du: ilYa(2), au: maintenant };
    case '7j':
      return { du: ilYa(6), au: maintenant };
    case '15j':
      return { du: ilYa(14), au: maintenant };
    case '1m':
      return { du: new Date(minuit.getFullYear(), minuit.getMonth() - 1, minuit.getDate()), au: maintenant };
  }
}

/** Garde ce qui tombe dans [du, au[, le plus récent d'abord, sans doublon d'identifiant. */
export function filtrerActivite(evenements: EvenementActivite[], du: Date, au: Date): EvenementActivite[] {
  const vus = new Set<string>();
  return evenements
    .filter((e) => {
      const t = new Date(e.quand).getTime();
      if (Number.isNaN(t) || t < du.getTime() || t >= au.getTime() || vus.has(e.id)) return false;
      vus.add(e.id);
      return true;
    })
    .sort((a, b) => b.quand.localeCompare(a.quand));
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** « 10 h 12 » aujourd'hui, « hier 18 h », « sam. 9 h » dans la semaine, « 12/10 » au-delà. */
export function quandCourt(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime();
  const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ecart = Math.round((minuit - jour) / 86_400_000);
  const heure = `${d.getHours()} h${d.getMinutes() ? ` ${String(d.getMinutes()).padStart(2, '0')}` : ''}`;
  if (ecart <= 0) return heure;
  if (ecart === 1) return `hier ${heure}`;
  if (ecart < 7) return `${JOURS[d.getDay()]} ${heure}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Libellé d'une activité sportive importée (Health Connect, fichier…). */
export function phraseSport(sport: string, titre: string, distanceM?: number | null, dureeS?: number): string {
  const noms: Record<string, string> = {
    course: 'a couru',
    trail: 'a fait un trail',
    velo: 'a roulé',
    marche: 'a marché',
    randonnee: 'a randonné',
    natation: 'a nagé',
  };
  const km = distanceM ? `${(Math.round(distanceM / 100) / 10).toString().replace('.', ',')} km` : '';
  const min = !km && dureeS ? `${Math.round(dureeS / 60)} min` : '';
  if (noms[sport]) return [noms[sport], km || min].filter(Boolean).join(' ');
  return `a fait ${titre.trim() || 'une activité'}${km || min ? ` · ${km || min}` : ''}`;
}
