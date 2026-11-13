// Bilan du mois du coach : encaissé, à encaisser, abonnements réglés, packs vendus, séances réalisées, clients vus,
// et l'évolution mois par mois et année par année. Règles pures : l'écran les applique aux paiements du carnet et aux
// rendez-vous de l'agenda.
import type { RendezVous } from './agenda';
import type { Contact } from './crm';
import type { Paiement } from './gestion';

/** AAAA-MM. */
export type Mois = string;

/** D'où vient l'argent, d'après la référence du paiement. */
export type Source = 'abonnement' | 'pack' | 'seance' | 'achat' | 'autre';
export const SOURCES: Record<Source, string> = {
  abonnement: 'Abonnements',
  pack: 'Packs de séances',
  seance: 'Séances à l’unité',
  achat: 'Achats',
  autre: 'Autres paiements',
};

export function sourcePaiement(p: Pick<Paiement, 'reference'>): Source {
  const prefixe = p.reference?.split(':')[0];
  return prefixe === 'abonnement' || prefixe === 'pack' || prefixe === 'seance' || prefixe === 'achat' ? prefixe : 'autre';
}

const deux = (n: number) => String(n).padStart(2, '0');
export const moisDe = (d: Date): Mois => `${d.getFullYear()}-${deux(d.getMonth() + 1)}`;

/** Mois d'un instant ISO, à l'heure de Paris (une séance du 31 à 23 h reste dans son mois). */
export function moisParis(iso: string): Mois {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

export function decalerMois(m: Mois, n: number): Mois {
  const [a, mm] = m.split('-').map(Number);
  const d = new Date(a, mm - 1 + n, 1);
  return moisDe(d);
}

export function nomMois(m: Mois, court = false): string {
  const [a, mm] = m.split('-').map(Number);
  return new Date(a, mm - 1, 15).toLocaleDateString('fr-FR', court ? { month: 'short' } : { month: 'long', year: 'numeric' });
}

/** Le bilan à montrer d'abord : le mois qui vient de se terminer pendant la première semaine, sinon le mois en cours. */
export function moisParDefaut(maintenant: Date): Mois {
  const m = moisDe(maintenant);
  return maintenant.getDate() <= 7 ? decalerMois(m, -1) : m;
}

/** Séances comptées dans le bilan : en salle et en visio ; les appels n'en sont pas. */
const estSeance = (r: Pick<RendezVous, 'type'>) => r.type === 'seance' || r.type === 'visio';

export interface ChiffresMois {
  mois: Mois;
  /** Paiements « Payé » datés du mois. */
  encaisse: number;
  /** Paiements « En attente » datés du mois. */
  aEncaisser: number;
  rembourse: number;
  parSource: { source: Source; montant: number; nombre: number }[];
  /** Abonnements payés avec un montant, et ceux offerts (0 €). */
  abonnementsRegles: number;
  abonnementsOfferts: number;
  packsVendus: number;
  seancesRealisees: number;
  /** Absences et annulations tardives. */
  seancesManquees: number;
  /** Personnes venues à au moins une séance (un duo compte pour deux). */
  clientsVus: number;
  /** Clients dont la première séance ou le premier paiement tombe ce mois-ci. */
  nouveauxClients: number;
  /** Ceux qui ont rapporté le plus ce mois-ci. */
  meilleursClients: { cle: string; nom: string; montant: number; seances: number }[];
}

export interface Donnees {
  paiements: Paiement[];
  rendezVous: RendezVous[];
  contacts: Pick<Contact, 'id' | 'prenom' | 'nom' | 'clientId'>[];
}

/** Une personne : le contact quand on le connaît, sinon le dossier client de l'agenda. */
function cles(d: Donnees) {
  const parClient = new Map(d.contacts.filter((c) => c.clientId).map((c) => [c.clientId!, c]));
  const parContact = new Map(d.contacts.map((c) => [c.id, c]));
  return {
    duPaiement: (p: Paiement) => (p.contactId ? `contact:${p.contactId}` : undefined),
    duClient: (clientId: string) => {
      const c = parClient.get(clientId);
      return c ? `contact:${c.id}` : `client:${clientId}`;
    },
    nom: (cle: string, repli?: string) => {
      const c = cle.startsWith('contact:') ? parContact.get(cle.slice(8)) : undefined;
      return c ? `${c.prenom} ${c.nom}`.trim() : (repli ?? 'Client');
    },
  };
}

/** Premier mois d'activité (séance réalisée ou paiement réglé) de chaque personne. */
function premiersMois(d: Donnees, k: ReturnType<typeof cles>) {
  const premier = new Map<string, Mois>();
  const noter = (cle: string | undefined, m: Mois) => {
    if (!cle) return;
    const avant = premier.get(cle);
    if (!avant || m < avant) premier.set(cle, m);
  };
  for (const p of d.paiements) if (p.statut === 'Payé' && p.date && (p.montant ?? 0) > 0) noter(k.duPaiement(p), p.date.slice(0, 7));
  for (const r of d.rendezVous) if (r.statut === 'realise' && estSeance(r)) for (const x of r.participants) noter(k.duClient(x.clientId), moisParis(r.debut));
  return premier;
}

export function chiffresDuMois(d: Donnees, mois: Mois): ChiffresMois {
  const k = cles(d);
  const duMois = d.paiements.filter((p) => p.date?.slice(0, 7) === mois);
  const montant = (l: Paiement[]) => Math.round(l.reduce((s, p) => s + (p.montant ?? 0), 0) * 100) / 100;
  const payes = duMois.filter((p) => p.statut === 'Payé');
  const parSource = (Object.keys(SOURCES) as Source[])
    .map((source) => {
      const l = payes.filter((p) => sourcePaiement(p) === source);
      return { source, montant: montant(l), nombre: l.length };
    })
    .filter((x) => x.nombre > 0);
  const abonnements = payes.filter((p) => sourcePaiement(p) === 'abonnement');

  const rdv = d.rendezVous.filter((r) => estSeance(r) && moisParis(r.debut) === mois);
  const realises = rdv.filter((r) => r.statut === 'realise');
  const vus = new Map<string, { nom: string; seances: number }>();
  for (const r of realises)
    for (const x of r.participants) {
      const cle = k.duClient(x.clientId);
      const v = vus.get(cle) ?? { nom: k.nom(cle, `${x.prenom} ${x.nom}`.trim()), seances: 0 };
      vus.set(cle, { ...v, seances: v.seances + 1 });
    }

  const premier = premiersMois(d, k);
  const actifs = new Set([...vus.keys(), ...payes.filter((p) => (p.montant ?? 0) > 0).map(k.duPaiement).filter((x): x is string => !!x)]);
  const argent = new Map<string, number>();
  for (const p of payes) {
    const cle = k.duPaiement(p);
    if (cle) argent.set(cle, (argent.get(cle) ?? 0) + (p.montant ?? 0));
  }
  const meilleursClients = [...actifs]
    .map((cle) => ({ cle, nom: vus.get(cle)?.nom ?? k.nom(cle), montant: Math.round((argent.get(cle) ?? 0) * 100) / 100, seances: vus.get(cle)?.seances ?? 0 }))
    .filter((x) => x.montant > 0 || x.seances > 0)
    .sort((a, b) => b.montant - a.montant || b.seances - a.seances || a.nom.localeCompare(b.nom))
    .slice(0, 5);

  return {
    mois,
    encaisse: montant(payes),
    aEncaisser: montant(duMois.filter((p) => p.statut === 'En attente')),
    rembourse: montant(duMois.filter((p) => p.statut === 'Remboursé')),
    parSource,
    abonnementsRegles: abonnements.filter((p) => (p.montant ?? 0) > 0).length,
    abonnementsOfferts: abonnements.filter((p) => (p.montant ?? 0) === 0).length,
    packsVendus: payes.filter((p) => sourcePaiement(p) === 'pack').length,
    seancesRealisees: realises.length,
    seancesManquees: rdv.filter((r) => r.statut === 'absent' || r.statut === 'annule_tard').length,
    clientsVus: vus.size,
    nouveauxClients: [...actifs].filter((cle) => premier.get(cle) === mois).length,
    meilleursClients,
  };
}

export type Mesure = 'encaisse' | 'seances' | 'clients';
export const MESURES: Record<Mesure, string> = { encaisse: 'Encaissé', seances: 'Séances', clients: 'Clients vus' };

export interface Point {
  /** AAAA-MM ou AAAA. */
  cle: string;
  encaisse: number;
  seances: number;
  clients: number;
}

/** Les douze mois d'une année, janvier à décembre. */
export function evolutionMensuelle(d: Donnees, annee: number): Point[] {
  return Array.from({ length: 12 }, (_, i) => {
    const c = chiffresDuMois(d, `${annee}-${deux(i + 1)}`);
    return { cle: c.mois, encaisse: c.encaisse, seances: c.seancesRealisees, clients: c.clientsVus };
  });
}

/** Une barre par année, de la première activité à l'année en cours. */
export function evolutionAnnuelle(d: Donnees, maintenant: Date): Point[] {
  const k = cles(d);
  const fin = maintenant.getFullYear();
  const annees = [
    ...d.paiements.filter((p) => p.date).map((p) => Number(p.date!.slice(0, 4))),
    ...d.rendezVous.map((r) => Number(moisParis(r.debut).slice(0, 4))),
  ].filter((a) => a <= fin);
  const debut = annees.length ? Math.min(...annees) : fin;
  return Array.from({ length: fin - debut + 1 }, (_, i) => {
    const a = String(debut + i);
    const payes = d.paiements.filter((p) => p.statut === 'Payé' && p.date?.startsWith(a));
    const realises = d.rendezVous.filter((r) => r.statut === 'realise' && estSeance(r) && moisParis(r.debut).startsWith(a));
    const vus = new Set(realises.flatMap((r) => r.participants.map((x) => k.duClient(x.clientId))));
    return { cle: a, encaisse: Math.round(payes.reduce((s, p) => s + (p.montant ?? 0), 0) * 100) / 100, seances: realises.length, clients: vus.size };
  });
}

/** « +12 % » par rapport à une référence ; rien quand la référence est vide. */
export function ecart(valeur: number, reference: number): number | null {
  if (!reference) return null;
  return Math.round(((valeur - reference) / reference) * 100);
}

/** Les tuiles du bilan : chacune ouvre la liste de ce qu'elle compte. */
export type Tuile = 'encaisse' | 'aEncaisser' | 'abonnements' | 'packs' | 'seances' | 'clients' | 'nouveaux' | 'manquees';

/** Une personne derrière les chiffres : son contact quand on le connaît (pour ouvrir sa fiche). */
export interface PersonneMois {
  cle: string;
  nom: string;
  contactId?: string;
  seances: number;
  montant: number;
}

export interface DetailMois {
  encaisse: Paiement[];
  aEncaisser: Paiement[];
  abonnements: Paiement[];
  packs: Paiement[];
  seances: RendezVous[];
  manquees: RendezVous[];
  clients: PersonneMois[];
  nouveaux: PersonneMois[];
}

/** Ce qu'il y a derrière chaque tuile du mois, avec les mêmes règles que chiffresDuMois. */
export function detailDuMois(d: Donnees, mois: Mois): DetailMois {
  const k = cles(d);
  const parDate = (a: Paiement, b: Paiement) => (a.date ?? '').localeCompare(b.date ?? '') || a.titre.localeCompare(b.titre);
  const duMois = d.paiements.filter((p) => p.date?.slice(0, 7) === mois).sort(parDate);
  const payes = duMois.filter((p) => p.statut === 'Payé');
  const rdv = d.rendezVous.filter((r) => estSeance(r) && moisParis(r.debut) === mois).sort((a, b) => a.debut.localeCompare(b.debut));
  const realises = rdv.filter((r) => r.statut === 'realise');

  const personnes = new Map<string, PersonneMois>();
  const personne = (cle: string, repli?: string) => {
    let x = personnes.get(cle);
    if (!x) {
      x = { cle, nom: k.nom(cle, repli), contactId: cle.startsWith('contact:') ? cle.slice(8) : undefined, seances: 0, montant: 0 };
      personnes.set(cle, x);
    }
    return x;
  };
  const vus = new Set<string>();
  for (const r of realises)
    for (const x of r.participants) {
      const cle = k.duClient(x.clientId);
      personne(cle, `${x.prenom} ${x.nom}`.trim()).seances += 1;
      vus.add(cle);
    }
  for (const p of payes) {
    const cle = k.duPaiement(p);
    if (cle) personne(cle).montant = Math.round((personne(cle).montant + (p.montant ?? 0)) * 100) / 100;
  }
  const premier = premiersMois(d, k);
  const actifs = new Set([...vus, ...payes.filter((p) => (p.montant ?? 0) > 0).map(k.duPaiement).filter((x): x is string => !!x)]);
  const parNom = (a: PersonneMois, b: PersonneMois) => a.nom.localeCompare(b.nom);

  return {
    encaisse: payes,
    aEncaisser: duMois.filter((p) => p.statut === 'En attente'),
    abonnements: payes.filter((p) => sourcePaiement(p) === 'abonnement'),
    packs: payes.filter((p) => sourcePaiement(p) === 'pack'),
    seances: realises,
    manquees: rdv.filter((r) => r.statut === 'absent' || r.statut === 'annule_tard'),
    clients: [...vus].map((cle) => personnes.get(cle)!).sort(parNom),
    nouveaux: [...actifs].filter((cle) => premier.get(cle) === mois).map((cle) => personnes.get(cle)!).sort(parNom),
  };
}
