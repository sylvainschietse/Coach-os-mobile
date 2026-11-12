// Mes relances (Mon profil › Mes relances) : le coach réécrit le texte des relances prêtes à l'emploi, les coupe
// ou les rallume, et crée les siennes (quand ? pour qui ? quel message ?). Règles pures, sans écran ni base.
//
// Une relance du coach devient une tâche « libre » avec un titre (son nom) et, en note, le message déjà rempli : c'est ce
// qui la distingue d'une relance libre saisie à la main (sans titre) et d'une tâche (modèle « tache »).
import { ajouterJours, MODELES, type Contact, type ModeleMessage } from './crm';

export type ModeleAuto = 'questionnaire' | 'booster' | 'rappel_booster' | 'suivi_booster' | 'nouvelles_10j' | 'nouvelles_1mois';

/** Les relances que CoachGo crée tout seul, dans l'ordre du parcours, avec le moment où elles arrivent. */
export const RELANCES_AUTO: { cle: ModeleAuto; quand: string }[] = [
  { cle: 'questionnaire', quand: 'À la création d’un prospect' },
  { cle: 'booster', quand: 'Dès que ses réponses au questionnaire arrivent' },
  { cle: 'rappel_booster', quand: 'La veille de la séance Booster' },
  { cle: 'suivi_booster', quand: 'Deux jours après le Booster' },
  { cle: 'nouvelles_10j', quand: '10 jours après le Booster, s’il n’a pris aucun suivi' },
  { cle: 'nouvelles_1mois', quand: 'Un mois après le Booster, s’il n’a pris aucun suivi' },
];
const CLES_AUTO = RELANCES_AUTO.map((r) => r.cle);
export const estAuto = (m: ModeleMessage): m is ModeleAuto => (CLES_AUTO as string[]).includes(m);

/** Ce qu'on peut glisser dans un texte ; remplacé au moment d'envoyer. */
export const VARIABLES = [
  { code: '{prenom}', libelle: 'Prénom du client' },
  { code: '{coach}', libelle: 'Mon prénom' },
  { code: '{quand}', libelle: 'Date du RDV' },
  { code: '{lien}', libelle: 'Lien du questionnaire' },
] as const;

export type Declencheur =
  | { type: 'sans_seance'; jours: number }
  | { type: 'avant_rdv'; jours: number }
  | { type: 'apres_rdv'; jours: number }
  | { type: 'fin_pack'; restantes: number }
  | { type: 'paiement_retard'; jours: number }
  | { type: 'anniversaire' }
  | { type: 'date'; date: string };
export type TypeDeclencheur = Declencheur['type'];

export const DECLENCHEURS: { type: TypeDeclencheur; libelle: string; nombre?: { libelle: string; defaut: number; min: number; max: number } }[] = [
  { type: 'sans_seance', libelle: 'X jours sans séance', nombre: { libelle: 'Jours sans séance', defaut: 7, min: 1, max: 90 } },
  { type: 'avant_rdv', libelle: 'Avant un RDV', nombre: { libelle: 'Jours avant le RDV', defaut: 1, min: 0, max: 30 } },
  { type: 'apres_rdv', libelle: 'Après un RDV', nombre: { libelle: 'Jours après le RDV', defaut: 1, min: 0, max: 30 } },
  { type: 'fin_pack', libelle: 'Fin de pack', nombre: { libelle: 'Séances restantes', defaut: 2, min: 0, max: 10 } },
  { type: 'paiement_retard', libelle: 'Paiement en retard', nombre: { libelle: 'Jours de retard', defaut: 7, min: 1, max: 90 } },
  { type: 'anniversaire', libelle: 'Anniversaire' },
  { type: 'date', libelle: 'Date fixe' },
];

export type Public = 'prospects' | 'clients' | 'veille';
export const PUBLICS: { cle: Public; libelle: string }[] = [
  { cle: 'prospects', libelle: 'Prospects' },
  { cle: 'clients', libelle: 'Clients actifs' },
  { cle: 'veille', libelle: 'En veille' },
];

export interface RelancePerso {
  id: string;
  nom: string;
  texte: string;
  declencheur: Declencheur;
  pour: Public[];
  active: boolean;
}

export interface ReglagesRelances {
  /** Texte réécrit par le coach ; absent : le texte d'origine. */
  textes: Partial<Record<ModeleAuto, string>>;
  /** Relances prêtes à l'emploi que le coach a coupées : elles n'arrivent plus dans « À faire ». */
  coupees: ModeleAuto[];
  perso: RelancePerso[];
  /** Relances du coach déjà créées (clé de l'occasion → jour de création), pour ne jamais créer deux fois la même. */
  creees: Record<string, string>;
}

export const REGLAGES_RELANCES: ReglagesRelances = { textes: {}, coupees: [], perso: [], creees: {} };
export const MAX_TEXTE = 1000;
const MAX_PERSO = 30;

const entier = (v: unknown, min: number, max: number, defaut: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : defaut;
const jourValide = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function lireDeclencheur(d: unknown): Declencheur | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const x = d as Record<string, unknown>;
  const def = DECLENCHEURS.find((e) => e.type === x.type);
  if (!def) return undefined;
  if (def.type === 'anniversaire') return { type: 'anniversaire' };
  if (def.type === 'date') return jourValide(x.date) ? { type: 'date', date: x.date } : undefined;
  const n = def.nombre!;
  if (def.type === 'fin_pack') return { type: 'fin_pack', restantes: entier(x.restantes, n.min, n.max, n.defaut) };
  return { type: def.type, jours: entier(x.jours, n.min, n.max, n.defaut) } as Declencheur;
}

/** Réglages lus en base : tout ce qui est illisible retombe sur la valeur de départ. */
export function lireReglagesRelances(brut: unknown): ReglagesRelances {
  if (!brut || typeof brut !== 'object') return REGLAGES_RELANCES;
  const b = brut as Record<string, unknown>;
  const textes: ReglagesRelances['textes'] = {};
  if (b.textes && typeof b.textes === 'object')
    for (const [cle, t] of Object.entries(b.textes as Record<string, unknown>))
      if ((CLES_AUTO as string[]).includes(cle) && typeof t === 'string' && t.trim() && t.length <= MAX_TEXTE) textes[cle as ModeleAuto] = t;
  const coupees = Array.isArray(b.coupees) ? CLES_AUTO.filter((c) => (b.coupees as unknown[]).includes(c)) : [];
  const perso: RelancePerso[] = [];
  if (Array.isArray(b.perso))
    for (const p of b.perso.slice(0, MAX_PERSO)) {
      if (!p || typeof p !== 'object') continue;
      const x = p as Record<string, unknown>;
      const declencheur = lireDeclencheur(x.declencheur);
      if (typeof x.id !== 'string' || typeof x.nom !== 'string' || typeof x.texte !== 'string' || !declencheur) continue;
      const pour = PUBLICS.map((q) => q.cle).filter((q) => Array.isArray(x.pour) && x.pour.includes(q));
      perso.push({ id: x.id, nom: x.nom.slice(0, 80), texte: x.texte.slice(0, MAX_TEXTE), declencheur, pour: pour.length ? pour : ['clients'], active: x.active !== false });
    }
  const creees: Record<string, string> = {};
  if (b.creees && typeof b.creees === 'object')
    for (const [cle, jour] of Object.entries(b.creees as Record<string, unknown>)) if (jourValide(jour)) creees[cle] = jour;
  return { textes, coupees, perso, creees };
}

/** Le texte en service : celui du coach s'il l'a réécrit, sinon celui d'origine. */
export const texteDe = (r: Pick<ReglagesRelances, 'textes'>, m: ModeleAuto) => r.textes[m] ?? MODELES[m].texte;

/** Ce qui empêche d'enregistrer un texte, en clair ; null s'il est bon. */
export function erreurTexte(texte: string): string | null {
  if (!texte.trim()) return 'Écris le message.';
  if (texte.length > MAX_TEXTE) return `${MAX_TEXTE} caractères au plus.`;
  const inconnues = (texte.match(/\{[^}]*\}/g) ?? []).filter((v) => !VARIABLES.some((x) => x.code === v));
  if (inconnues.length) return `${inconnues[0]} n’est pas reconnu. Utilise les boutons pour insérer le prénom, la date ou le lien.`;
  return null;
}

export function erreurPerso(p: Pick<RelancePerso, 'nom' | 'texte' | 'declencheur' | 'pour'>): string | null {
  if (!p.nom.trim()) return 'Donne un nom à ta relance.';
  if (!p.pour.length) return 'Choisis pour qui.';
  if (p.declencheur.type === 'date' && !jourValide(p.declencheur.date)) return 'Indique la date (jj/mm/aaaa).';
  return erreurTexte(p.texte);
}

/** Remplace les variables ; une variable sans valeur disparaît proprement. */
export function remplir(texte: string, v: { prenom?: string; coach: string; quand?: string; lien?: string }): string {
  return texte
    .split('{prenom}').join(v.prenom || 'à toi')
    .split('{coach}').join(v.coach)
    .split('{quand}').join(v.quand ?? 'bientôt')
    .split('{lien}').join(v.lien ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Prospects, clients actifs, en veille ; un dossier archivé ne reçoit plus rien. */
export function publicDe(c: Pick<Contact, 'statut' | 'statutCrm'>): Public | null {
  if (c.statut === 'archive') return null;
  if (c.statutCrm === 'En veille') return 'veille';
  if (c.statut === 'client') return 'clients';
  return 'prospects';
}

/** Ce qu'on sait d'un dossier pour décider s'il faut le relancer. */
export interface Situation {
  contact: Pick<Contact, 'id' | 'prenom' | 'statut' | 'statutCrm' | 'dateNaissance'>;
  /** Jour de la dernière séance faite (programme). */
  derniereSeance?: string;
  /** Début des rendez-vous (ISO) non annulés. */
  rdvs?: string[];
  packs?: { id: string; restantes: number }[];
  /** Paiements « En attente » datés. */
  attentes?: { id: string; date: string }[];
}

export interface RelanceACreer {
  cle: string;
  persoId: string;
  contactId: string;
  titre: string;
  /** Le message prêt à partir. */
  note: string;
}

const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const dateLisible = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
const jourDe = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
/** Une occasion manquée de plus de 3 jours (appli pas ouverte) ne crée plus rien : le message n'aurait plus de sens. */
const RATTRAPAGE = 3;

/** Les occasions du jour : une par relance active, dossier et événement, jamais deux fois la même. */
export function relancesACreer(r: ReglagesRelances, situations: Situation[], jour: string, coach: string): RelanceACreer[] {
  const sortie: RelanceACreer[] = [];
  for (const p of r.perso) {
    if (!p.active) continue;
    for (const s of situations) {
      const qui = publicDe(s.contact);
      if (!qui || !p.pour.includes(qui)) continue;
      const occasions: { cle: string; quand?: string }[] = [];
      const d = p.declencheur;
      if (d.type === 'sans_seance' && s.derniereSeance && ecart(s.derniereSeance, jour) >= d.jours) occasions.push({ cle: s.derniereSeance });
      if (d.type === 'avant_rdv' || d.type === 'apres_rdv')
        for (const rdv of s.rdvs ?? []) {
          const n = ecart(jourDe(rdv), jour);
          const ok = d.type === 'avant_rdv' ? n <= 0 && n >= -d.jours : n >= d.jours && n <= d.jours + RATTRAPAGE;
          if (ok) occasions.push({ cle: rdv, quand: dateLisible(rdv) });
        }
      if (d.type === 'fin_pack') for (const k of s.packs ?? []) if (k.restantes <= d.restantes) occasions.push({ cle: `pack:${k.id}` });
      if (d.type === 'paiement_retard') for (const a of s.attentes ?? []) if (ecart(a.date, jour) >= d.jours) occasions.push({ cle: `paiement:${a.id}` });
      if (d.type === 'anniversaire' && s.contact.dateNaissance?.slice(5, 10) === jour.slice(5, 10)) occasions.push({ cle: jour.slice(0, 4) });
      if (d.type === 'date' && ecart(d.date, jour) >= 0 && ecart(d.date, jour) <= RATTRAPAGE) occasions.push({ cle: d.date });
      for (const o of occasions) {
        const cle = `${p.id}:${s.contact.id}:${o.cle}`;
        if (r.creees[cle] || sortie.some((x) => x.cle === cle)) continue;
        sortie.push({ cle, persoId: p.id, contactId: s.contact.id, titre: p.nom, note: remplir(p.texte, { prenom: s.contact.prenom, coach, quand: o.quand }) });
      }
    }
  }
  return sortie;
}

/** Garde la trace des créations d'un peu plus d'un an : assez pour l'anniversaire, sans grossir sans fin. */
export function noterCreees(r: ReglagesRelances, cles: string[], jour: string): ReglagesRelances {
  const limite = ajouterJours(jour, -400);
  const creees = Object.fromEntries(Object.entries(r.creees).filter(([, j]) => j >= limite));
  for (const c of cles) creees[c] = jour;
  return { ...r, creees };
}

/** Une relance du coach se reconnaît à son titre : modèle « libre » et titre, le message en note. */
export const estRelancePerso = (x: { modele: ModeleMessage; titre?: string }) => x.modele === 'libre' && !!x.titre;

/** « 7 jours sans séance », « La veille d'un RDV »… pour la liste. */
export function libelleDeclencheur(d: Declencheur): string {
  switch (d.type) {
    case 'sans_seance':
      return `${d.jours} jour${d.jours > 1 ? 's' : ''} sans séance`;
    case 'avant_rdv':
      return d.jours === 0 ? 'Le jour d’un RDV' : d.jours === 1 ? 'La veille d’un RDV' : `${d.jours} jours avant un RDV`;
    case 'apres_rdv':
      return d.jours === 0 ? 'Le jour d’un RDV, après' : d.jours === 1 ? 'Le lendemain d’un RDV' : `${d.jours} jours après un RDV`;
    case 'fin_pack':
      return d.restantes === 0 ? 'Pack terminé' : `Quand il reste ${d.restantes} séance${d.restantes > 1 ? 's' : ''} au pack`;
    case 'paiement_retard':
      return `Paiement en attente depuis ${d.jours} jour${d.jours > 1 ? 's' : ''}`;
    case 'anniversaire':
      return 'Le jour de son anniversaire';
    case 'date':
      return `Le ${d.date.split('-').reverse().join('/')}`;
  }
}
