// Lot 6 · Coachings, Tâches, Paiements et Bilans du CRM d'origine (CRMWorkspace.tsx, Champs-CRM.json, reports.ts,
// createCoachingFromBooster.ts, saveBilan.ts). Règles pures sur le carnet : les deux dépôts (démo, Supabase) les partagent.
import { jourLocal, type Carnet, type Contexte, type Relance } from './crm';

// ---------- Choix repris de Champs-CRM.json ----------

export const STATUTS_COACHING = ['À démarrer', 'Actif', 'En pause', 'Terminé', 'Abandonné'] as const;
export type StatutCoaching = (typeof STATUTS_COACHING)[number];
export const FORMULES = ['Essentiel', 'Premium'] as const;
export type Formule = (typeof FORMULES)[number];

export const PRIORITES_TACHE = ['Haute', 'Moyenne', 'Basse'] as const;
export type PrioriteTache = (typeof PRIORITES_TACHE)[number];
export const STATUTS_TACHE = ['À faire', 'En cours', 'Terminée', 'Annulée'] as const;
export type StatutTache = (typeof STATUTS_TACHE)[number];

/** « Stripe » n'est qu'un moyen déclaré : aucun encaissement n'est fait par l'app. */
export const MOYENS_PAIEMENT = ['Stripe', 'Carte bancaire', 'Espèces', 'Virement', 'Chèque'] as const;
export type MoyenPaiement = (typeof MOYENS_PAIEMENT)[number];
export const STATUTS_PAIEMENT = ['En attente', 'Payé', 'Remboursé', 'Annulé'] as const;
export type StatutPaiement = (typeof STATUTS_PAIEMENT)[number];

/** Les dix piliers de reports.ts, notés de 1 à 10 ou « Non évalué ». */
export const PILIERS = ['Activité physique', 'Force', 'Endurance', 'Mobilité', 'Posture', 'Sommeil', 'Stress', 'Alimentation', 'Récupération', 'Régularité'] as const;
export type Pilier = (typeof PILIERS)[number];

// ---------- Objets ----------

export interface Coaching {
  id: string;
  contactId: string;
  /** Booster d'origine : un seul coaching par Booster. */
  boosterId?: string;
  nom: string;
  /** AAAA-MM-JJ. */
  dateDebut?: string;
  dateFinPrevue?: string;
  statut?: StatutCoaching;
  /** L'offre choisie n'est pas un paiement. */
  formule?: Formule;
  objectif?: string;
  commentaires?: string;
  creeLe: string;
}

export interface Paiement {
  id: string;
  titre: string;
  contactId?: string;
  coachingId?: string;
  date?: string;
  /** Absent = non renseigné (jamais converti en 0). */
  montant?: number;
  devise: 'EUR';
  moyen?: MoyenPaiement;
  statut?: StatutPaiement;
  reference?: string;
  notes?: string;
  creeLe: string;
}

export interface BilanCoach {
  id: string;
  contactId: string;
  coachingId?: string;
  /** AAAA-MM-JJ. */
  date: string;
  poids?: number;
  taille?: number;
  tourTaille?: number;
  tourHanches?: number;
  /** null = Non évalué, distinct d'une note. */
  piliers: Partial<Record<Pilier, number | null>>;
  synthese: string;
  priorites: string[];
  /** PDF du bilan dans Documents (type Bilan) ; envoyé, le bilan n'est plus modifiable. */
  documentId?: string;
  creeLe: string;
  modifieLe: string;
}

/** Une tâche est une relance (les relances automatiques du parcours en sont aussi). */
export type Tache = Relance;

// ---------- Vérifications communes ----------

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
function jourValide(j: string | undefined, nom: string) {
  if (j === undefined) return;
  const d = new Date(j + 'T12:00:00Z');
  if (!JOUR.test(j) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== j) throw new Error(`${nom} : date invalide (AAAA-MM-JJ).`);
}
function contactExiste(c: Carnet, id: string | undefined, requis: boolean) {
  if (!id) {
    if (requis) throw new Error('Choisissez le contact.');
    return;
  }
  if (!c.contacts.some((x) => x.id === id)) throw new Error('Contact introuvable');
}
function coachingExiste(c: Carnet, id: string | undefined) {
  if (id && !c.coachings.some((x) => x.id === id)) throw new Error('Coaching introuvable');
}
const texte = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
const sans = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------- Coachings ----------

export type SaisieCoaching = Omit<Coaching, 'id' | 'creeLe'>;

function verifierCoaching(c: Carnet, s: SaisieCoaching) {
  if (!s.nom.trim()) throw new Error('Donnez un nom au coaching.');
  contactExiste(c, s.contactId, true);
  jourValide(s.dateDebut, 'Date de début');
  jourValide(s.dateFinPrevue, 'Date de fin prévue');
  if (s.dateDebut && s.dateFinPrevue && s.dateFinPrevue < s.dateDebut) throw new Error('La fin prévue précède le début.');
  if (s.boosterId && !c.boosters.some((b) => b.id === s.boosterId && b.contactId === s.contactId)) throw new Error('Booster d’origine hors de ce contact');
}

const propreCoaching = (s: SaisieCoaching): SaisieCoaching =>
  sans({ ...s, nom: s.nom.trim(), objectif: texte(s.objectif), commentaires: texte(s.commentaires) });

export function creerCoaching(c: Carnet, s: SaisieCoaching, ctx: Contexte): { carnet: Carnet; id: string } {
  verifierCoaching(c, s);
  if (s.boosterId && c.coachings.some((x) => x.boosterId === s.boosterId)) throw new Error('Ce Booster a déjà son coaching.');
  const id = ctx.nouvelId();
  return { carnet: { ...c, coachings: [...c.coachings, { ...propreCoaching(s), id, creeLe: ctx.maintenant.toISOString() }] }, id };
}

export function modifierCoaching(c: Carnet, id: string, s: SaisieCoaching): Carnet {
  const avant = c.coachings.find((x) => x.id === id);
  if (!avant) throw new Error('Coaching introuvable');
  verifierCoaching(c, s);
  if (s.boosterId && c.coachings.some((x) => x.id !== id && x.boosterId === s.boosterId)) throw new Error('Ce Booster a déjà son coaching.');
  return { ...c, coachings: c.coachings.map((x) => (x.id === id ? { ...propreCoaching(s), id, creeLe: avant.creeLe } : x)) };
}

/** Supprime le coaching seul : paiements, tâches et bilans restent, sans lien vers lui. */
export function supprimerCoaching(c: Carnet, id: string): Carnet {
  if (!c.coachings.some((x) => x.id === id)) throw new Error('Coaching introuvable');
  const delier = <T extends { coachingId?: string }>(l: T[]) => l.map((x) => (x.coachingId === id ? { ...x, coachingId: undefined } : x));
  return {
    ...c,
    coachings: c.coachings.filter((x) => x.id !== id),
    paiements: delier(c.paiements),
    relances: delier(c.relances),
    bilans: delier(c.bilans),
  };
}

/**
 * createCoachingFromBooster d'origine : sans doublon (le coaching existant est rendu), offre choisie obligatoire,
 * Booster « Vendu » et contact « Client actif ».
 */
export function coachingDepuisBooster(c: Carnet, boosterId: string, ctx: Contexte): { carnet: Carnet; id: string; existant: boolean } {
  const b = c.boosters.find((x) => x.id === boosterId);
  if (!b) throw new Error('Booster introuvable');
  const existant = c.coachings.find((x) => x.boosterId === boosterId);
  if (existant) return { carnet: c, id: existant.id, existant: true };
  if (!b.offreRecommandee || b.offreRecommandee === 'Aucune') throw new Error('Choisissez une offre dans le Booster');
  const contact = c.contacts.find((x) => x.id === b.contactId);
  if (!contact) throw new Error('Contact introuvable');
  const r = creerCoaching(
    c,
    {
      nom: `Coaching · ${`${contact.prenom} ${contact.nom}`.trim()}`,
      contactId: contact.id,
      boosterId: b.id,
      statut: 'À démarrer',
      formule: b.offreRecommandee.includes('Premium') ? 'Premium' : 'Essentiel',
      objectif: contact.objectifPrincipal || b.entretien?.projection || undefined,
    },
    ctx,
  );
  const carnet = {
    ...r.carnet,
    boosters: r.carnet.boosters.map((x) => (x.id === b.id ? { ...x, resultatCommercial: 'Vendu' } : x)),
    contacts: r.carnet.contacts.map((x) => (x.id === contact.id ? { ...x, statutCrm: 'Client actif' as const } : x)),
  };
  return { carnet, id: r.id, existant: false };
}

// ---------- Tâches ----------

export interface SaisieTache {
  titre: string;
  contactId: string;
  boosterId?: string;
  coachingId?: string;
  responsable?: string;
  echeance: string;
  priorite?: PrioriteTache;
  statut: StatutTache;
  notes?: string;
}

/** Statut affiché : celui choisi, sinon « Terminée » pour une relance faite et « À faire » sinon. */
export function statutTache(r: Pick<Relance, 'faiteLe' | 'statutTache'>): StatutTache {
  if (r.statutTache) return r.statutTache;
  return r.faiteLe ? 'Terminée' : 'À faire';
}
export const tacheOuverte = (r: Pick<Relance, 'faiteLe' | 'statutTache'>) => !['Terminée', 'Annulée'].includes(statutTache(r));

function verifierTache(c: Carnet, s: SaisieTache) {
  if (!s.titre.trim()) throw new Error('Donnez un titre à la tâche.');
  contactExiste(c, s.contactId, true);
  if (!s.echeance) throw new Error('Indiquez l’échéance.');
  jourValide(s.echeance, 'Échéance');
  coachingExiste(c, s.coachingId);
  if (s.boosterId && !c.boosters.some((b) => b.id === s.boosterId && b.contactId === s.contactId)) throw new Error('Booster hors de ce contact');
}

function appliquerTache(r: Relance, s: SaisieTache, ctx: Contexte): Relance {
  const ferme = s.statut === 'Terminée' || s.statut === 'Annulée';
  return sans({
    ...r,
    titre: s.titre.trim(),
    contactId: s.contactId,
    boosterId: s.boosterId,
    coachingId: s.coachingId,
    responsable: texte(s.responsable),
    echeance: s.echeance,
    priorite: s.priorite,
    statutTache: s.statut,
    note: texte(s.notes),
    // Fermée : sort de la journée du coach ; rouverte : y revient.
    faiteLe: ferme ? (r.faiteLe ?? ctx.maintenant.toISOString()) : undefined,
  });
}

export function creerTache(c: Carnet, s: SaisieTache, ctx: Contexte): { carnet: Carnet; id: string } {
  verifierTache(c, s);
  const id = ctx.nouvelId();
  const r = appliquerTache({ id, contactId: s.contactId, echeance: s.echeance, modele: 'tache' }, s, ctx);
  return { carnet: { ...c, relances: [...c.relances, r] }, id };
}

export function modifierTache(c: Carnet, id: string, s: SaisieTache, ctx: Contexte): Carnet {
  const avant = c.relances.find((x) => x.id === id);
  if (!avant) throw new Error('Tâche introuvable');
  verifierTache(c, s);
  return { ...c, relances: c.relances.map((x) => (x.id === id ? appliquerTache(avant, s, ctx) : x)) };
}

/** Bouton « Terminer » de la liste. */
export function terminerTache(c: Carnet, id: string, ctx: Contexte): Carnet {
  if (!c.relances.some((x) => x.id === id)) throw new Error('Tâche introuvable');
  return {
    ...c,
    relances: c.relances.map((x) => (x.id === id ? { ...x, statutTache: 'Terminée', faiteLe: x.faiteLe ?? ctx.maintenant.toISOString() } : x)),
  };
}

export function supprimerTache(c: Carnet, id: string): Carnet {
  if (!c.relances.some((x) => x.id === id)) throw new Error('Tâche introuvable');
  return { ...c, relances: c.relances.filter((x) => x.id !== id) };
}

/** Actions échues de la Vue d'ensemble : ouvertes, échéance aujourd'hui ou avant. */
export function tachesEchues(c: Carnet, maintenant: Date): Tache[] {
  const jour = jourLocal(maintenant);
  const actifs = new Set(c.contacts.filter((x) => x.statut !== 'archive').map((x) => x.id));
  return c.relances.filter((r) => actifs.has(r.contactId) && tacheOuverte(r) && r.echeance <= jour).sort((a, b) => a.echeance.localeCompare(b.echeance));
}

// ---------- Paiements ----------

export type SaisiePaiement = Omit<Paiement, 'id' | 'creeLe' | 'devise'>;

function verifierPaiement(c: Carnet, s: SaisiePaiement) {
  if (!s.titre.trim()) throw new Error('Donnez un titre au paiement.');
  contactExiste(c, s.contactId, false);
  coachingExiste(c, s.coachingId);
  if (s.coachingId && s.contactId && c.coachings.find((x) => x.id === s.coachingId)?.contactId !== s.contactId) throw new Error('Coaching hors de ce contact');
  jourValide(s.date, 'Date');
  if (s.montant !== undefined && (!Number.isFinite(s.montant) || s.montant < 0 || s.montant > 1_000_000)) throw new Error('Montant invalide.');
}

const proprePaiement = (s: SaisiePaiement) =>
  sans({ ...s, titre: s.titre.trim(), reference: texte(s.reference), notes: texte(s.notes), montant: s.montant === undefined ? undefined : Math.round(s.montant * 100) / 100 });

export function creerPaiement(c: Carnet, s: SaisiePaiement, ctx: Contexte): { carnet: Carnet; id: string } {
  verifierPaiement(c, s);
  const id = ctx.nouvelId();
  return { carnet: { ...c, paiements: [...c.paiements, { ...proprePaiement(s), id, devise: 'EUR', creeLe: ctx.maintenant.toISOString() }] }, id };
}

export function modifierPaiement(c: Carnet, id: string, s: SaisiePaiement): Carnet {
  const avant = c.paiements.find((x) => x.id === id);
  if (!avant) throw new Error('Paiement introuvable');
  verifierPaiement(c, s);
  return { ...c, paiements: c.paiements.map((x) => (x.id === id ? { ...proprePaiement(s), id, devise: avant.devise, creeLe: avant.creeLe } : x)) };
}

export function supprimerPaiement(c: Carnet, id: string): Carnet {
  if (!c.paiements.some((x) => x.id === id)) throw new Error('Paiement introuvable');
  return { ...c, paiements: c.paiements.filter((x) => x.id !== id) };
}

/** Encaissements ce mois : seuls les paiements « Payé » datés du mois en cours comptent. */
export function encaissementsDuMois(c: Carnet, maintenant: Date): number {
  const mois = jourLocal(maintenant).slice(0, 7);
  const actifs = new Set(c.contacts.filter((x) => x.statut !== 'archive').map((x) => x.id));
  return c.paiements
    .filter((p) => p.statut === 'Payé' && p.date?.slice(0, 7) === mois && (!p.contactId || actifs.has(p.contactId)))
    .reduce((s, p) => s + (p.montant ?? 0), 0);
}

export const montantLisible = (v: number | undefined) =>
  v === undefined ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

// ---------- Bilans ----------

export type SaisieBilan = Omit<BilanCoach, 'id' | 'creeLe' | 'modifieLe' | 'documentId'>;

function verifierBilan(c: Carnet, s: SaisieBilan) {
  contactExiste(c, s.contactId, true);
  coachingExiste(c, s.coachingId);
  jourValide(s.date, 'Date');
  for (const [cle, nom] of [
    ['poids', 'Poids'],
    ['taille', 'Taille'],
    ['tourTaille', 'Tour de taille'],
    ['tourHanches', 'Tour de hanches'],
  ] as const) {
    const v = s[cle];
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 500)) throw new Error(`${nom} : valeur entre 0 et 500.`);
  }
  for (const [p, v] of Object.entries(s.piliers)) {
    if (!(PILIERS as readonly string[]).includes(p)) throw new Error('Pilier inconnu');
    if (v !== null && v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 10)) throw new Error(`${p} : note de 1 à 10 ou Non évalué.`);
  }
  if (s.priorites.length > 3) throw new Error('Trois priorités au plus.');
}

const propreBilan = (s: SaisieBilan): SaisieBilan =>
  sans({
    ...s,
    synthese: s.synthese.trim(),
    // Non évalué reste null : jamais converti en zéro.
    piliers: Object.fromEntries(PILIERS.map((p) => [p, s.piliers[p] ?? null])),
    priorites: [0, 1, 2].map((i) => s.priorites[i]?.trim() ?? ''),
  });

export function creerBilan(c: Carnet, s: SaisieBilan, ctx: Contexte): { carnet: Carnet; id: string } {
  verifierBilan(c, s);
  const id = ctx.nouvelId();
  const t = ctx.maintenant.toISOString();
  return { carnet: { ...c, bilans: [...c.bilans, { ...propreBilan(s), id, creeLe: t, modifieLe: t }] }, id };
}

/** `envoye` : le PDF lié a déjà été envoyé ; on crée alors un nouveau bilan pour garder l'historique. */
export function modifierBilan(c: Carnet, id: string, s: SaisieBilan, ctx: Contexte, envoye = false): Carnet {
  const avant = c.bilans.find((x) => x.id === id);
  if (!avant) throw new Error('Bilan introuvable');
  if (envoye) throw new Error('Ce bilan a déjà été envoyé : créez un nouveau bilan pour conserver l’historique');
  if (avant.contactId !== s.contactId) throw new Error('Bilan hors de ce contact');
  verifierBilan(c, s);
  return {
    ...c,
    bilans: c.bilans.map((x) => (x.id === id ? { ...propreBilan(s), id, documentId: avant.documentId, creeLe: avant.creeLe, modifieLe: ctx.maintenant.toISOString() } : x)),
  };
}

export function lierDocumentBilan(c: Carnet, id: string, documentId: string): Carnet {
  if (!c.bilans.some((x) => x.id === id)) throw new Error('Bilan introuvable');
  return { ...c, bilans: c.bilans.map((x) => (x.id === id ? { ...x, documentId } : x)) };
}

export function supprimerBilan(c: Carnet, id: string): Carnet {
  if (!c.bilans.some((x) => x.id === id)) throw new Error('Bilan introuvable');
  return { ...c, bilans: c.bilans.filter((x) => x.id !== id) };
}

/** Écart avec le bilan précédent du même contact (« +1,2 kg depuis le bilan précédent »). */
export function ecartPrecedent(c: Pick<Carnet, 'bilans'>, b: BilanCoach, cle: 'poids' | 'tourTaille' | 'tourHanches'): number | null {
  const precedent = c.bilans
    .filter((x) => x.id !== b.id && x.contactId === b.contactId && x.date < b.date && x[cle] !== undefined)
    .sort((x, y) => y.date.localeCompare(x.date))[0];
  const v = b[cle];
  return v !== undefined && precedent ? Math.round((v - precedent[cle]!) * 10) / 10 : null;
}

/** Sections du PDF, dans l'ordre de saveBilan.ts. */
export function sectionsBilan(b: BilanCoach): { titre: string; texte: string }[] {
  const mesures = (
    [
      ['Poids', b.poids, 'kg'],
      ['Taille', b.taille, 'cm'],
      ['Tour de taille', b.tourTaille, 'cm'],
      ['Tour de hanches', b.tourHanches, 'cm'],
    ] as const
  )
    .filter((x) => x[1] !== undefined)
    .map((x) => `${x[0]} : ${String(x[1]).replace('.', ',')} ${x[2]}`)
    .join('\n');
  return [
    { titre: 'Mesures', texte: mesures },
    { titre: 'Les dix piliers', texte: PILIERS.map((p) => `${p} : ${b.piliers[p] == null ? 'Non évalué' : `${b.piliers[p]}/10`}`).join('\n') },
    { titre: 'Synthèse', texte: b.synthese },
    { titre: 'Priorités', texte: b.priorites.filter(Boolean).join('\n') },
  ].filter((s) => s.texte.trim());
}

const echapper = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * PDF du bilan : mêmes sections que saveBilan.ts, aux couleurs de l'app (le modèle vert de reports.ts n'est pas
 * une référence graphique, et le modèle Google Docs préféré de Sylvain n'est pas fourni).
 */
export function bilanHtml(b: BilanCoach, nom: string, options: { police?: string } = {}): string {
  const date = new Date(b.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const fontFace = options.police ? `@font-face{font-family:'Titre';src:url(data:font/ttf;base64,${options.police}) format('truetype')}` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${fontFace}
@page{size:A4;margin:18mm}body{font:12px/1.6 Helvetica,Arial,sans-serif;color:#262931;margin:0}
header{background:#16181d;color:#fff;padding:22px 24px;border-bottom:4px solid #c3181e}
.marque{font-size:11px;letter-spacing:3px;color:#f3f4f6}h1{font-family:'Titre',Impact,sans-serif;font-size:34px;letter-spacing:1px;margin:6px 0 0;text-transform:uppercase}
.date{color:#d1d5db}main{padding:8px 4px}section{margin:20px 0;break-inside:avoid}
h2{font-family:'Titre',Impact,sans-serif;font-size:18px;letter-spacing:1px;color:#c3181e;text-transform:uppercase;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}footer{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:10px;color:#6b7280}
</style></head><body><header><div class="marque">COACH OS · BILAN</div><h1>${echapper(nom)}</h1><div class="date">${echapper(date)}</div></header><main>
${sectionsBilan(b)
  .map((s) => `<section><h2>${echapper(s.titre)}</h2><p>${echapper(s.texte)}</p></section>`)
  .join('\n')}
<footer>Bilan de coaching sportif. Les observations reflètent les éléments recueillis à cette date.</footer></main></body></html>`;
}
