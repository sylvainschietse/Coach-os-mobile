// Parcours et historique d'un contact : étapes du prospect au client (avec les étapes sautées), journal des changements
// et des notes du coach, et la ligne de résumé du dossier. Règles pures, sans écran ni base.
import { statutContact, type Carnet, type Contact, type ContactResume, type Contexte, type EvenementContact, type StatutContact } from './crm';

/** Le chemin principal, dans l'ordre. « En réflexion » est facultative : elle n'est jamais comptée comme sautée. */
export const PARCOURS: readonly StatutContact[] = ['Nouveau Prospect', 'Booster planifié', 'Booster réalisé', 'Client actif'];
const RANG: Partial<Record<StatutContact, number>> = {
  'Nouveau Prospect': 0,
  'Booster planifié': 1,
  'Booster réalisé': 2,
  'En réflexion': 2.5,
  'Client actif': 3,
};

/** Étapes de la rangée de l'onglet Prospects, avec leur libellé court. Les dernières n'apparaissent que si elles servent. */
export const ETAPES_PROSPECTS: { etape: StatutContact; libelle: string; toujours: boolean }[] = [
  { etape: 'Nouveau Prospect', libelle: 'Nouveaux', toujours: true },
  { etape: 'Booster planifié', libelle: 'Booster prévu', toujours: true },
  { etape: 'Booster réalisé', libelle: 'Booster fait', toujours: true },
  { etape: 'En réflexion', libelle: 'Réflexion', toujours: true },
  { etape: 'A relancer', libelle: 'À relancer', toujours: false },
  { etape: 'En veille', libelle: 'En veille', toujours: false },
  { etape: 'Perdu', libelle: 'Perdus', toujours: false },
  { etape: 'Coaching terminé', libelle: 'Terminés', toujours: false },
];

/** Ce que le coach peut choisir dans « Changer d'étape » : le parcours, puis « Mettre de côté ». */
export function etapesProposees(c: Pick<Contact, 'statut' | 'clientId'>): { parcours: StatutContact[]; deCote: StatutContact[] } {
  if (c.statut === 'client') return { parcours: ['Client actif', 'Coaching terminé'], deCote: ['En veille'] };
  return { parcours: ['Nouveau Prospect', 'Booster planifié', 'Booster réalisé', 'En réflexion', 'Client actif'], deCote: ['A relancer', 'En veille', 'Perdu'] };
}

/** Les étapes du chemin principal entre deux étapes, quand on avance de plus d'une case. */
export function etapesSautees(depuis: StatutContact | undefined, vers: StatutContact): StatutContact[] {
  const a = depuis === undefined ? undefined : RANG[depuis];
  const b = RANG[vers];
  if (a === undefined || b === undefined || b <= a) return [];
  return PARCOURS.filter((e) => RANG[e]! > a && RANG[e]! < b);
}

/** L'étape d'après sur le chemin principal (bouton rouge de la carte), ou rien pour un dossier mis de côté ou client. */
export function etapeApres(etape: StatutContact): StatutContact | undefined {
  if (etape === 'En réflexion') return 'Client actif';
  const i = PARCOURS.indexOf(etape);
  return i >= 0 && i < PARCOURS.length - 1 ? PARCOURS[i + 1] : undefined;
}

/** Le statut à enregistrer : vide quand l'étape choisie est déjà celle du parcours (le statut redevient automatique). */
export function statutPourEtape(c: Pick<Contact, 'statut' | 'statutAvantArchive'>, vers: StatutContact): StatutContact | undefined {
  // « Client actif » doit rester explicite : c'est lui qui ouvre l'espace client (voir data/crm.ts, confirmerClient).
  if (vers === 'Client actif') return c.statut === 'client' ? undefined : vers;
  return statutContact({ ...c, statutCrm: undefined }) === vers ? undefined : vers;
}

/** Nombre de dossiers par étape dans la rangée de l'onglet Prospects (sans les clients ni les archivés). */
export function compterEtapes(contacts: Pick<ContactResume, 'statut' | 'statutAvantArchive' | 'statutCrm'>[]) {
  const n = new Map<StatutContact, number>();
  for (const c of contacts) {
    if (c.statut === 'client' || c.statut === 'archive') continue;
    const e = statutContact(c);
    n.set(e, (n.get(e) ?? 0) + 1);
  }
  return n;
}

/**
 * Ajoute au journal chaque changement d'étape fait entre deux états du carnet, quelle que soit l'action
 * (Booster planifié ou terminé, statut choisi à la main, passage en client…). Un contact créé n'a pas de ligne :
 * son arrivée est lue sur sa date de création.
 */
export function journaliserEtapes(avant: Carnet, apres: Carnet, ctx: Contexte): Carnet {
  const anciens = new Map(avant.contacts.map((c) => [c.id, c]));
  const ajouts: EvenementContact[] = [];
  for (const c of apres.contacts) {
    const ancien = anciens.get(c.id);
    if (!ancien || ancien === c) continue;
    const depuis = statutContact(ancien);
    const vers = statutContact(c);
    if (depuis === vers) continue;
    const sautees = etapesSautees(depuis, vers);
    ajouts.push({
      id: ctx.nouvelId(),
      contactId: c.id,
      quand: ctx.maintenant.toISOString(),
      type: 'etape',
      depuis,
      vers,
      ...(sautees.length ? { sautees } : {}),
    });
  }
  return ajouts.length ? { ...apres, journal: [...(apres.journal ?? []), ...ajouts] } : apres;
}

export function ajouterNote(c: Carnet, contactId: string, texte: string, ctx: Contexte): Carnet {
  const propre = texte.trim();
  if (!propre) throw new Error('Écris d’abord ta note.');
  if (!c.contacts.some((x) => x.id === contactId)) throw new Error('Contact introuvable');
  return { ...c, journal: [...c.journal, { id: ctx.nouvelId(), contactId, quand: ctx.maintenant.toISOString(), type: 'note', texte: propre }] };
}

export function supprimerNote(c: Carnet, id: string): Carnet {
  return { ...c, journal: c.journal.filter((e) => !(e.id === id && e.type === 'note')) };
}

// ---------- Historique ----------

export type CategorieHistorique = 'parcours' | 'paiements' | 'bilans' | 'notes';
export const CATEGORIES_HISTORIQUE: { cle: CategorieHistorique | 'tout'; libelle: string }[] = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'parcours', libelle: 'Parcours' },
  { cle: 'paiements', libelle: 'Paiements' },
  { cle: 'bilans', libelle: 'Bilans' },
  { cle: 'notes', libelle: 'Notes' },
];

export interface LigneHistorique {
  id: string;
  /** Date ISO ou AAAA-MM-JJ : de quoi trier et afficher le jour. */
  quand: string;
  categorie: CategorieHistorique;
  titre: string;
  detail?: string;
  /** Étape passée sans avoir été faite. */
  sautee?: boolean;
  /** Passage en client : mis en avant. */
  fort?: boolean;
  /** Note du coach : elle peut être supprimée. */
  noteId?: string;
}

const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const AFFICHAGE: Partial<Record<StatutContact, string>> = { 'Nouveau Prospect': 'Nouveau prospect', 'A relancer': 'À relancer' };
export const libelleEtape = (e: StatutContact) => AFFICHAGE[e] ?? e;
/** Midi pour une date sans heure : elle reste le même jour d'un fuseau à l'autre, et passe après les événements datés du matin. */
const cle = (quand: string) => (quand.length === 10 ? `${quand}T12:00:00` : quand);

/** Tout ce qui s'est passé pour ce contact, du plus récent au plus ancien. */
export function historique(c: Carnet, contactId: string): LigneHistorique[] {
  const contact = c.contacts.find((x) => x.id === contactId);
  if (!contact) return [];
  const lignes: LigneHistorique[] = [
    {
      id: `arrivee-${contact.id}`,
      quand: contact.creeLe,
      categorie: 'parcours',
      titre: contact.source ? `Arrivée · ${contact.source}` : 'Arrivée dans tes contacts',
    },
  ];
  for (const q of c.questionnaires.filter((x) => x.contactId === contactId)) {
    lignes.push({ id: `questionnaire-${q.id}`, quand: q.recuLe, categorie: 'parcours', titre: 'Questionnaire reçu' });
  }
  for (const b of c.boosters.filter((x) => x.contactId === contactId)) {
    if (b.statut === 'fait')
      lignes.push({ id: `booster-${b.id}`, quand: b.date, categorie: 'parcours', titre: 'Séance Booster', detail: b.planEnvoyeLe ? 'Compte rendu envoyé' : undefined });
    else if (b.statut === 'annule') lignes.push({ id: `booster-${b.id}`, quand: b.date, categorie: 'parcours', titre: 'Booster annulé' });
  }
  for (const e of c.journal.filter((x) => x.contactId === contactId)) {
    if (e.type === 'note' && e.texte) {
      lignes.push({ id: e.id, quand: e.quand, categorie: 'notes', titre: e.texte, noteId: e.id });
      continue;
    }
    if (e.type !== 'etape' || !e.vers) continue;
    // Les étapes sautées juste avant, dans l'ordre du parcours, à la même date (affichées sous le passage).
    (e.sautees ?? []).forEach((s, i) =>
      lignes.push({ id: `${e.id}-saute-${i}`, quand: e.quand, categorie: 'parcours', titre: libelleEtape(s), sautee: true }),
    );
    lignes.push({
      id: e.id,
      quand: e.quand,
      categorie: 'parcours',
      titre: e.vers === 'Client actif' ? 'Passage en client' : `Passé en « ${libelleEtape(e.vers)} »`,
      detail: e.depuis ? `Avant : ${libelleEtape(e.depuis)}` : undefined,
      fort: e.vers === 'Client actif',
    });
  }
  for (const x of c.coachings.filter((y) => y.contactId === contactId && y.dateDebut)) {
    lignes.push({ id: `coaching-${x.id}`, quand: x.dateDebut!, categorie: 'parcours', titre: `Coaching démarré · ${x.nom}`, detail: x.formule });
  }
  for (const p of c.paiements.filter((y) => y.contactId === contactId && y.statut === 'Payé')) {
    lignes.push({
      id: `paiement-${p.id}`,
      quand: p.date ?? p.creeLe,
      categorie: 'paiements',
      titre: p.montant !== undefined ? `Paiement reçu · ${euros(p.montant)}` : 'Paiement reçu',
      detail: [p.titre, p.moyen].filter(Boolean).join(' · ') || undefined,
    });
  }
  for (const b of c.bilans.filter((y) => y.contactId === contactId)) {
    lignes.push({ id: `bilan-${b.id}`, quand: b.date, categorie: 'bilans', titre: 'Bilan', detail: b.synthese ? b.synthese.slice(0, 90) : undefined });
  }
  // Du plus récent au plus ancien ; à la même heure, le passage d'étape passe avant ses étapes sautées.
  return lignes
    .map((l, i) => ({ l, i }))
    .sort((a, b) => cle(b.l.quand).localeCompare(cle(a.l.quand)) || b.i - a.i)
    .map((x) => x.l);
}

export function filtrerHistorique(lignes: LigneHistorique[], categorie: CategorieHistorique | 'tout') {
  return categorie === 'tout' ? lignes : lignes.filter((l) => l.categorie === categorie);
}

/** Regroupe par mois (« novembre 2026 ») en gardant l'ordre. */
export function parMois(lignes: LigneHistorique[]): { mois: string; lignes: LigneHistorique[] }[] {
  const groupes: { mois: string; lignes: LigneHistorique[] }[] = [];
  for (const l of lignes) {
    const mois = new Date(cle(l.quand)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const dernier = groupes[groupes.length - 1];
    if (dernier?.mois === mois) dernier.lignes.push(l);
    else groupes.push({ mois, lignes: [l] });
  }
  return groupes;
}

/** « 4 jours », « 3 semaines », « 5 mois », « 1 an ». */
export function duree(depuis: string, maintenant: Date): string {
  const jours = Math.max(0, Math.floor((maintenant.getTime() - new Date(cle(depuis)).getTime()) / 86_400_000));
  if (jours < 1) return 'aujourd’hui';
  if (jours < 14) return `${jours} jour${jours > 1 ? 's' : ''}`;
  if (jours < 60) return `${Math.floor(jours / 7)} semaines`;
  // Mois du calendrier : du 27 août au 27 novembre, 3 mois.
  const d = new Date(cle(depuis));
  const mois = (maintenant.getFullYear() - d.getFullYear()) * 12 + maintenant.getMonth() - d.getMonth() - (maintenant.getDate() < d.getDate() ? 1 : 0);
  if (mois < 12) return `${Math.max(mois, 2)} mois`;
  const ans = Math.floor(mois / 12);
  return `${ans} an${ans > 1 ? 's' : ''}`;
}

/**
 * La ligne sous le nom du dossier : « Client depuis 3 mois · Instagram », « Prospect depuis 4 jours · Google ».
 * Le passage en client est lu dans le journal, sinon le début du premier coaching, sinon la date d'arrivée.
 */
export function resumeParcours(c: Carnet, contactId: string, maintenant: Date): string | null {
  const contact = c.contacts.find((x) => x.id === contactId);
  if (!contact) return null;
  const origine = contact.source ? ` · ${contact.source}` : '';
  if (contact.statut === 'client') {
    const passage = c.journal
      .filter((e) => e.contactId === contactId && e.type === 'etape' && e.vers === 'Client actif')
      .map((e) => e.quand)
      .sort()
      .pop();
    const coaching = c.coachings
      .filter((x) => x.contactId === contactId && x.dateDebut)
      .map((x) => x.dateDebut!)
      .sort()[0];
    const depuis = passage ?? coaching;
    return depuis ? `Client depuis ${duree(depuis, maintenant)}${origine}` : `Client${origine}`;
  }
  const etape = statutContact(contact);
  return `${libelleEtape(etape)} · contact depuis ${duree(contact.creeLe, maintenant)}${origine}`;
}
