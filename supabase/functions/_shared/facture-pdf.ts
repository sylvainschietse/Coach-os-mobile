// PDF d'une facture, à partir de la ligne `factures` (émetteur, destinataire, lignes figés à l'émission).
// Sert à joindre la facture au mail de relance, pour les clients qui n'ont pas l'appli.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

export interface Facture {
  numero: string;
  date: string;
  objet: string | null;
  total: number | string;
  emetteur: { nom?: string; adresse?: string; siret?: string; telephone?: string; mentions?: string } | null;
  destinataire: { nom?: string; adresse?: string } | null;
  lignes: { libelle?: string; quantite?: number; prix_unitaire?: number; montant?: number; prix_base?: number; remise_pct?: number }[] | null;
}

const EXTRA = '€‘’“”–—…•œŒ';
/** Les polices standard du PDF ne connaissent que le latin : un caractère inconnu (emoji…) est retiré. */
const propre = (t: unknown) => String(t ?? '').replace(/\r/g, '').split('').filter((c) => c === '\n' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 255) || EXTRA.includes(c)).join('');
export const euros = (n: number | string | undefined) => `${Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ')} €`;
const dateFr = (iso: string) => iso.split('-').reverse().join('/');

function couleur(hex?: string | null) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const v = m ? parseInt(m[1], 16) : 0xd71920;
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

function couper(texte: string, police: PDFFont, taille: number, largeur: number) {
  const sortie: string[] = [];
  for (const paragraphe of propre(texte).split('\n')) {
    let ligne = '';
    for (const mot of paragraphe.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (police.widthOfTextAtSize(essai, taille) > largeur && ligne) {
        sortie.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    sortie.push(ligne);
  }
  return sortie;
}

export async function facturePdf(f: Facture, options: { couleur?: string | null; iban?: string | null; bic?: string | null }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Facture ${f.numero}`);
  const page: PDFPage = doc.addPage([595.28, 841.89]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = couleur(options.couleur);
  const gris = rgb(0.35, 0.35, 0.35);
  const G = 50;
  const D = 545;
  let y = 790;
  const ecrire = (t: string, x: number, yy: number, o: { police?: PDFFont; taille?: number; c?: ReturnType<typeof rgb>; droite?: boolean } = {}) => {
    const police = o.police ?? normal;
    const taille = o.taille ?? 10;
    const texte = propre(t);
    page.drawText(texte, { x: o.droite ? x - police.widthOfTextAtSize(texte, taille) : x, y: yy, size: taille, font: police, color: o.c ?? rgb(0.1, 0.1, 0.1) });
  };

  page.drawRectangle({ x: 0, y: 821, width: 595.28, height: 21, color: accent });
  ecrire('FACTURE', G, y, { police: gras, taille: 22, c: accent });
  ecrire(`N° ${f.numero}`, D, y + 6, { police: gras, taille: 12, droite: true });
  ecrire(`Date : ${dateFr(f.date)}`, D, y - 10, { droite: true, c: gris });
  y -= 50;

  // Émetteur à gauche, client à droite.
  const e = f.emetteur ?? {};
  const blocE = [e.nom ?? '', ...(e.adresse ?? '').split('\n'), e.telephone ? `Tél. ${e.telephone}` : '', e.siret ? `SIRET ${e.siret}` : ''].filter(Boolean);
  const d = f.destinataire ?? {};
  const blocD = [d.nom ?? '', ...(d.adresse ?? '').split('\n')].filter((l, i, t) => l && !(i > 0 && l === t[0]));
  ecrire('ÉMETTEUR', G, y, { police: gras, taille: 8, c: accent });
  ecrire('FACTURÉ À', 320, y, { police: gras, taille: 8, c: accent });
  y -= 15;
  for (let i = 0; i < Math.max(blocE.length, blocD.length); i++) {
    if (blocE[i]) ecrire(blocE[i], G, y - i * 14, { police: i === 0 ? gras : normal });
    if (blocD[i]) ecrire(blocD[i], 320, y - i * 14, { police: i === 0 ? gras : normal });
  }
  y -= Math.max(blocE.length, blocD.length) * 14 + 20;

  if (f.objet) {
    ecrire(`Objet : ${f.objet}`, G, y, { police: gras, taille: 11 });
    y -= 26;
  }

  // Tableau des lignes.
  page.drawRectangle({ x: G, y: y - 6, width: D - G, height: 22, color: accent, opacity: 0.12 });
  ecrire('Désignation', G + 8, y, { police: gras, taille: 9 });
  ecrire('Qté', 370, y, { police: gras, taille: 9, droite: true });
  ecrire('Prix unitaire', 460, y, { police: gras, taille: 9, droite: true });
  ecrire('Montant', D - 8, y, { police: gras, taille: 9, droite: true });
  y -= 24;
  for (const l of f.lignes ?? []) {
    const lignes = couper(l.libelle ?? '', normal, 10, 270);
    if (l.prix_base && l.remise_pct) lignes.push(`Prix de base ${euros(l.prix_base)}, remise ${String(l.remise_pct).replace('.', ',')} %`);
    lignes.forEach((t, i) => ecrire(t, G + 8, y - i * 13, { taille: i === lignes.length - 1 && l.prix_base && l.remise_pct ? 8 : 10, c: i === lignes.length - 1 && l.prix_base && l.remise_pct ? gris : undefined }));
    if (l.quantite != null) ecrire(String(l.quantite), 370, y, { droite: true });
    if (l.prix_unitaire != null) ecrire(euros(l.prix_unitaire), 460, y, { droite: true });
    ecrire(euros(l.montant), D - 8, y, { droite: true });
    y -= lignes.length * 13 + 10;
    page.drawLine({ start: { x: G, y: y + 4 }, end: { x: D, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  }
  y -= 14;
  page.drawRectangle({ x: 340, y: y - 8, width: D - 340, height: 26, color: accent });
  ecrire('TOTAL', 352, y, { police: gras, taille: 11, c: rgb(1, 1, 1) });
  ecrire(euros(f.total), D - 10, y, { police: gras, taille: 12, c: rgb(1, 1, 1), droite: true });
  y -= 44;

  if (options.iban) {
    ecrire('Règlement par virement', G, y, { police: gras, taille: 10 });
    ecrire(`IBAN : ${options.iban}${options.bic ? `   BIC : ${options.bic}` : ''}`, G, y - 14, { taille: 9 });
    ecrire(`Référence à indiquer : ${f.numero}`, G, y - 27, { taille: 9, c: gris });
    y -= 50;
  }
  for (const t of couper(e.mentions ?? '', normal, 8, D - G)) {
    ecrire(t, G, Math.max(y, 60), { taille: 8, c: gris });
    y -= 11;
  }
  return await doc.save();
}

/** Base64 d'un contenu binaire, pour une pièce jointe Brevo. */
export function base64Octets(octets: Uint8Array) {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}
