// Newsletters (Mon profil › Mes newsletters) : le coach écrit une nouvelle pour ses clients actifs, ses clients en veille
// ou les deux, choisit l'envoi par e-mail, par notification ou les deux, et l'heure. Le serveur l'envoie tout seul à
// l'heure dite (fonction Edge `envoyer-newsletters`, appelée toutes les 15 minutes).
// Règles pures, sans écran ni base. Ce fichier est aussi copié dans supabase/functions/_shared (Deno) : aucune
// dépendance, et un test vérifie que les deux copies sont identiques.

export type Cible = 'clients' | 'veille';
export const CIBLES: { cle: Cible; libelle: string }[] = [
  { cle: 'clients', libelle: 'Clients actifs' },
  { cle: 'veille', libelle: 'En veille' },
];

export type EtatNewsletter = 'brouillon' | 'programmee' | 'en_cours' | 'envoyee';

export interface Newsletter {
  id: string;
  /** Surtitre, en petites capitales rouges au-dessus du titre (« Le conseil du mois »). */
  rubrique: string;
  /** Grand titre de l'article, et objet de l'e-mail. */
  objet: string;
  /** Deux lignes d'introduction sous le titre. */
  chapeau: string;
  message: string;
  /** Illustration : thème d'origine (« theme:saison ») ou photo du coach, rangée dans le stockage. */
  image?: string;
  boutonLibelle?: string;
  boutonLien?: string;
  cibles: Cible[];
  parEmail: boolean;
  parNotif: boolean;
  /** Heure d'envoi (ISO) ; absente : brouillon sans date. */
  envoiLe?: string;
  etat: EtatNewsletter;
  envoyeeLe?: string;
  nbEmails: number;
  nbNotifs: number;
  creeLe: string;
}

export const MAX_OBJET = 150;
export const MAX_MESSAGE = 15000;
export const MAX_RUBRIQUE = 60;
export const MAX_CHAPEAU = 400;

/** Ce qu'on peut glisser dans le message ; remplacé pour chaque personne au moment d'envoyer. */
export const VARIABLES_NEWSLETTER = [
  { code: '{prenom}', libelle: 'Prénom du client' },
  { code: '{coach}', libelle: 'Mon prénom' },
] as const;

/** Remplace les variables ; sans prénom connu, « Bonjour {prenom}, » devient « Bonjour, » et « Salut, {prenom} ! », « Salut ! ». */
export function personnaliser(texte: string, v: { prenom?: string; coach: string }): string {
  const prenom = v.prenom?.trim();
  return (prenom ? texte.split('{prenom}').join(prenom) : texte.replace(/,?[ \t]*\{prenom\}/g, '')).split('{coach}').join(v.coach);
}

/** Ce qui empêche de programmer, en clair ; null si tout est bon. `maintenant` : pour refuser une heure passée. */
export function erreurNewsletter(
  n: Pick<Newsletter, 'objet' | 'message' | 'cibles' | 'parEmail' | 'parNotif'> & Partial<Pick<Newsletter, 'rubrique' | 'chapeau' | 'boutonLibelle' | 'boutonLien'>> & { envoiLe?: string },
  maintenant?: number,
): string | null {
  if (!n.cibles.length) return 'Choisis pour qui : clients actifs, en veille, ou les deux.';
  if (!n.objet.trim()) return 'Écris l’objet.';
  if (n.objet.length > MAX_OBJET) return `L’objet : ${MAX_OBJET} caractères au plus.`;
  if (n.rubrique && n.rubrique.length > MAX_RUBRIQUE) return `La rubrique : ${MAX_RUBRIQUE} caractères au plus.`;
  if (n.chapeau && n.chapeau.length > MAX_CHAPEAU) return `L’introduction : ${MAX_CHAPEAU} caractères au plus.`;
  if (!n.message.trim()) return 'Écris le message.';
  if (n.message.length > MAX_MESSAGE) return `Le message : ${MAX_MESSAGE} caractères au plus.`;
  if (n.boutonLibelle?.trim() && !/^https:\/\/\S+\.\S+$/.test(n.boutonLien?.trim() ?? '')) return 'Le lien du bouton doit commencer par https://';
  const inconnues = (`${n.rubrique ?? ''} ${n.objet} ${n.chapeau ?? ''} ${n.message}`.match(/\{[^}]*\}/g) ?? []).filter((x) => !VARIABLES_NEWSLETTER.some((v) => v.code === x));
  if (inconnues.length) return `${inconnues[0]} n’est pas reconnu. Utilise les boutons pour insérer le prénom.`;
  if (!n.parEmail && !n.parNotif) return 'Choisis l’envoi : e-mail, notification, ou les deux.';
  if (maintenant !== undefined) {
    if (!n.envoiLe || Number.isNaN(Date.parse(n.envoiLe))) return 'Choisis le jour et l’heure d’envoi.';
    if (Date.parse(n.envoiLe) < maintenant - 60_000) return 'Cette heure est déjà passée : choisis plus tard.';
  }
  return null;
}

/** Ce qu'il faut savoir d'un contact pour décider s'il reçoit la newsletter. */
export interface ContactNewsletter {
  statut: string;
  statutCrm?: string | null;
  email?: string | null;
  /** Le client a un compte dans l'appli (il peut recevoir une notification). */
  appli?: boolean;
  /** Il a cliqué « Ne plus recevoir ces nouvelles ». */
  desabonne?: boolean;
}

/** Clients actifs ou en veille ; un prospect ou un dossier archivé ne reçoit pas de newsletter. */
export function cibleDe(c: Pick<ContactNewsletter, 'statut' | 'statutCrm'>): Cible | null {
  if (c.statut === 'archive') return null;
  if (c.statutCrm === 'En veille') return 'veille';
  if (c.statut === 'client') return 'clients';
  return null;
}

export const emailValide = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Combien de personnes de chaque groupe, et combien recevront vraiment un e-mail ou une notification. */
export function compterDestinataires(contacts: ContactNewsletter[]) {
  const vide = () => ({ total: 0, emails: 0, notifs: 0 });
  const r: Record<Cible, { total: number; emails: number; notifs: number }> = { clients: vide(), veille: vide() };
  for (const c of contacts) {
    const cible = cibleDe(c);
    if (!cible) continue;
    r[cible].total += 1;
    if (!c.desabonne && emailValide(c.email)) r[cible].emails += 1;
    if (!c.desabonne && c.appli) r[cible].notifs += 1;
  }
  return r;
}

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Le corps de l'article, en blocs : « ## » ouvre un intertitre, « - » une liste, « > » une citation mise en valeur. */
export type Bloc = { type: 'paragraphe' | 'intertitre' | 'citation'; texte: string } | { type: 'liste'; points: string[] };

export function blocsArticle(message: string): Bloc[] {
  const blocs: Bloc[] = [];
  for (const morceau of message.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lignes = morceau.split('\n').map((l) => l.trim()).filter(Boolean);
    let texte: string[] = [];
    const finirTexte = () => {
      if (texte.length) blocs.push({ type: 'paragraphe', texte: texte.join('\n') });
      texte = [];
    };
    for (const l of lignes) {
      if (/^#{1,3}\s+/.test(l)) {
        finirTexte();
        blocs.push({ type: 'intertitre', texte: l.replace(/^#{1,3}\s+/, '') });
      } else if (/^[-•*]\s+/.test(l)) {
        finirTexte();
        const dernier = blocs.at(-1);
        const point = l.replace(/^[-•*]\s+/, '');
        if (dernier?.type === 'liste') dernier.points.push(point);
        else blocs.push({ type: 'liste', points: [point] });
      } else if (/^>\s*/.test(l)) {
        finirTexte();
        blocs.push({ type: 'citation', texte: l.replace(/^>\s*/, '').replace(/^[«"]\s*|\s*[»"]$/g, '') });
      } else {
        if (blocs.at(-1)?.type === 'liste' && !texte.length && lignes.indexOf(l) > 0) finirTexte();
        texte.push(l);
      }
    }
    finirTexte();
  }
  return blocs;
}

/** Ce qui fait l'article : l'objet sert de grand titre, la rubrique de surtitre, le chapeau d'introduction. */
export type Article = Pick<Newsletter, 'objet' | 'message'> & Partial<Pick<Newsletter, 'rubrique' | 'chapeau' | 'boutonLibelle' | 'boutonLien'>> & { image?: string };

export interface MailNewsletter {
  sujet: string;
  html: string;
  texte: string;
}

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Helvetica,Arial,sans-serif';

/** « Décembre 2026 », pour le bandeau en haut de la lettre. */
export function numeroDe(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const t = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * L'e-mail d'une personne, mis en page comme un article de magazine : bandeau « La lettre de … », illustration pleine
 * largeur, surtitre, grand titre, chapeau, corps avec intertitres, listes et citation, bouton, signature, et en bas le
 * lien pour ne plus rien recevoir. Tableaux et styles en ligne : c'est ce que Gmail, Outlook et Apple Mail lisent.
 */
export function mailNewsletter(a: Article, v: { prenom?: string; coach: string; desabonnement: string; quand?: string }): MailNewsletter {
  const p = (t?: string) => personnaliser(t ?? '', v).trim();
  const sujet = p(a.objet);
  const rubrique = p(a.rubrique);
  const chapeau = p(a.chapeau);
  const blocs = blocsArticle(p(a.message));
  const bouton = a.boutonLibelle?.trim() && /^https:\/\/\S+$/.test(a.boutonLien?.trim() ?? '') ? { libelle: p(a.boutonLibelle), lien: a.boutonLien!.trim() } : undefined;
  const numero = numeroDe(v.quand);
  const pied = `Tu reçois cette lettre parce que tu es suivi(e) par ${v.coach}.`;
  const t = (x: string) => echapper(x).replace(/\n/g, '<br>');
  // Les adresses citées (sources) deviennent cliquables ; la ponctuation finale reste hors du lien.
  const liens = (x: string) => t(x).replace(/https:\/\/[^\s<]+[^\s<.,;:!?)»]/g, (u) => `<a href="${u}" style="color:#9F1418;word-break:break-all">${u}</a>`);
  const corps = blocs
    .map((b, i) => {
      if (b.type === 'intertitre')
        return `<h2 style="margin:30px 0 10px;font-family:${SANS};font-size:19px;line-height:1.3;color:#1A1C23">${t(b.texte)}</h2>`;
      if (b.type === 'citation')
        return `<p style="margin:26px 0;padding:4px 0 4px 18px;border-left:4px solid #C3181E;font-family:${SERIF};font-style:italic;font-size:22px;line-height:1.4;color:#9F1418">« ${t(b.texte)} »</p>`;
      if (b.type === 'liste')
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px">${b.points
          .map((x) => `<tr><td valign="top" style="padding:3px 12px 3px 0;font-size:17px;line-height:1.6;color:#C3181E">●</td><td style="padding:3px 0;font-family:${SERIF};font-size:17px;line-height:1.6;color:#2A2C33">${liens(x)}</td></tr>`)
          .join('')}</table>`;
      // Le premier paragraphe commence par une lettrine.
      if (i === 0 && !chapeau && b.texte.length > 1)
        return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.7;color:#2A2C33"><span style="float:left;font-size:52px;line-height:44px;padding:6px 8px 0 0;color:#C3181E;font-family:${SERIF}">${echapper(b.texte[0])}</span>${t(b.texte.slice(1))}</p>`;
      return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.7;color:#2A2C33">${liens(b.texte)}</p>`;
    })
    .join('');
  const html = [
    `<div style="margin:0;padding:24px 12px;background:#F4F1EC">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">`,
    `<tr><td style="padding:18px 32px;border-bottom:1px solid #EEE9E2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`,
    `<td style="font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#1A1C23">La lettre de ${echapper(v.coach)}</td>`,
    `<td align="right" style="padding-left:12px;font-family:${SANS};font-size:12px;letter-spacing:1px;color:#8A8F99;white-space:nowrap">${echapper(numero)}</td></tr></table></td></tr>`,
    ...(a.image && /^https:\/\//.test(a.image) ? [`<tr><td><img src="${echapper(a.image)}" width="600" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>`] : []),
    `<tr><td style="padding:30px 32px 8px">`,
    ...(rubrique ? [`<p style="margin:0 0 10px;font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:#C3181E">${t(rubrique)}</p>`] : []),
    `<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:32px;line-height:1.18;font-weight:normal;color:#111216">${t(sujet)}</h1>`,
    ...(chapeau ? [`<p style="margin:0 0 22px;font-family:${SANS};font-size:18px;line-height:1.55;color:#4A4E57">${t(chapeau)}</p>`] : []),
    `<div style="width:48px;height:3px;background:#C3181E;margin:0 0 24px"></div>`,
    corps,
    ...(bouton
      ? [`<p style="margin:28px 0 8px"><a href="${echapper(bouton.lien)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#C3181E;color:#FFFFFF;text-decoration:none;font-family:${SANS};font-size:15px;font-weight:bold">${t(bouton.libelle)}</a></p>`]
      : []),
    `<p style="margin:30px 0 0;font-family:${SERIF};font-style:italic;font-size:17px;color:#2A2C33">${echapper(v.coach)}</p>`,
    `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:#8A8F99">Ton coach · réponds simplement à ce mail pour m’écrire</p>`,
    `</td></tr>`,
    `<tr><td style="padding:24px 32px 28px"><p style="margin:0;padding-top:16px;border-top:1px solid #EEE9E2;font-family:${SANS};font-size:12px;line-height:1.6;color:#8A8F99">${echapper(pied)}<br><a href="${echapper(v.desabonnement)}" style="color:#8A8F99">Ne plus recevoir ces nouvelles</a></p></td></tr>`,
    `</table></div>`,
  ].join('');
  const texteCorps = blocs
    .map((b) => (b.type === 'liste' ? b.points.map((x) => `• ${x}`).join('\n') : b.type === 'intertitre' ? b.texte.toUpperCase() : b.type === 'citation' ? `« ${b.texte} »` : b.texte))
    .join('\n\n');
  const texte = [rubrique.toUpperCase(), sujet, chapeau, texteCorps, bouton ? `${bouton.libelle} : ${bouton.lien}` : '', v.coach, `--\n${pied}\nNe plus recevoir ces nouvelles : ${v.desabonnement}`]
    .filter(Boolean)
    .join('\n\n');
  return { sujet, html, texte };
}

/** Texte de la notification : l'objet en titre, le chapeau (sinon le début du message) en dessous. */
export function notifNewsletter(a: Article, v: { prenom?: string; coach: string }) {
  const titre = personnaliser(a.objet, v).trim().slice(0, 200);
  const source = a.chapeau?.trim() ? a.chapeau : a.message.replace(/^\s*(bonjour|salut|coucou|hello)[^\n]*\n+/i, '');
  const sans = personnaliser(source, v)
    .replace(/^[#>\-•*]+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { titre, corps: sans.length > 180 ? `${sans.slice(0, 179).trimEnd()}…` : sans };
}

/** Le corps JSON de l'API transactionnelle de Brevo, avec l'en-tête de désabonnement que lisent Gmail et Apple Mail. */
export function corpsBrevoNewsletter(expediteur: { email: string; nom: string }, destinataire: { email: string; prenom?: string }, m: MailNewsletter, o: { desabonnement: string; repondreA?: string; id: string }) {
  return {
    sender: { email: expediteur.email, name: expediteur.nom },
    to: [{ email: destinataire.email, ...(destinataire.prenom ? { name: destinataire.prenom } : {}) }],
    ...(o.repondreA ? { replyTo: { email: o.repondreA } } : {}),
    subject: m.sujet,
    htmlContent: m.html,
    textContent: m.texte,
    headers: { 'List-Unsubscribe': `<${o.desabonnement}>`, 'X-Coach-OS-Newsletter': o.id },
    tags: ['newsletter'],
  };
}

/** Idées de newsletters prêtes à adapter, chacune avec son illustration : un geste pour partir d'un vrai article. */
export interface Theme {
  cle: string;
  /** Clé de l'illustration ; absente, celle du thème (cle). */
  illustration?: string;
  pour: Cible;
  rubrique: string;
  objet: string;
  chapeau: string;
  message: string;
}

export const THEMES: Theme[] = [
  {
    cle: 'conseil',
    pour: 'clients',
    rubrique: 'Le conseil du mois',
    objet: 'Le squat parfait, en trois réglages',
    chapeau: '{prenom}, c’est le mouvement que tu fais le plus souvent. Trois petits réglages suffisent pour le rendre plus efficace et plus doux pour tes genoux.',
    message:
      'On le croit simple, et pourtant le squat est l’un des mouvements les plus techniques de tes séances.\n\n## 1. Les pieds bien ancrés\nPousse le sol avec tout le pied : talon, base du gros orteil et base du petit orteil.\n\n## 2. Les genoux dans l’axe\nL’erreur la plus fréquente : laisser les genoux rentrer vers l’intérieur. Garde-les au-dessus des orteils.\n\n## 3. Le dos fier\nPoitrine ouverte, regard devant toi, comme si tu voulais montrer le logo de ton t-shirt.\n\n> La technique avant la charge, toujours.\n\nOn vérifie tout ça ensemble à ta prochaine séance !',
  },
  {
    cle: 'recette',
    pour: 'clients',
    rubrique: 'Dans ton assiette',
    objet: 'L’omelette express qui fait du bien aux muscles',
    chapeau: 'Pas le temps de cuisiner ? Cette recette est prête en dix minutes et apporte environ 30 g de protéines.',
    message:
      '## Les ingrédients\n- 3 œufs\n- une poignée d’épinards frais\n- 30 g de feta\n- une tranche de pain complet\n\n## La recette\nFais tomber les épinards une minute à la poêle, verse les œufs battus, émiette la feta et laisse cuire à feu doux. Sers avec le pain grillé.\n\n> Après la séance, une assiette simple vaut mieux qu’un repas sauté.\n\nEnvoie-moi une photo si tu la testes !',
  },
  {
    cle: 'saison',
    pour: 'clients',
    rubrique: 'Spécial fêtes',
    objet: 'Les fêtes approchent : on garde le rythme',
    chapeau: '{prenom}, pas question de te priver pendant les fêtes. Voici trois réflexes pour en profiter sans perdre tes progrès.',
    message:
      '## Bouger un peu, mais souvent\nUne séance courte de 20 minutes vaut bien mieux que rien. Le corps retient la régularité, pas la durée.\n\n## Marcher après les grands repas\nDix à quinze minutes de marche aident la digestion et font du bien au moral.\n\n## Boire de l’eau\n- un verre d’eau entre chaque verre ;\n- une grande bouteille à portée de main le lendemain.\n\n> Les fêtes ne défont pas des mois de travail. Ce qui compte, c’est la reprise.\n\nProfite bien, et on repart ensemble en janvier.',
  },
  {
    cle: 'recup',
    pour: 'clients',
    rubrique: 'Récupération',
    objet: 'Le sommeil, ton meilleur allié',
    chapeau: 'C’est pendant le repos que le corps progresse. Bien dormir, c’est déjà s’entraîner.',
    message:
      'Tu peux avoir le meilleur programme du monde : sans sommeil, les progrès ralentissent.\n\n## Trois habitudes qui changent tout\n- viser 7 à 9 heures par nuit ;\n- couper les écrans 30 minutes avant de dormir ;\n- garder des horaires réguliers, même le week-end.\n\n> Un muscle se construit à l’entraînement et se répare la nuit.\n\nEssaie pendant une semaine, et dis-moi ce que tu ressens en séance.',
  },
  {
    cle: 'defi',
    pour: 'clients',
    rubrique: 'Le défi du mois',
    objet: '10 000 pas par jour pendant 30 jours',
    chapeau: '{prenom}, ce mois-ci je te lance un défi simple, qui fait une vraie différence sur l’énergie et la silhouette.',
    message:
      '## Le principe\nChaque jour, atteins 10 000 pas. Pas besoin de courir : la marche compte, les escaliers aussi.\n\n## Mes astuces\n- descendre un arrêt plus tôt ;\n- passer tes appels en marchant ;\n- une petite marche après le dîner.\n\n> Le meilleur exercice est celui que tu fais tous les jours.\n\nNote tes pas dans l’appli, et on fait le bilan à la fin du mois. Partant(e) ?',
  },
  {
    cle: 'nouveautes',
    pour: 'clients',
    rubrique: 'Du nouveau',
    objet: 'Ce qui change dans ton coaching',
    chapeau: 'Quelques nouveautés pour t’accompagner encore mieux ce mois-ci.',
    message:
      '## Nouveaux créneaux\n[Décris les nouveaux horaires ou lieux.]\n\n## Les séances duo\n[Explique la nouveauté : s’entraîner à deux, à prix doux.]\n\n## Parrainage\nSi tu fais découvrir le coaching à un proche, [ton avantage].\n\nUne question ? Réponds simplement à ce mail.',
  },
  {
    cle: 'manque',
    pour: 'veille',
    rubrique: 'Des nouvelles',
    objet: 'Ça fait un moment, {prenom} !',
    chapeau: 'Ça fait un moment qu’on ne s’est pas vus, et je voulais simplement prendre de tes nouvelles.',
    message:
      'Lors de notre rencontre, tu m’avais parlé d’un bel objectif. Je me demandais où tu en étais.\n\nLa vie va vite, les priorités changent, et c’est normal. Mais si l’envie est toujours là, je suis là aussi.\n\n> Il n’est jamais trop tard pour reprendre là où on s’était arrêtés.\n\nSi tu veux en parler, réponds simplement à ce mail.',
  },
  {
    cle: 'reprendre',
    pour: 'veille',
    rubrique: 'Reprendre en douceur',
    objet: '15 minutes chez toi pour t’y remettre',
    chapeau: 'Pas besoin de matériel ni de salle pour reprendre. Voici un petit circuit à faire dans ton salon.',
    message:
      '## Le circuit, 3 tours\n- 10 squats ;\n- 10 pompes, sur les genoux si besoin ;\n- 30 secondes de gainage ;\n- 1 minute de repos.\n\n## Le bon rythme\nDeux fois cette semaine, c’est parfait. La semaine prochaine, ajoute un tour.\n\n> Le plus dur, c’est la première séance. Après, ça roule.\n\nSi tu veux aller plus loin, je peux te préparer un programme sur mesure.',
  },
  {
    cle: 'temoignage',
    pour: 'veille',
    rubrique: 'Ils ont repris',
    objet: 'Deux ans sans sport, et puis…',
    chapeau: '[Prénom] avait tout arrêté. Trois mois après avoir repris, [son résultat]. Voici son histoire.',
    message:
      '## Le déclic\n[Ce qui lui a donné envie de reprendre.]\n\n## Ce qui a tout changé\nCommencer petit, avec des séances adaptées à son emploi du temps, et quelqu’un pour l’encourager.\n\n> « [Une phrase de ton client, avec son accord.] »\n\nEt toi, quand est-ce qu’on s’y remet ?',
  },
  {
    cle: 'offre',
    pour: 'veille',
    rubrique: 'Offre de retour',
    objet: 'Une séance offerte pour reprendre',
    chapeau: '{prenom}, pour t’aider à faire le premier pas, je t’offre [une séance découverte / une remise de X %] jusqu’au [date].',
    message:
      '## Ce que je te propose\nUne séance pour faire le point : où tu en es, ce que tu veux, et un plan simple pour y arriver.\n\n## Comment en profiter\nRéponds à ce mail ou écris-moi, et on trouve un créneau ensemble.\n\n> Aucun engagement : juste une séance pour voir si l’envie revient.',
  },
  {
    cle: 'objectif',
    pour: 'veille',
    rubrique: 'Nouveau départ',
    objet: 'Nouvelle année, nouvel objectif ?',
    chapeau: 'La nouvelle année est le bon moment pour se fixer un objectif réaliste, et s’y tenir cette fois.',
    message:
      '## Un objectif qui te ressemble\n- courir 5 km sans t’arrêter ;\n- retrouver de l’énergie au quotidien ;\n- avoir moins mal au dos.\n\n## Un plan simple\nDeux séances par semaine, des repères clairs, et un point chaque mois.\n\n> Un objectif sans plan, c’est juste un souhait.\n\nJe te propose d’en parler 15 minutes, sans engagement. Ça te dit ?',
  },
  {
    cle: 'mythes',
    pour: 'veille',
    rubrique: 'Vrai ou faux',
    objet: '« Je n’ai pas le temps » : et si c’était un mythe ?',
    chapeau: 'Trois idées reçues qui empêchent beaucoup de monde de reprendre. On démêle le vrai du faux.',
    message:
      '## « Il faut s’entraîner une heure »\nFaux. Deux séances de 30 minutes par semaine suffisent pour voir des progrès.\n\n## « Il faut souffrir pour progresser »\nFaux. Une séance bien dosée laisse fatigué, pas épuisé.\n\n## « C’est trop tard pour moi »\nFaux. On progresse à tout âge, à son rythme.\n\n> Le meilleur moment pour commencer, c’était hier. Le deuxième meilleur, c’est aujourd’hui.\n\nD’autres idées reçues ? Réponds-moi, j’en ferai le sujet de la prochaine lettre.',
  },
];

/** Image d'un thème (« theme:saison ») ou photo du coach (chemin dans le stockage). */
export const imageTheme = (cle: string) => `theme:${cle}`;
export const cleThemeImage = (image?: string) => (image?.startsWith('theme:') ? image.slice(6) : undefined);
