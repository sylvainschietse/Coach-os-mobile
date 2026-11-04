// Brochure des prix du coach : une page A4 à ses couleurs, faite à partir de ses offres en vente.
// Elle se refait à chaque fois depuis « Mes offres », donc elle suit toujours ses prix du moment.
import { contenuOffre, libellePrix, type Offre } from './offres';

const COULEUR_DEFAUT = '#D71920';
const estCouleur = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

function echapper(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type OffreBrochure = Pick<Offre, 'id' | 'nom' | 'accroche' | 'prix' | 'periodicite' | 'accesAppli' | 'nutrition' | 'messagerie' | 'videosMois' | 'seances' | 'essaiJours' | 'active' | 'ordre'>;

/** Offres à mettre dans la brochure : celles en vente, abonnements d'abord puis packs, dans l'ordre du coach. */
export function offresDeLaBrochure<T extends OffreBrochure>(offres: T[]): T[] {
  return offres
    .filter((o) => o.active)
    .sort((a, b) => Number(a.periodicite === 'unique') - Number(b.periodicite === 'unique') || a.ordre - b.ordre);
}

export function brochureHtml(
  offres: OffreBrochure[],
  coach: { nom: string; telephone?: string; email?: string },
  options: { couleur?: string; logo?: string; police?: string; lien?: (id: string) => string } = {},
): string {
  const couleur = options.couleur && estCouleur(options.couleur) ? options.couleur : COULEUR_DEFAUT;
  const fontFace = options.police ? `@font-face { font-family: 'Titre'; src: url(data:font/ttf;base64,${options.police}) format('truetype'); }` : '';
  const liste = offresDeLaBrochure(offres);
  // Plus de 4 offres : cartes plus serrées pour tenir sur la page.
  const serre = liste.length > 4;
  const cartes = liste
    .map((o) => {
      const lignes = contenuOffre(o)
        .map((l) => `<li>${echapper(l)}</li>`)
        .join('');
      const lien = options.lien ? options.lien(o.id) : '';
      return `<div class="carte">
  <div class="nom">${echapper(o.nom)}</div>
  ${o.accroche ? `<div class="accroche">${echapper(o.accroche)}</div>` : ''}
  <div class="prix">${echapper(libellePrix(o))}</div>
  <ul>${lignes}</ul>
  ${lien ? `<div class="lien">S’inscrire en ligne : <span>${echapper(lien)}</span></div>` : ''}
</div>`;
    })
    .join('');
  const contact = [coach.telephone, coach.email].filter(Boolean).map((c) => echapper(c!)).join(' · ');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Les offres de ${echapper(coach.nom)}</title><style>
${fontFace}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #17171A; font-size: 10.5pt; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; min-height: 297mm; position: relative; padding-bottom: 22mm; }
.bandeau { background: ${couleur}; height: 6mm; }
.haut { display: flex; justify-content: space-between; align-items: center; padding: 12mm 16mm 0; gap: 10mm; }
.logo { max-height: 22mm; max-width: 60mm; object-fit: contain; display: block; }
.titre { font-family: 'Titre', 'Bebas Neue', 'Oswald', Impact, 'Arial Narrow', sans-serif; font-size: 44pt; line-height: .9; letter-spacing: .02em; }
.titre span { color: ${couleur}; }
.sous { color: #6B6B73; margin-top: 2mm; font-size: 11pt; }
.grille { display: grid; grid-template-columns: 1fr 1fr; gap: ${serre ? '5mm' : '7mm'}; padding: ${serre ? '8mm' : '12mm'} 16mm 0; }
.carte { border: 0.4mm solid #E4E4E7; border-top: 2mm solid ${couleur}; border-radius: 3mm; padding: ${serre ? '4mm 5mm' : '6mm'}; break-inside: avoid; }
.nom { font-family: 'Titre', 'Bebas Neue', 'Oswald', Impact, 'Arial Narrow', sans-serif; font-size: ${serre ? '20pt' : '24pt'}; line-height: 1; letter-spacing: .02em; }
.accroche { color: #6B6B73; margin-top: 1.5mm; }
.prix { color: ${couleur}; font-weight: 700; font-size: ${serre ? '15pt' : '17pt'}; margin-top: 3mm; }
ul { list-style: none; padding: 0; margin: 3mm 0 0; }
li { padding-left: 5mm; position: relative; margin-top: 1.2mm; }
li::before { content: '✓'; position: absolute; left: 0; color: ${couleur}; font-weight: 700; }
.lien { margin-top: 3mm; font-size: 8pt; color: #6B6B73; word-break: break-all; }
.lien span { color: #17171A; }
.vide { padding: 12mm 16mm; color: #6B6B73; }
.bas { position: absolute; left: 16mm; right: 16mm; bottom: 10mm; border-top: 0.3mm solid #E4E4E7; padding-top: 3mm; display: flex; justify-content: space-between; color: #6B6B73; font-size: 9pt; }
.bas strong { color: #17171A; }
</style></head><body><div class="page">
<div class="bandeau"></div>
<div class="haut">
  <div>
    <div class="titre">Coaching <span>${echapper(coach.nom)}</span></div>
    <div class="sous">Mes formules et mes tarifs</div>
  </div>
  ${options.logo ? `<img class="logo" src="${echapper(options.logo)}" alt="">` : ''}
</div>
${liste.length ? `<div class="grille">${cartes}</div>` : '<div class="vide">Pas encore d’offre en vente.</div>'}
<div class="bas"><span><strong>${echapper(coach.nom)}</strong>${contact ? ` · ${contact}` : ''}</span><span>Paiement sécurisé par carte</span></div>
</div></body></html>`;
}
