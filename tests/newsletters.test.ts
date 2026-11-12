/// <reference types="node" />
// Newsletters : variables, mise en page de l'article, destinataires et validation. Données fictives.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  blocsArticle,
  cibleDe,
  compterDestinataires,
  corpsBrevoNewsletter,
  erreurNewsletter,
  mailNewsletter,
  MAX_MESSAGE,
  notifNewsletter,
  personnaliser,
  THEMES,
} from '@/domain/newsletters';
import { fichierIllustration } from '@/domain/illustrations-newsletters';

const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('newsletters', () => {
  it('la copie du serveur est identique', () => {
    expect(lire('supabase/functions/_shared/newsletters.ts')).toBe(lire('src/domain/newsletters.ts'));
  });

  it('remplace le prénom, et l’efface proprement quand il manque', () => {
    expect(personnaliser('Bonjour {prenom}, {coach} ici.', { prenom: 'Inès', coach: 'Sylvain' })).toBe('Bonjour Inès, Sylvain ici.');
    expect(personnaliser('Bonjour {prenom},', { coach: 'Sylvain' })).toBe('Bonjour,');
    expect(personnaliser('Ça fait un moment, {prenom} !', { coach: 'S' })).toBe('Ça fait un moment !');
  });

  it('découpe l’article en intertitres, listes, citations et paragraphes', () => {
    expect(blocsArticle('Intro.\n\n## Titre\n- un\n- deux\n\n> Belle phrase\n\nFin.')).toEqual([
      { type: 'paragraphe', texte: 'Intro.' },
      { type: 'intertitre', texte: 'Titre' },
      { type: 'liste', points: ['un', 'deux'] },
      { type: 'citation', texte: 'Belle phrase' },
      { type: 'paragraphe', texte: 'Fin.' },
    ]);
  });

  it('met l’article en page, échappe le HTML et ajoute le lien de désabonnement', () => {
    const m = mailNewsletter(
      { rubrique: 'Conseil', objet: 'Salut {prenom}', chapeau: 'Intro', message: '## A <b>\nTexte', image: 'https://x.test/i.jpg', boutonLibelle: 'Réserver', boutonLien: 'https://x.test/r' },
      { prenom: 'Léa', coach: 'Sylvain', desabonnement: 'https://app.test/desabonnement/j1' },
    );
    expect(m.sujet).toBe('Salut Léa');
    expect(m.html).toContain('La lettre de Sylvain');
    expect(m.html).toContain('https://x.test/i.jpg');
    expect(m.html).toContain("A &lt;b&gt;");
    expect(m.html).not.toContain('<b>');
    expect(m.html).toContain('https://app.test/desabonnement/j1');
    expect(m.html).toContain('https://x.test/r');
    expect(m.texte).toContain('Ne plus recevoir ces nouvelles : https://app.test/desabonnement/j1');
    // Une image qui n'est pas en https n'est pas montrée.
    expect(mailNewsletter({ objet: 'T', message: 'x', image: 'javascript:alert(1)' }, { coach: 'S', desabonnement: 'https://d' }).html).not.toContain('javascript:');
  });

  it('dit à Gmail comment se désabonner', () => {
    const c = corpsBrevoNewsletter({ email: 'coach@x.test', nom: 'Sylvain' }, { email: 'a@x.test' }, { sujet: 's', html: 'h', texte: 't' }, { desabonnement: 'https://d', id: 'n1' });
    expect(c.headers['List-Unsubscribe']).toBe('<https://d>');
  });

  it('la notification reprend le titre et l’introduction', () => {
    expect(notifNewsletter({ objet: 'Le défi', chapeau: '{prenom}, un défi simple.', message: 'x' }, { prenom: 'Léa', coach: 'S' })).toEqual({ titre: 'Le défi', corps: 'Léa, un défi simple.' });
    expect(notifNewsletter({ objet: 'T', message: 'Bonjour {prenom},\n\n## Partie\nTexte' }, { coach: 'S' }).corps).toBe('Partie Texte');
  });

  it('range les contacts : clients actifs, en veille, jamais les prospects ni les archivés', () => {
    expect(cibleDe({ statut: 'client' })).toBe('clients');
    expect(cibleDe({ statut: 'booster_fait', statutCrm: 'En veille' })).toBe('veille');
    expect(cibleDe({ statut: 'prospect' })).toBeNull();
    expect(cibleDe({ statut: 'archive', statutCrm: 'En veille' })).toBeNull();
    const c = compterDestinataires([
      { statut: 'client', email: 'a@x.fr', appli: true },
      { statut: 'client', email: 'pas-un-mail' },
      { statut: 'client', email: 'b@x.fr', desabonne: true, appli: true },
      { statut: 'booster_fait', statutCrm: 'En veille', email: 'c@x.fr' },
    ]);
    expect(c).toEqual({ clients: { total: 3, emails: 1, notifs: 1 }, veille: { total: 1, emails: 1, notifs: 0 } });
  });

  it('refuse ce qui ne peut pas partir', () => {
    const ok = { objet: 'T', message: 'M', cibles: ['clients' as const], parEmail: true, parNotif: false };
    expect(erreurNewsletter(ok)).toBeNull();
    expect(erreurNewsletter({ ...ok, cibles: [] })).toMatch(/pour qui/);
    expect(erreurNewsletter({ ...ok, parEmail: false })).toMatch(/l’envoi/);
    expect(erreurNewsletter({ ...ok, message: '{nom}' })).toMatch(/pas reconnu/);
    expect(erreurNewsletter({ ...ok, boutonLibelle: 'Go', boutonLien: 'www.x' })).toMatch(/https/);
    expect(erreurNewsletter(ok, Date.now())).toMatch(/jour et l’heure/);
    expect(erreurNewsletter({ ...ok, envoiLe: new Date(Date.now() - 3_600_000).toISOString() }, Date.now())).toMatch(/passée/);
    expect(erreurNewsletter({ ...ok, envoiLe: new Date(Date.now() + 3_600_000).toISOString() }, Date.now())).toBeNull();
  });

  it('les thèmes sont prêts à partir, avec leur illustration', () => {
    for (const t of THEMES) {
      expect(erreurNewsletter({ ...t, cibles: [t.pour], parEmail: true, parNotif: true })).toBeNull();
      expect(t.message.length).toBeLessThan(MAX_MESSAGE);
      expect(() => readFileSync(join(__dirname, '../assets/newsletters', `${fichierIllustration(t.cle)}.jpg`))).not.toThrow();
    }
    expect(THEMES.filter((t) => t.pour === 'clients').length).toBeGreaterThan(3);
    expect(THEMES.filter((t) => t.pour === 'veille').length).toBeGreaterThan(3);
  });
});

describe('articles complets', () => {
  it('les 20 articles sont prêts à partir, avec une illustration livrée et des sources', async () => {
    const articles = (await import('@/domain/articles-newsletters.json')).default as { cle: string; pour: 'clients' | 'veille'; rubrique: string; objet: string; chapeau: string; message: string; illustration: string }[];
    expect(articles.length).toBeGreaterThanOrEqual(49);
    for (const a of articles) {
      expect(erreurNewsletter({ ...a, cibles: [a.pour], parEmail: true, parNotif: true })).toBeNull();
      expect(fichierIllustration(a.illustration)).toBe(a.illustration);
      expect(() => readFileSync(join(__dirname, '../assets/newsletters', `${a.illustration}.jpg`))).not.toThrow();
      expect(a.message).toMatch(/## Sources\n+- .+https:\/\//);
    }
    const m = mailNewsletter(articles[0], { coach: 'S', desabonnement: 'https://d' });
    expect(m.html).toMatch(/<a href="https:\/\/www\.who\.int\/[^"]+"/);
    // « À retenir » et « Sources » sont mis à part, pas en simple liste.
    expect(blocsArticle(articles[1].message).map((b) => b.type)).toEqual(expect.arrayContaining(['retenir', 'sources']));
    expect(mailNewsletter(articles[1], { coach: 'S', desabonnement: 'https://d' }).html).toContain('À retenir');
  });
});
