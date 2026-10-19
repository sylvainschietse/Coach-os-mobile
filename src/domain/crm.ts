// Accueil des clients : contacts, questionnaire d'accueil, séance Booster et relances.
// Fonctions pures : la démo et les tests les appellent directement, la base reprend les mêmes règles.

export type Statut = 'prospect' | 'booster_prevu' | 'booster_fait' | 'client' | 'archive';

export const STATUTS: Record<Statut, { libelle: string; couleur: 'gris' | 'bleu' | 'orange' | 'vert' | 'noir' }> = {
  prospect: { libelle: 'Prospect', couleur: 'gris' },
  booster_prevu: { libelle: 'Booster prévu', couleur: 'bleu' },
  booster_fait: { libelle: 'Booster fait', couleur: 'orange' },
  client: { libelle: 'Client', couleur: 'vert' },
  archive: { libelle: 'Archivé', couleur: 'noir' },
};

export interface Contact {
  id: string;
  prenom: string;
  nom: string;
  /** Numéro normalisé au format international sans « + » (336…), clé de rapprochement. */
  telephone?: string;
  email?: string;
  dateNaissance?: string;
  statut: Statut;
  /** Statut à retrouver si le contact est réactivé. */
  statutAvantArchive?: Statut;
  source?: string;
  notes?: string;
  /** Lien vers la fiche client (programmes, séances) une fois converti. */
  clientId?: string;
  creeLe: string;
}

export interface Questionnaire {
  id: string;
  contactId: string;
  recuLe: string;
  reponses: Record<string, string>;
  /** Ce qui n'a pas pu être rapproché automatiquement et que le coach doit vérifier. */
  alertes: string[];
}

export interface Booster {
  id: string;
  contactId: string;
  date: string;
  statut: 'prevu' | 'fait' | 'annule';
  tests?: string;
  compteRendu?: string;
  priorites: string[];
  paye?: boolean;
}

export type ModeleMessage = 'questionnaire' | 'booster' | 'rappel_booster' | 'suivi_booster' | 'libre';

export interface Relance {
  id: string;
  contactId: string;
  /** Jour prévu, AAAA-MM-JJ (heure locale). */
  echeance: string;
  modele: ModeleMessage;
  note?: string;
  faiteLe?: string;
  /** Close automatiquement parce que l'étape suivante est arrivée. */
  auto?: boolean;
}

export interface Carnet {
  contacts: Contact[];
  questionnaires: Questionnaire[];
  boosters: Booster[];
  relances: Relance[];
}

export interface Contexte {
  nouvelId: () => string;
  maintenant: Date;
}

export const CARNET_VIDE: Carnet = { contacts: [], questionnaires: [], boosters: [], relances: [] };

// ---------- Téléphone, e-mail, dates ----------

/** 06 12 34 56 78, +33 6…, 0033 6… → 33612345678. Undefined si ce n'est pas un numéro. */
export function normaliserTelephone(brut: string | undefined): string | undefined {
  if (!brut) return undefined;
  let chiffres = brut.replace(/[^\d+]/g, '');
  if (chiffres.startsWith('+')) chiffres = chiffres.slice(1);
  else if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  else if (chiffres.startsWith('0') && chiffres.length === 10) chiffres = `33${chiffres.slice(1)}`;
  chiffres = chiffres.replace(/\D/g, '');
  if (chiffres.startsWith('330')) chiffres = `33${chiffres.slice(3)}`;
  return chiffres.length >= 9 && chiffres.length <= 15 ? chiffres : undefined;
}

export function formaterTelephone(cle: string | undefined): string {
  if (!cle) return '';
  if (cle.startsWith('33') && cle.length === 11) return `0${cle.slice(2)}`.replace(/(\d{2})(?=\d)/g, '$1 ');
  return `+${cle}`;
}

export function normaliserEmail(brut: string | undefined): string | undefined {
  const e = brut?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

const deux = (n: number) => String(n).padStart(2, '0');
export const jourLocal = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return jourLocal(new Date(a, m - 1, j + n));
}

/** « 24/10 18:30 », « 24/10/2026 18h30 » → date ISO ; l'année manquante est la prochaine occurrence. */
export function lireDateHeure(texte: string, maintenant: Date): string | undefined {
  const m = texte.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s+(\d{1,2})\s*[:h]\s*(\d{2})?$/i);
  if (!m) return undefined;
  const [, j, mo, a, h, mi] = m;
  let annee = a ? Number(a.length === 2 ? `20${a}` : a) : maintenant.getFullYear();
  let d = new Date(annee, Number(mo) - 1, Number(j), Number(h), Number(mi ?? 0));
  if (!a && d.getTime() < maintenant.getTime() - 86_400_000) d = new Date(++annee, Number(mo) - 1, Number(j), Number(h), Number(mi ?? 0));
  if (d.getMonth() !== Number(mo) - 1 || Number(h) > 23 || Number(mi ?? 0) > 59) return undefined;
  return d.toISOString();
}

// ---------- Doublons ----------

export type Doublon = { contact: Contact; par: 'telephone' | 'email' };

/** Rapproche par téléphone normalisé, puis par e-mail. Jamais par le nom seul. */
export function trouverDoublon(contacts: Contact[], cherche: { telephone?: string; email?: string }): Doublon | null {
  const tel = normaliserTelephone(cherche.telephone);
  const email = normaliserEmail(cherche.email);
  // Les contacts actifs passent avant les archivés.
  const ordonnes = [...contacts].sort((a, b) => Number(a.statut === 'archive') - Number(b.statut === 'archive'));
  const parTel = tel ? ordonnes.find((c) => c.telephone === tel) : undefined;
  if (parTel) return { contact: parTel, par: 'telephone' };
  const parEmail = email ? ordonnes.find((c) => c.email === email) : undefined;
  return parEmail ? { contact: parEmail, par: 'email' } : null;
}

// ---------- Opérations sur le carnet ----------

const majContact = (c: Carnet, id: string, patch: Partial<Contact>): Carnet => ({
  ...c,
  contacts: c.contacts.map((x) => (x.id === id ? { ...x, ...patch } : x)),
});

/** Ferme les relances ouvertes d'un contact (toutes, ou seulement certains modèles). */
function fermerRelances(c: Carnet, contactId: string, ctx: Contexte, modeles?: ModeleMessage[]): Carnet {
  return {
    ...c,
    relances: c.relances.map((r) =>
      r.contactId === contactId && !r.faiteLe && (!modeles || modeles.includes(r.modele))
        ? { ...r, faiteLe: ctx.maintenant.toISOString(), auto: true }
        : r,
    ),
  };
}

function relancer(c: Carnet, contactId: string, modele: ModeleMessage, echeance: string, ctx: Contexte): Carnet {
  const dejaOuverte = c.relances.some((r) => r.contactId === contactId && r.modele === modele && !r.faiteLe);
  if (dejaOuverte) return c;
  return { ...c, relances: [...c.relances, { id: ctx.nouvelId(), contactId, echeance, modele }] };
}

export type ResultatCreation = { carnet: Carnet; contact: Contact } | { doublon: Doublon };

/** Création depuis l'appli par le coach : un téléphone suffit. */
export function creerContact(
  c: Carnet,
  saisie: { prenom: string; nom?: string; telephone?: string; email?: string; source?: string },
  ctx: Contexte,
): ResultatCreation {
  const doublon = trouverDoublon(c.contacts, saisie);
  if (doublon) return { doublon };
  const contact: Contact = {
    id: ctx.nouvelId(),
    prenom: saisie.prenom.trim(),
    nom: saisie.nom?.trim() ?? '',
    telephone: normaliserTelephone(saisie.telephone),
    email: normaliserEmail(saisie.email),
    source: saisie.source,
    statut: 'prospect',
    creeLe: ctx.maintenant.toISOString(),
  };
  const avec = { ...c, contacts: [...c.contacts, contact] };
  return { carnet: relancer(avec, contact.id, 'questionnaire', jourLocal(ctx.maintenant), ctx), contact };
}

/**
 * Réponses reçues par le questionnaire d'accueil (remplace Tally → Make → Airtable).
 * Rattache au contact existant (téléphone puis e-mail), complète sans écraser,
 * et signale au coach ce qui ne colle pas au lieu de fusionner à l'aveugle.
 */
export function recevoirQuestionnaire(c: Carnet, reponses: Record<string, string>, ctx: Contexte) {
  const telephone = normaliserTelephone(reponses.telephone);
  const email = normaliserEmail(reponses.email);
  const alertes: string[] = [];
  const parTel = telephone ? trouverDoublon(c.contacts, { telephone }) : null;
  const parEmail = email ? trouverDoublon(c.contacts, { email }) : null;
  let carnet = c;
  let contact = parTel?.contact ?? parEmail?.contact;

  if (parTel && parEmail && parTel.contact.id !== parEmail.contact.id) {
    const autre = parEmail.contact;
    alertes.push(`L’e-mail correspond aussi à la fiche de ${autre.prenom} ${autre.nom}`.trim() + '. À vérifier.');
  }

  if (!contact) {
    contact = {
      id: ctx.nouvelId(),
      prenom: reponses.prenom?.trim() ?? '',
      nom: reponses.nom?.trim() ?? '',
      telephone,
      email,
      dateNaissance: reponses.dateNaissance,
      source: reponses.source,
      statut: 'prospect',
      creeLe: ctx.maintenant.toISOString(),
    };
    carnet = { ...carnet, contacts: [...carnet.contacts, contact] };
  } else {
    const patch: Partial<Contact> = {};
    const completer = <K extends 'prenom' | 'nom' | 'telephone' | 'email' | 'dateNaissance' | 'source'>(
      cle: K,
      valeur: string | undefined,
      libelle: string,
    ) => {
      if (!valeur) return;
      const actuelle = contact![cle];
      if (!actuelle) patch[cle] = valeur;
      else if (String(actuelle).toLowerCase() !== valeur.toLowerCase()) {
        alertes.push(`${libelle} différent dans le questionnaire : ${valeur} (fiche : ${actuelle}).`);
      }
    };
    completer('prenom', reponses.prenom?.trim(), 'Prénom');
    completer('nom', reponses.nom?.trim(), 'Nom');
    completer('telephone', telephone, 'Téléphone');
    completer('email', email, 'E-mail');
    completer('dateNaissance', reponses.dateNaissance, 'Date de naissance');
    completer('source', reponses.source, 'Source');
    if (contact.statut === 'archive') {
      patch.statut = contact.statutAvantArchive ?? 'prospect';
      alertes.push('Ce contact était archivé : il a été réactivé par ses réponses.');
    }
    carnet = majContact(carnet, contact.id, patch);
    contact = { ...contact, ...patch };
  }

  const questionnaire: Questionnaire = {
    id: ctx.nouvelId(),
    contactId: contact.id,
    recuLe: ctx.maintenant.toISOString(),
    reponses,
    alertes,
  };
  carnet = { ...carnet, questionnaires: [...carnet.questionnaires, questionnaire] };
  carnet = fermerRelances(carnet, contact.id, ctx, ['questionnaire']);
  if (contact.statut === 'prospect') carnet = relancer(carnet, contact.id, 'booster', jourLocal(ctx.maintenant), ctx);
  return { carnet, contact, questionnaire };
}

export function planifierBooster(c: Carnet, contactId: string, date: string, ctx: Contexte): Carnet {
  let carnet: Carnet = {
    ...c,
    boosters: [...c.boosters, { id: ctx.nouvelId(), contactId, date, statut: 'prevu', priorites: [] }],
  };
  const contact = c.contacts.find((x) => x.id === contactId);
  if (contact && (contact.statut === 'prospect' || contact.statut === 'booster_fait')) {
    carnet = majContact(carnet, contactId, { statut: 'booster_prevu' });
  }
  carnet = fermerRelances(carnet, contactId, ctx, ['questionnaire', 'booster']);
  // Rappel la veille ; le jour même si le Booster est dans moins de 24 h.
  const veille = ajouterJours(jourLocal(new Date(date)), -1);
  const aujourdhui = jourLocal(ctx.maintenant);
  return relancer(carnet, contactId, 'rappel_booster', veille < aujourdhui ? aujourdhui : veille, ctx);
}

export function terminerBooster(
  c: Carnet,
  boosterId: string,
  compteRendu: { tests?: string; compteRendu?: string; priorites: string[]; paye?: boolean },
  ctx: Contexte,
): Carnet {
  const booster = c.boosters.find((b) => b.id === boosterId);
  if (!booster) return c;
  let carnet: Carnet = {
    ...c,
    boosters: c.boosters.map((b) =>
      b.id === boosterId ? { ...b, ...compteRendu, priorites: compteRendu.priorites.filter((p) => p.trim()), statut: 'fait' } : b,
    ),
  };
  const contact = c.contacts.find((x) => x.id === booster.contactId);
  if (contact && contact.statut !== 'client') {
    carnet = majContact(carnet, contact.id, { statut: 'booster_fait' });
    carnet = fermerRelances(carnet, contact.id, ctx, ['rappel_booster']);
    carnet = relancer(carnet, contact.id, 'suivi_booster', ajouterJours(jourLocal(ctx.maintenant), 2), ctx);
  }
  return carnet;
}

export function annulerBooster(c: Carnet, boosterId: string, ctx: Contexte): Carnet {
  const booster = c.boosters.find((b) => b.id === boosterId);
  if (!booster) return c;
  let carnet: Carnet = { ...c, boosters: c.boosters.map((b) => (b.id === boosterId ? { ...b, statut: 'annule' } : b)) };
  carnet = fermerRelances(carnet, booster.contactId, ctx, ['rappel_booster']);
  const contact = c.contacts.find((x) => x.id === booster.contactId);
  const autrePrevu = carnet.boosters.some((b) => b.contactId === booster.contactId && b.statut === 'prevu');
  if (contact?.statut === 'booster_prevu' && !autrePrevu) {
    carnet = majContact(carnet, contact.id, { statut: 'prospect' });
    carnet = relancer(carnet, contact.id, 'booster', jourLocal(ctx.maintenant), ctx);
  }
  return carnet;
}

export function ajouterRelance(c: Carnet, contactId: string, echeance: string, modele: ModeleMessage, note: string | undefined, ctx: Contexte): Carnet {
  return { ...c, relances: [...c.relances, { id: ctx.nouvelId(), contactId, echeance, modele, note: note?.trim() || undefined }] };
}

export function terminerRelance(c: Carnet, relanceId: string, ctx: Contexte): Carnet {
  return { ...c, relances: c.relances.map((r) => (r.id === relanceId ? { ...r, faiteLe: ctx.maintenant.toISOString() } : r)) };
}

export function reporterRelance(c: Carnet, relanceId: string, echeance: string): Carnet {
  return { ...c, relances: c.relances.map((r) => (r.id === relanceId ? { ...r, echeance } : r)) };
}

export function devenirClient(c: Carnet, contactId: string, clientId: string, ctx: Contexte): Carnet {
  return fermerRelances(majContact(c, contactId, { statut: 'client', clientId }), contactId, ctx);
}

export function archiver(c: Carnet, contactId: string, ctx: Contexte): Carnet {
  const contact = c.contacts.find((x) => x.id === contactId);
  if (!contact || contact.statut === 'archive') return c;
  return fermerRelances(majContact(c, contactId, { statut: 'archive', statutAvantArchive: contact.statut }), contactId, ctx);
}

export function reactiver(c: Carnet, contactId: string): Carnet {
  const contact = c.contacts.find((x) => x.id === contactId);
  if (!contact || contact.statut !== 'archive') return c;
  return majContact(c, contactId, { statut: contact.statutAvantArchive ?? 'prospect', statutAvantArchive: undefined });
}

export function modifierContact(c: Carnet, contactId: string, patch: Partial<Pick<Contact, 'prenom' | 'nom' | 'telephone' | 'email' | 'notes' | 'dateNaissance'>>) {
  const propre = { ...patch };
  if ('telephone' in patch) propre.telephone = normaliserTelephone(patch.telephone);
  if ('email' in patch) propre.email = normaliserEmail(patch.email);
  return majContact(c, contactId, propre);
}

// ---------- Lecture ----------

export interface RelanceAFaire extends Relance {
  contact: Contact;
  enRetard: boolean;
}

/** Ce que le coach doit faire aujourd'hui : relances échues ou du jour, les plus anciennes d'abord. */
export function relancesDuJour(c: Carnet, maintenant: Date): RelanceAFaire[] {
  const jour = jourLocal(maintenant);
  return c.relances
    .filter((r) => !r.faiteLe && r.echeance <= jour)
    .map((r) => ({ ...r, contact: c.contacts.find((x) => x.id === r.contactId)!, enRetard: r.echeance < jour }))
    .filter((r) => r.contact && r.contact.statut !== 'archive')
    .sort((a, b) => a.echeance.localeCompare(b.echeance));
}

export function boostersAVenir(c: Carnet, maintenant: Date, jours = 7) {
  const debut = maintenant.getTime() - 3 * 3600_000;
  const fin = maintenant.getTime() + jours * 86_400_000;
  return c.boosters
    .filter((b) => b.statut === 'prevu' && new Date(b.date).getTime() >= debut && new Date(b.date).getTime() <= fin)
    .map((b) => ({ ...b, contact: c.contacts.find((x) => x.id === b.contactId)! }))
    .filter((b) => b.contact)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface FicheContact {
  contact: Contact;
  questionnaires: Questionnaire[];
  boosters: Booster[];
  relances: Relance[];
}

export function fiche(c: Carnet, contactId: string): FicheContact | null {
  const contact = c.contacts.find((x) => x.id === contactId);
  if (!contact) return null;
  return {
    contact,
    questionnaires: c.questionnaires.filter((q) => q.contactId === contactId).sort((a, b) => b.recuLe.localeCompare(a.recuLe)),
    boosters: c.boosters.filter((b) => b.contactId === contactId).sort((a, b) => b.date.localeCompare(a.date)),
    relances: c.relances.filter((r) => r.contactId === contactId).sort((a, b) => a.echeance.localeCompare(b.echeance)),
  };
}

export interface ContactResume extends Contact {
  prochaineRelance?: string;
  prochainBooster?: string;
}

export function listeContacts(c: Carnet): ContactResume[] {
  return c.contacts
    .map((x) => ({
      ...x,
      prochaineRelance: c.relances.filter((r) => r.contactId === x.id && !r.faiteLe).map((r) => r.echeance).sort()[0],
      prochainBooster: c.boosters.filter((b) => b.contactId === x.id && b.statut === 'prevu').map((b) => b.date).sort()[0],
    }))
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
}

export function filtrerContacts(contacts: ContactResume[], recherche: string, statut?: Statut): ContactResume[] {
  const simple = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = simple(recherche).split(/\s+/).filter(Boolean);
  const chiffres = recherche.replace(/\D/g, '');
  return contacts.filter((x) => {
    if (statut ? x.statut !== statut : x.statut === 'archive') return false;
    if (!mots.length) return true;
    const texte = simple(`${x.prenom} ${x.nom} ${x.email ?? ''}`);
    const telTrouve =
      chiffres.length >= 4 && [x.telephone ?? '', formaterTelephone(x.telephone).replace(/\D/g, '')].some((t) => t.includes(chiffres));
    return telTrouve || mots.every((m) => texte.includes(m));
  });
}

// ---------- Messages ----------

export const MODELES: Record<ModeleMessage, { libelle: string; texte: string }> = {
  questionnaire: {
    libelle: 'Envoyer le questionnaire',
    texte: 'Bonjour {prenom}, c’est {coach}. Pour préparer notre première séance, peux-tu remplir ce court questionnaire ? {lien}',
  },
  booster: {
    libelle: 'Proposer une séance Booster',
    texte:
      'Bonjour {prenom}, merci pour tes réponses ! Je te propose une séance Booster pour faire le point et tester ton niveau. Quand es-tu disponible ?',
  },
  rappel_booster: {
    libelle: 'Rappel de la séance Booster',
    texte: 'Bonjour {prenom}, petit rappel : on se voit {quand} pour ta séance Booster. À bientôt !',
  },
  suivi_booster: {
    libelle: 'Suivi après le Booster',
    texte:
      'Bonjour {prenom}, merci pour la séance Booster ! Tu as tes 3 priorités pour avancer. Veux-tu qu’on en parle pour la suite de ton accompagnement ?',
  },
  libre: { libelle: 'Relance', texte: 'Bonjour {prenom}, ' },
};

export function rediger(
  modele: ModeleMessage,
  contact: Contact,
  infos: { coach: string; lienQuestionnaire?: string; booster?: string },
): string {
  const quand = infos.booster
    ? new Date(infos.booster).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'bientôt';
  return MODELES[modele].texte
    .replace('{prenom}', contact.prenom || 'à toi')
    .replace('{coach}', infos.coach)
    .replace('{lien}', infos.lienQuestionnaire ?? '')
    .replace('{quand}', quand)
    .trim();
}

export type Canal = 'sms' | 'whatsapp' | 'email' | 'appel';

/** Lien qui ouvre l'app de messagerie du téléphone avec le message prérempli. Aucun envoi payant. */
export function lienEnvoi(canal: Canal, contact: Contact, message: string, sujet = 'Coaching'): string | null {
  const m = encodeURIComponent(message);
  if (canal === 'email') return contact.email ? `mailto:${contact.email}?subject=${encodeURIComponent(sujet)}&body=${m}` : null;
  if (!contact.telephone) return null;
  if (canal === 'appel') return `tel:+${contact.telephone}`;
  if (canal === 'whatsapp') return `https://wa.me/${contact.telephone}?text=${m}`;
  return `sms:+${contact.telephone}?body=${m}`;
}
