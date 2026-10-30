// Accueil des clients : contacts, questionnaire d'accueil, séance Booster et relances.
// Fonctions pures : la démo et les tests les appellent directement, la base reprend les mêmes règles.

import { syntheseEvaluation, type Evaluation } from './evaluation';
import type { BilanCoach, Coaching, Paiement, PrioriteTache, StatutTache } from './gestion';
import type { Redaction } from './redaction';

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
  /** Statut choisi par le coach ; absent, il suit l'étape du parcours (voir statutContact). */
  statutCrm?: StatutContact;
  objectifPrincipal?: string;
  prochaineAction?: string;
  offreVendue?: string;
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
  /** Synthèse texte de l'évaluation (format du compte rendu), recalculée à chaque enregistrement. */
  tests?: string;
  compteRendu?: string;
  priorites: string[];
  paye?: boolean;
  evaluation?: Evaluation;
  /** Réponses de l'entretien, par identifiant de ENTRETIEN. */
  entretien?: Record<string, string>;
  /** Date du dernier envoi du compte rendu au client. */
  planEnvoyeLe?: string;
  /** Textes développés du compte rendu, une fois rédigés (IA) ou retouchés par le coach. */
  redaction?: Redaction;
  nom?: string;
  /** Statut choisi parmi les statuts ouverts (À préparer, Questionnaire reçu, En cours) ; voir statutBooster. */
  statutCrm?: StatutBooster;
  resumeIa?: string;
  pointsAttention?: string;
  offreRecommandee?: string;
  resultatCommercial?: string;
  /** AAAA-MM-JJ. */
  dateRelance?: string;
  /** Réservées au coach : jamais dans le compte rendu. */
  notesInternes?: string;
}

export type SaisieBooster = Partial<
  Pick<
    Booster,
    | 'evaluation'
    | 'entretien'
    | 'priorites'
    | 'paye'
    | 'compteRendu'
    | 'planEnvoyeLe'
    | 'redaction'
    | 'nom'
    | 'date'
    | 'resumeIa'
    | 'pointsAttention'
    | 'offreRecommandee'
    | 'resultatCommercial'
    | 'dateRelance'
    | 'notesInternes'
  >
>;

/** « tache » : une chose à faire pour ce contact, sans message à envoyer (le texte est dans la note). */
export type ModeleMessage = 'questionnaire' | 'booster' | 'rappel_booster' | 'suivi_booster' | 'libre' | 'tache';

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
  // Champs de la table Tâches d'origine (lot 6) : une relance est une tâche.
  titre?: string;
  boosterId?: string;
  coachingId?: string;
  responsable?: string;
  priorite?: PrioriteTache;
  /** Absent : « Terminée » si faite, sinon « À faire » (voir statutTache). */
  statutTache?: StatutTache;
}

export interface Carnet {
  contacts: Contact[];
  questionnaires: Questionnaire[];
  boosters: Booster[];
  relances: Relance[];
  coachings: Coaching[];
  paiements: Paiement[];
  bilans: BilanCoach[];
}

export interface Contexte {
  nouvelId: () => string;
  maintenant: Date;
}

export const CARNET_VIDE: Carnet = { contacts: [], questionnaires: [], boosters: [], relances: [], coachings: [], paiements: [], bilans: [] };

/** Carnet enregistré avant le lot 6 : les nouvelles collections partent vides. */
export const completerCarnet = (c: Partial<Carnet>): Carnet => ({ ...CARNET_VIDE, ...c });

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
  const m = texte.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:\s+(\d{1,2})\s*[:h]\s*(\d{2})?)?$/i);
  if (!m) return undefined;
  // Sans heure, midi : la date ne bouge pas d'un fuseau à l'autre.
  const [, j, mo, a, h = '12', mi] = m;
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

// ---------- Choix repris de la configuration d'origine (Champs-CRM.json) ----------

export const STATUTS_CONTACT = [
  'Nouveau Prospect',
  'Booster planifié',
  'Booster réalisé',
  'En réflexion',
  'Client actif',
  'Coaching terminé',
  'A relancer',
  'Perdu',
] as const;
export type StatutContact = (typeof STATUTS_CONTACT)[number];
export const OBJECTIFS = ['Perte de poids', 'Prise de masse', 'Remise en forme', 'Santé', 'Préparation physique', 'Performance', 'Autre', 'Prendre du muscle', 'Perdre du poids', 'Retrouver la forme'];
export const PROCHAINES_ACTIONS = ['Appeler', 'Planifier booster', 'Envoyer lien stripe', 'Envoyer questionnaire', 'Créer programme', 'Relancer', 'Attendre retour', 'Aucune'];
export const ORIGINES = ['Booster', 'Bouche à Oreille', 'Ancien client', 'Demande en direct', 'Recommandation', 'Autre'];
export const OFFRES_VENDUES = ['Séance Coaching', 'Formule Essentielle', 'Formule premium', 'Suivi Nutritionnel', 'Analyse vidéo'];

export const STATUTS_BOOSTER = ['À préparer', 'Questionnaire reçu', 'En cours', 'Terminée', 'Annulée'] as const;
export type StatutBooster = (typeof STATUTS_BOOSTER)[number];
/** Offres de CoachGo (voir domain/abonnements.ts). */
export const OFFRES_RECOMMANDEES = [
  'Appli – 59 €/mois',
  'Appli + nutrition – 99 €/mois',
  'Séance à l’unité – 60 €',
  'Pack 10 séances + 1 offerte – 600 €',
  'Aucune',
];
export const RESULTATS_COMMERCIAUX = ['Vendu', 'En réflexion', 'À relancer', 'Refus'];

const STATUT_DE_L_ETAPE: Record<Exclude<Statut, 'archive'>, StatutContact> = {
  prospect: 'Nouveau Prospect',
  booster_prevu: 'Booster planifié',
  booster_fait: 'Booster réalisé',
  client: 'Client actif',
};

/**
 * Statut affiché du contact : celui choisi par le coach, sinon celui de l'étape du parcours.
 * L'archivage est à part (comme « Gestion du dossier » d'origine) : un contact archivé garde son statut.
 */
export function statutContact(c: Pick<Contact, 'statut' | 'statutAvantArchive' | 'statutCrm'>): StatutContact {
  if (c.statutCrm) return c.statutCrm;
  const etape = c.statut === 'archive' ? (c.statutAvantArchive ?? 'prospect') : c.statut;
  return STATUT_DE_L_ETAPE[etape === 'archive' ? 'prospect' : etape];
}

export function statutBooster(b: Pick<Booster, 'statut' | 'statutCrm'>): StatutBooster {
  if (b.statut === 'fait') return 'Terminée';
  if (b.statut === 'annule') return 'Annulée';
  return b.statutCrm && b.statutCrm !== 'Terminée' && b.statutCrm !== 'Annulée' ? b.statutCrm : 'À préparer';
}

/** Nom d'origine d'un Booster (« Booster · Prénom Nom »), proposé à la création. */
export const nomBooster = (c: Pick<Contact, 'prenom' | 'nom'>) => `Booster · ${`${c.prenom} ${c.nom}`.trim()}`;

/** Les 3 priorités gardent leur place : la priorité 2 peut être remplie sans la 1. */
export const troisPriorites = (p: string[] | undefined) => [0, 1, 2].map((i) => p?.[i] ?? '');

export type ResultatCreation = { carnet: Carnet; contact: Contact } | { doublon: Doublon };

/** Création depuis l'appli par le coach : un téléphone suffit. */
export function creerContact(
  c: Carnet,
  saisie: { prenom: string; nom?: string; telephone?: string; email?: string; source?: string } & SaisieContactFiche,
  ctx: Contexte,
): ResultatCreation {
  const doublon = trouverDoublon(c.contacts, saisie);
  if (doublon) return { doublon };
  if (saisie.telephone?.trim() && !normaliserTelephone(saisie.telephone)) throw new Error('Numéro de téléphone non reconnu.');
  if (saisie.email?.trim() && !normaliserEmail(saisie.email)) throw new Error('Adresse e-mail non reconnue.');
  if (!normaliserTelephone(saisie.telephone) && !normaliserEmail(saisie.email)) throw new Error('Indique au moins un téléphone ou un e-mail.');
  const propre = (v: string | undefined) => v?.trim() || undefined;
  const contact: Contact = {
    id: ctx.nouvelId(),
    prenom: saisie.prenom.trim(),
    nom: saisie.nom?.trim() ?? '',
    telephone: normaliserTelephone(saisie.telephone),
    email: normaliserEmail(saisie.email),
    source: propre(saisie.source),
    statut: 'prospect',
    creeLe: ctx.maintenant.toISOString(),
    statutCrm: saisie.statutCrm,
    objectifPrincipal: propre(saisie.objectifPrincipal),
    prochaineAction: propre(saisie.prochaineAction),
    offreVendue: propre(saisie.offreVendue),
    notes: propre(saisie.notes),
    dateNaissance: propre(saisie.dateNaissance),
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

export function planifierBooster(c: Carnet, contactId: string, date: string, ctx: Contexte, extra: SaisieBooster & { id?: string } = {}): Carnet {
  const contact = c.contacts.find((x) => x.id === contactId);
  const { id, ...champs } = extra;
  let carnet: Carnet = {
    ...c,
    boosters: [
      ...c.boosters,
      { nom: contact ? nomBooster(contact) : undefined, ...champs, id: id ?? ctx.nouvelId(), contactId, date, statut: 'prevu', priorites: troisPriorites(champs.priorites) },
    ],
  };
  if (contact && (contact.statut === 'prospect' || contact.statut === 'booster_fait')) {
    carnet = majContact(carnet, contactId, { statut: 'booster_prevu', statutCrm: undefined });
  }
  carnet = fermerRelances(carnet, contactId, ctx, ['questionnaire', 'booster']);
  // Rappel la veille ; le jour même si le Booster est dans moins de 24 h.
  const veille = ajouterJours(jourLocal(new Date(date)), -1);
  const aujourdhui = jourLocal(ctx.maintenant);
  return relancer(carnet, contactId, 'rappel_booster', veille < aujourdhui ? aujourdhui : veille, ctx);
}

/** Enregistre ce qui a été saisi pendant la séance, sans la clore (le coach peut y revenir). */
export function enregistrerBooster(c: Carnet, boosterId: string, saisie: SaisieBooster): Carnet {
  return {
    ...c,
    boosters: c.boosters.map((b) => {
      if (b.id !== boosterId) return b;
      const suite = { ...b, ...saisie };
      return suite.evaluation ? { ...suite, tests: syntheseEvaluation(suite.evaluation) } : suite;
    }),
  };
}

export function terminerBooster(
  c: Carnet,
  boosterId: string,
  compteRendu: SaisieBooster & { tests?: string; priorites: string[] },
  ctx: Contexte,
): Carnet {
  const booster = c.boosters.find((b) => b.id === boosterId);
  if (!booster) return c;
  let carnet = enregistrerBooster(c, boosterId, { ...compteRendu, priorites: troisPriorites(compteRendu.priorites.map((p) => p.trim())) });
  if (compteRendu.tests !== undefined && !compteRendu.evaluation) {
    carnet = { ...carnet, boosters: carnet.boosters.map((b) => (b.id === boosterId ? { ...b, tests: compteRendu.tests } : b)) };
  }
  carnet = { ...carnet, boosters: carnet.boosters.map((b) => (b.id === boosterId ? { ...b, statut: 'fait', statutCrm: undefined } : b)) };
  const contact = c.contacts.find((x) => x.id === booster.contactId);
  if (contact && contact.statut !== 'client' && contact.statut !== 'archive' && booster.statut !== 'fait') {
    carnet = majContact(carnet, contact.id, { statut: 'booster_fait', statutCrm: undefined });
    carnet = fermerRelances(carnet, contact.id, ctx, ['rappel_booster']);
    carnet = relancer(carnet, contact.id, 'suivi_booster', ajouterJours(jourLocal(ctx.maintenant), 2), ctx);
  }
  return carnet;
}

export function annulerBooster(c: Carnet, boosterId: string, ctx: Contexte): Carnet {
  const booster = c.boosters.find((b) => b.id === boosterId);
  if (!booster) return c;
  const carnet: Carnet = { ...c, boosters: c.boosters.map((b) => (b.id === boosterId ? { ...b, statut: 'annule', statutCrm: undefined } : b)) };
  return apresRetraitBooster(carnet, booster, ctx);
}

/** Un Booster prévu disparaît (annulé ou supprimé) : rappel fermé, contact revenu à l'étape d'avant. */
function apresRetraitBooster(c: Carnet, booster: Booster, ctx: Contexte): Carnet {
  if (booster.statut !== 'prevu') return c;
  let carnet = fermerRelances(c, booster.contactId, ctx, ['rappel_booster']);
  const contact = c.contacts.find((x) => x.id === booster.contactId);
  const autrePrevu = carnet.boosters.some((b) => b.contactId === booster.contactId && b.statut === 'prevu');
  if (contact?.statut === 'booster_prevu' && !autrePrevu) {
    carnet = majContact(carnet, contact.id, { statut: 'prospect', statutCrm: undefined });
    carnet = relancer(carnet, contact.id, 'booster', jourLocal(ctx.maintenant), ctx);
  }
  return carnet;
}

/**
 * Supprime un Booster saisi par erreur. Le contact, ses autres Boosters, questionnaires et relances restent.
 */
export function supprimerBooster(c: Carnet, boosterId: string, ctx: Contexte): Carnet {
  const booster = c.boosters.find((b) => b.id === boosterId);
  if (!booster) return c;
  return apresRetraitBooster({ ...c, boosters: c.boosters.filter((b) => b.id !== boosterId) }, booster, ctx);
}

export type SaisieFicheBooster = SaisieBooster & { statutCrm?: StatutBooster };

/**
 * Enregistrement de l'éditeur Booster (Préparation, Entretien, Tests, Conclusion).
 * Choisir « Terminée » ou « Annulée » fait avancer le parcours comme les boutons dédiés ;
 * revenir à un statut ouvert rouvre le Booster sans toucher au contact.
 */
export function modifierBooster(c: Carnet, boosterId: string, saisie: SaisieFicheBooster, ctx: Contexte): Carnet {
  const booster = c.boosters.find((b) => b.id === boosterId);
  if (!booster) return c;
  const { statutCrm, ...champs } = saisie;
  if (champs.priorites) champs.priorites = troisPriorites(champs.priorites.map((p) => p.trim()));
  let carnet = enregistrerBooster(c, boosterId, champs);
  if (!statutCrm || statutCrm === statutBooster(booster)) return carnet;
  if (statutCrm === 'Terminée') {
    const apres = carnet.boosters.find((b) => b.id === boosterId)!;
    return terminerBooster(carnet, boosterId, { priorites: apres.priorites }, ctx);
  }
  if (statutCrm === 'Annulée') return annulerBooster(carnet, boosterId, ctx);
  carnet = { ...carnet, boosters: carnet.boosters.map((b) => (b.id === boosterId ? { ...b, statut: 'prevu', statutCrm } : b)) };
  return carnet;
}

/** « Nouveau Booster » : un contact et une date suffisent, le reste se complète ensuite. */
export function creerBooster(c: Carnet, contactId: string, saisie: SaisieFicheBooster & { date: string }, ctx: Contexte): { carnet: Carnet; id: string } {
  if (!c.contacts.some((x) => x.id === contactId)) throw new Error('Choisis le contact de ce Booster.');
  if (!saisie.date || Number.isNaN(new Date(saisie.date).getTime())) throw new Error('Indique la date et l’heure du Booster.');
  const id = ctx.nouvelId();
  const { statutCrm, ...champs } = saisie;
  let carnet = planifierBooster(c, contactId, saisie.date, ctx, { ...champs, id });
  if (statutCrm && statutCrm !== 'À préparer') carnet = modifierBooster(carnet, id, { statutCrm }, ctx);
  return { carnet, id };
}

export function ajouterRelance(c: Carnet, contactId: string, echeance: string, modele: ModeleMessage, note: string | undefined, ctx: Contexte): Carnet {
  if (modele === 'tache' && !note?.trim()) throw new Error('Écris ce qu’il y a à faire.');
  return { ...c, relances: [...c.relances, { id: ctx.nouvelId(), contactId, echeance, modele, note: note?.trim() || undefined }] };
}

export function terminerRelance(c: Carnet, relanceId: string, ctx: Contexte): Carnet {
  return { ...c, relances: c.relances.map((r) => (r.id === relanceId ? { ...r, faiteLe: ctx.maintenant.toISOString() } : r)) };
}

export function reporterRelance(c: Carnet, relanceId: string, echeance: string): Carnet {
  return { ...c, relances: c.relances.map((r) => (r.id === relanceId ? { ...r, echeance } : r)) };
}

export function devenirClient(c: Carnet, contactId: string, clientId: string, ctx: Contexte): Carnet {
  return fermerRelances(majContact(c, contactId, { statut: 'client', clientId, statutCrm: undefined }), contactId, ctx);
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

export type SaisieContactFiche = Partial<
  Pick<Contact, 'prenom' | 'nom' | 'telephone' | 'email' | 'notes' | 'dateNaissance' | 'source' | 'statutCrm' | 'objectifPrincipal' | 'prochaineAction' | 'offreVendue'>
>;

export function modifierContact(c: Carnet, contactId: string, patch: SaisieContactFiche) {
  const propre = { ...patch };
  for (const cle of Object.keys(propre) as (keyof SaisieContactFiche)[]) {
    if (typeof propre[cle] === 'string' && cle !== 'statutCrm') (propre as Record<string, string | undefined>)[cle] = (propre[cle] as string).trim() || undefined;
  }
  if ('prenom' in patch) propre.prenom = patch.prenom?.trim() ?? '';
  if ('nom' in patch) propre.nom = patch.nom?.trim() ?? '';
  if ('statutCrm' in patch) propre.statutCrm = patch.statutCrm || undefined;
  if ('telephone' in patch && patch.telephone?.trim() && !normaliserTelephone(patch.telephone)) throw new Error('Numéro de téléphone non reconnu.');
  if ('email' in patch && patch.email?.trim() && !normaliserEmail(patch.email)) throw new Error('Adresse e-mail non reconnue.');
  const doublon = trouverDoublon(
    c.contacts.filter((x) => x.id !== contactId),
    { telephone: 'telephone' in patch ? patch.telephone : undefined, email: 'email' in patch ? patch.email : undefined },
  );
  if (doublon) {
    const qui = `${doublon.contact.prenom} ${doublon.contact.nom}`.trim() || 'un autre contact';
    throw new Error(`${doublon.par === 'telephone' ? 'Ce numéro' : 'Cet e-mail'} est déjà celui de ${qui}. Rien n’a été fusionné.`);
  }
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

export type BoosterDossier = Booster & { contact: Contact };

/** Rubrique Boosters : tous les Boosters, le plus récent d'abord, avec leur contact. */
export function listeBoosters(c: Carnet): BoosterDossier[] {
  return c.boosters
    .map((b) => ({ ...b, contact: c.contacts.find((x) => x.id === b.contactId)! }))
    .filter((b) => b.contact)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function filtrerBoosters(
  boosters: BoosterDossier[],
  recherche: string,
  options: { statut?: StatutBooster; contactId?: string; archives?: boolean } = {},
): BoosterDossier[] {
  const simple = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = simple(recherche.trim());
  return boosters.filter(
    (b) =>
      (options.archives || b.contact.statut !== 'archive') &&
      (!options.contactId || b.contactId === options.contactId) &&
      (!options.statut || statutBooster(b) === options.statut) &&
      (!q || simple(`${b.nom ?? ''} ${b.contact.prenom} ${b.contact.nom} ${b.contact.email ?? ''}`).includes(q)),
  );
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

export function filtrerContacts(
  contacts: ContactResume[],
  recherche: string,
  statut?: StatutContact,
  options: { archives?: boolean } = {},
): ContactResume[] {
  const simple = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = simple(recherche).split(/\s+/).filter(Boolean);
  const chiffres = recherche.replace(/\D/g, '');
  return contacts.filter((x) => {
    if (!options.archives && x.statut === 'archive') return false;
    if (statut && statutContact(x) !== statut) return false;
    if (!mots.length) return true;
    const texte = simple(`${x.prenom} ${x.nom} ${x.email ?? ''} ${x.objectifPrincipal ?? ''}`);
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
  tache: { libelle: 'Tâche', texte: '' },
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

// ---------- Saisie des dates dans les éditeurs ----------

/** « 30/10/2026 » → « 2026-10-30 » ; undefined si la date n'existe pas. */
export function lireJour(texte: string): string | undefined {
  const m = texte.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return undefined;
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(a, mo - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return undefined;
  return jourLocal(d);
}

/** « 2026-10-30 » → « 30/10/2026 ». */
export const ecrireJour = (jour: string | undefined) => (jour ? jour.split('-').reverse().join('/') : '');

/** Date ISO → « 24/10/2026 » (date locale, sans l'heure), relisible par lireDateHeure. */
export function ecrireDateHeure(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ---------- Accès du client à son espace ----------

/**
 * Message d'origine « Envoyer l'accès client » : le client se connecte avec l'e-mail donné au coach
 * (Google, Microsoft ou son propre mot de passe), et son compte est relié à sa fiche par cet e-mail.
 */
export function messageAccesClient(prenom: string, coach: string, lienAppli: string, lienTuto?: string): string {
  return [
    `Salut${prenom ? ` ${prenom}` : ''} ! Voici le lien pour accéder à ton espace CoachGo : ${lienAppli}`,
    '',
    'Connecte-toi avec l’adresse email que tu m’as communiquée. Tu pourras y retrouver ton programme et enregistrer tes séances.',
    '',
    'Tu peux aussi ajouter le lien à l’écran d’accueil de ton téléphone pour y accéder facilement.',
    '',
    ...(lienTuto ? [`Pour bien démarrer, regarde la vidéo (1 min 30) : ${lienTuto}`, ''] : []),
    `À bientôt, ${coach}`,
  ].join('\n');
}

/**
 * Lien WhatsApp « Envoyer l'accès client », seulement quand l'accès est prêt (fiche client avec e-mail),
 * le dossier actif et le numéro valide. Ouvrir ce lien ne prouve pas que le message est parti.
 */
export function lienAccesWhatsApp(contact: Contact, coach: string, lienAppli: string, lienTuto?: string): string | null {
  if (!contact.clientId || !contact.email || contact.statut === 'archive' || !contact.telephone) return null;
  return lienEnvoi('whatsapp', contact, messageAccesClient(contact.prenom, coach, lienAppli, lienTuto));
}
