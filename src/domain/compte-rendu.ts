// Compte rendu du Booster (« Plan d'Action Personnalisé ») remis au client, sans IA :
// il assemble le bilan d'accueil, l'évaluation, l'entretien, le mot du coach et les trois priorités.

import { preparerSeance } from './briefing';
import type { Booster, Contact } from './crm';
import { TESTS } from './evaluation';

/** Résultats qui ne se placent pas sur l'échelle d'un test. */
const HORS_ECHELLE = /^(Non |À approfondir|Test interrompu)/;

export interface SectionCompteRendu {
  titre: string;
  lignes: string[];
  numerotee?: boolean;
}

export interface TestCompteRendu {
  libelle: string;
  resultat: string;
  /** Position du résultat sur l'échelle du test (1 = le plus favorable), absente pour « Non réalisé », « Non adapté »… */
  niveau?: number;
  echelle: number;
  details: string[];
}

export interface CompteRendu {
  titre: string;
  pour: string;
  prenom: string;
  date: string;
  coach: string;
  sections: SectionCompteRendu[];
  conclusion: string[];
  /** Les mêmes contenus, rangés pour la mise en page du PDF. */
  pdf: {
    mot?: string;
    objectif?: string;
    pourquoi?: string;
    echeance?: string;
    projection?: string;
    tests: TestCompteRendu[];
    douleur?: string;
    notes?: string;
    leviers: string[];
    freins: string[];
    priorites: string[];
  };
}

export const TITRE_COMPTE_RENDU = 'Plan d’Action Personnalisé';

const dateLongue = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function construireCompteRendu(contact: Contact, booster: Booster, reponses: Record<string, string> | undefined, coach: string): CompteRendu {
  const bilan = reponses ? preparerSeance(reponses) : undefined;
  const entretien = booster.entretien ?? {};
  const e = booster.evaluation;
  const sections: SectionCompteRendu[] = [];
  const ajouter = (titre: string, lignes: (string | undefined | false)[], numerotee?: boolean) => {
    const propres = lignes.filter((l): l is string => !!l && !!l.trim());
    if (propres.length) sections.push({ titre, lignes: propres, numerotee });
  };

  ajouter('Le mot de ton coach', [booster.compteRendu]);
  ajouter('Ton point de départ', [
    ...(bilan?.objectif.filter((l) => !l.startsWith('Ce qui l’amène')) ?? []).map((l, i) => (i === 0 ? `Objectif : ${l}` : l)),
    entretien.projection && `Dans six mois : ${entretien.projection}`,
  ]);
  ajouter(
    'Ton évaluation physique',
    e
      ? [
          ...TESTS.filter((t) => e.tests[t.id]?.resultat).map((t) => {
            const r = e.tests[t.id]!;
            const details = [t.rpe && r.rpe ? `effort ressenti ${r.rpe}/10` : '', r.observations.join(', ')].filter(Boolean).join(' · ');
            return `${t.libelle} : ${r.resultat}${details ? ` (${details})` : ''}`;
          }),
          e.douleur === 'Oui' && `Douleur ou gêne pendant les tests${e.douleurPrecision ? ` : ${e.douleurPrecision}` : ''}`,
          e.notes,
        ]
      : [],
  );
  ajouter('Tes habitudes à travailler', bilan?.leviers ?? []);
  ajouter('Ce qui peut te freiner', [entretien.freins, bilan?.motivation.find((l) => l.startsWith('Principal obstacle'))]);
  ajouter('Tes 3 priorités', booster.priorites, true);

  const tests: TestCompteRendu[] = e
    ? TESTS.filter((t) => e.tests[t.id]?.resultat).map((t) => {
        const r = e.tests[t.id]!;
        const echelle = t.resultats.filter((x) => !HORS_ECHELLE.test(x));
        const position = echelle.indexOf(r.resultat!);
        return {
          libelle: t.libelle,
          resultat: r.resultat!,
          niveau: position >= 0 ? position + 1 : undefined,
          echelle: echelle.length,
          details: [t.rpe && r.rpe ? `Effort ressenti ${r.rpe}/10` : '', ...r.observations].filter(Boolean),
        };
      })
    : [];
  const valeur = (prefixe: string) => bilan?.objectif.find((l) => l.startsWith(prefixe))?.slice(prefixe.length);
  const propre = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

  return {
    titre: TITRE_COMPTE_RENDU,
    pour: `${contact.prenom} ${contact.nom}`.trim(),
    prenom: contact.prenom,
    date: dateLongue(booster.date),
    coach,
    pdf: {
      mot: propre(booster.compteRendu),
      objectif: bilan?.objectif[0] && !bilan.objectif[0].includes(' : ') ? bilan.objectif[0] : undefined,
      pourquoi: valeur('Pourquoi : '),
      echeance: valeur('Échéance : '),
      projection: propre(entretien.projection),
      tests,
      douleur: e?.douleur === 'Oui' ? e.douleurPrecision?.trim() || 'Signalée pendant les tests' : undefined,
      notes: propre(e?.notes),
      leviers: bilan?.leviers ?? [],
      freins: [propre(entretien.freins), bilan?.motivation.find((l) => l.startsWith('Principal obstacle'))].filter((x): x is string => !!x),
      priorites: booster.priorites.filter((p) => p.trim()),
    },
    sections,
    conclusion: [
      'Ces recommandations sont à appliquer dès maintenant, que tu choisisses ou non de poursuivre un accompagnement.',
      'À très bientôt !',
      coach,
    ],
  };
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const texte = (s: string) => echapper(s).replace(/\n/g, '<br>');

/** Rayures diagonales du bandeau quand aucune photo n'est fournie. */
const MOTIF = `<svg class="motif" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<g transform="rotate(-24 150 150)"><rect x="60" y="-60" width="34" height="420" fill="#D71920"/><rect x="118" y="-60" width="12" height="420" fill="#D71920" opacity=".55"/>
<rect x="150" y="-60" width="58" height="420" fill="#FFFFFF" opacity=".06"/><rect x="226" y="-60" width="6" height="420" fill="#D71920" opacity=".8"/></g></svg>`;

function jauge(t: TestCompteRendu) {
  if (!t.niveau) return '<div class="jauge vide">Non évalué sur l’échelle</div>';
  // Le niveau 1 est le plus favorable : il remplit toute la jauge.
  const pleins = t.echelle - t.niveau + 1;
  return `<div class="jauge">${Array.from({ length: t.echelle }, (_, i) => `<span class="${i < pleins ? 'plein' : ''}"></span>`).join('')}</div>`;
}

/**
 * Le compte rendu en HTML, mis en page pour un PDF A4 de deux pages.
 * `options.police` : Bebas Neue en base64 (titres) ; `options.photo` : photo du coach ou de la salle (URL ou data URI).
 */
export function compteRenduHtml(cr: CompteRendu, options: { police?: string; photo?: string } = {}): string {
  const d = cr.pdf;
  const fontFace = options.police ? `@font-face { font-family: 'Titre'; src: url(data:font/ttf;base64,${options.police}) format('truetype'); }` : '';
  const visuel = options.photo
    ? `<div class="photo" style="background-image:url('${echapper(options.photo)}')"></div>`
    : MOTIF;

  const objectif = d.objectif
    ? `<section class="objectif"><div class="etiquette">Ton objectif</div><div class="grand">${texte(d.objectif)}</div>
${d.pourquoi ? `<p class="pourquoi">« ${texte(d.pourquoi)} »</p>` : ''}
${d.echeance || d.projection ? `<div class="reperes">${d.echeance ? `<div><span>Échéance</span>${texte(d.echeance)}</div>` : ''}${d.projection ? `<div><span>Dans six mois</span>${texte(d.projection)}</div>` : ''}</div>` : ''}
</section>`
    : '';

  const tests = d.tests.length
    ? `<section><h2>Ton évaluation physique</h2><div class="tests">${d.tests
        .map(
          (t) => `<div class="test"><div class="nom">${echapper(t.libelle)}</div><div class="resultat">${echapper(t.resultat)}</div>${jauge(t)}
${t.details.length ? `<div class="details">${t.details.map((x) => `<span>${echapper(x)}</span>`).join('')}</div>` : ''}</div>`,
        )
        .join('')}</div>
${d.douleur ? `<div class="alerte"><b>Douleur ou gêne pendant les tests</b> ${texte(d.douleur)}</div>` : ''}
${d.notes ? `<p class="notes">${texte(d.notes)}</p>` : ''}</section>`
    : '';

  const priorites = d.priorites.length
    ? `<section class="priorites"><h2>Tes ${d.priorites.length} priorités</h2>${d.priorites
        .map((p, i) => `<div class="priorite"><div class="num">${i + 1}</div><div class="texte">${texte(p)}</div></div>`)
        .join('')}</section>`
    : '';

  const colonnes =
    d.leviers.length || d.freins.length
      ? `<section class="colonnes">${d.leviers.length ? `<div class="encadre"><h3>Tes leviers au quotidien</h3><ul>${d.leviers.map((l) => `<li>${echapper(l)}</li>`).join('')}</ul></div>` : ''}
${d.freins.length ? `<div class="encadre sombre"><h3>Ce qui peut te freiner</h3><ul>${d.freins.map((l) => `<li>${echapper(l)}</li>`).join('')}</ul><p>On en tient compte dans ton plan : le but est d’avancer avec ta vraie vie, pas contre elle.</p></div>` : ''}</section>`
      : '';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${fontFace}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #17171A; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.titre, h2, .grand, .nom, .num, .citation { font-family: 'Titre', 'Bebas Neue', 'Oswald', Impact, 'Arial Narrow', sans-serif; font-weight: 400; letter-spacing: .02em; }
.page { width: 210mm; min-height: 297mm; position: relative; overflow: hidden; }
.page + .page { page-break-before: always; }
.contenu { padding: 9mm 14mm 12mm; display: flex; flex-direction: column; gap: 6mm; }
.bandeau { background: #0B0B0C; color: #fff; height: 86mm; position: relative; padding: 13mm 14mm; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
.bandeau .motif { position: absolute; right: -10mm; top: 0; width: 110mm; height: 100%; }
.bandeau .photo { position: absolute; right: 0; top: 0; width: 46%; height: 100%; background-size: cover; background-position: center; }
.bandeau .photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #0B0B0C 0%, rgba(11,11,12,0) 45%); }
.bandeau > div { position: relative; }
.surtitre { font-size: 9pt; letter-spacing: .18em; text-transform: uppercase; color: #FFB3B5; font-weight: 600; }
.titre { font-size: 50pt; line-height: .92; margin: 3mm 0 4mm; }
.titre em { font-style: normal; color: #D71920; }
.pour { font-size: 13pt; } .pour b { font-weight: 600; }
h2 { font-size: 19pt; margin: 0 0 3mm; color: #0B0B0C; display: flex; align-items: center; gap: 3mm; }
h2::before { content: ''; width: 7mm; height: 2.4mm; background: #D71920; display: inline-block; }
section { break-inside: avoid; }
.mot { background: #F6F6F7; border-radius: 4mm; padding: 6mm 7mm 5mm 16mm; position: relative; font-size: 11.5pt; }
.mot::before { content: '“'; position: absolute; left: 4mm; top: -3mm; font-size: 64pt; color: #D71920; font-family: Georgia, serif; line-height: 1; }
.mot .signe { margin-top: 2mm; color: #6B6B73; font-size: 10pt; }
.objectif { border-left: 2.4mm solid #D71920; padding: 1mm 0 1mm 6mm; }
.etiquette { font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: #6B6B73; font-weight: 600; }
.grand { font-size: 30pt; line-height: 1; margin: 1mm 0 2mm; }
.pourquoi { margin: 0 0 3mm; color: #3A3A40; font-style: italic; }
.reperes { display: flex; gap: 4mm; } .reperes div { flex: 1; background: #FBE8E9; border-radius: 3mm; padding: 3mm 4mm; font-weight: 600; }
.reperes span { display: block; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #D71920; margin-bottom: 1mm; }
.tests { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.test { border: 0.3mm solid #E4E4E8; border-radius: 3mm; padding: 3.5mm 4mm; break-inside: avoid; }
.test .nom { font-size: 15pt; color: #6B6B73; line-height: 1; }
.test .resultat { font-weight: 700; font-size: 11pt; margin: 1mm 0 2mm; }
.jauge { display: flex; gap: 1mm; } .jauge span { flex: 1; height: 1.8mm; border-radius: 1mm; background: #E4E4E8; } .jauge span.plein { background: #D71920; }
.jauge.vide { font-size: 8pt; color: #A3A3AB; }
.details { margin-top: 2mm; display: flex; flex-wrap: wrap; gap: 1mm; } .details span { font-size: 7.8pt; background: #F6F6F7; border-radius: 2mm; padding: .6mm 2mm; color: #3A3A40; }
.alerte { margin-top: 3mm; background: #FFF1E6; border-radius: 3mm; padding: 3mm 4mm; color: #7A2E0B; } .alerte b { display: block; font-size: 8.5pt; letter-spacing: .1em; text-transform: uppercase; }
.notes { margin: 3mm 0 0; color: #3A3A40; }
.entete2 { display: flex; justify-content: space-between; align-items: center; padding: 8mm 14mm 0; font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: #6B6B73; font-weight: 600; }
.entete2 b { color: #D71920; }
.priorites { background: #0B0B0C; color: #fff; border-radius: 5mm; padding: 7mm 8mm 4mm; }
.priorites h2 { color: #fff; font-size: 26pt; }
.priorite { display: flex; gap: 6mm; align-items: center; padding: 4mm 0; border-top: 0.3mm solid rgba(255,255,255,.14); }
.priorite .num { font-size: 52pt; line-height: .8; color: #D71920; width: 14mm; text-align: center; }
.priorite .texte { font-size: 14pt; font-weight: 600; }
.colonnes { display: flex; gap: 4mm; } .encadre { flex: 1; border-radius: 4mm; padding: 5mm 6mm; background: #F6F6F7; }
.encadre h3 { margin: 0 0 2mm; font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: #D71920; }
.encadre ul { margin: 0; padding: 0; list-style: none; } .encadre li { padding: 1.2mm 0 1.2mm 6mm; position: relative; border-bottom: 0.2mm solid #E4E4E8; }
.encadre li::before { content: ''; position: absolute; left: 0; top: 2.9mm; width: 2.4mm; height: 2.4mm; border-radius: 50%; background: #D71920; }
.encadre.sombre { background: #FBE8E9; } .encadre p { margin: 3mm 0 0; font-size: 9.5pt; color: #3A3A40; }
.envol { margin-top: auto; border-radius: 5mm; background: linear-gradient(120deg, #D71920, #8E0F14); color: #fff; padding: 7mm 8mm; position: relative; overflow: hidden; }
.envol .citation { font-size: 25pt; line-height: 1.02; max-width: 120mm; }
.envol p { margin: 3mm 0 0; max-width: 135mm; opacity: .92; }
.signature { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 2mm; color: #6B6B73; font-size: 9.5pt; }
.signature b { color: #17171A; font-size: 12pt; display: block; }
</style></head><body>
<div class="page">
  <header class="bandeau">${visuel}<div>
    <div class="surtitre">Séance Booster · ${echapper(cr.date)}</div>
    <div class="titre">Plan d’action<br><em>personnalisé</em></div>
    <div class="pour">Pour <b>${echapper(cr.pour)}</b></div>
  </div></header>
  <div class="contenu">
    ${d.mot ? `<section class="mot">${texte(d.mot)}<div class="signe">${echapper(cr.coach)}, ton coach</div></section>` : ''}
    ${objectif}
    ${tests}
  </div>
</div>
<div class="page">
  <div class="entete2"><span>Plan d’action · <b>${echapper(cr.prenom)}</b></span><span>${echapper(cr.date)}</span></div>
  <div class="contenu" style="min-height: 280mm">
    ${priorites}
    ${colonnes}
    <section class="envol"><div class="citation">Ce n’est pas une question de perfection. C’est une question de régularité.</div>
      <p>${echapper(cr.conclusion[0])}</p></section>
    <div class="signature"><div><b>${echapper(cr.coach)}</b>Ton coach · À très bientôt !</div><div>Coach OS</div></div>
  </div>
</div>
</body></html>`;
}
