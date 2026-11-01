// Agenda du coach : rendez-vous à une ou plusieurs personnes (duo, couple), chevauchements, récurrence, annulation,
// alertes de fin de pack et d'inactivité. Le comptage (pack ou paiement) est fait par la base : voir la migration agenda.

export type TypeRdv = 'seance' | 'visio' | 'appel';
export type StatutRdv = 'propose' | 'confirme' | 'refuse' | 'annule' | 'annule_tard' | 'absent' | 'realise';

export const TYPES_RDV: Record<TypeRdv, string> = { seance: 'Séance', visio: 'Visio', appel: 'Appel' };
export const STATUTS_RDV: Record<StatutRdv, string> = {
  propose: 'En attente de réponse',
  confirme: 'Confirmé',
  refuse: 'Refusé',
  annule: 'Annulé',
  annule_tard: 'Annulé tardivement',
  absent: 'Absent',
  realise: 'Réalisé',
};

export interface Participant {
  clientId: string;
  prenom: string;
  nom: string;
  /** Pack d'où vient la séance, une fois comptée. */
  packId?: string;
  decompte: boolean;
  /** Séance à l'unité : sa part du prix, en euros. */
  montant?: number;
}

export interface RendezVous {
  id: string;
  type: TypeRdv;
  /** ISO 8601. */
  debut: string;
  fin: string;
  lieu: string;
  lienVisio?: string;
  note: string;
  statut: StatutRdv;
  /** Séance comptée : pack décompté ou paiement créé. */
  compte: boolean;
  serieId?: string;
  participants: Participant[];
}

/** Ce que voit le client connecté. */
export interface MonRendezVous {
  id: string;
  type: TypeRdv;
  debut: string;
  fin: string;
  lieu: string;
  lienVisio?: string;
  statut: StatutRdv;
  /** Prénoms des autres personnes inscrites. */
  avec?: string;
  /** Après cette date, l'annulation se fait par téléphone. */
  annulableJusquAu: string;
}

export interface ReglagesAgenda {
  dureeMinutes: number;
  tamponMinutes: number;
  delaiAnnulationHeures: number;
  rappelHeures: number;
  rappelCourt: boolean;
  seuilFinPack: number;
  inactiviteJours: number;
  lieuDefaut: string;
}

export const REGLAGES_AGENDA_DEFAUT: ReglagesAgenda = {
  dureeMinutes: 60,
  tamponMinutes: 0,
  delaiAnnulationHeures: 24,
  rappelHeures: 24,
  rappelCourt: false,
  seuilFinPack: 2,
  inactiviteJours: 21,
  lieuDefaut: '',
};

/** Statuts qui n'occupent plus le créneau. */
const LIBERES: StatutRdv[] = ['refuse', 'annule', 'annule_tard'];
export const occupe = (r: Pick<RendezVous, 'statut'>) => !LIBERES.includes(r.statut);

const ms = (iso: string) => new Date(iso).getTime();
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Rendez-vous qui chevauchent le créneau, temps tampon compris. Les rendez-vous annulés ou refusés ne comptent pas. */
export function chevauchements<T extends Pick<RendezVous, 'id' | 'debut' | 'fin' | 'statut'>>(
  creneau: { debut: string; fin: string },
  existants: T[],
  tamponMinutes = 0,
  ignorerId?: string,
) {
  const d = ms(creneau.debut) - tamponMinutes * MINUTE;
  const f = ms(creneau.fin) + tamponMinutes * MINUTE;
  return existants.filter((r) => r.id !== ignorerId && occupe(r) && ms(r.debut) < f && ms(r.fin) > d);
}

/**
 * « Toutes les semaines pendant N semaines » : même heure locale chaque semaine, changement d'heure compris.
 * fois = 1 renvoie le seul créneau de départ.
 */
export function repeter(creneau: { debut: string; fin: string }, fois: number, pasSemaines = 1) {
  const duree = ms(creneau.fin) - ms(creneau.debut);
  return Array.from({ length: Math.max(1, Math.min(fois, 52)) }, (_, i) => {
    const d = new Date(creneau.debut);
    d.setDate(d.getDate() + i * 7 * pasSemaines);
    return { debut: d.toISOString(), fin: new Date(d.getTime() + duree).toISOString() };
  });
}

/** Le client peut encore annuler lui-même. */
export function annulableEnLigne(r: Pick<MonRendezVous, 'statut' | 'annulableJusquAu'>, maintenant = new Date()) {
  return (r.statut === 'propose' || r.statut === 'confirme') && maintenant.getTime() <= ms(r.annulableJusquAu);
}

/** Lundi 0 h (heure locale) de la semaine de cette date. */
export function lundiDe(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function ajouterJours(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** AAAA-MM-JJ en heure locale. */
export function cleJour(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date locale + heure « 18:30 » → ISO. */
export function versIso(jour: string, heure: string) {
  const [a, m, j] = jour.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  return new Date(a, m - 1, j, h, mi).toISOString();
}

export const heureDe = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** « 18:30 » valide. */
export const heureValide = (h: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(h.trim());

export const dureeMinutes = (r: Pick<RendezVous, 'debut' | 'fin'>) => Math.round((ms(r.fin) - ms(r.debut)) / MINUTE);

export const nomsParticipants = (r: Pick<RendezVous, 'participants'>) =>
  r.participants.map((p) => p.prenom || p.nom || 'Client').join(' et ') || 'Sans client';

/** Ce qu'il faut corriger avant d'enregistrer un rendez-vous. */
export function erreursRendezVous(r: { clientIds: string[]; jour: string; heure: string; duree: number; type: TypeRdv; lienVisio?: string }) {
  const e: string[] = [];
  if (!r.clientIds.length) e.push('Choisis au moins un client.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.jour)) e.push('Date illisible.');
  if (!heureValide(r.heure)) e.push('Heure illisible : écris-la comme 18:30.');
  if (!(r.duree >= 15 && r.duree <= 480)) e.push('Durée entre 15 minutes et 8 heures.');
  if (r.lienVisio?.trim() && !/^https:\/\//.test(r.lienVisio.trim())) e.push('Le lien visio doit commencer par https://');
  return e;
}

/** Séances restantes d'un client (ses packs et ceux partagés avec lui), sous le seuil d'alerte. */
export function packsBientotFinis(soldes: { clientId: string; prenom: string; restantes: number; total: number }[], seuil: number) {
  return soldes.filter((s) => s.total > 0 && s.restantes <= seuil).sort((a, b) => a.restantes - b.restantes);
}

/**
 * Clients inactifs : aucun rendez-vous à venir, et ni séance faite dans l'appli ni rendez-vous réalisé depuis `jours`.
 * Un client tout juste créé (aucune activité) n'est pas compté.
 */
export function clientsInactifs(
  clients: { id: string; prenom: string; nom: string; derniereSeance?: { fin: string } }[],
  rdv: Pick<RendezVous, 'debut' | 'fin' | 'statut' | 'participants'>[],
  jours: number,
  maintenant = new Date(),
) {
  const limite = maintenant.getTime() - jours * JOUR;
  return clients
    .map((c) => {
      const siens = rdv.filter((r) => r.participants.some((p) => p.clientId === c.id));
      const aVenir = siens.some((r) => occupe(r) && ms(r.debut) > maintenant.getTime());
      const dates = [
        ...siens.filter((r) => r.statut === 'realise').map((r) => ms(r.fin)),
        ...(c.derniereSeance ? [ms(c.derniereSeance.fin)] : []),
      ];
      const derniere = dates.length ? Math.max(...dates) : undefined;
      return { ...c, aVenir, derniere };
    })
    .filter((c) => !c.aVenir && c.derniere !== undefined && c.derniere < limite)
    .map((c) => ({ id: c.id, prenom: c.prenom, nom: c.nom, depuisJours: Math.floor((maintenant.getTime() - c.derniere!) / JOUR) }))
    .sort((a, b) => b.depuisJours - a.depuisJours);
}

/** Grille du mois (semaines complètes du lundi au dimanche) qui contient cette date. */
export function grilleMois(date: Date) {
  const premier = new Date(date.getFullYear(), date.getMonth(), 1);
  const dernier = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const debut = lundiDe(premier);
  const jours: Date[] = [];
  for (let d = debut; d <= dernier || jours.length % 7; d = ajouterJours(d, 1)) jours.push(d);
  return jours;
}

/** Créneaux (événements perso Google) qui touchent ce jour, en heure locale. */
export function surLeJour<T extends { debut: string; fin: string }>(liste: T[], jour: Date) {
  const d = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate()).getTime();
  const f = ajouterJours(new Date(d), 1).getTime();
  return liste.filter((o) => ms(o.debut) < f && ms(o.fin) > d);
}
