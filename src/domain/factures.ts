// Factures du coach : numérotées par client (RT38, BT1…), émises à chaque prélèvement Stripe ou d'un bouton,
// et mises en page aux couleurs du coach (PDF A4). Une facture émise ne change plus.

export interface LigneFacture {
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

export interface Facture {
  id: string;
  clientId?: string;
  paiementId?: string;
  numero: string;
  /** AAAA-MM-JJ */
  date: string;
  objet: string;
  emetteur: { nom: string; adresse?: string; telephone?: string; siret?: string; mentions?: string };
  destinataire: { nom: string; adresse?: string };
  lignes: LigneFacture[];
  total: number;
  moyen?: string;
  payeLe?: string;
}

/** En-tête réglé par le coach dans « Mon profil ». */
export interface EnteteFacture {
  nom: string;
  adresse: string;
  telephone: string;
  siret: string;
  mentions: string;
  /** #RRVVBB */
  couleur: string;
  /** Image en data URL. */
  logo?: string;
  /** Tarif de base d'une séance (€, en texte) : un prix plus bas apparaît en remise sur la facture. */
  tarifBase: string;
  /** Coordonnées bancaires imprimées sur chaque facture. */
  iban: string;
  bic: string;
}

export const COULEUR_FACTURE = '#D71920';
export const MENTIONS_FACTURE =
  'Dispensé d’immatriculation au registre du commerce et des sociétés (RCS) et au répertoire des métiers (RM)\nTVA non applicable, art. 293 B du CGI';
/** Couleurs proposées d'un geste ; le coach peut aussi taper la sienne. */
export const COULEURS_FACTURE = ['#D71920', '#0B0B0C', '#1F4E9E', '#0E7C66', '#7A3FB0', '#E07A1F'];

export const estCouleur = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

/** Ce qui empêche d'enregistrer l'en-tête, en clair. */
export function erreursEntete(e: EnteteFacture): string[] {
  const erreurs: string[] = [];
  const siret = e.siret.replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) erreurs.push('Le SIRET compte 14 chiffres.');
  if (!estCouleur(e.couleur)) erreurs.push('Couleur illisible : écris-la comme #D71920.');
  const tarif = Number(e.tarifBase.replace(',', '.'));
  if (!Number.isFinite(tarif) || tarif < 0 || tarif > 10000) erreurs.push('Tarif de base illisible : écris un montant, par exemple 60.');
  const iban = nettoyerIban(e.iban);
  if (iban && !ibanValide(iban)) erreurs.push('IBAN illisible : vérifie-le, il commence par FR76 en France.');
  const bic = nettoyerIban(e.bic);
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) erreurs.push('Le BIC compte 8 ou 11 lettres et chiffres.');
  return erreurs;
}

/** IBAN ou BIC sans espaces, en majuscules. */
export const nettoyerIban = (s: string) => s.replace(/\s/g, '').toUpperCase();

/** Contrôle de l'IBAN (clé modulo 97). */
export function ibanValide(iban: string) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const chiffres = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let reste = 0;
  for (const c of chiffres) reste = (reste * 10 + Number(c)) % 97;
  return reste === 1;
}

/** « FR7630001007941234567890185 » → « FR76 3000 1007 9412 3456 7890 185 ». */
export const ibanLisible = (iban: string) => nettoyerIban(iban).replace(/(.{4})(?=.)/g, '$1 ');

/** Préfixe de numérotation : lettres et chiffres en majuscules, 10 au plus. */
export const nettoyerPrefixe = (p: string) =>
  p
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

/** Numéro que portera la prochaine facture du client. */
export function prochainNumero(prefixe: string | undefined, prochain: number, prenom: string, nom: string) {
  const initiales = nettoyerPrefixe(`${prenom.slice(0, 1)}${nom.slice(0, 1)}`);
  return `${prefixe || initiales || 'F'}${prochain}`;
}

const euros = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`.replace(/ /g, ' ');
const dateFr = (j: string) => j.split('-').reverse().join('/');
const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const texte = (s?: string) => (s ? echapper(s).replace(/\n/g, '<br>') : '');

/** Mention de règlement en bas de facture. */
export function mentionReglement(f: Pick<Facture, 'total' | 'moyen' | 'payeLe'>) {
  if (f.total === 0) return 'Offert : rien à régler.';
  if (!f.payeLe) return `À régler : ${euros(f.total)}. Merci !`;
  const quand = f.payeLe ? ` le ${dateFr(f.payeLe)}` : '';
  if (f.moyen === 'Stripe') return `Payée par prélèvement automatique${quand}.`;
  return `Payée${f.moyen ? ` par ${f.moyen.toLowerCase()}` : ''}${quand}.`;
}

/**
 * La facture en HTML, une page A4 à imprimer ou à transformer en PDF.
 * `options.police` : Bebas Neue en base64 pour le titre, comme les autres documents de l'appli.
 */
export function factureHtml(f: Facture, style: { couleur?: string; logo?: string; police?: string; iban?: string; bic?: string } = {}): string {
  const couleur = style.couleur && estCouleur(style.couleur) ? style.couleur : COULEUR_FACTURE;
  const fontFace = style.police ? `@font-face { font-family: 'Titre'; src: url(data:font/ttf;base64,${style.police}) format('truetype'); }` : '';
  const e = f.emetteur;
  const remise = f.lignes.filter((l) => l.montant < 0).reduce((s, l) => s - l.montant, 0);
  const lignes = f.lignes
    .map(
      (l) =>
        `<tr class="${l.montant < 0 ? 'remise' : ''}"><td>${echapper(l.libelle)}</td><td class="n">${l.quantite}</td><td class="n">${euros(l.prixUnitaire)}</td><td class="n">${euros(l.montant)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${echapper(f.numero)}</title><style>
${fontFace}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #17171A; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; min-height: 297mm; padding: 0 0 14mm; position: relative; }
.bandeau { background: ${couleur}; height: 6mm; }
.haut { display: flex; justify-content: space-between; align-items: flex-start; padding: 12mm 16mm 0; gap: 10mm; }
.logo { max-height: 22mm; max-width: 60mm; object-fit: contain; display: block; margin-bottom: 4mm; }
.emetteur .nom { font-weight: 700; font-size: 12pt; }
.emetteur, .client { color: #3A3A40; }
.titre { font-family: 'Titre', 'Bebas Neue', 'Oswald', Impact, 'Arial Narrow', sans-serif; font-size: 40pt; line-height: .9; color: ${couleur}; letter-spacing: .02em; text-align: right; }
.numero { text-align: right; font-size: 12pt; font-weight: 700; margin-top: 2mm; }
.date { text-align: right; color: #6B6B73; }
.bloc { display: flex; justify-content: space-between; padding: 10mm 16mm 0; gap: 10mm; }
.etiquette { font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color: ${couleur}; font-weight: 700; margin-bottom: 1.5mm; }
.client .nom { font-weight: 700; font-size: 11.5pt; color: #17171A; }
.objet { padding: 8mm 16mm 0; font-size: 11pt; }
table { width: calc(100% - 32mm); margin: 5mm 16mm 0; border-collapse: collapse; }
th { text-align: left; font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: #fff; background: ${couleur}; padding: 2.5mm 3mm; }
th.n, td.n { text-align: right; white-space: nowrap; }
td { padding: 3mm; border-bottom: 0.3mm solid #E4E4E7; }
tr.remise td { color: ${couleur}; }
.totaux { display: flex; justify-content: flex-end; padding: 5mm 16mm 0; }
.totaux table { width: 80mm; margin: 0; }
.totaux td { border: 0; padding: 1.2mm 3mm; }
.totaux .final td { font-weight: 700; font-size: 13pt; border-top: 0.6mm solid ${couleur}; padding-top: 2.5mm; }
.reglement { margin: 8mm 16mm 0; padding: 4mm 5mm; border-left: 1.6mm solid ${couleur}; background: #F6F6F7; border-radius: 0 2mm 2mm 0; }
.banque { margin: 4mm 16mm 0; font-size: 9.5pt; color: #3A3A40; }
.banque b { color: #17171A; }
.mentions { position: absolute; left: 16mm; right: 16mm; bottom: 12mm; font-size: 8.5pt; color: #6B6B73; border-top: 0.3mm solid #E4E4E7; padding-top: 3mm; }
</style></head><body><div class="page">
<div class="bandeau"></div>
<div class="haut">
  <div class="emetteur">
    ${style.logo ? `<img class="logo" src="${echapper(style.logo)}" alt="">` : ''}
    <div class="nom">${echapper(e.nom)}</div>
    ${e.adresse ? `<div>${texte(e.adresse)}</div>` : ''}
    ${e.telephone ? `<div>Tél. ${echapper(e.telephone)}</div>` : ''}
    ${e.siret ? `<div>SIRET ${echapper(e.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4'))}</div>` : ''}
  </div>
  <div>
    <div class="titre">Facture</div>
    <div class="numero">N° ${echapper(f.numero)}</div>
    <div class="date">Du ${dateFr(f.date)}</div>
  </div>
</div>
<div class="bloc">
  <div></div>
  <div class="client"><div class="etiquette">Facturé à</div><div class="nom">${echapper(f.destinataire.nom)}</div>${f.destinataire.adresse ? `<div>${texte(f.destinataire.adresse)}</div>` : ''}</div>
</div>
<div class="objet"><b>Objet :</b> ${echapper(f.objet)}</div>
<table><thead><tr><th>Détail</th><th class="n">Qté</th><th class="n">Prix unitaire</th><th class="n">Montant</th></tr></thead><tbody>${lignes}</tbody></table>
<div class="totaux"><table>
  ${remise > 0 ? `<tr><td>Sous-total</td><td class="n">${euros(f.total + remise)}</td></tr><tr><td>Remise</td><td class="n">−${euros(remise)}</td></tr>` : ''}
  <tr class="final"><td>Total à payer</td><td class="n">${euros(f.total)}</td></tr>
</table></div>
<div class="reglement">${echapper(mentionReglement(f))}</div>
${style.iban ? `<div class="banque"><span class="etiquette">Coordonnées bancaires</span><br><b>IBAN</b> ${echapper(ibanLisible(style.iban))}${style.bic ? ` · <b>BIC</b> ${echapper(nettoyerIban(style.bic))}` : ''} · <b>Titulaire</b> ${echapper(e.nom)}</div>` : ''}
${e.mentions ? `<div class="mentions">${texte(e.mentions)}</div>` : ''}
</div></body></html>`;
}
