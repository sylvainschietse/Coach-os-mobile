// Brochure des prix du coach : une page A4 faite à partir de ses offres en vente.
// Elle se refait à chaque fois depuis « Mes offres », donc elle suit toujours ses prix du moment.
// Design repris du tract des formules CoachGo choisi par Camille : photo en haut, fond crème,
// prix en doré, cartes noires pour les offres avec séances, QR code pour écrire au coach.
import creerQr from 'qrcode-generator';

import { contenuOffre, libellePrix, PERIODICITES, type Offre } from './offres';

const ROUGE = '#D9232D';
const OR = '#C9A45C';
const NOIR = '#232327';
const CREME = '#F4EFE6';
const estCouleur = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

function echapper(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type OffreBrochure = Pick<Offre, 'id' | 'nom' | 'accroche' | 'prix' | 'periodicite' | 'accesAppli' | 'nutrition' | 'messagerie' | 'videosMois' | 'seances' | 'essaiJours' | 'active' | 'ordre'> & { conseil?: boolean };

/** Offres à mettre dans la brochure : celles en vente, abonnements d'abord puis packs, dans l'ordre du coach. */
export function offresDeLaBrochure<T extends OffreBrochure>(offres: T[]): T[] {
  return offres
    .filter((o) => o.active)
    .sort((a, b) => Number(a.periodicite === 'unique') - Number(b.periodicite === 'unique') || a.ordre - b.ordre);
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
  options: VisuelsBrochure & { couleur?: string; logo?: string; lien?: (id: string) => string; date?: Date } = {},
): string {
  const accent = options.couleur && estCouleur(options.couleur) ? options.couleur : ROUGE;
  const polices = [
    options.police ? `@font-face { font-family: 'Titre'; src: url(data:font/ttf;base64,${options.police}) format('truetype'); }` : '',
    options.texte ? `@font-face { font-family: 'Texte'; font-weight: 400; src: url(data:font/ttf;base64,${options.texte.normal}) format('truetype'); }` : '',
    options.texte ? `@font-face { font-family: 'Texte'; font-weight: 600; src: url(data:font/ttf;base64,${options.texte.gras}) format('truetype'); }` : '',
  ].join('\n');
  const liste = offresDeLaBrochure(offres);
  const abonnements = liste.filter((o) => o.periodicite !== 'unique');
  const toutAuMois = liste.length > 0 && liste.every((o) => o.periodicite === 'mois');
  // Plus de 4 offres : cartes plus serrées pour tenir sur la page.
  const serre = liste.length > 4;

  const cartes = liste
    .map((o) => {
      const suffixe = PERIODICITES[o.periodicite].suffixe;
      const montant = libellePrix(o).slice(0, -suffixe.length).trim();
      const lignes = contenuOffre(o)
        .map((l) => `<li>${echapper(l)}</li>`)
        .join('');
      const lien = options.lien ? options.lien(o.id) : '';
      // Les offres où le coach est là en personne ressortent en noir, comme sur le tract.
      return `<div class="carte${o.seances ? ' sombre' : ''}${o.conseil ? ' conseil' : ''}">
  ${o.conseil ? '<div class="badge">Mon conseil</div>' : ''}
  <div class="nom">${echapper(o.nom)}</div>
  ${o.accroche ? `<div class="accroche">${echapper(o.accroche)}</div>` : ''}
  <div class="prix"><span class="montant">${echapper(montant)}</span> <span class="suffixe">${echapper(suffixe)}</span></div>
  <ul>${lignes}</ul>
  ${lien ? `<div class="lien">S’inscrire en ligne : <span>${echapper(lien)}</span></div>` : ''}
</div>`;
    })
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

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Les offres de ${echapper(coach.nom)}</title><style>
${polices}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Texte', 'Jost', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: ${NOIR}; font-size: 10.5pt; line-height: 1.35; background: ${CREME}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; overflow: hidden; display: flex; flex-direction: column; margin: 0 auto; background: ${CREME}; }
.t1, .marque, .h2, .nom, .montant, .atout .t, .cta { font-family: 'Titre', 'Bebas Neue', 'Oswald', Impact, 'Arial Narrow', sans-serif; font-weight: 400; letter-spacing: .01em; }
.haut { position: relative; color: #fff; padding: ${serre ? '8mm 13mm 6mm' : '9mm 13mm 7mm'}; background: #2a2a2e ${options.photo ? `url(data:image/jpeg;base64,${options.photo}) center 22% / cover no-repeat` : ''}; }
.haut::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20,20,24,.88) 0%, rgba(20,20,24,.6) 55%, rgba(20,20,24,.25) 100%); }
.haut > * { position: relative; }
.logo { max-height: 15mm; max-width: 60mm; object-fit: contain; display: block; }
.marque { font-size: 30pt; line-height: 1; }
.marque span { color: ${accent}; }
.kicker { color: ${OR}; font-weight: 600; font-size: 9pt; letter-spacing: .32em; text-transform: uppercase; margin-top: ${serre ? '3mm' : '4.5mm'}; }
.t1 { font-size: ${serre ? '34pt' : '42pt'}; line-height: .92; margin-top: 2mm; text-transform: uppercase; }
.t1 span { color: ${accent}; display: block; }
.intro { margin-top: ${serre ? '2mm' : '3mm'}; font-size: ${serre ? '10pt' : '11pt'}; max-width: 135mm; color: #f1f1f1; }
.corps { flex: 1; padding: ${serre ? '4.5mm' : '5mm'} 13mm 0; display: flex; flex-direction: column; }
.entete { display: flex; justify-content: space-between; align-items: baseline; }
.h2 { font-size: ${serre ? '20pt' : '24pt'}; line-height: 1; text-transform: uppercase; }
.par-mois { color: #6B6B73; font-size: 10pt; letter-spacing: .04em; }
.grille { margin-bottom: 3mm; display: grid; grid-template-columns: 1fr 1fr; gap: ${serre ? '4mm' : '4.5mm'}; margin-top: ${serre ? '3mm' : '3.5mm'}; }
.carte { background: #fff; border: 0.3mm solid #E4DCCB; border-radius: 4mm; padding: ${serre ? '3mm 4.5mm' : '4.5mm 5.5mm'}; break-inside: avoid; }
.carte.sombre { background: ${NOIR}; border-color: ${NOIR}; color: #fff; }
.carte.conseil { position: relative; border: 0.8mm solid ${accent}; }
.badge { position: absolute; top: -3.2mm; right: 7mm; background: ${accent}; color: #fff; font-weight: 600; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; padding: 1mm 3.5mm; border-radius: 99mm; }
.nom { font-size: ${serre ? '17pt' : '21pt'}; line-height: 1; text-transform: uppercase; }
.accroche { color: #6B6B73; margin-top: .6mm; font-size: ${serre ? '9pt' : '9.5pt'}; }
.sombre .accroche { color: #B9B9C0; }
.prix { margin-top: ${serre ? '1mm' : '2mm'}; color: #6B6B73; }
.sombre .prix { color: #B9B9C0; }
.montant { color: ${OR}; font-size: ${serre ? '26pt' : '34pt'}; line-height: .95; }
.suffixe { font-size: 10.5pt; margin-left: 1mm; }
ul { list-style: none; padding: 0; margin: ${serre ? '1mm' : '2mm'} 0 0; font-size: ${serre ? '9pt' : '10pt'}; }
li { padding-left: 4.5mm; position: relative; margin-top: ${serre ? '.4mm' : '.6mm'}; }
li::before { content: ''; position: absolute; left: 0; top: ${serre ? '1.2mm' : '1.5mm'}; width: 2mm; height: 2mm; border-radius: 50%; background: ${accent}; }
.lien { margin-top: ${serre ? '1mm' : '2mm'}; font-size: 7.5pt; color: #8A8A92; word-break: break-all; }
.lien span { color: inherit; text-decoration: underline; }
.vide { padding: 10mm 0; color: #6B6B73; }
.atouts { display: flex; justify-content: space-around; text-align: center; border-top: 0.3mm solid #DDD4C2; border-bottom: 0.3mm solid #DDD4C2; margin-top: auto; padding: 3mm 0; }
.atout .t { color: ${accent}; font-size: ${serre ? '13pt' : '15pt'}; line-height: 1; text-transform: uppercase; }
.atout .s { color: #6B6B73; font-size: 9.5pt; margin-top: .8mm; }
.bas { display: flex; align-items: center; gap: 7mm; padding: ${serre ? '3mm' : '4mm'} 0 2.5mm; }
.qr { background: #fff; border-radius: 3mm; padding: 2.5mm; border: 0.3mm solid #E4DCCB; width: ${serre ? '24mm' : '28mm'}; height: ${serre ? '24mm' : '28mm'}; flex: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.cta { font-size: ${serre ? '18pt' : '21pt'}; line-height: 1; text-transform: uppercase; }
.coord { margin-top: 2mm; font-size: 11pt; }
.coord strong { font-weight: 600; font-size: 13pt; }
.mentions { text-align: center; color: #9A968C; font-size: 7.5pt; padding-bottom: 4mm; }
</style></head><body><div class="page">
<div class="haut">
  ${titre}
  <div class="kicker">Après la séance, on continue</div>
  <div class="t1">Ton coach. Ton programme.<span>${abonnements.length ? 'Chaque mois.' : 'À ton rythme.'}</span></div>
  <div class="intro">${abonnements.length ? 'Un abonnement simple, sans engagement : tes séances, ton appli et ta nutrition réunies dans une seule formule.' : 'Des séances avec ton coach, et ton suivi dans l’appli.'}</div>
</div>
<div class="corps">
  <div class="entete"><div class="h2">Choisis ta formule</div>${toutAuMois ? '<div class="par-mois">Prix par mois</div>' : ''}</div>
  ${liste.length ? `<div class="grille">${cartes}</div>` : '<div class="vide">Pas encore d’offre en vente.</div>'}
  <div class="atouts">${atouts}</div>
  <div class="bas">
    ${whatsapp ? `<div class="qr">${qrSvg(whatsapp)}</div>` : ''}
    <div>
      <div class="cta">${whatsapp ? 'On s’y met ? Scanne et écris-moi' : 'On s’y met ? Écris-moi'}</div>
      <div class="coord">${echapper(coach.nom)}, ton coach${contact ? ` · ${contact}` : ''}</div>
    </div>
  </div>
  <div class="mentions">Tarifs au ${date}. Inscription et paiement en ligne, directement auprès du coach.</div>
</div>
</div></body></html>`;
}
