// Textes des automatisations (validés par le coach le 23/11/2026). Aucune dépendance : testable tel quel.
import { euros } from './facture-pdf.ts';

export interface Mail {
  sujet: string;
  html: string;
  texte: string;
}

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dateFr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Même habillage que les mails d'agenda : Bonjour, paragraphes, bouton rouge, signature. */
export function composer(sujet: string, prenom: string, lignes: string[], signature: string, bouton?: { libelle: string; url: string }): Mail {
  const bonjour = prenom.trim() ? `Bonjour ${prenom.trim()},` : 'Bonjour,';
  const html = [
    `<p>${echapper(bonjour)}</p>`,
    ...lignes.map((l) => `<p>${echapper(l).replace(/\n/g, '<br>')}</p>`),
    ...(bouton ? [`<p><a href="${echapper(bouton.url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#C3181E;color:#ffffff;text-decoration:none;font-weight:600">${echapper(bouton.libelle)}</a></p>`] : []),
    `<p>À bientôt,<br>${echapper(signature)}</p>`,
  ].join('');
  const texte = [bonjour, ...lignes, ...(bouton ? [`${bouton.libelle} : ${bouton.url}`] : []), `À bientôt,\n${signature}`].join('\n\n');
  return { sujet, html, texte };
}

type F = { numero: string; date: string; total: number | string };

export function mailRelanceFacture(etape: 1 | 2, prenom: string, coach: string, f: F, avecAppli: boolean, lien: string): Mail {
  const deja = avecAppli
    ? 'Si tu as déjà fait le virement, touche « J’ai payé » dans l’appli et je le note, rien d’autre à faire.'
    : 'Si tu as déjà fait le virement, réponds simplement à ce mail et je le note, rien d’autre à faire.';
  const bouton = avecAppli ? { libelle: 'Voir ma facture', url: lien } : undefined;
  if (etape === 1)
    return composer(`Ta facture ${f.numero} de ${euros(f.total)}`, prenom, [
      `Petit rappel : ta facture ${f.numero} du ${dateFr(f.date)} (${euros(f.total)}) n’est pas encore réglée. Tu la trouveras en pièce jointe.`,
      deja,
    ], coach, bouton);
  return composer(`Facture ${f.numero} toujours en attente`, prenom, [
    `Ta facture ${f.numero} de ${euros(f.total)} est toujours en attente (en pièce jointe). Pour que tes séances continuent sans souci, peux-tu la régler cette semaine ?`,
    'Un imprévu ? Réponds simplement à ce mail, on trouvera une solution ensemble.',
  ], coach, bouton);
}

export const notifRelanceFacture = (f: F) => ({ titre: `Ta facture ${f.numero} est en attente`, corps: `${euros(f.total)} · touche pour la voir` });
export const notifCoachFacture = (prenom: string, f: F, jours: number) => ({ titre: `${prenom} n’a pas réglé sa facture`, corps: `${f.numero}, ${euros(f.total)}, depuis ${jours} jours. Un petit appel ?` });

export function mailStripe(etape: 0 | 3 | 7 | 14, prenom: string, coach: string, montant: number, lien: string | null): Mail {
  const bouton = lien ? { libelle: 'Mettre à jour ma carte', url: lien } : undefined;
  const textes: Record<typeof etape, [string, string[]]> = {
    0: ['Ton paiement n’est pas passé', [`Le prélèvement de ton abonnement (${euros(montant)}) n’a pas fonctionné. Ça arrive souvent avec une carte expirée ou un plafond atteint.`, 'Tu peux mettre ta carte à jour en une minute ici :']],
    3: ['Petit rappel : mets à jour ta carte', [`Le prélèvement de ton abonnement (${euros(montant)}) n’est toujours pas passé.`, 'Une minute suffit pour mettre ta carte à jour :']],
    7: ['Ton abonnement est en attente de paiement', [`Le prélèvement de ton abonnement (${euros(montant)}) n’est toujours pas passé. Sans paiement, ton accès à l’appli risque d’être suspendu.`, 'Mets ta carte à jour ici :']],
    14: ['Dernier rappel pour ton abonnement', [`Le prélèvement de ton abonnement (${euros(montant)}) n’a toujours pas fonctionné. C’est mon dernier rappel automatique.`, 'Un souci ? Réponds simplement à ce mail, on trouvera une solution ensemble.']],
  };
  const [sujet, lignes] = textes[etape];
  return composer(sujet, prenom, lignes, coach, bouton);
}

export function mailBienvenue(prenom: string, coach: string, lien: string): Mail {
  return composer(`Bienvenue, ${prenom} !`, prenom, [
    'C’est parti pour ce suivi ensemble. Pour bien démarrer :',
    '1. Ouvre l’appli et complète ton profil.\n2. Regarde ta première séance dans « Ma semaine ».\n3. Une question ? Écris-moi directement dans la messagerie.',
  ], coach, { libelle: 'Ouvrir l’appli', url: lien });
}
export const notifBienvenueJ2 = { titre: 'Ta première séance t’attend', corps: 'Elle est prête dans « Ma semaine ». Dis-moi comment ça s’est passé !' };
export const notifBienvenueJ7 = { titre: 'Une semaine déjà !', corps: 'Comment tu te sens ? Prends 2 minutes pour remplir ton premier bilan.' };

const NOMS_TYPE: Record<string, string> = { seance: 'Séance', visio: 'Séance en visio', appel: 'Appel' };
export const heureFr = (iso: string) => {
  const [h, m] = new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).split(':');
  return `${Number(h)} h${m === '00' ? '' : ` ${m}`}`;
};
export function notifVeille(r: { type: string; debut: string; lieu?: string | null; lien_visio?: string | null }, coach: string) {
  const ou = r.lieu?.trim() ? r.lieu.trim() : r.lien_visio || r.type === 'visio' ? 'en visio' : '';
  return { titre: `${NOMS_TYPE[r.type] ?? 'Rendez-vous'} demain à ${heureFr(r.debut)}`, corps: `Avec ${coach}${ou ? `, ${ou}` : ''}. Touche pour confirmer ou déplacer.` };
}

// ---------- Rapport hebdo ----------
export interface Rapport {
  debut: string;
  fin: string;
  actifs: number;
  nouveaux: string[];
  inactifs: string[];
  rdv_prevus: number;
  rdv_faits: number;
  rdv_annules: number;
  seances_prevues: number;
  seances_faites: number;
  rdv_a_venir: { debut: string; qui: string | null; type: string }[];
  encaisse: number | string;
  encaisse_avant: number | string;
  a_regler: { prenom: string; numero: string; total: number | string; jours: number; signale: boolean }[];
}

const jourMois = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const quand = (iso: string) => `${new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric' })} à ${heureFr(iso)}`;
const liste = (t: string[]) => (t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} et ${t.at(-1)}`);

export function mailRapport(r: Rapport, coach: string, lien: string): Mail {
  const enc = Number(r.encaisse);
  const avant = Number(r.encaisse_avant);
  const retard = r.a_regler.filter((x) => x.jours >= 7);
  const attente = r.a_regler.filter((x) => x.jours < 7);
  const sommeRetard = retard.reduce((s, x) => s + Number(x.total), 0);
  const sections: [string, string[]][] = [
    ['Clients', [`${r.actifs} actifs, ${r.nouveaux.length ? `${r.nouveaux.length} nouveau${r.nouveaux.length > 1 ? 'x' : ''} (${liste(r.nouveaux)})` : 'aucun nouveau'}.`,
      r.inactifs.length ? `Sans activité depuis 14 jours : ${liste(r.inactifs)}.` : 'Personne sans activité depuis 14 jours.']],
    ['Rendez-vous', [`${r.rdv_prevus} prévus, ${r.rdv_faits} faits, ${r.rdv_annules} annulé${r.rdv_annules > 1 ? 's' : ''}.`]],
    ['Séances dans l’appli', [r.seances_prevues || r.seances_faites ? `${r.seances_prevues} prévues, ${r.seances_faites} faites.` : 'Pas de donnée cette semaine.']],
    ['Cette semaine', r.rdv_a_venir.length ? r.rdv_a_venir.map((x) => `${quand(x.debut)} : ${x.qui ?? 'client'}`) : ['Aucun rendez-vous prévu pour l’instant.']],
    ['Argent', [`${euros(enc)} encaissés (${euros(avant)} la semaine d’avant).`,
      retard.length ? `En retard : ${retard.map((x) => `${x.prenom} ${euros(x.total)} (${x.numero}, ${x.jours} j${x.signale ? ', virement signalé' : ''})`).join(', ')}.` : 'Aucune facture en retard.',
      ...(attente.length ? [`En attente : ${attente.map((x) => `${x.prenom} ${euros(x.total)}`).join(', ')}.`] : [])]],
  ];
  const idees: string[] = [];
  if (retard.length) idees.push(`Relancer ${liste(retard.map((x) => x.prenom))} pour ${euros(sommeRetard)}.`);
  if (r.rdv_a_venir.length < 3) idees.push('Caler les rendez-vous de la semaine : l’agenda est presque vide.');
  if (r.inactifs.length) idees.push(`Prendre des nouvelles de ${liste(r.inactifs.slice(0, 3))}${r.inactifs.length > 3 ? ` (et ${r.inactifs.length - 3} autres)` : ''}.`);
  if (r.nouveaux.length) idees.push(`Faire un point avec ${liste(r.nouveaux)}, arrivé${r.nouveaux.length > 1 ? 's' : ''} la semaine dernière.`);
  if (!idees.length) idees.push('Tout est à jour : profites-en pour préparer les programmes du mois.');
  const titre = `Ta semaine du ${jourMois(r.debut)} au ${jourMois(r.fin)}`;
  const html = [
    `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px">`,
    `<h1 style="font-size:22px;margin:0 0 18px">${echapper(titre)}</h1>`,
    ...sections.map(([t, l]) => `<p style="margin:0 0 14px"><strong style="color:#C3181E">${echapper(t)}</strong><br>${l.map(echapper).join('<br>')}</p>`),
    `<p style="margin:20px 0 6px"><strong>3 idées pour la semaine</strong></p><ol style="margin:0 0 18px;padding-left:20px">${idees.slice(0, 3).map((i) => `<li style="margin:0 0 6px">${echapper(i)}</li>`).join('')}</ol>`,
    `<p><a href="${echapper(lien)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#C3181E;color:#ffffff;text-decoration:none;font-weight:600">Ouvrir Coach Os</a></p>`,
    `<p style="font-size:12px;color:#777">Chiffres calculés dans ta base lundi matin. Ce rapport n’est envoyé qu’à toi.</p></div>`,
  ].join('');
  const texte = [titre, ...sections.map(([t, l]) => `${t.toUpperCase()}\n${l.join('\n')}`), `3 IDÉES POUR LA SEMAINE\n${idees.slice(0, 3).map((i, n) => `${n + 1}. ${i}`).join('\n')}`, `Ouvrir Coach Os : ${lien}`].join('\n\n');
  return { sujet: titre, html, texte };
}
