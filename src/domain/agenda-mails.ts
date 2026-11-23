// Mails de l'agenda (invitation, relance, rappels, annulation, fin de pack, alerte au coach) et fichier .ics joint.
// La fonction Edge `agenda-mails` les envoie par Brevo. Ce fichier est aussi copié dans supabase/functions/_shared (Deno) :
// aucune dépendance, et un test vérifie que les deux copies sont identiques.

export type GenreMail = 'invitation' | 'modification' | 'relance' | 'rappel' | 'rappel_court' | 'annulation';

export interface InfosRdv {
  /** Identifiant stable du rendez-vous : le même événement est mis à jour dans l'agenda du client. */
  id: string;
  type: 'seance' | 'visio' | 'appel';
  debut: string;
  fin: string;
  lieu: string;
  lienVisio?: string;
  coach: string;
  /** Page de réponse : https://…/rdv/<jeton>. */
  lien: string;
  /** Autres personnes inscrites (duo). */
  avec?: string;
  delaiAnnulationHeures: number;
}

export interface ContenuMail {
  sujet: string;
  html: string;
  texte: string;
}

const NOMS_TYPE = { seance: 'Séance', visio: 'Séance en visio', appel: 'Appel' } as const;
const FUSEAU = 'Europe/Paris';

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** « mardi 3 novembre à 18 h 30 », à l'heure de Paris. */
export function dateLisible(iso: string) {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long' });
  const [h, m] = d.toLocaleTimeString('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' }).split(':');
  return `${jour} à ${Number(h)} h ${m === '00' ? '' : m}`.trim();
}

const horodatageIcs = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Texte d'un champ .ics : virgules, points-virgules et retours à la ligne échappés. */
const champIcs = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fichier .ics (Google, Apple, Outlook). annule : retire l'événement de l'agenda du client. */
export function fichierIcs(r: InfosRdv, options: { sequence: number; annule?: boolean; maintenant?: Date }) {
  const titre = `${NOMS_TYPE[r.type]} avec ${r.coach}`;
  const description = [r.lienVisio ? `Visio : ${r.lienVisio}` : '', `Répondre ou annuler : ${r.lien}`].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CoachGo//Agenda//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${options.annule ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${r.id}@coachgo`,
    `SEQUENCE:${options.sequence}`,
    `DTSTAMP:${horodatageIcs((options.maintenant ?? new Date()).toISOString())}`,
    `DTSTART:${horodatageIcs(r.debut)}`,
    `DTEND:${horodatageIcs(r.fin)}`,
    `SUMMARY:${champIcs(titre)}`,
    ...(r.lieu ? [`LOCATION:${champIcs(r.lieu)}`] : r.lienVisio ? [`LOCATION:${champIcs(r.lienVisio)}`] : []),
    `DESCRIPTION:${champIcs(description)}`,
    `STATUS:${options.annule ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Mail envoyé à une personne inscrite au rendez-vous. */
export function mailRendezVous(genre: GenreMail, prenom: string, r: InfosRdv): ContenuMail {
  const quand = dateLisible(r.debut);
  const quoi = `${NOMS_TYPE[r.type].toLowerCase()} avec ${r.coach}${r.avec ? ` (avec ${r.avec})` : ''}`;
  const ou = r.type === 'visio' && r.lienVisio ? `En visio : ${r.lienVisio}` : r.lieu ? `Lieu : ${r.lieu}` : '';
  const annulation = `Tu peux annuler en ligne jusqu’à ${r.delaiAnnulationHeures} h avant. Ensuite, appelle ${r.coach}.`;
  const contenus: Record<GenreMail, { sujet: string; lignes: string[]; bouton?: string }> = {
    invitation: {
      sujet: `Rendez-vous le ${quand}`,
      lignes: [`${r.coach} te propose une ${quoi} le ${quand}.`, ou, 'Confirme ta venue, ou dis-lui si tu ne peux pas. Le fichier joint l’ajoute à ton agenda.', annulation],
      bouton: 'Confirmer ou refuser',
    },
    modification: {
      sujet: `Nouvelle date : ${quand}`,
      lignes: [`Ta ${quoi} a changé d’horaire : elle a lieu le ${quand}.`, ou, 'Confirme la nouvelle date. Le fichier joint met à jour ton agenda.', annulation],
      bouton: 'Confirmer ou refuser',
    },
    relance: {
      sujet: `Tu viens le ${quand} ?`,
      lignes: [`${r.coach} attend ta réponse pour la ${quoi} du ${quand}.`, ou],
      bouton: 'Répondre',
    },
    rappel: {
      sujet: `Rappel : ${quand}`,
      lignes: [`Petit rappel : ${quoi} le ${quand}.`, ou, annulation],
      bouton: 'Voir le rendez-vous',
    },
    rappel_court: {
      sujet: `Tout à l’heure : ${quand}`,
      lignes: [`À tout à l’heure pour ta ${quoi}, le ${quand}.`, ou],
      bouton: r.type === 'visio' ? undefined : 'Voir le rendez-vous',
    },
    annulation: {
      sujet: `Rendez-vous annulé : ${quand}`,
      lignes: [`${r.coach} a annulé la ${quoi} prévue le ${quand}.`, 'Le fichier joint la retire de ton agenda. Ton coach te proposera un autre créneau.'],
    },
  };
  const c = contenus[genre];
  return composer(c.sujet, prenom, c.lignes.filter(Boolean), r.coach, c.bouton ? { libelle: c.bouton, url: r.lien } : undefined, genre === 'rappel_court' && r.lienVisio ? { libelle: 'Rejoindre la visio', url: r.lienVisio } : undefined);
}

/** Fin de pack : plus que quelques séances, pour inviter au renouvellement. */
export function mailFinDePack(prenom: string, coach: string, restantes: number): ContenuMail {
  const sujet = restantes ? `Plus que ${restantes} séance${restantes > 1 ? 's' : ''} sur ton pack` : 'Ton pack de séances est terminé';
  const lignes = [
    restantes
      ? `Il te reste ${restantes} séance${restantes > 1 ? 's' : ''} sur ton pack avec ${coach}.`
      : `Tu as fait toutes les séances de ton pack avec ${coach}, bravo !`,
    'Pour continuer sur ta lancée sans interruption, pense à renouveler ton pack : réponds simplement à ce mail ou parles-en à ta prochaine séance.',
  ];
  return composer(sujet, prenom, lignes, coach);
}

/** Alerte au coach : un client a refusé ou annulé. */
export function mailCoachPrevenu(coach: string, personnes: string, statut: 'refuse' | 'annule', debut: string): ContenuMail {
  const quand = dateLisible(debut);
  const sujet = `${personnes} ${statut === 'refuse' ? 'ne peut pas venir' : 'a annulé'} le ${quand}`;
  const lignes = [
    statut === 'refuse' ? `${personnes} a refusé le rendez-vous du ${quand}.` : `${personnes} a annulé en ligne le rendez-vous du ${quand}. Rien n’est décompté.`,
    'Le créneau est de nouveau libre dans ton agenda.',
  ];
  return composer(sujet, coach, lignes, 'CoachGo');
}

function composer(sujet: string, prenom: string, lignes: string[], signature: string, bouton?: { libelle: string; url: string }, second?: { libelle: string; url: string }): ContenuMail {
  const bonjour = prenom.trim() ? `Bonjour ${prenom.trim()},` : 'Bonjour,';
  const lienHtml = (b: { libelle: string; url: string }) =>
    `<p><a href="${echapper(b.url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#C3181E;color:#ffffff;text-decoration:none;font-weight:600">${echapper(b.libelle)}</a></p>`;
  const html = [
    `<p>${echapper(bonjour)}</p>`,
    ...lignes.map((l) => `<p>${echapper(l)}</p>`),
    ...(bouton ? [lienHtml(bouton)] : []),
    ...(second ? [lienHtml(second)] : []),
    `<p>À bientôt,<br>${echapper(signature)}</p>`,
  ].join('');
  const texte = [bonjour, ...lignes, ...(bouton ? [`${bouton.libelle} : ${bouton.url}`] : []), ...(second ? [`${second.libelle} : ${second.url}`] : []), `À bientôt,\n${signature}`].join('\n\n');
  return { sujet, html, texte };
}

/** Pièce jointe Brevo : contenu en base64 (UTF-8). */
export function base64(texte: string) {
  const octets = new TextEncoder().encode(texte);
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

/** Corps JSON de l'API transactionnelle Brevo. */
export function corpsBrevoAgenda(
  expediteur: { email: string; nom?: string },
  destinataire: { email: string; nom?: string },
  m: ContenuMail,
  options: { ics?: string; repondreA?: string; tag: string },
) {
  return {
    sender: { email: expediteur.email, ...(expediteur.nom ? { name: expediteur.nom } : {}) },
    to: [{ email: destinataire.email, ...(destinataire.nom ? { name: destinataire.nom } : {}) }],
    ...(options.repondreA ? { replyTo: { email: options.repondreA } } : {}),
    subject: m.sujet,
    htmlContent: m.html,
    textContent: m.texte,
    ...(options.ics ? { attachment: [{ content: base64(options.ics), name: 'rendez-vous.ics' }] } : {}),
    tags: ['agenda', options.tag],
  };
}
