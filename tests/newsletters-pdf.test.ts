import { describe, expect, it } from 'vitest';

import { articleDuLien, cheminDuLien, cheminPdf, introPdf, messageWhatsAppPdf } from '../src/domain/newsletters-pdf';
import { erreurNewsletter } from '../src/domain/newsletters';
import ARTICLES from '../src/domain/articles-newsletters.json';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const COACH = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';

describe('newsletters en PDF', () => {
  it('range le PDF dans le dossier du coach et le retrouve depuis le lien signé', () => {
    const chemin = cheminPdf(COACH, 'article-02-proteines-combien-et-quand');
    expect(chemin).toBe(`${COACH}/newsletters/article-02-proteines-combien-et-quand.pdf`);
    const lien = `https://x.supabase.co/storage/v1/object/sign/documents/${chemin}?token=abc`;
    expect(articleDuLien(lien)).toBe('article-02-proteines-combien-et-quand');
    expect(cheminDuLien(lien)).toBe(chemin);
    expect(articleDuLien('https://exemple.fr/autre.pdf')).toBeUndefined();
    expect(cheminPdf(COACH, '../x/../y')).toBe(`${COACH}/newsletters/xy.pdf`);
  });

  it('écrit un message WhatsApp prêt à partir, sans répéter le prénom', () => {
    const m = messageWhatsAppPdf(
      { objet: 'Protéines : combien en faut-il ?', chapeau: '{prenom}, les protéines sont partout.' },
      { prenom: 'Léa', coach: 'Camille', lien: 'https://lien/pdf' },
    );
    expect(m).toBe('Bonjour Léa ! Voici ma nouvelle newsletter : « Protéines : combien en faut-il ? »\n\nLes protéines sont partout.\n\nLe PDF à lire ici :\nhttps://lien/pdf\n\nBonne lecture ! Camille');
    expect(messageWhatsAppPdf({ objet: 'Titre' }, { coach: 'C', lien: 'https://l' })).toMatch(/^Bonjour ! Voici/);
    // PDF joint au message : pas de lien.
    expect(messageWhatsAppPdf({ objet: 'Titre' }, { coach: 'C' })).not.toMatch(/https/);
  });

  it('chaque article de la bibliothèque a son PDF et peut partir tel quel', () => {
    const pdfs = readdirSync(join(__dirname, '../assets/newsletters/pdf'));
    expect(pdfs).toHaveLength(ARTICLES.length);
    for (const a of ARTICLES) {
      expect(pdfs).toContain(`${a.cle.replace(/^article-/, '')}.pdf`);
      const n = { objet: a.objet, chapeau: a.chapeau, message: introPdf(a.lecture), cibles: [a.pour as 'clients'], parEmail: true, parNotif: false, boutonLibelle: 'Lire', boutonLien: 'https://lien.fr/x.pdf' };
      expect(erreurNewsletter(n)).toBeNull();
    }
  });
});
