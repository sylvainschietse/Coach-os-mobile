// Brochure des prix du coach : une page A4 faite à partir de ses offres en vente.
// Elle se refait à chaque fois depuis « Mes offres », donc elle suit toujours ses prix du moment.
// Design repris du tract des formules CoachGo choisi par Camille : photo en haut, fond crème,
// prix en doré, cartes noires pour les offres avec séances, QR code pour écrire au coach.
// Le coach règle sa brochure dans « Ma brochure » : couleur, textes du haut, blocs d'offres,
// couleur de chaque carte et parties affichées (ReglagesBrochure, gardés dans la table brochures).
import creerQr from 'qrcode-generator';

import { contenuOffre, libellePrix, PERIODICITES, trierOffres, type Offre } from './offres';

const ROUGE = '#D9232D';
const OR = '#C9A45C';
const NOIR = '#232327';
const CREME = '#F4EFE6';
const estCouleur = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

function echapper(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type OffreBrochure = Pick<Offre, 'id' | 'nom' | 'accroche' | 'prix' | 'periodicite' | 'accesAppli' | 'nutrition' | 'messagerie' | 'videosMois' | 'seances' | 'essaiJours' | 'active' | 'ordre'> & { conseil?: boolean };

/** Offres à mettre dans la brochure : celles en vente, dans l'ordre choisi par le coach dans « Mes offres ». */
export function offresDeLaBrochure<T extends OffreBrochure>(offres: T[]): T[] {
  return trierOffres(offres.filter((o) => o.active));
}

/** Lien WhatsApp à partir d'un numéro français ou international, ou rien si le numéro est illisible. */
export function lienWhatsApp(telephone?: string): string | undefined {
  if (!telephone) return undefined;
  let chiffres = telephone.replace(/[^\d+]/g, '');
  if (chiffres.startsWith('+')) chiffres = chiffres.slice(1);
  else if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  else if (/^0\d{9}$/.test(chiffres)) chiffres = `33${chiffres.slice(1)}`;
  return /^\d{8,15}$/.test(chiffres) ? `https://wa.me/${chiffres}` : undefined;
}

function qrSvg(texte: string): string {
  const qr = creerQr(0, 'M');
  qr.addData(texte);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export type BlocBrochure = 'appli' | 'formules' | 'seances';
export type CarteBrochure = 'clair' | 'sombre' | 'couleur';

export const BLOCS_BROCHURE: Record<BlocBrochure, { libelle: string; titre: string }> = {
  appli: { libelle: 'Suivi dans l’appli', titre: 'Suivi en ligne' },
  formules: { libelle: 'Formules avec le coach', titre: 'Avec ton coach' },
  seances: { libelle: 'Séances et packs', titre: 'Séances' },
};

export const CARTES_BROCHURE: Record<CarteBrochure, string> = {
  clair: 'Blanche',
  sombre: 'Noire',
  couleur: 'À ma couleur',
};

export interface ReglagesBrochure {
  /** Couleur principale (titres, puces, badge, cartes « à ma couleur ») ; sinon le rouge CoachGo. */
  couleur?: string;
  /** Textes du haut : vides, ce sont ceux de départ. */
  surtitre?: string;
  titre?: string;
  titreCouleur?: string;
  intro?: string;
  titreOffres?: string;
  /** Offres rangées par blocs titrés (Suivi en ligne, Avec ton coach, Séances) plutôt qu'en une seule grille. */
  parBlocs: boolean;
  blocs: Record<BlocBrochure, { titre: string; visible: boolean }>;
  ordreBlocs: BlocBrochure[];
  /** Pour chaque offre (par son identifiant) : couleur de sa carte et bloc où elle va, quand le coach les a changés. */
  offres: Record<string, { carte?: CarteBrochure; bloc?: BlocBrochure }>;
  photo: boolean;
  atouts: boolean;
  contact: boolean;
  liens: boolean;
}

export const REGLAGES_BROCHURE: ReglagesBrochure = {
  parBlocs: false,
  blocs: {
    appli: { titre: BLOCS_BROCHURE.appli.titre, visible: true },
    formules: { titre: BLOCS_BROCHURE.formules.titre, visible: true },
    seances: { titre: BLOCS_BROCHURE.seances.titre, visible: true },
  },
  ordreBlocs: ['appli', 'formules', 'seances'],
  offres: {},
  photo: true,
  atouts: true,
  contact: true,
  liens: true,
};

const CLES_BLOCS = Object.keys(BLOCS_BROCHURE) as BlocBrochure[];
const estBloc = (x: unknown): x is BlocBrochure => typeof x === 'string' && (CLES_BLOCS as string[]).includes(x);
const estCarte = (x: unknown): x is CarteBrochure => typeof x === 'string' && x in CARTES_BROCHURE;
const texte = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);
const oui = (x: unknown, defaut: boolean) => (typeof x === 'boolean' ? x : defaut);

/** Réglages enregistrés (JSON de la base) complétés par ceux de départ ; ce qui est illisible est ignoré. */
export function lireReglagesBrochure(brut: unknown): ReglagesBrochure {
  const r = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const d = REGLAGES_BROCHURE;
  const blocsBruts = (r.blocs && typeof r.blocs === 'object' ? r.blocs : {}) as Record<string, { titre?: unknown; visible?: unknown } | undefined>;
  const ordre = Array.isArray(r.ordreBlocs) ? [...new Set(r.ordreBlocs.filter(estBloc))] : [];
  const offresBrutes = (r.offres && typeof r.offres === 'object' ? r.offres : {}) as Record<string, { carte?: unknown; bloc?: unknown } | undefined>;
  const offres: ReglagesBrochure['offres'] = {};
  for (const [id, o] of Object.entries(offresBrutes)) {
    const carte = estCarte(o?.carte) ? o.carte : undefined;
    const bloc = estBloc(o?.bloc) ? o.bloc : undefined;
    if (carte || bloc) offres[id] = { ...(carte && { carte }), ...(bloc && { bloc }) };
  }
  return {
    couleur: typeof r.couleur === 'string' && estCouleur(r.couleur) ? r.couleur.toUpperCase() : undefined,
    surtitre: texte(r.surtitre, 60),
    titre: texte(r.titre, 60),
    titreCouleur: texte(r.titreCouleur, 40),
    intro: texte(r.intro, 220),
    titreOffres: texte(r.titreOffres, 40),
    parBlocs: oui(r.parBlocs, d.parBlocs),
    blocs: Object.fromEntries(
      CLES_BLOCS.map((b) => [b, { titre: texte(blocsBruts[b]?.titre, 40) ?? d.blocs[b].titre, visible: oui(blocsBruts[b]?.visible, true) }]),
    ) as ReglagesBrochure['blocs'],
    ordreBlocs: [...ordre, ...CLES_BLOCS.filter((b) => !ordre.includes(b))],
    offres,
    photo: oui(r.photo, d.photo),
    atouts: oui(r.atouts, d.atouts),
    contact: oui(r.contact, d.contact),
    liens: oui(r.liens, d.liens),
  };
}

type OffreRangee = Pick<Offre, 'id' | 'periodicite' | 'seances'>;

/** Bloc de départ d'une offre : séance ou pack payé une fois, formule avec séances, ou suivi dans l'appli. */
export const blocDeDepart = (o: OffreRangee): BlocBrochure => (o.periodicite === 'unique' ? 'seances' : o.seances ? 'formules' : 'appli');
/** Carte de départ : les séances et packs à la couleur du coach, les formules avec séances en noir, le reste en blanc. */
export const carteDeDepart = (o: OffreRangee): CarteBrochure => (o.periodicite === 'unique' ? 'couleur' : o.seances ? 'sombre' : 'clair');

export const blocDeLOffre = (o: OffreRangee, r: ReglagesBrochure) => r.offres[o.id]?.bloc ?? blocDeDepart(o);
export const carteDeLOffre = (o: OffreRangee, r: ReglagesBrochure) => r.offres[o.id]?.carte ?? carteDeDepart(o);

/** Groupes d'offres tels qu'ils sortent sur la brochure : un seul sans titre, ou un par bloc affiché qui a des offres. */
export function groupesBrochure<T extends OffreBrochure>(offres: T[], r: ReglagesBrochure): { bloc?: BlocBrochure; titre?: string; offres: T[] }[] {
  const liste = offresDeLaBrochure(offres);
  if (!r.parBlocs) return liste.length ? [{ offres: liste }] : [];
  return r.ordreBlocs
    .filter((b) => r.blocs[b].visible)
    .map((b) => ({ bloc: b, titre: r.blocs[b].titre, offres: liste.filter((o) => blocDeLOffre(o, r) === b) }))
    .filter((g) => g.offres.length > 0);
}

export interface VisuelsBrochure {
  /** Photo du bandeau, en JPEG base64. */
  photo?: string;
  /** Police des titres (Bebas Neue), en TTF base64. */
  police?: string;
  /** Police du texte (Jost normal et demi-gras), en TTF base64. */
  texte?: { normal: string; gras: string };
}

export function brochureHtml(
  offres: OffreBrochure[],
  coach: { nom: string; telephone?: string; email?: string },
  options: VisuelsBrochure & { couleur?: string; logo?: string; lien?: (id: string) => string; date?: Date; reglages?: ReglagesBrochure; apercu?: number } = {},
): string {
  const r = options.reglages ?? REGLAGES_BROCHURE;
  const couleur = r.couleur ?? options.couleur;
  const accent = couleur && estCouleur(couleur) ? couleur : ROUGE;
  const polices = [
    options.police ? `@font-face { font-family: 'Titre'; src: url(data:font/ttf;base64,${options.police}) format('truetype'); }` : '',
    options.texte ? `@font-face { font-family: 'Texte'; font-weight: 400; src: url(data:font/ttf;base64,${options.texte.normal}) format('truetype'); }` : '',
    options.texte ? `@font-face { font-family: 'Texte'; font-weight: 600; src: url(data:font/ttf;base64,${options.texte.gras}) format('truetype'); }` : '',
  ].join('\n');
  const groupes = groupesBrochure(offres, r);
  const liste = groupes.flatMap((g) => g.offres);
  const abonnements = liste.filter((o) => o.periodicite !== 'unique');
  const toutAuMois = liste.length > 0 && liste.every((o) => o.periodicite === 'mois');
  // Beaucoup d'offres, ou des blocs titrés : cartes plus serrées pour tenir sur la page.
  const titres = groupes.filter((g) => g.titre).length;
  const serre = liste.length > 4 || (titres > 1 && liste.length > 3);
  const tresSerre = liste.length > 6 || (titres > 2 && liste.length > 5);
  // Colonnes d'un groupe : 3 quand il y a 3 cartes ou plus de 4, sinon 2.
  const colonnes = (n: number) => (n === 3 || n > 4 ? 3 : 2);

  const carte = (o: OffreBrochure) => {
    const suffixe = PERIODICITES[o.periodicite].suffixe;
    const montant = libellePrix(o).slice(0, -suffixe.length).trim();
    const lignes = contenuOffre(o)
      .map((l) => `<li>${echapper(l)}</li>`)
      .join('');
    const lien = r.liens && options.lien ? options.lien(o.id) : '';
    const fond = carteDeLOffre(o, r);
    return `<div class="carte${fond === 'clair' ? '' : ` ${fond}`}${o.conseil ? ' conseil' : ''}">
  ${o.conseil ? '<div class="badge">Mon conseil</div>' : ''}
  <div class="nom">${echapper(o.nom)}</div>
  ${o.accroche ? `<div class="accroche">${echapper(o.accroche)}</div>` : ''}
  <div class="prix"><span class="montant">${echapper(montant)}</span> <span class="suffixe">${echapper(suffixe)}</span></div>
  <ul>${lignes}</ul>
  ${lien ? `<div class="lien">S’inscrire en ligne : <span>${echapper(lien)}</span></div>` : ''}
</div>`;
  };
  const grilles = groupes
    .map(
      (g) =>
        `<div class="groupe">${g.titre ? `<div class="h3">${echapper(g.titre)}</div>` : ''}<div class="grille c${colonnes(g.offres.length)}">${g.offres.map(carte).join('')}</div></div>`,
    )
    .join('');

  const atouts = [
    abonnements.length ? ['Sans engagement', 'tu arrêtes quand tu veux'] : ['À ton rythme', 'tes séances quand tu veux'],
    ['Paiement en ligne', 'par carte, sécurisé'],
    ['Tout dans l’appli', 'programme, suivi, messages'],
  ]
    .map(([t, s]) => `<div class="atout"><div class="t">${t}</div><div class="s">${s}</div></div>`)
    .join('');

  const whatsapp = lienWhatsApp(coach.telephone);
  const contact = [coach.telephone ? `${whatsapp ? 'WhatsApp ' : ''}<strong>${echapper(coach.telephone)}</strong>` : '', coach.email ? echapper(coach.email) : '']
    .filter(Boolean)
    .join(' · ');
  const date = (options.date ?? new Date()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const titre = options.logo
    ? `<img class="logo" src="${echapper(options.logo)}" alt="">`
    : `<div class="marque">Coaching <span>${echapper(coach.nom)}</span></div>`;
  const surtitre = r.surtitre ?? 'Après la séance, on continue';
  const t1 = r.titre ?? 'Ton coach. Ton programme.';
  const t1Couleur = r.titreCouleur ?? (abonnements.length ? 'Chaque mois.' : 'À ton rythme.');
  const intro =
    r.intro ??
    (abonnements.length
      ? 'Un abonnement simple, sans engagement : tes séances, ton appli et ta nutrition réunies dans une seule formule.'
      : 'Des séances avec ton coach, et ton suivi dans l’appli.');
  const photo = r.photo && options.photo;
  // Taille des textes et des marges selon la place : normale, serrée, très serrée.
  const t = (normal: string, s: string, ts: string) => (tresSerre ? ts : serre ? s : normal);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Les offres de ${echapper(coach.nom)}</title><style>
${polices}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
${options.apercu ? `html { zoom: ${options.apercu}; } body { overflow: hidden; }` : ''}
body { margin: 0; font-family: 'Texte', 'Jost', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: ${NOIR}; font-size: 10.5pt; line-height: 1.35; background: ${CREME}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; overflow: hidden; display: flex; flex-direction: column; margin: 0 auto; background: ${CREME}; }
.t1, .marque, .h2, .h3, .nom, .montant, .atout .t, .cta { font-family: 'Titre', 'Bebas Neue', 'Oswald', Impact, 'Arial Narrow', sans-serif; font-weight: 400; letter-spacing: .01em; }
.haut { position: relative; color: #fff; padding: ${t('9mm 13mm 7mm', '8mm 13mm 6mm', '6.5mm 13mm 5mm')}; background: #2a2a2e ${photo ? `url(data:image/jpeg;base64,${options.photo}) center 22% / cover no-repeat` : ''}; }
.haut::before { content: ''; position: absolute; inset: 0; background: ${photo ? 'linear-gradient(90deg, rgba(20,20,24,.88) 0%, rgba(20,20,24,.6) 55%, rgba(20,20,24,.25) 100%)' : NOIR}; }
.haut > * { position: relative; }
.logo { max-height: ${t('15mm', '15mm', '12mm')}; max-width: 60mm; object-fit: contain; display: block; }
.marque { font-size: ${t('30pt', '30pt', '24pt')}; line-height: 1; }
.marque span { color: ${accent}; }
.kicker { color: ${OR}; font-weight: 600; font-size: 9pt; letter-spacing: .32em; text-transform: uppercase; margin-top: ${t('4.5mm', '3mm', '2.5mm')}; }
.t1 { font-size: ${t('42pt', '34pt', '28pt')}; line-height: .92; margin-top: 2mm; text-transform: uppercase; }
.t1 span { color: ${accent}; display: block; }
.intro { margin-top: ${t('3mm', '2mm', '1.5mm')}; font-size: ${t('11pt', '10pt', '9.5pt')}; max-width: 135mm; color: #f1f1f1; }
.corps { flex: 1; padding: ${t('5mm', '4.5mm', '4mm')} 13mm 0; display: flex; flex-direction: column; }
.entete { display: flex; justify-content: space-between; align-items: baseline; }
.h2 { font-size: ${t('24pt', '20pt', '18pt')}; line-height: 1; text-transform: uppercase; }
.h3 { font-size: ${t('15pt', '13pt', '12pt')}; line-height: 1; text-transform: uppercase; color: ${accent}; margin-top: ${t('4mm', '3mm', '2.5mm')}; }
.par-mois { color: #6B6B73; font-size: 10pt; letter-spacing: .04em; }
.grille { margin-bottom: ${t('3mm', '2mm', '1.5mm')}; display: grid; grid-template-columns: 1fr 1fr; gap: ${t('4.5mm', '4mm', '3mm')}; margin-top: ${t('3.5mm', '3mm', '2.5mm')}; }
.grille.c3 { grid-template-columns: 1fr 1fr 1fr; }
.carte { background: #fff; border: 0.3mm solid #E4DCCB; border-radius: 4mm; padding: ${t('4.5mm 5.5mm', '3mm 4.5mm', '2.5mm 3.5mm')}; break-inside: avoid; }
.carte.sombre { background: ${NOIR}; border-color: ${NOIR}; color: #fff; }
.carte.couleur { background: ${accent}; border-color: ${accent}; color: #fff; }
.carte.conseil { position: relative; border: 0.8mm solid ${accent}; }
.carte.couleur.conseil { border-color: ${NOIR}; }
.badge { position: absolute; top: -3.2mm; right: 7mm; background: ${accent}; color: #fff; font-weight: 600; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; padding: 1mm 3.5mm; border-radius: 99mm; }
.couleur .badge { background: ${NOIR}; }
.nom { font-size: ${t('21pt', '17pt', '15pt')}; line-height: 1; text-transform: uppercase; }
.accroche { color: #6B6B73; margin-top: .6mm; font-size: ${t('9.5pt', '9pt', '8.5pt')}; }
.sombre .accroche { color: #B9B9C0; }
.couleur .accroche, .couleur .prix, .couleur .lien { color: rgba(255,255,255,.85); }
.prix { margin-top: ${t('2mm', '1mm', '.8mm')}; color: #6B6B73; }
.sombre .prix { color: #B9B9C0; }
.montant { color: ${OR}; font-size: ${t('34pt', '26pt', '22pt')}; line-height: .95; }
.couleur .montant { color: #fff; }
.suffixe { font-size: ${t('10.5pt', '10.5pt', '9pt')}; margin-left: 1mm; }
ul { list-style: none; padding: 0; margin: ${t('2mm', '1mm', '.8mm')} 0 0; font-size: ${t('10pt', '9pt', '8.5pt')}; }
li { padding-left: 4.5mm; position: relative; margin-top: ${t('.6mm', '.4mm', '.3mm')}; }
li::before { content: ''; position: absolute; left: 0; top: ${t('1.5mm', '1.2mm', '1.1mm')}; width: 2mm; height: 2mm; border-radius: 50%; background: ${accent}; }
.couleur li::before { background: #fff; }
.lien { margin-top: ${t('2mm', '1mm', '.8mm')}; font-size: 7.5pt; color: #8A8A92; word-break: break-all; }
.lien span { color: inherit; text-decoration: underline; }
.vide { padding: 10mm 0; color: #6B6B73; }
.atouts { display: flex; justify-content: space-around; text-align: center; border-top: 0.3mm solid #DDD4C2; border-bottom: 0.3mm solid #DDD4C2; margin-top: auto; padding: ${t('3mm', '3mm', '2mm')} 0; }
.atout .t { color: ${accent}; font-size: ${t('15pt', '13pt', '12pt')}; line-height: 1; text-transform: uppercase; }
.atout .s { color: #6B6B73; font-size: ${t('9.5pt', '9.5pt', '8.5pt')}; margin-top: .8mm; }
.bas { display: flex; align-items: center; gap: 7mm; padding: ${t('4mm', '3mm', '2.5mm')} 0 2.5mm; }
.atouts + .bas, .bas:first-child { margin-top: 0; }
.espace { margin-top: auto; }
.qr { background: #fff; border-radius: 3mm; padding: 2.5mm; border: 0.3mm solid #E4DCCB; width: ${t('28mm', '24mm', '21mm')}; height: ${t('28mm', '24mm', '21mm')}; flex: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.cta { font-size: ${t('21pt', '18pt', '16pt')}; line-height: 1; text-transform: uppercase; }
.coord { margin-top: 2mm; font-size: 11pt; }
.coord strong { font-weight: 600; font-size: 13pt; }
.mentions { text-align: center; color: #9A968C; font-size: 7.5pt; padding-bottom: 4mm; }
</style></head><body><div class="page">
<div class="haut">
  ${titre}
  ${surtitre ? `<div class="kicker">${echapper(surtitre)}</div>` : ''}
  <div class="t1">${echapper(t1)}${t1Couleur ? `<span>${echapper(t1Couleur)}</span>` : ''}</div>
  ${intro ? `<div class="intro">${echapper(intro)}</div>` : ''}
</div>
<div class="corps">
  <div class="entete"><div class="h2">${echapper(r.titreOffres ?? 'Choisis ta formule')}</div>${toutAuMois ? '<div class="par-mois">Prix par mois</div>' : ''}</div>
  ${liste.length ? grilles : '<div class="vide">Pas encore d’offre en vente.</div>'}
  ${r.atouts ? `<div class="atouts">${atouts}</div>` : '<div class="espace"></div>'}
  ${
    r.contact
      ? `<div class="bas">
    ${whatsapp ? `<div class="qr">${qrSvg(whatsapp)}</div>` : ''}
    <div>
      <div class="cta">${whatsapp ? 'On s’y met ? Scanne et écris-moi' : 'On s’y met ? Écris-moi'}</div>
      <div class="coord">${echapper(coach.nom)}, ton coach${contact ? ` · ${contact}` : ''}</div>
    </div>
  </div>`
      : ''
  }
  <div class="mentions">Tarifs au ${date}. Inscription et paiement en ligne, directement auprès du coach.</div>
</div>
</div></body></html>`;
}
