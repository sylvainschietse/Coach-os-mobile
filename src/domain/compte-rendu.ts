// Compte rendu du Booster (« Plan d'Action Personnalisé ») remis au client, sans IA :
// il assemble le bilan d'accueil, l'évaluation, l'entretien, le mot du coach et les trois priorités.

import { preparerSeance } from './briefing';
import type { Booster, Contact } from './crm';
import { TESTS } from './evaluation';

export interface SectionCompteRendu {
  titre: string;
  lignes: string[];
  numerotee?: boolean;
}

export interface CompteRendu {
  titre: string;
  pour: string;
  date: string;
  sections: SectionCompteRendu[];
  conclusion: string[];
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

  return {
    titre: TITRE_COMPTE_RENDU,
    pour: `${contact.prenom} ${contact.nom}`.trim(),
    date: dateLongue(booster.date),
    sections,
    conclusion: [
      'Ces recommandations sont à appliquer dès maintenant, que tu choisisses ou non de poursuivre un accompagnement.',
      'À très bientôt !',
      coach,
    ],
  };
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Le même contenu en HTML, mis en page pour un PDF A4. */
export function compteRenduHtml(cr: CompteRendu): string {
  const sections = cr.sections
    .map((s) => {
      const balise = s.numerotee ? 'ol' : 'ul';
      const contenu =
        s.lignes.length === 1 && !s.numerotee
          ? `<p>${echapper(s.lignes[0]).replace(/\n/g, '<br>')}</p>`
          : `<${balise}>${s.lignes.map((l) => `<li>${echapper(l)}</li>`).join('')}</${balise}>`;
      return `<section><h2>${echapper(s.titre)}</h2>${contenu}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1A1A1A; font-size: 11.5pt; line-height: 1.5; margin: 0; }
header { border-bottom: 3px solid #D7262E; padding-bottom: 10px; margin-bottom: 18px; }
h1 { font-size: 24pt; margin: 0; text-transform: uppercase; letter-spacing: .5px; }
.pour { color: #555; margin-top: 4px; }
h2 { color: #D7262E; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 6px; }
section { break-inside: avoid; }
ul, ol { margin: 0; padding-left: 20px; } li { margin: 2px 0; }
ol li { font-weight: 600; }
footer { margin-top: 24px; border-top: 1px solid #DDD; padding-top: 10px; }
footer p { margin: 4px 0; }
</style></head><body>
<header><h1>${echapper(cr.titre)}</h1><div class="pour">${echapper(cr.pour)} · séance Booster du ${echapper(cr.date)}</div></header>
${sections}
<footer>${cr.conclusion.map((l) => `<p>${echapper(l)}</p>`).join('')}</footer>
</body></html>`;
}
